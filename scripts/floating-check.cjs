// Render and exercise exact source with explicit page/API fixtures. Never contact media sites.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'reports','floating-'+Date.now());fs.mkdirSync(report,{recursive:true});
(async()=>{
 const listeners=[],popped=[],opened=[],fallback=[],id='a'.repeat(32),url='https://www.bilibili.com/video/BV15z4y1U7HS/';
 const worker={console,Date,URL,ShiyingPlatform:require('../js/shiying-platform.js'),importScripts(){},chrome:{runtime:{id,getURL:s=>'chrome-extension://'+id+'/'+s,onMessage:{addListener:f=>listeners.push(f)}},sidePanel:{open:options=>{opened.push(options);return Promise.resolve();}},tabs:{create:options=>{fallback.push(options);return Promise.resolve();}},downloads:{onChanged:{addListener(){}}}}};
 vm.createContext(worker);vm.runInContext(fs.readFileSync(path.join(root,'js/shiying-background.js'),'utf8'),worker);
 worker.chrome.action={openPopup:options=>{popped.push(options);return Promise.resolve();}};
 const sender={id,frameId:0,url,tab:{id:23,windowId:8,url}};
 const dispatch=caller=>new Promise(resolve=>listeners[0]({Message:'shiyingOpenPanel'},caller,resolve));
 const pending=dispatch(sender);assert.equal(popped.length,1,'popup call lost the click gesture');assert((await pending).ok);assert.equal(popped[0].windowId,8);assert.equal(opened.length,0);
 for(const caller of [{...sender,frameId:1},{...sender,url:'https://evil.test/'},{...sender,tab:{id:23,url:'https://www.bilibili.com/video/BV1234567890/'}}])assert.equal((await dispatch(caller)).ok,false);
 assert.equal(popped.length,1);worker.chrome.action.openPopup=async()=>{throw new Error('popup unavailable');};assert((await dispatch(sender)).ok);assert.equal(fallback[0].url,'chrome-extension://'+id+'/shiying.html?tabId=23');
 delete worker.chrome.action.openPopup;assert((await dispatch(sender)).ok);assert.equal(opened[0].tabId,23);
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const checks=[],errors=[];
 try{
  for(const [site,url,next] of [['bilibili','https://www.bilibili.com/video/BV15z4y1U7HS/','https://www.bilibili.com/video/BV1234567890/']]){
   const context=await browser.newContext();
   await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f6f8fc;font:16px system-ui;color:#24334a}header{padding:18px 28px;background:#fff;border-bottom:1px solid #dce3ef}main{padding:24px}video{display:block;width:100%;max-width:640px;aspect-ratio:16/9;background:#172942}h1{font-size:22px}p{color:#637189}</style><header>拾影 · 悬浮入口界面测试样例</header><main><video aria-label="测试播放器"></video><h1>'+site+' 页面布局样例</h1><p>仅验证布局与按钮，没有加载或下载任何视频。</p></main>'}));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);if(this.id==='shiying-video-shortcut')window.floatingRoot=root;return root;};
    window.sent=[];window.settingChanged=[];
    window.chrome={storage:{sync:{get:async()=>({enable:true})},local:{
     get:async()=>({shiyingFloating:JSON.parse(localStorage.getItem('floating-test')||'{}')}),
     set:async values=>{const previous=JSON.parse(localStorage.getItem('floating-test')||'{}');localStorage.setItem('floating-test',JSON.stringify(values.shiyingFloating));window.settingChanged.forEach(f=>f({shiyingFloating:{oldValue:previous,newValue:values.shiyingFloating}},'local'));}
    },onChanged:{addListener:f=>window.settingChanged.push(f)}},runtime:{id:'a'.repeat(32),sendMessage:async message=>{window.sent.push(message);return {ok:true,id:'fixture',title:'本地清晰度样例',choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};}}};
   });
   await page.goto(url);await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});
   for(const width of [1280,320]){
    await page.setViewportSize({width,height:720});const video=await page.locator('video').boundingBox();await page.mouse.move(video.x+video.width/2,video.y+video.height/2);
    const host=page.locator('#shiying-video-shortcut');await host.waitFor({state:'visible'});const box=await host.boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=720,'shortcut overflow');
    async function visualState(){const png=await host.screenshot();return page.evaluate(async uri=>{const img=new Image();img.src=uri;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const context=canvas.getContext('2d');context.drawImage(img,0,0);const pixel=(x,y)=>[...context.getImageData(x,y,1,1).data];const r=document.querySelector('#shiying-video-shortcut').getBoundingClientRect();return {box:{x:r.x,y:r.y,width:r.width,height:r.height},font:getComputedStyle(window.floatingRoot.querySelector('.open')).font,corners:[pixel(2,2),pixel(img.width-3,2),pixel(2,img.height-3),pixel(img.width-3,img.height-3)]};},'data:image/png;base64,'+png.toString('base64'));}
    const normal=await visualState();
    for(const point of [{x:box.x+30,y:box.y+box.height/2},{x:box.x+box.width-12,y:box.y+box.height/2}]){
     await page.mouse.move(point.x,point.y);const hover=await visualState();assert.deepEqual(hover.box,normal.box,'hover changed shortcut geometry');assert.equal(hover.font,normal.font,'hover changed shortcut font');assert.deepEqual(hover.corners,normal.corners,'hover fill paints outside the rounded border');
    }
    await page.screenshot({path:path.join(report,site+'-'+width+'-hover.png')});await page.mouse.move(video.x+video.width/2,video.y+video.height/2);
    await page.screenshot({path:path.join(report,site+'-'+width+'.png')});checks.push(site+' '+width+'px');
   }
   const host=page.locator('#shiying-video-shortcut');
   await page.mouse.move(4,4);await page.evaluate(()=>chrome.storage.local.set({shiyingFloating:{hidden:false}}));await host.waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.floatingRoot.querySelectorAll('.pill button').length),1,'floating control still has a separate close button');
   checks.push(site+' explicit show works without hovering the player or a saved position; one clean download button');
   async function drag(dx,dy){const box=await host.boundingBox();const x=box.x+30,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
   const before=await host.boundingBox();await drag(40-before.x,500-before.y);
   let box=await host.boundingBox();assert(Math.abs(box.x-40)<2&&Math.abs(box.y-500)<2,'free dragging outside player failed');
   assert.equal(await page.evaluate(()=>window.sent.length),0,'dragging opened the download panel');
   const saved=await page.evaluate(async()=>(await chrome.storage.local.get()).shiyingFloating.position);assert(saved.x===40&&saved.y===500);
   await page.mouse.move(4,4);await host.waitFor({state:'visible'});
   await page.screenshot({path:path.join(report,site+'-dragged.png')});
   await page.reload();await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});await host.waitFor({state:'visible'});
   box=await host.boundingBox();assert(Math.abs(box.x-saved.x)<2&&Math.abs(box.y-saved.y)<2,'saved position was lost on refresh');
   await drag(2000,2000);box=await host.boundingBox();assert(box.x>=8&&box.x+box.width<=320&&box.y+box.height<=720,'drag escaped viewport');
   await page.setViewportSize({width:1280,height:720});await drag(700,-100);await page.setViewportSize({width:320,height:420});
   await page.waitForFunction(()=>{const box=document.querySelector('#shiying-video-shortcut').getBoundingClientRect();return box.x>=8&&box.right<=innerWidth&&box.bottom<=innerHeight;});
   box=await host.boundingBox();assert(box.x>=8&&box.x+box.width<=320&&box.y+box.height<=420,'resize lost floating control');
   // A slight pointer movement remains a click; a completed drag never opens the panel.
   assert.equal(await page.evaluate(()=>window.sent.length),0);
   await drag(2,1);assert.equal(await page.evaluate(()=>window.sent.length),1);assert.equal(await page.evaluate(()=>window.sent[0].Message),'shiyingFloatingRead');
   await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.sent.length),1,'keyboard collapse re-read metadata');assert(await page.evaluate(()=>window.floatingRoot.querySelector('.panel').hidden),'keyboard collapse failed');
   await page.evaluate(async()=>{const settings=(await chrome.storage.local.get()).shiyingFloating;await chrome.storage.local.set({shiyingFloating:{...settings,hidden:true}});});await page.locator('#shiying-video-shortcut').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(async()=>(await chrome.storage.local.get()).shiyingFloating.hidden),true);
   await page.evaluate(next=>history.pushState({},'',next),next);const video=await page.locator('video').boundingBox();await page.mouse.move(video.x+40,video.y+50);assert(await host.isHidden(),'SPA navigation restored hidden control');
   await page.reload();await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});assert(await host.isHidden(),'refresh restored hidden control');
   await page.evaluate(async()=>{const settings=(await chrome.storage.local.get()).shiyingFloating;await chrome.storage.local.set({shiyingFloating:{...settings,hidden:false}});});await host.waitFor({state:'visible'});
   await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});assert.equal(await page.locator('#shiying-video-shortcut').count(),1);
   await page.evaluate(()=>window.settingChanged.forEach(f=>f({enable:{newValue:false}},'sync')));await page.locator('#shiying-video-shortcut').waitFor({state:'hidden'});
   await page.evaluate(()=>window.settingChanged.forEach(f=>f({enable:{newValue:true}},'sync')));await page.locator('#shiying-video-shortcut').waitFor({state:'visible'});
   await page.evaluate(()=>history.pushState({},'','/'));await page.mouse.move(video.x+60,video.y+60);await page.locator('#shiying-video-shortcut').waitFor({state:'hidden'});
   checks.push(site+' hover corner pixels, font and geometry unchanged; free drag, drag-click suppression, small-movement click, keyboard activation, saved position, viewport bounds, persistent hide, restore, SPA replacement, duplicate guard, pause and unsupported page');await context.close();
  }
  // Exercise the visible topbar control without opening the menu; keep the stored position.
  const context=await browser.newContext(),panel=await context.newPage();panel.on('pageerror',e=>errors.push(e.message));
  await panel.setContent(fs.readFileSync(path.join(root,'shiying.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  await panel.evaluate(()=>{
   window.settings={hidden:true,position:{x:75,y:215}};window.changed=[];window.closedPanels=[];
   window.chrome={storage:{local:{get:async()=>({shiyingFloating:window.settings}),set:async values=>{window.settings=values.shiyingFloating;window.changed.forEach(f=>f({shiyingFloating:{newValue:window.settings}},'local'));}},sync:{get:async()=>({saveAs:false,enable:true})},onChanged:{addListener:f=>window.changed.push(f)}},runtime:{id:'a'.repeat(32),sendMessage:async()=>[],onMessage:{addListener(){}}},tabs:{query:async()=>[{id:23,url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'fixture'}],onActivated:{addListener(){}},onUpdated:{addListener(){}}},downloads:{onChanged:{addListener(){}}}};
   window.chrome.windows={getCurrent:async()=>({id:8})};
   window.chrome.sidePanel={close:async options=>{if(!window.settings.hidden)throw new Error('closed before saving hidden state');if(window.globalPanelOnly&&options.tabId)throw new Error('no tab-specific panel');window.closedPanels.push(options);}};
   window.ShiyingPlatformUI={bind:async()=>{},refresh:async()=>{}};window.ShiyingAccess={sync:async()=>{},origin:()=>null};
  });
  await panel.evaluate(catalog=>{window.RuxgetI18n={t:key=>catalog[key]?.message||key,pick:zh=>zh};},JSON.parse(fs.readFileSync(path.join(root,'_locales/zh_CN/messages.json'))));
  await panel.addScriptTag({path:path.join(root,'js/shiying-core.js')});await panel.addScriptTag({path:path.join(root,'js/shiying.js')});
  assert.equal(await panel.locator('.menu').getAttribute('open'),null);assert(await panel.locator('.topbar #floatingToggle').isVisible());
  await panel.getByRole('button',{name:'显示浮钮',exact:true}).click();assert.deepEqual(await panel.evaluate(()=>window.settings),{hidden:false,position:{x:75,y:215}});assert.equal(await panel.evaluate(()=>window.closedPanels.length),0);
  await panel.getByRole('button',{name:'隐藏浮钮',exact:true}).click();await panel.waitForFunction(()=>window.closedPanels.length===1);assert.equal(await panel.evaluate(()=>window.settings.hidden),true);assert.deepEqual(await panel.evaluate(()=>window.closedPanels),[{tabId:23}]);
  await panel.evaluate(()=>{window.settings={hidden:false,position:{x:75,y:215}};window.changed.forEach(f=>f({shiyingFloating:{newValue:window.settings}},'local'));});assert(await panel.getByRole('button',{name:'隐藏浮钮',exact:true}).isVisible());
  await panel.evaluate(()=>{window.globalPanelOnly=true;});await panel.getByRole('button',{name:'隐藏浮钮',exact:true}).click();await panel.waitForFunction(()=>window.closedPanels.length===2);assert.deepEqual(await panel.evaluate(()=>window.closedPanels[1]),{windowId:8});
  await context.close();checks.push('visible topbar hide/restore without menu, retained position, live setting synchronization, hidden state saved before sidebar close, show does not close, and fallback from tab-specific to global sidebar close');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,method:'real Chrome rendering with explicit page and API fixtures; no media requests, personal profile, or site compatibility acceptance',checks,worker:['synchronous user gesture','top-frame and current-source checks','side-panel fallback'],errors},null,2));console.log('FLOATING CHECKS PASSED',report);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
