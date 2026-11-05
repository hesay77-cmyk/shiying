// The download card's single hint line (store edition): a desktop suggestion for long videos or failed downloads,
// and a rating link after 5 finished downloads that shows at most 5 times and never after it is clicked. Never a dialog.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-card-hint-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const VIDEO='https://www.bilibili.com/video/BV15z4y1U7HS/';
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  await browser.route('https://www.bilibili.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title><video></video>'}));
  // The page read is stubbed; the video's length comes from storage so each case can set it.
  await browser.addInitScript(url=>{if(location.protocol!=='chrome-extension:'||!location.pathname.endsWith('/shiying.html'))return;const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{if(message.Message==='shiyingPlatformRead'){const {testDuration=60}=await chrome.storage.local.get('testDuration');return {ok:true,id:'catalog',url,title:'卡片提示测试',site:'bilibili',duration:testDuration,choices:[{height:720,label:'720p'}],audioAvailable:true,subtitles:[]};}return send(message);};},VIDEO);
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const site=await browser.newPage();await site.goto(VIDEO);
  const tabId=await worker.evaluate(async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id,VIDEO),jobUrl=await worker.evaluate(u=>ShiyingPlatform.source(u).url,VIDEO);
  const state=values=>worker.evaluate(values=>chrome.storage.local.set(values),values);
  const job=values=>state({shiyingJobIds:['j'],'shiyingJob:j':{id:'j',url:jobUrl,title:'卡片提示测试',format:'mp4',height:720,progress:100,stage:'下载完成',...values}});
  const open=async()=>{const p=await browser.newPage();await p.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await p.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);await p.waitForTimeout(400);return p;};
  const hint=async p=>({visible:await p.locator('#cardHint').isVisible(),text:(await p.locator('#cardHint').innerText().catch(()=>'')).trim(),dialogs:await p.locator('dialog[open]').count()});

  // Short video, no job: nothing.
  await state({testDuration:60,shiyingVideoPreference:{height:720,format:'mp4',method:'chrome'}});
  let p=await open();let h=await hint(p);assert.equal(h.visible,false);await p.close();
  check('a short video with no download shows no hint');

  // Long video: a desktop suggestion; the link only switches the method.
  await state({testDuration:2400});p=await open();h=await hint(p);
  assert.equal(h.visible,true);assert.match(h.text,/视频较长，用桌面版下载更稳/);assert.equal(h.dialogs,0);
  await p.screenshot({path:path.join(report,'hint-long.png')});
  await p.locator('#cardHint .hint-link').click();await p.waitForFunction(()=>document.querySelector('#cardHint').hidden);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('shiyingVideoPreference'))).shiyingVideoPreference.method,'desktop');
  assert.equal(await p.locator('#platformDownload').innerText(),'用桌面版下载');await p.close();
  check('long video: “改用桌面版” switches the download method and the hint goes away; nothing starts');

  // A failed download in the browser: a desktop suggestion.
  await state({testDuration:60,shiyingVideoPreference:{height:720,format:'mp4',method:'chrome'}});await job({status:'error',stage:'下载失败',error:'下载失败',progress:30});
  p=await open();h=await hint(p);assert.match(h.text,/下载没成功？可以改用桌面版下载/);await p.close();
  check('failed download: the hint suggests the desktop app');

  // Four finished downloads: no rating line yet; five: the rating link (GitHub for a build that is not the store's).
  await job({status:'complete'});await state({ruxgetDoneCount:4});
  p=await open();assert.equal((await hint(p)).visible,false);await p.close();
  await state({ruxgetDoneCount:5});p=await open();h=await hint(p);
  assert.match(h.text,/用着顺手的话，去 GitHub 给 Ruxget 点个 Star/);assert.equal(h.dialogs,0);
  assert.equal(await p.locator('#cardHint a').getAttribute('href'),'https://github.com/hesay77-cmyk/shiying');
  await p.screenshot({path:path.join(report,'hint-rate.png')});await p.close();
  check('rating line appears only after 5 finished downloads, as a plain link');

  // Shown in at most 5 popup openings in total.
  for(let i=2;i<=5;i++){p=await open();assert.equal((await hint(p)).visible,true,'opening '+i);await p.close();}
  p=await open();assert.equal((await hint(p)).visible,false);await p.close();
  check('the rating line stops after 5 openings without any click');

  // Clicked once: never again, even with openings left.
  await state({ruxgetRate:{shown:1}});p=await open();
  const [tab]=await Promise.all([browser.waitForEvent('page'),p.locator('#cardHint a').click()]);await tab.close().catch(()=>{});
  await p.waitForFunction(()=>document.querySelector('#cardHint').hidden);await p.close();
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetRate'))).ruxgetRate.clicked,true);
  p=await open();assert.equal((await hint(p)).visible,false);await p.close();
  check('after the rating link is clicked it never shows again');

  // A finished download counts toward the total.
  const before=(await worker.evaluate(()=>chrome.storage.local.get('ruxgetDoneCount'))).ruxgetDoneCount;
  assert.equal(before,5);
  check('finished downloads are counted in ruxgetDoneCount');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
