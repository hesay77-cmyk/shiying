// Download button and 交给桌面版 setting (0.4.71, no ▾ menu any more) in the real extension popup. Native host, downloads and network are faked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-method-check-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const extension=path.join(report,'extension');fs.mkdirSync(extension);
 for(const dir of ['js','css','img','lib','_locales'])fs.cpSync(path.join(root,dir),path.join(extension,dir),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name==='manifest.json')fs.copyFileSync(path.join(root,name),path.join(extension,name));
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:360,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{
  await browser.route('**/*',route=>new URL(route.request().url()).protocol==='chrome-extension:'?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const site=await browser.newPage();await site.goto('https://www.bilibili.com/video/BV15z4y1U7HS/');
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('BV15z4y1U7HS')).id);
  await browser.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:')return;
   // nativeMode: permission (not yet allowed) | missing (not installed) | forbidden (installed, not paired) | ready
   window.testCalls=[];window.nativeCalls=[];window.permissionRequests=0;
   const mode=()=>localStorage.getItem('nativeMode')||'permission';
   chrome.permissions.contains=async()=>mode()!=='permission';
   chrome.permissions.request=async()=>{permissionRequests++;if(mode()==='permission')localStorage.setItem('nativeMode','ready');return true;};
   chrome.runtime.sendNativeMessage=async(host,payload)=>{nativeCalls.push(payload);const m=mode();if(m==='missing')throw new Error('Specified native messaging host not found.');if(m==='forbidden')throw new Error('Access to the specified native messaging host is forbidden.');return payload.action==='ping'?{ok:true,version:'0.4.47'}:payload.action==='add'&&localStorage.getItem('addReply')?JSON.parse(localStorage.getItem('addReply')):{ok:true};};
   chrome.downloads.download=async()=>{throw new Error('Download blocked by fixture');};
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=async message=>{
    testCalls.push(message);
    if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',site:'bilibili',duration:Number(localStorage.getItem('duration')||252),choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true,subtitles:[{lang:'zh-CN',name:'中文'}]};
    if(message.Message==='shiyingPlatformDesktop')return {ok:true,payload:{action:'add',kind:'video',format:message.format,height:message.height}};
    if(message.Message==='shiyingPlatformStart')return {ok:true,id:'job',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',status:'downloading',stage:'正在下载',progress:5};
    if(message.Message==='shiyingPlatformSubtitle')return {ok:true,downloadId:1};
    if(message.Message==='getData')return [];
    return send(message);
   };
  });
  const page=await browser.newPage();const url=`chrome-extension://${id}/shiying.html?tabId=${tabId}`;
  const ready=async()=>{await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);};
  const menuOpen=()=>page.locator('#methodMenu').isVisible();
  await ready();

  // 0.4.71: no ▾ menu. Settings → 交给桌面版 (ruxgetDesktopMode never|large|all) decides who downloads; large = 30 minutes or more.
  const setMode=value=>worker.evaluate(v=>v?chrome.storage.local.set({ruxgetDesktopMode:v}):chrome.storage.local.remove('ruxgetDesktopMode'),value);
  const label=()=>page.locator('#platformDownload').innerText();
  const useBrowser=()=>page.locator('#platformUseBrowser').isVisible();
  const count=(name)=>page.evaluate(n=>testCalls.filter(c=>c.Message===n).length,name);
  assert.equal(await label(),'下载视频');assert.equal(await page.locator('#platformMethod').isVisible(),false);assert.equal(await menuOpen(),false);assert.equal(await useBrowser(),false);
  check('default (交给桌面版: 从不) is one primary "下载视频" button: no ▾, no browser link');

  await setMode('large');await page.waitForTimeout(250);assert.equal(await label(),'下载视频');assert.equal(await useBrowser(),false);
  check('“大文件和长视频” leaves a 4-minute video in Chrome');
  await page.evaluate(()=>localStorage.setItem('duration','2400'));await ready();
  assert.equal(await label(),'用桌面版下载');assert.equal(await useBrowser(),true);assert.equal(await page.locator('#platformUseBrowser').innerText(),'这次用插件下载');
  assert.equal(await page.locator('#cardHint').isVisible(),false,'no "改用桌面版" hint when the desktop app already gets it');
  await page.locator('label[for=formatAudio]').click();assert.equal(await label(),'桌面版下载 MP3');await page.locator('label[for=formatVideo]').click();
  check('“大文件和长视频” sends a 40-minute video to the desktop app and offers 这次用插件下载');
  await setMode('never');await page.waitForFunction(()=>document.querySelector('#platformDownload').textContent==='下载视频');assert.equal(await useBrowser(),false);
  await setMode('large');await page.waitForFunction(()=>document.querySelector('#platformDownload').textContent==='用桌面版下载');
  check('an open panel follows the setting as soon as it changes');
  await setMode(null);await worker.evaluate(()=>chrome.storage.local.set({ruxgetTakeover:{enabled:true}}));await ready();assert.equal(await label(),'用桌面版下载');
  await worker.evaluate(()=>chrome.storage.local.remove('ruxgetTakeover'));
  check('before 0.4.71 the takeover switch was the only choice: on counts as “大文件和长视频”');
  await page.evaluate(()=>localStorage.removeItem('duration'));await setMode('all');await ready();assert.equal(await label(),'用桌面版下载');assert.equal(await useBrowser(),true);
  check('“全部” sends even a 4-minute video to the desktop app');

  await page.locator('#platformDownload').click();await page.waitForFunction(()=>nativeCalls.some(c=>c.action==='add'));
  assert.equal(await page.evaluate(()=>permissionRequests),1);
  assert.deepEqual(await page.evaluate(()=>testCalls.filter(c=>c.Message==='shiyingPlatformDesktop').map(c=>[c.format,c.height])),[['mp4',1080]]);
  assert.equal(await count('shiyingPlatformStart'),0);
  await page.waitForFunction(()=>/已交给 Ruxget 桌面版，请在桌面窗口确认下载/.test(document.querySelector('#platformNote').textContent));
  check('desktop download asks permission on click, sends the chosen quality once and never starts a Chrome download (an older app asks to confirm)');

  await page.evaluate(()=>localStorage.setItem('addReply',JSON.stringify({ok:true,stage:'started',id:'desk-1',name:'一段可以安心下载的视频.mp4'})));await ready();
  await page.locator('#platformDownload').click();await page.waitForFunction(()=>/已交给桌面版，在「已下载」里看进度/.test(document.querySelector('#platformNote').textContent));
  assert.deepEqual(await page.evaluate(()=>testCalls.filter(c=>c.Message==='ruxgetDesktopRemember').map(c=>[c.id,c.name])),[['desk-1','一段可以安心下载的视频.mp4']]);
  assert.equal(await page.locator('#desktopConnectPrompt').count(),0);assert.equal(await count('shiyingPlatformStart'),0);
  assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c.action==='add').every(c=>c.quiet===true)),true,'the extension says it shows quiet starts');
  await page.locator('#platformDownload').click();await page.waitForFunction(()=>/已经交给桌面版了/.test(document.querySelector('#platformNote').textContent));
  assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c.action==='add').length),1,'a second click does not send it again');
  await page.locator('label[for=formatAudio]').click();await page.locator('#platformDownload').click();await page.waitForFunction(()=>nativeCalls.filter(c=>c.action==='add').length===2);
  await page.locator('label[for=formatVideo]').click();
  await ready();await page.locator('#platformDownload').click();await page.waitForFunction(()=>/已经交给桌面版了/.test(document.querySelector('#platformNote').textContent));
  assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c.action==='add').length),0,'reopening the panel does not send a started video again');
  await worker.evaluate(()=>chrome.storage.session.remove('ruxgetDesktopSent'));
  check('the 0.4.70 desktop app starts it at once: no window to confirm, the note points to 已下载 and the task is remembered for that list');

  await ready();const adds=await page.evaluate(()=>nativeCalls.filter(c=>c.action==='add').length);
  await page.locator('#platformUseBrowser').click();await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart'));
  assert.equal(await count('shiyingPlatformStart'),1);assert.equal(await page.evaluate(()=>nativeCalls.filter(c=>c.action==='add').length),adds);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetDesktopMode'))).ruxgetDesktopMode,'all');
  check('这次用插件下载 downloads this one video in Chrome, once, and changes no setting');

  await ready();await page.evaluate(()=>localStorage.setItem('nativeMode','missing'));await page.locator('#platformDownload').click();
  await page.locator('#desktopConnectPrompt').waitFor({state:'visible'});await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'missing-dialog-360.png')});
  await page.locator('[data-desktop-action=chrome]').click();await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart'));
  assert.equal(await count('shiyingPlatformStart'),1);assert.equal(await page.locator('#platformError').isVisible(),false);assert.equal(await label(),'用桌面版下载');
  check('without the desktop app, the dialog offers install/repair and 继续用 Chrome downloads this video in Chrome at once');

  await ready();await page.evaluate(()=>localStorage.setItem('nativeMode','forbidden'));await page.locator('#platformDownload').click();
  await page.locator('#desktopConnectPrompt').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await page.waitForFunction(()=>/没有连上桌面版/.test(document.querySelector('#platformNote').textContent));
  const note=await page.locator('#platformNote').innerText();assert.match(note,/这次用插件下载/);assert.doesNotMatch(note,/▾/);
  assert.equal(await count('shiyingPlatformStart'),0);assert.equal(await useBrowser(),true);assert.equal(await page.locator('#platformError').isVisible(),false);
  check('closing the dialog downloads nothing and says how to go on (这次用插件下载, no ▾ any more)');

  await ready();await page.evaluate(()=>localStorage.setItem('nativeMode','ready'));
  for(const width of [320,360,440]){await page.setViewportSize({width,height:640});await page.waitForTimeout(150);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const selector of ['#platformDownload','#platformUseBrowser']){const box=await page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width,selector+' fits '+width);}
   await page.screenshot({path:path.join(report,'desktop-mode-'+width+'.png')});}
  await page.setViewportSize({width:360,height:640});
  check('the panel fits 320/360/440 widths without horizontal scroll');

  await page.evaluate(()=>RuxgetI18n.setLanguage('en'));await page.waitForFunction(()=>document.querySelector('#platformDownload').textContent==='Download in app');
  assert.equal(await page.locator('#platformUseBrowser').innerText(),'Use the extension this time');
  await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'desktop-mode-en-360.png')});await page.evaluate(()=>RuxgetI18n.setLanguage('zh_CN'));
  await setMode('never');
  check('button and browser link follow the English interface');

  // Subtitles: no separate button (0.4.71); settings → 下载视频时一起保存字幕 saves them with the video, Chinese first.
  await ready();assert.equal(await page.locator('#subtitleBox').isVisible(),false);
  await page.locator('#platformDownload').click();await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart'));await page.waitForTimeout(400);
  assert.equal(await count('shiyingPlatformSubtitle'),0);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetSaveSubtitles:true}));await ready();
  await page.locator('#platformDownload').click();await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformSubtitle'));
  assert.equal(await page.evaluate(()=>testCalls.find(c=>c.Message==='shiyingPlatformSubtitle').index),0);
  await worker.evaluate(()=>chrome.storage.local.remove('ruxgetSaveSubtitles'));
  check('no separate 下载字幕 button; with the setting on, downloading the video also saves its subtitles');
  // Recent downloads: newest first, up to twenty (0.4.69), click opens the progress page.
  await worker.evaluate(async()=>{const ids=[];const records={};for(let i=1;i<=7;i++){const id='job'+i;ids.push(id);records['shiyingJob:'+id]={id,title:'视频 '+i,createdAt:new Date(Date.now()-(7-i)*1000).toISOString(),format:i===7?'mp3':'mp4',height:1080,status:i===7?'complete':i===6?'error':'downloading',stage:'正在合并画面与声音',error:i===6?'下载失败':'',progress:40};}await chrome.storage.local.set({shiyingJobIds:ids,...records});});
  await ready();await page.locator('#tabDownloads').click();
  const recent=await page.locator('#recentList li').allInnerTexts();assert.equal(recent.length,7);assert.match(recent[0],/视频 7[\s\S]*MP3 · 下载完成/);assert.match(recent[1],/视频 6[\s\S]*下载失败/);assert.match(recent[2],/视频 5[\s\S]*正在合并画面与声音 · 40%/);
  await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'recent-360.png')});
  const [task]=await Promise.all([browser.waitForEvent('page'),page.locator('#recentList li button').first().click()]);assert.match(task.url(),/shiying-task\.html\?id=job7$/);await task.close();
  check('the downloads tab shows the latest downloads and opens their progress');
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
