// 0.4.69: the panel's two tabs, "本页视频" and "已下载". Which one opens, when it switches by itself (only before the
// person picks one), Chrome's own downloads in "已下载" (not the copies Ruxget Desktop took over, not site videos twice),
// "只移除记录" keeping Chrome's history, the running count, arrow keys, and English labels. Store edition, local server.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-view-tabs-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://x');
  if(url.pathname.startsWith('/file/'))return response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':4096,'Content-Disposition':'attachment; filename="'+url.pathname.slice(6)+'"'}),response.end(Buffer.alloc(4096,1));
  // Never finishes while the test runs.
  if(url.pathname==='/slow.bin'){response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':300*1048576,'Content-Disposition':'attachment; filename="slow.bin"'});const t=setInterval(()=>response.destroyed?clearInterval(t):response.write(Buffer.alloc(8192,2)),100);response.on('close',()=>clearInterval(t));return;}
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end('<!doctype html><title>Plain page</title><p>nothing to download</p>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:path.join(report,'downloads'),viewport:{width:380,height:700},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  let worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const html=fs.readFileSync(path.join(root,'shiying.html'),'utf8');
  assert(html.indexOf('id="viewTabs"')<html.indexOf('id="pageView"')&&html.indexOf('id="pageView"')<html.indexOf('id="downloadsView"'));
  // 0.4.71: the takeover switch left 已下载 for the settings page (交给桌面版); the old row stays in the HTML, hidden.
  assert(/id="downloadsView"[\s\S]*id="recentDownloads"/.test(html)&&/<section id="desktopRow" hidden/.test(html),'已下载 holds only the list; the old takeover row is hidden');
  assert(/name="desktopMode" value="large"/.test(fs.readFileSync(path.join(root,'ruxget-settings.html'),'utf8')),'the settings page has the 交给桌面版 choice');
  assert(html.indexOf('id="offerCard"')<html.indexOf('id="viewTabs"'),'the desktop offer stays above both tabs');
  check('layout: tabs, then 本页视频 (find and download) and 已下载 (list, then the takeover switch); the offer above both');

  const blank=await browser.newPage();await blank.goto('about:blank');
  const site=await browser.newPage();await site.goto(origin+'/');
  const tabs=await worker.evaluate(async u=>{const all=await chrome.tabs.query({});return {site:all.find(t=>t.url.startsWith(u)).id,blank:all.find(t=>t.url==='about:blank').id};},origin);
  const tabId=tabs.site;
  const open=async(tab=tabId)=>{const p=await browser.newPage();await p.goto(`chrome-extension://${id}/shiying.html?tabId=${tab}`);await p.waitForFunction(()=>document.body.dataset.view&&document.body.dataset.decided&&window.RuxgetTabs);await p.waitForTimeout(300);return p;};
  const view=p=>p.evaluate(()=>document.body.dataset.view);

  // Nothing to download (a blank tab): 已下载 opens. A video found later doesn't take the list away; its count shows.
  let popup=await open(tabs.blank);
  assert.equal(await view(popup),'downloads');assert.equal(await popup.locator('#pageView').isVisible(),false);assert.equal(await popup.locator('#recentEmpty').isVisible(),true);
  assert.equal(await popup.locator('#openDownloadFolder').isVisible(),true);
  check('a page with nothing to download opens on 已下载 (empty: it says so; the downloads folder is one click away)');
  // 0.4.72: only this browser session, like Chrome's own bubble, for Chrome's own downloads and desktop tasks.
  // 0.4.81: what Ruxget itself saved stays listed after a restart (as the download card does), so yesterday's video
  // is listed too. 「全部下载记录」 opens Chrome's own download page.
  {await worker.evaluate(()=>chrome.storage.session.set({ruxgetSessionStart:Date.now()-60000}));const now=Date.now();
   await worker.evaluate(now=>chrome.storage.session.set({ruxgetDesktopStatus:{at:now,running:true,active:0,jobs:[{id:'d1d1d1d1d1d1d1d1',title:'yesterday-handed.iso',file:'yesterday-handed.iso',state:'done',progress:100,at:now-86400000}]}}),now);
   await worker.evaluate(now=>chrome.storage.local.set({shiyingJobIds:['old','new'],'shiyingJob:old':{id:'old',title:'昨天的视频',format:'mp4',height:720,status:'complete',progress:100,stage:'下载完成',createdAt:new Date(now-86400000).toISOString()},'shiyingJob:new':{id:'new',title:'刚才的视频',format:'mp4',height:720,status:'complete',progress:100,stage:'下载完成',createdAt:new Date(now).toISOString()}}),now);
   const p=await open(tabs.blank);await p.locator('#tabDownloads').click();await p.waitForTimeout(400);
   const text=await p.locator('#recentList').innerText();assert(text.includes('刚才的视频')&&text.includes('昨天的视频')&&text.indexOf('刚才的视频')<text.indexOf('昨天的视频'),'Ruxget’s own videos, newest first, also from before Chrome started: '+text);
   assert(text.includes('yesterday-handed.iso'),'a desktop task handed over before Chrome started but finished now is listed: '+text);
   const before=browser.pages().length;await p.locator('#openDownloadHistory').click();await p.waitForTimeout(800);
   assert(browser.pages().some(page=>page.url().startsWith('chrome://downloads')),'「全部下载记录」 opens chrome://downloads');assert(browser.pages().length>before);
   for(const page of browser.pages())if(page.url().startsWith('chrome://downloads'))await page.close();await p.close();
   await worker.evaluate(()=>chrome.storage.local.remove(['shiyingJobIds','shiyingJob:old','shiyingJob:new']));
   check('已下载 keeps Ruxget’s own videos from before Chrome started (0.4.81); 「全部下载记录」 opens Chrome’s own download page');}
  await popup.waitForTimeout(1600);await worker.evaluate(({tabId,origin})=>new Promise(r=>chrome.runtime.sendMessage({Message:'popupAddData',data:{tabId,url:origin+'/late.mp4',name:'late.mp4',ext:'mp4',type:'video/mp4',size:1048576,title:'Plain page',webUrl:origin+'/',requestId:'r0'}},()=>r())),{tabId:tabs.blank,origin}).catch(()=>{});
  await popup.waitForFunction(()=>!document.querySelector('#tabPage .tab-count').hidden,null,{timeout:8000});
  assert.equal(await view(popup),'downloads');assert.equal(await popup.locator('#tabPage .tab-count').innerText(),'1');
  check('a video found later doesn’t switch tabs by itself; 本页视频 shows its count instead');
  await popup.close();
  // A site Ruxget may not read yet: 本页视频 opens, so “允许此网站” is in view.
  popup=await open();
  assert.equal(await view(popup),'page');assert.equal(await popup.locator('#allowSite').isVisible(),true);
  check('a site not yet allowed opens on 本页视频 with “允许此网站” in view');
  await popup.close();
  // What the detector keeps for this tab (popupAddData only reaches an open panel).
  // 0.4.79: the engine keeps its lists in chrome.storage.session (MediaData) and reads them when it starts; store one
  // there and restart the worker, as Chrome does when it wakes the extension.
  await worker.evaluate(({tabId,origin})=>chrome.storage.session.set({MediaData:{[tabId]:[{tabId,url:origin+'/clip.mp4',name:'clip.mp4',ext:'mp4',type:'video/mp4',size:1048576,title:'Plain page',webUrl:origin+'/',requestId:'r1',getTime:Date.now()}]}}),{tabId,origin});
  {const cdp=await browser.newCDPSession(browser.pages()[0]);await cdp.send('ServiceWorker.enable').catch(()=>{});await cdp.send('ServiceWorker.stopAllWorkers').catch(()=>{});await cdp.detach().catch(()=>{});
   const waking=browser.waitForEvent('serviceworker',{timeout:10000}).catch(()=>null);const wake=await browser.newPage();await wake.goto(`chrome-extension://${id}/shiying-help.html`);worker=(await waking)||browser.serviceWorkers()[0];await wake.close();}
  popup=await open();
  assert.equal(await view(popup),'page');
  check('a page with a video opens on 本页视频');
  // Once the person picks a tab, it stays.
  await popup.locator('#tabDownloads').click();assert.equal(await view(popup),'downloads');
  await worker.evaluate(({tabId,origin})=>new Promise(r=>chrome.runtime.sendMessage({Message:'popupAddData',data:{tabId,url:origin+'/clip2.mp4',name:'clip2.mp4',ext:'mp4',type:'video/mp4',size:1048576,title:'Plain page',webUrl:origin+'/',requestId:'r2'}},()=>r())),{tabId:tabId,origin}).catch(()=>{});
  await popup.waitForTimeout(1500);assert.equal(await view(popup),'downloads');
  check('after the person picks 已下载, a new video doesn’t switch the tab');
  // Arrow keys move between tabs.
  await popup.locator('#tabDownloads').focus();await popup.keyboard.press('ArrowLeft');
  assert.equal(await view(popup),'page');assert.equal(await popup.evaluate(()=>document.activeElement.id),'tabPage');
  assert.equal(await popup.locator('#tabPage').getAttribute('aria-selected'),'true');assert.equal(await popup.locator('#tabDownloads').getAttribute('tabindex'),'-1');
  check('arrow keys move between the tabs, with tab roles kept in step');
  await popup.close();

  // Chrome's own downloads show in 已下载; a site video's Chrome download only once; a taken-over (cancelled) one not at all.
  const download=name=>worker.evaluate(async url=>{const id=await chrome.downloads.download({url});for(let i=0;i<100;i++){const [d]=await chrome.downloads.search({id});if(d?.state==='complete')return id;await new Promise(r=>setTimeout(r,50));}throw new Error('fixture download did not finish');},origin+'/file/'+name);
  const plain=await download('manual.pdf'),siteFile=await download('site-video.mp4'),moved=await worker.evaluate(async url=>{const id=await chrome.downloads.download({url});await new Promise(r=>setTimeout(r,300));await chrome.downloads.cancel(id);return id;},origin+'/slow.bin');
  await worker.evaluate(({siteFile})=>chrome.storage.local.set({shiyingJobIds:['s1'],'shiyingJob:s1':{id:'s1',title:'网站视频',status:'complete',format:'mp4',height:720,progress:100,stage:'下载完成',downloadId:siteFile,createdAt:new Date().toISOString()}}),{siteFile});
  popup=await open();await popup.locator('#tabDownloads').click();await popup.waitForTimeout(500);
  // (Playwright names accepted downloads by a GUID, so rows are found by their Chrome download id.)
  const rowIds=await popup.locator('#recentList li').evaluateAll(items=>items.map(item=>item.dataset.id));
  assert.match(await popup.locator(`#recentList li[data-id="chrome-${plain}"]`).innerText(),/Ruxget · 4 KB · 下载完成 · 双击打开/); // 0.4.81: started by the extension, so labelled Ruxget (file-gone-check covers “Chrome”)
  assert(!rowIds.includes('chrome-'+siteFile)&&rowIds.includes('s1'),'the site video is listed once, as its own row: '+JSON.stringify(rowIds));
  assert(!rowIds.includes('chrome-'+moved),'a cancelled (taken-over) download is not listed');
  assert.equal(await popup.locator(`#recentList li[data-id="chrome-${plain}"] .recent-show`).getAttribute('title'),'在文件夹中显示');
  check('已下载 lists Chrome’s own downloads too, each file once, without cancelled copies');
  // "只移除记录" hides it here only; Chrome's history keeps it.
  const row=popup.locator(`#recentList li[data-id="chrome-${plain}"]`);
  await row.locator('.recent-delete').click();await row.getByRole('button',{name:'只移除记录'}).click();await row.waitFor({state:'detached'});
  assert.equal((await worker.evaluate(id=>chrome.downloads.search({id}),plain)).length,1);
  check('“只移除记录” hides a Chrome download here and leaves Chrome’s own list alone');
  // A running Chrome download is counted on the tab and shows its progress.
  const running=await worker.evaluate(url=>chrome.downloads.download({url}),origin+'/slow.bin');
  await popup.waitForFunction(id=>!!document.querySelector(`#recentList li[data-id="chrome-${id}"] .recent-bar`),running,{timeout:8000});
  assert.equal(await popup.locator('#tabDownloads .tab-count').innerText(),'1');
  const before=await popup.locator(`#recentList li[data-id="chrome-${running}"] small`).innerText();await popup.waitForTimeout(2500);
  const after=await popup.locator(`#recentList li[data-id="chrome-${running}"] small`).innerText();
  assert.notEqual(before,after,'progress moves while the tab is open');
  check('a running Chrome download is counted on the tab and its progress updates');
  const runRow=popup.locator(`#recentList li[data-id="chrome-${running}"]`);
  await runRow.locator('.recent-delete').click();await runRow.getByRole('button',{name:'停止并删除'}).click();await runRow.waitFor({state:'detached'});
  assert.equal((await worker.evaluate(id=>chrome.downloads.search({id}),running)).length,0);
  await popup.waitForFunction(()=>document.querySelector('#tabDownloads .tab-count').hidden);
  check('“停止并删除” stops a running Chrome download and the count goes away');
  await popup.close();

  // English labels.
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));
  popup=await open();
  assert.equal(await popup.locator('#tabPage span').innerText(),'This page');assert.equal(await popup.locator('#tabDownloads span').innerText(),'Downloads');
  await popup.locator('#tabDownloads').click();await popup.waitForTimeout(400);
  assert(!/[一-鿿]/.test((await popup.locator('#recentList').innerText()).replace(/网站视频/g,'')),'English list');
  await popup.screenshot({path:path.join(report,'downloads-en.png'),fullPage:true});
  check('the tabs and the list read in English');
  // Toolbar popup: one fixed frame. Switching tabs must not change the document size (Chrome sizes the popup by it)
  // or move the tabs; a long 已下载 list scrolls inside its own panel.
  {await popup.evaluate(()=>document.documentElement.classList.add('popup'));const frames=[];
   for(const tab of ['#tabPage','#tabDownloads','#tabPage','#tabDownloads']){await popup.locator(tab).click();await popup.waitForTimeout(300);
    frames.push(await popup.evaluate(()=>{const r=document.documentElement.getBoundingClientRect(),t=document.querySelector('#viewTabs').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),Math.round(t.left),Math.round(t.width),document.body.scrollHeight<=document.body.clientHeight+1].join(' ');}));}
   assert.equal(new Set(frames).size,1,'popup frame changes between tabs: '+frames.join(' | '));assert(frames[0].startsWith('360 560 '),'popup frame is 360 × 560: '+frames[0]);assert(frames[0].endsWith('true'),'the popup body itself never scrolls');
   check('the toolbar popup keeps one 360 × 560 frame when switching 本页视频 ↔ 已下载');}
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('VIEW TABS CHECKS PASSED ('+checks.length+')');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error('FAIL',error);process.exit(1);});
