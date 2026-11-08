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
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  await browser.route('https://www.bilibili.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title><video></video>'}));
  // The page read is stubbed; the video's length comes from storage so each case can set it.
  await browser.addInitScript(url=>{if(location.protocol!=='chrome-extension:'||!location.pathname.endsWith('/shiying.html'))return;window.testCalls=[];window.nativeCalls=[];chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;chrome.runtime.sendNativeMessage=async(host,payload)=>{nativeCalls.push(payload);return payload.action==='add'?{ok:true,stage:'started',id:'desk-1',name:'卡片提示测试.mp4'}:{ok:true,version:'0.4.70'};};const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{testCalls.push(message);if(message.Message==='shiyingPlatformDesktop')return {ok:true,payload:{action:'add',kind:'video',format:message.format,height:message.height}};if(message.Message==='shiyingPlatformRead'){const {testDuration=60}=await chrome.storage.local.get('testDuration');if(/BV1xxxxxxxxx/.test(message.url))return {ok:false,error:'没有找到这个视频，请检查链接'};const other=!message.url.includes('BV15z4y1U7HS');return {ok:true,id:'catalog',url:other?message.url:url,title:other?'另一个视频':'卡片提示测试',site:'bilibili',duration:testDuration,choices:[{height:720,label:'720p'}],audioAvailable:true,subtitles:[],loginLimited:other,parts:other?1:3};}if(message.Message==='shiyingPlatformStart')return {ok:true,id:'chrome-job',url,title:'卡片提示测试',format:message.format,height:message.height,label:'720p',status:'downloading',stage:'正在下载视频画面',progress:10};return send(message);};},VIDEO);
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

  // Long video: a desktop suggestion; 0.4.71: the link hands this video to the desktop app at once (no setting changes).
  await state({testDuration:2400});p=await open();h=await hint(p);
  assert.equal(h.visible,true);assert.match(h.text,/视频较长，用桌面版下载更稳/);assert.equal(h.dialogs,0);
  await p.screenshot({path:path.join(report,'hint-long.png')});
  await p.locator('#cardHint .hint-link').click();await p.waitForFunction(()=>nativeCalls.some(c=>c.action==='add'));
  await p.waitForFunction(()=>document.querySelector('#cardHint').hidden&&/已交给桌面版/.test(document.querySelector('#platformNote').textContent));
  assert.deepEqual(await p.evaluate(()=>nativeCalls.filter(c=>c.action==='add').map(c=>[c.kind,c.height])),[['video',720]]);
  assert.equal(await p.evaluate(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart')),false);
  assert.equal(await p.locator('dialog[open]').count(),0);
  await p.evaluate(()=>document.dispatchEvent(new CustomEvent('ruxget-i18n-applied')));await p.waitForTimeout(400);
  assert.equal(await p.locator('#cardHint').isVisible(),false,'the hint stays away for a video already sent');
  assert.equal(await p.locator('#platformDownload').innerText(),'下载视频');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetDesktopMode'))).ruxgetDesktopMode,undefined);
  // 0.4.72: 下载视频 right after the hand-off doesn't silently start a second copy; the first click says so, a second one downloads.
  await p.locator('#platformDownload').click();await p.waitForFunction(()=>/已经交给桌面版了/.test(document.querySelector('#platformNote').textContent));
  assert.equal(await p.evaluate(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart')),false);
  await p.locator('#platformDownload').click();await p.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart'));
  check('after a hand-off, 下载视频 first says 已经交给桌面版了 and only a second click downloads another copy');
  await p.close();
  p=await open();assert.equal((await hint(p)).visible,false,'reopening the panel (it closes at every outside click) keeps the hint away');
  // User report (0.4.72): handed over once, panel reopened, then downloaded with the extension: the card must describe
  // the extension's own download, not 「已交给桌面版」.
  const extensionDownload=async(p,selector)=>{await p.locator(selector).click();await p.waitForFunction(()=>/已经交给桌面版了/.test(document.querySelector('#platformNote').textContent));
   await p.locator(selector).click();await p.locator('#platformJob').waitFor({state:'visible'});
   assert.doesNotMatch(await p.locator('#platformNote').innerText(),/桌面版/);assert.match(await p.locator('#platformStage').innerText(),/正在下载视频画面/);assert.doesNotMatch(await p.locator('#platformCard').innerText(),/已交给桌面版|已经交给桌面版/);};
  await extensionDownload(p,'#platformDownload');await p.close();
  check('handed over, panel reopened, then downloaded with the extension: the hand-over note is gone and the card shows the extension’s download');
  await worker.evaluate(()=>chrome.storage.session.remove('ruxgetDesktopSent'));
  check('long video: “改用桌面版” sends it to the desktop app at once, the hint goes away and stays away; no setting changes, no Chrome download');
  await state({ruxgetDesktopMode:'large'});p=await open();assert.equal((await hint(p)).visible,false);assert.equal(await p.locator('#platformDownload').innerText(),'用桌面版下载');await p.close();
  // Desktop mode: 用桌面版下载 starts it in the app; 「这次用插件下载」 afterwards switches the card to the extension's download.
  p=await open();await p.locator('#platformDownload').click();await p.waitForFunction(()=>/已交给桌面版/.test(document.querySelector('#platformNote').textContent));
  await extensionDownload(p,'#platformUseBrowser');await p.close();await worker.evaluate(()=>chrome.storage.session.remove('ruxgetDesktopSent'));
  check('desktop mode: after a hand-over, 「这次用插件下载」 replaces the hand-over note with the extension’s own download');
  await worker.evaluate(()=>chrome.storage.local.remove('ruxgetDesktopMode'));
  check('when the settings already send long videos to the desktop app, there is no hint');

  // A failed download in the browser: a desktop suggestion.
  await state({testDuration:60,shiyingVideoPreference:{height:720,format:'mp4',method:'chrome'}});await job({status:'error',stage:'下载失败',error:'下载失败',progress:30});
  p=await open();h=await hint(p);assert.match(h.text,/下载没成功？可以改用桌面版下载/);await p.close();
  check('failed download: the hint suggests the desktop app');

  // 0.4.81: only the Chrome Web Store build has a rating page; this build shows no rating line, even after 5 finished downloads.
  await job({status:'complete'});await state({ruxgetDoneCount:5});
  p=await open();assert.equal((await hint(p)).visible,false);await p.close();
  check('a build outside the store never shows a rating line');

  // A finished download counts toward the total.
  const before=(await worker.evaluate(()=>chrome.storage.local.get('ruxgetDoneCount'))).ruxgetDoneCount;
  assert.equal(before,5);
  check('finished downloads are counted in ruxgetDoneCount');

  // 0.4.73 (first-run tester): the card's download belongs to the video it shows. Reading another link, or a link
  // that fails, must not leave the previous video's 「下载完成 · 打开 · 删除文件」 (删除文件 would delete that file).
  await state({ruxgetRate:{clicked:true},ruxgetDoneCount:0});await job({status:'complete',downloadId:7});
  p=await open();await p.locator('#platformDelete').waitFor({state:'visible'});
  assert.equal(await p.locator('#platformDelete').innerText(),'删除文件');assert.equal(await p.locator('#collectionOpen').isVisible(),true);
  const readLink=async link=>{await p.locator('#platformURL').fill(link);await p.locator('#platformRead').click();await p.waitForFunction(()=>!document.querySelector('#platformRead').disabled&&!/正在读取/.test(document.querySelector('#platformTitle').textContent));await p.waitForTimeout(300);};
  const cardState=()=>p.evaluate(()=>({title:document.querySelector('#platformTitle').textContent,job:!document.querySelector('#platformJob').hidden,deleteButton:!document.querySelector('#platformDelete').hidden&&!!document.querySelector('#platformDelete').offsetParent,hasJob:document.body.classList.contains('has-job'),error:document.querySelector('#platformError').hidden?'':document.querySelector('#platformError').textContent,parts:!document.querySelector('#collectionOpen').hidden,meta:document.querySelector('#platformMeta').textContent,login:!document.querySelector('#platformLoginNote').hidden}));
  await readLink('https://b23.tv/BV1GJ411x7h7');let c=await cardState();
  assert.equal(c.title,'另一个视频');assert.equal(c.job,false);assert.equal(c.deleteButton,false);assert.equal(c.hasJob,false);assert.equal(c.parts,false);
  await p.screenshot({path:path.join(report,'card-other-video.png')});
  check('a pasted b23.tv link of another video: the card no longer shows the previous video’s finished download');
  // 0.4.73: with MP3 chosen, the 480p sign-in note (about picture quality) is not shown.
  assert.equal(c.login,true);await p.locator('label[for=formatAudio]').click();await p.waitForTimeout(200);
  assert.equal((await cardState()).login,false,'MP3: no 480p note');await p.locator('label[for=formatVideo]').click();await p.waitForTimeout(200);assert.equal((await cardState()).login,true);
  check('the B站 480p sign-in note shows for video and hides for MP3');
  await readLink('BV1xxxxxxxxx');c=await cardState();
  assert.equal(c.title,'暂时没有读到视频');assert.equal(c.error,'没有找到这个视频，请检查链接');assert.equal(c.job,false);assert.equal(c.deleteButton,false);assert.equal(c.parts,false);
  await p.screenshot({path:path.join(report,'card-bad-bv.png')});
  check('a wrong BV id: our own sentence, and no download state or 分 P link from the previous video');
  await readLink(VIDEO);c=await cardState();
  assert.equal(c.title,'卡片提示测试');assert.equal(c.job,true);assert.equal(c.deleteButton,true);assert.equal(c.parts,true);
  check('reading the downloaded video again brings its own finished download back');
  // Site name follows a language switch while the panel is open (it stayed 「Bilibili」); no full-width space in English.
  assert.equal(c.meta,'B站　1:00');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));await p.waitForFunction(()=>/Bilibili/.test(document.querySelector('#platformMeta').textContent));
  assert.equal((await cardState()).meta,'Bilibili · 1:00');
  await readLink('BV1xxxxxxxxx');assert.equal((await cardState()).error,'Couldn’t find this video. Check the link.');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));await readLink(VIDEO);
  await p.waitForFunction(()=>document.querySelector('#platformMeta').textContent==='B站　1:00');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));await p.waitForFunction(()=>document.querySelector('#platformMeta').textContent==='Bilibili · 1:00');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));await p.waitForFunction(()=>document.querySelector('#platformMeta').textContent==='B站　1:00');
  check('the site name under the title follows the language while the panel is open; English: “Bilibili · 1:00”, wrong BV id in English');
  await p.close();
  // A failed download without a file: the confirm wording says the file isn't touched.
  await job({status:'error',stage:'下载失败',error:'下载失败',progress:30});p=await open();
  await p.locator('#platformDelete').click();assert.equal(await p.locator('#platformDelete').innerText(),'再点一次移除记录（文件不受影响）');
  await p.close();await job({status:'complete',downloadId:7});p=await open();await p.locator('#platformDelete').click();assert.equal(await p.locator('#platformDelete').innerText(),'再点一次确认删除');await p.close();
  check('「移除记录」 confirms with 「再点一次移除记录（文件不受影响）」; 「删除文件」 keeps 「再点一次确认删除」');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
