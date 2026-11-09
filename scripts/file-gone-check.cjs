// 0.4.81: a file deleted outside Chrome. The download card on a video page and the "已下载" list both say “文件已被移动或删除”
// in the three cases the trial found wrong: the panel left open while the file is deleted, the panel opened again,
// and Chrome restarted. A double-click always answers, a restart keeps Ruxget's own entries (and they can be removed),
// rows show the actual file name, and the source says “Ruxget” for what Ruxget started, “Chrome” for a page's own
// download. No 11-second wait before opening the panel: Chrome's 10-second limit on looking at the disk is part of
// what is tested. Local fixture server and fixture files only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-file-gone-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const GONE='文件已被移动或删除',LIMIT=16000;
(async()=>{
 const server=http.createServer((request,response)=>{
  if(request.url==='/page.html'){response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><meta charset="utf-8"><a id="get" href="/page.bin" download>get</a>');return;}
  response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':4096});response.end(Buffer.alloc(4096,1));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build'),profile=path.join(report,'profile');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const VIDEO='https://www.bilibili.com/video/BV15z4y1U7HS/';
 let browser,errors=[];
 async function launch(){
  browser=await chromium.launchPersistentContext(profile,{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:path.join(report,'downloads'),viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
  await browser.route('https://www.bilibili.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Fixture</title><video></video>'}));
  await browser.addInitScript(url=>{if(location.protocol!=='chrome-extension:'||!location.pathname.endsWith('/shiying.html'))return;
   window.asked=[];chrome.permissions.request=async p=>{asked.push(p);return false;};
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url,title:'卡片里的视频',site:'bilibili',duration:60,choices:[{height:720,label:'720p'}],audioAvailable:true,subtitles:[]};return send(message);};},VIDEO);
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');
  return {worker,id:new URL(worker.url()).hostname};
 }
 try{
  let {worker,id}=await launch();
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const saved=name=>worker.evaluate(async url=>{const downloadId=await chrome.downloads.download({url});for(let i=0;i<100;i++){const [item]=await chrome.downloads.search({id:downloadId});if(item?.state==='complete')return {downloadId,file:item.filename};await new Promise(r=>setTimeout(r,50));}throw new Error('fixture download did not finish');},origin+'/'+name);
  const site=await browser.newPage();await site.goto(VIDEO);
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,VIDEO),jobUrl=await worker.evaluate(url=>ShiyingPlatform.source(url).url,VIDEO);
  const job=(jobId,file,extra={})=>({id:jobId,url:jobUrl,title:'卡片里的视频',format:'mp4',height:360,label:'360p',status:'complete',progress:100,stage:'下载完成，文件和声音已检查',downloadId:file.downloadId,file:file.file,createdAt:new Date().toISOString(),...extra});
  const setJobs=jobs=>worker.evaluate(jobs=>{const data={shiyingJobIds:jobs.map(j=>j.id)};for(const j of jobs)data['shiyingJob:'+j.id]=j;return chrome.storage.local.set(data);},jobs);
  const openCard=async()=>{const card=await browser.newPage();await card.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await card.locator('#platformJob').waitFor({state:'visible'});return card;};
  const openList=async()=>{const list=await browser.newPage();await list.goto(`chrome-extension://${id}/shiying.html`);await list.locator('#tabDownloads').click();return list;};
  const stage=card=>card.locator('#platformStage').innerText();
  const row=(list,rowId)=>list.locator(`#recentList li[data-id="${rowId}"]`);
  const waitGone=(page,selector)=>page.waitForFunction(([s,g])=>(document.querySelector(s)?.textContent||'').includes(g),[selector,GONE],{timeout:LIMIT});

  // Two downloads of the same video (Chrome names the second one differently), one of Ruxget's own Chrome downloads
  // (as from the HLS/DASH or file pages) and one a web page started itself.
  const one=await saved('video.bin'),twin=await saved('video.bin'),own=await saved('own.bin');
  const web=await browser.newPage();await web.goto(origin+'/page.html');const [pageDownload]=await Promise.all([web.waitForEvent('download'),web.click('#get')]);await pageDownload.path();await web.close();
  const pageItem=await worker.evaluate(async()=>(await chrome.downloads.search({orderBy:['-startTime']})).find(i=>/page|\.bin$/.test(i.url)&&!i.byExtensionId));
  assert(pageItem,'the page download is in Chrome’s list');
  await setJobs([job('twin',twin,{url:'https://www.bilibili.com/video/BV1twin/'}),job('one',one)]);
  // ① The panel stays open; the file is deleted meanwhile.
  let card=await openCard();
  assert.equal(await stage(card),'下载完成，文件和声音已检查');assert.equal(await card.locator('#platformOpen').isVisible(),true);
  let list=await openList();
  await list.waitForFunction(n=>document.querySelectorAll('#recentList li[data-id]').length>=n,4,{timeout:5000});
  fs.unlinkSync(one.file);fs.unlinkSync(own.file);
  const started=Date.now();
  await waitGone(card,'#platformStage');
  assert.equal(await card.locator('#platformOpen').isVisible(),false);assert.equal(await card.locator('#platformDelete').innerText(),'移除记录');
  check(`① panel left open: the card turns to “${GONE}” by itself (${Math.round((Date.now()-started)/1000)} s), no 打开, “移除记录”`);
  await waitGone(list,'#recentList li[data-id="one"]');await waitGone(list,`#recentList li[data-id="chrome-${own.downloadId}"]`);
  assert.doesNotMatch(await row(list,'one').innerText(),/双击打开/);
  await row(list,'one').locator('.recent-open').dblclick();
  await list.waitForFunction(()=>/文件已不在原来的位置/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:3000});
  assert.deepEqual(await list.evaluate(()=>asked),[]);
  check('① 已下载 in the same session: the row says the file is gone, no “双击打开”, and a double-click explains it');
  await card.close();await list.close();

  // ② Deleted while the panel is closed, then the panel is opened again.
  const two=await saved('second.bin');
  await setJobs([job('one',one,{url:'https://www.bilibili.com/video/BV1one/'}),job('two',two)]);
  fs.unlinkSync(two.file);
  card=await openCard();await waitGone(card,'#platformStage');
  assert.equal(await card.locator('#platformDelete').innerText(),'移除记录');
  check('② panel opened again: the card says “'+GONE+'”');
  list=await openList();await waitGone(list,'#recentList li[data-id="two"]');
  await list.waitForFunction(g=>(document.querySelector('#recentList li[data-id="one"]')?.textContent||'').includes(g),GONE,{timeout:2000});
  check('② 已下载 opened again: both deleted files say so (one remembered at once)');
  // A file still there that Chrome hasn't noticed missing: the double-click still answers (here: opening wasn't allowed).
  const three=await saved('third.bin');
  await setJobs([job('three',three)]);await list.close();list=await openList();
  await row(list,'three').locator('.recent-open').dblclick();
  await list.waitForFunction(()=>(document.querySelector('#toast')?.textContent||'').length>0,null,{timeout:3000});
  check('a double-click on a file that is there always answers ('+await list.locator('#toast').innerText()+')');
  await card.close();await list.close();await site.close();

  // ③ Chrome restarts; one file was deleted while it was closed, one was found missing before.
  await setJobs([job('one',one,{url:'https://www.bilibili.com/video/BV1one/',createdAt:new Date(Date.now()-3600000).toISOString()}),job('three',three,{createdAt:new Date(Date.now()-3600000).toISOString()})]);
  await browser.close();if(fs.existsSync(three.file))fs.unlinkSync(three.file);
  ({worker,id}=await launch());
  await worker.evaluate(()=>chrome.storage.session.set({ruxgetSessionStart:Date.now()}));
  const site2=await browser.newPage();await site2.goto(VIDEO);
  const tab2=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,VIDEO);
  card=await browser.newPage();await card.goto(`chrome-extension://${id}/shiying.html?tabId=${tab2}`);await card.locator('#platformJob').waitFor({state:'visible'});
  await waitGone(card,'#platformStage');
  check('③ after a restart: the card says “'+GONE+'”');
  list=await openList();
  await list.waitForFunction(g=>(document.querySelector('#recentList li[data-id="one"]')?.textContent||'').includes(g),GONE,{timeout:3000});
  await waitGone(list,'#recentList li[data-id="three"]');
  await list.waitForFunction(([s,g])=>(document.querySelector(s)?.textContent||'').includes(g),[`#recentList li[data-id="chrome-${own.downloadId}"]`,GONE],{timeout:3000});
  check('③ after a restart: 已下载 keeps Ruxget’s entries and marks them “'+GONE+'”');
  await row(list,'one').locator('.recent-delete').click();assert.match(await row(list,'one').innerText(),/文件已不在，从列表移除？/);
  await row(list,'one').getByRole('button',{name:'移除'}).click();await row(list,'one').waitFor({state:'detached'});
  check('③ after a restart: a gone entry can be removed');
  await card.close();await list.close();await site2.close();
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('FILE GONE CHECKS PASSED ('+checks.length+')');console.log('REPORT '+report);
 }finally{await browser?.close().catch(()=>{});server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
