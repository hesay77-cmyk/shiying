// UI and click-flow fixtures, deliberately separate from real download/IPC evidence.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'reports','desktop-ui-'+Date.now());fs.mkdirSync(report,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');fs.createReadStream(file).pipe(res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({deviceScaleFactor:2}),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.addInitScript(()=>{
   const site={id:1,title:'沿着海岸线的旅行',url:'https://www.youtube.com/watch?v=abcdefghijk'},noop={addListener(){}},updated=[];
   window.changeSource=url=>{site.url=url;site.title='切换后的视频';updated.forEach(fn=>fn(1,{url},site));};
   window.sentNative=[];window.openedTabs=[];window.permissionRequests=0;window.nativeGranted=false;window.nativeMissing=false;
   window.chrome={tabs:{get:async()=>({...site}),query:async()=>[{...site}],create:async x=>{window.openedTabs.push(x);return x;},onActivated:noop,onUpdated:{addListener:fn=>updated.push(fn)}},storage:{sync:{get:async()=>({saveAs:false,enable:true}),set:async()=>{}},local:{get:async()=>({}),set:async()=>{}},onChanged:noop},permissions:{getAll:async()=>({origins:['https://www.youtube.com/*']}),contains:async()=>window.nativeGranted,request:async()=>{window.permissionRequests++;return window.nativeGranted=true;}},downloads:{onChanged:noop},runtime:{id:'a'.repeat(32),getManifest:()=>({host_permissions:['https://www.youtube.com/*']}),getURL:x=>x,onMessage:noop,sendNativeMessage:async(host,payload)=>{window.sentNative.push({host,payload});if(window.nativeMissing)throw new Error('Specified native messaging host not found');return {ok:true,stage:'confirm',version:'0.4.9'};},sendMessage:async event=>{
    if(event.Message==='getData')return window.fixtureMedia||[];
    if(event.Message==='shiyingPlatformRead')return {ok:true,id:'fixture',title:site.title,site:'youtube',duration:59.8,choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};
    if(event.Message==='shiyingPlatformDesktop')return {ok:true,payload:{action:'add',kind:'tracks',url:site.url,height:event.height,videoUrl:'https://r1.googlevideo.com/video',audioUrl:'https://r1.googlevideo.com/audio'}};
    return {ok:true};
   }}};
  });
  const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/shiying.html?tabId=1`);await page.locator('#platformDesktop').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#platformDesktop').disabled);
  for(const width of [440,360,320]){await page.setViewportSize({width,height:660});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.getByRole('button',{name:'隐藏下载浮钮',exact:true}).isVisible());assert.equal(await page.locator('.menu').getAttribute('open'),null);const panel=await page.locator('body').boundingBox();await page.screenshot({path:path.join(report,`panel-${width}.png`),clip:{x:0,y:0,width,height:Math.ceil(panel.height)}});}
  await page.selectOption('#platformQuality','720');await page.click('#platformDesktop');await page.waitForFunction(()=>window.sentNative.length===1);const native=await page.evaluate(()=>window.sentNative[0]);assert.equal(native.host,'org.shiying.desktop');assert.equal(native.payload.height,720);assert(await page.locator('#platformNote').innerText().then(text=>text.includes('桌面窗口确认')));
  assert((await page.locator('#platformMeta').innerText()).includes('1:00'));
  await page.evaluate(()=>window.changeSource('https://www.youtube.com/watch?v=mnopqrstuvw'));await page.waitForFunction(()=>document.querySelector('#platformTitle').textContent==='切换后的视频');assert.equal(await page.locator('#platformURL').inputValue(),'https://www.youtube.com/watch?v=mnopqrstuvw');
  await page.locator('.menu summary').click();await page.getByRole('button',{name:'桌面版安装与连接',exact:true}).click();assert.equal(await page.evaluate(()=>window.openedTabs.at(-1).url),'shiying-desktop.html');
  await page.goto(`http://127.0.0.1:${server.address().port}/shiying-desktop.html`);assert.equal(await page.locator('#desktopExtensionId').textContent(),'a'.repeat(32));
  assert.equal(await page.locator('.install-steps>li').count(),4);
  for(const anchor of ['install-steps','connection','troubleshooting','extension-install'])assert.equal(await page.locator('#'+anchor).count(),1);
  const guide=await page.locator('main').innerText();for(const text of ['0.4.26','0.4.4','安装并连接','尚未公开发布','当前没有公开下载地址','无需管理员权限','允许本机通信','http://127.0.0.1:7897','清空代理地址','加载已解压的扩展程序','manifest.json','重新加载'])assert(guide.includes(text),'missing install instruction: '+text);
  const installer=await page.locator('.installer-name').innerText();assert.equal(installer,'拾影-0.4.26-BT优化与快速关闭-安装预览.exe');
  assert.equal(await page.locator('a[download]').count(),0,'preview guide must not advertise an unpublished download');
  assert.equal(await page.evaluate(()=>window.permissionRequests),0);assert.equal(await page.evaluate(()=>window.sentNative.length),0);
  assert.equal(await page.locator('#pairDesktop').getAttribute('href'),'shiying-desktop://pair/'+'a'.repeat(32));
  await page.click('#checkDesktopConnection');await page.waitForFunction(()=>document.querySelector('#desktopConnectionStatus').dataset.state==='ready');assert((await page.locator('#desktopConnectionStatus').innerText()).includes('0.4.9'));assert.equal(await page.evaluate(()=>window.sentNative[0].payload.action),'ping');
  for(const width of [320,960]){await page.setViewportSize({width,height:900});await page.evaluate(()=>{document.querySelectorAll('details').forEach(item=>item.open=true);window.scrollTo(0,0);});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(report,`connection-${width}.png`),fullPage:true});await page.screenshot({path:path.join(report,`connection-top-${width}.png`)});}
  await page.evaluate(()=>window.nativeMissing=true);await page.click('#checkDesktopConnection');await page.waitForFunction(()=>document.querySelector('#desktopConnectionStatus').dataset.state==='missing');assert((await page.locator('#desktopConnectionStatus').innerText()).includes('安装器'));
  await page.evaluate(()=>window.chrome.permissions.request=async()=>false);await page.click('#checkDesktopConnection');await page.waitForFunction(()=>document.querySelector('#desktopConnectionStatus').textContent.includes('允许拾影'));
  assert((await page.evaluate(()=>window.sentNative)).every(message=>message.payload.action==='ping'),'guide check sent a download');
  await page.goto(`http://127.0.0.1:${server.address().port}/shiying-help.html`);assert.equal(await page.getByRole('link',{name:'桌面版完整安装方法与连接检查',exact:true}).getAttribute('href'),'shiying-desktop.html');assert((await page.locator('main').innerText()).includes('显示浮钮'));
  for(const width of [320,960]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.goto(`http://127.0.0.1:${server.address().port}/shiying.html?tabId=1`);
  const emptyCases=[['ordinary','https://example.test/article',false],['store','https://chromewebstore.google.com/detail/example',true],['old-store','https://chrome.google.com/webstore/detail/example',true],['settings','chrome://extensions/',true]];
  for(const [name,url,restricted] of emptyCases){
   await page.evaluate(url=>window.changeSource(url),url);await page.waitForFunction(url=>document.querySelector('#pageHost').textContent===new URL(url).hostname,url);
   await page.waitForFunction(()=>document.body.classList.contains('no-media')&&!document.querySelector('#empty').hidden);await page.waitForFunction(restricted=>document.querySelector('#siteAccess').hidden===restricted,restricted);
   assert(await page.locator('.filters').isHidden());assert(await page.locator('.list-heading').isHidden());assert(await page.locator('footer').isHidden());
   if(restricted)assert((await page.locator('#empty').innerText()).includes('此页面无法读取视频'));
   for(const width of [320,360]){await page.setViewportSize({width,height:660});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const body=await page.locator('body').boundingBox();assert(body.height<(restricted?320:420),'empty state became a tall column');await page.screenshot({path:path.join(report,`empty-${name}-${width}.png`),clip:{x:0,y:0,width,height:Math.ceil(body.height)}});}
  }
  await page.evaluate(()=>{window.fixtureMedia=[{url:'https://cdn.example.test/sample.mp4',title:'实际媒体布局样例',mime:'video/mp4',ext:'mp4',size:2048}];window.changeSource('https://example.test/video');});await page.locator('.media-item').waitFor({state:'visible'});assert(await page.locator('.filters').isVisible());assert(await page.locator('.list-heading').isVisible());
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,method:'real Chrome rendering with mocked extension APIs; not a logged-in or installed-host acceptance',checks:['440px and 320px panel layout','selected quality sent to native host','desktop confirmation message','menu and help-page install guide entry','four ordered install steps and honest unpublished download status','installer name, local extension folder and manifest selection','connection guide 320px and 960px layout with expanded troubleshooting','no permission prompt or native launch on initial ungranted load','explicit permission and ping version status','one-click pairing URL','missing host recovery instructions','permission refusal message','guide checks only ping without starting a download','proxy setup, component preparation and saved-file location instructions'],errors},null,2));console.log('UI FIXTURES PASSED',report);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
