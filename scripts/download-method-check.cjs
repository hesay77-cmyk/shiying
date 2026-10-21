// Split download button and method menu in the real extension popup. Native host, downloads and network are faked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-method-check-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const extension=path.join(report,'extension');fs.mkdirSync(extension);
 for(const dir of ['js','css','img','lib','catch-script','_locales'])fs.cpSync(path.join(root,dir),path.join(extension,dir),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name==='manifest.json')fs.copyFileSync(path.join(root,name),path.join(extension,name));
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:360,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
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
   chrome.runtime.sendNativeMessage=async(host,payload)=>{nativeCalls.push(payload);const m=mode();if(m==='missing')throw new Error('Specified native messaging host not found.');if(m==='forbidden')throw new Error('Access to the specified native messaging host is forbidden.');return payload.action==='ping'?{ok:true,version:'0.4.47'}:{ok:true};};
   chrome.downloads.download=async()=>{throw new Error('Download blocked by fixture');};
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=async message=>{
    testCalls.push(message);
    if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',site:'bilibili',duration:252,choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true,subtitles:[{lang:'zh-CN',name:'中文'}]};
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

  assert.equal(await page.locator('#platformDownload').innerText(),'下载视频');assert.equal(await menuOpen(),false);assert.equal(await page.locator('#platformMethod').getAttribute('aria-expanded'),'false');
  check('default is one primary "下载视频" button with the menu closed');

  await page.locator('#platformMethod').click();assert.equal(await menuOpen(),true);assert.equal(await page.locator('#platformMethod').getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.method),'chrome');
  await page.waitForFunction(()=>document.querySelector('#desktopMethodStatus').dataset.state==='permission');
  assert.equal(await page.evaluate(()=>permissionRequests),0);
  check('menu opens on the current choice and checks the desktop app without a permission prompt');
  await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'menu-360.png')});

  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.method),'desktop');
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'methodSetup');
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.method),'chrome');
  await page.keyboard.press('Escape');assert.equal(await menuOpen(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'platformMethod');
  check('arrow keys cycle the menu; Escape closes it and returns focus');

  await page.locator('#platformMethod').click();await page.locator('.platform-intro').click();assert.equal(await menuOpen(),false);
  check('clicking outside closes the menu');

  await page.locator('#platformMethod').click();await page.locator('[data-method=desktop]').click();
  assert.equal(await menuOpen(),false);assert.equal(await page.locator('#platformDownload').innerText(),'用桌面版下载');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('shiyingVideoPreference'))).shiyingVideoPreference.method,'desktop');
  await ready();assert.equal(await page.locator('#platformDownload').innerText(),'用桌面版下载');
  await page.locator('label[for=formatAudio]').click();assert.equal(await page.locator('#platformDownload').innerText(),'桌面版下载 MP3');await page.locator('label[for=formatVideo]').click();
  check('choosing the desktop app relabels the button and is remembered after reopening');

  await page.locator('#platformDownload').click();await page.waitForFunction(()=>nativeCalls.some(c=>c.action==='add'));
  assert.equal(await page.evaluate(()=>permissionRequests),1);
  assert.deepEqual(await page.evaluate(()=>testCalls.filter(c=>c.Message==='shiyingPlatformDesktop').map(c=>[c.format,c.height])),[['mp4',1080]]);
  assert.equal(await page.evaluate(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart')),false);
  assert.match(await page.locator('#platformNote').innerText(),/已交给 Ruxget 桌面版/);
  check('desktop download asks permission on click, sends the chosen quality once and never starts a Chrome download');

  await page.locator('#platformMethod').click();await page.waitForFunction(()=>document.querySelector('#desktopMethodStatus').dataset.state==='ready');
  assert.match(await page.locator('#desktopMethodStatus').innerText(),/已连接/);await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'menu-ready-360.png')});await page.keyboard.press('Escape');
  for(const [mode,state,text] of [['missing','missing',/还没有安装/],['forbidden','connection',/重新连接/]]){
   await page.evaluate(m=>localStorage.setItem('nativeMode',m),mode);await page.locator('#platformMethod').click();
   await page.waitForFunction(s=>document.querySelector('#desktopMethodStatus').dataset.state===s,state);assert.match(await page.locator('#desktopMethodStatus').innerText(),text);
   await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'menu-'+mode+'-360.png')});await page.keyboard.press('Escape');
  }
  check('menu shows connected / not installed / needs reconnecting from the real native errors');

  await page.evaluate(()=>localStorage.setItem('nativeMode','missing'));await page.locator('#platformDownload').click();
  await page.locator('#desktopConnectPrompt').waitFor({state:'visible'});await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'missing-dialog-360.png')});
  await page.locator('[data-desktop-action=chrome]').click();await page.waitForFunction(()=>document.querySelector('#platformDownload').textContent==='下载视频');
  assert.equal(await page.locator('#platformError').isVisible(),false);
  check('without the desktop app, the existing dialog offers install/repair and "继续用 Chrome" switches back');

  await page.locator('#platformDownload').click();await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart'));
  assert.equal(await page.evaluate(()=>testCalls.filter(c=>c.Message==='shiyingPlatformStart').length),1);
  check('browser method starts exactly one Chrome download');

  await ready();await page.evaluate(()=>localStorage.setItem('nativeMode','ready'));
  for(const width of [320,360,440]){await page.setViewportSize({width,height:640});await page.locator('#platformMethod').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.locator('#methodMenu').boundingBox();assert(box.x>=0&&box.x+box.width<=width);
   await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'menu-'+width+'.png')});await page.keyboard.press('Escape');}
  check('menu fits 320/360/440 widths without horizontal scroll');

  await page.evaluate(()=>RuxgetI18n.setLanguage('en'));await page.locator('#platformMethod').click();
  assert.match(await page.locator('[data-method-label=chrome]').innerText(),/Download in Chrome/);assert.match(await page.locator('#methodMenuTitle').innerText(),/Download with/);
  await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'menu-en-360.png')});await page.keyboard.press('Escape');await page.evaluate(()=>RuxgetI18n.setLanguage('zh_CN'));
  check('menu and button follow the English interface');

  // Subtitles: one language shows its name on the button and sends the chosen index.
  await ready();assert.equal(await page.locator('#subtitleBox').isVisible(),true);assert.equal(await page.locator('#platformSubtitleLang').isVisible(),false);
  assert.match(await page.locator('#platformSubtitles').innerText(),/下载字幕（中文）/);await page.locator('#platformSubtitles').click();
  await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformSubtitle'));assert.equal(await page.evaluate(()=>testCalls.find(c=>c.Message==='shiyingPlatformSubtitle').index),0);assert.match(await page.locator('#platformNote').innerText(),/字幕已保存/);
  check('subtitle button names the language and saves it');
  // Recent downloads: newest first, at most five, click opens the progress page.
  await worker.evaluate(async()=>{const ids=[];const records={};for(let i=1;i<=7;i++){const id='job'+i;ids.push(id);records['shiyingJob:'+id]={id,title:'视频 '+i,format:i===7?'mp3':'mp4',height:1080,status:i===7?'complete':i===6?'error':'downloading',stage:'正在合并画面与声音',error:i===6?'下载失败':'',progress:40};}await chrome.storage.local.set({shiyingJobIds:ids,...records});});
  await ready();await page.locator('#recentDownloads').waitFor({state:'visible'});await page.locator('#recentDownloads summary').click();
  const recent=await page.locator('#recentList li').allInnerTexts();assert.equal(recent.length,5);assert.match(recent[0],/视频 7[\s\S]*MP3 · 已完成/);assert.match(recent[1],/视频 6[\s\S]*下载失败/);assert.match(recent[2],/视频 5[\s\S]*正在合并画面与声音 · 40%/);
  await page.waitForTimeout(250);await page.screenshot({path:path.join(report,'recent-360.png')});
  const [task]=await Promise.all([browser.waitForEvent('page'),page.locator('#recentList li button').first().click()]);assert.match(task.url(),/shiying-task\.html\?id=job7$/);await task.close();
  check('recent downloads list shows the latest five and opens their progress');
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
