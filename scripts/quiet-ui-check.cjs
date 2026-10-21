// Actual UI sources in isolated headless Chrome. API fixtures never download media.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'reports','quiet-ui-'+Date.now());fs.mkdirSync(report,{recursive:true});
const checks=[],errors=[];
async function workerChecks(){
 const listeners=[],tabs=[],id='a'.repeat(32),url='https://www.bilibili.com/video/BV15z4y1U7HS/';
 const records={shiyingJobIds:[],['shiyingCatalog:catalog']:{id:'catalog',createdAt:Date.now(),url,title:'Fixture',site:'bilibili',choices:[{height:720}],video:[],audio:[]}};
 const storage={get:async keys=>typeof keys==='string'?{[keys]:records[keys]}:Object.fromEntries(keys.map(k=>[k,records[k]]).filter(([,v])=>v!==undefined)),set:async values=>Object.assign(records,values)};
 const worker={console,Date,URL,crypto:require('node:crypto').webcrypto,ShiyingPlatform:require('../js/shiying-platform.js'),importScripts(){},chrome:{runtime:{id,getURL:s=>'chrome-extension://'+id+'/'+s,onMessage:{addListener:f=>listeners.push(f)}},storage:{local:storage,session:storage},offscreen:{hasDocument:async()=>true},declarativeNetRequest:{updateSessionRules:async()=>{}},tabs:{create:async x=>tabs.push(x)},downloads:{onChanged:{addListener(){}}}}};
 vm.createContext(worker);vm.runInContext(fs.readFileSync(path.join(root,'js/shiying-background.js'),'utf8'),worker);vm.runInContext('engineSend=async()=>({ok:true})',worker);
 const sender={id,frameId:0,url,tab:{id:7,windowId:2,url}};
 const dispatch=(event,caller=sender)=>new Promise(resolve=>listeners[0](event,caller,resolve));
 const job=await dispatch({Message:'shiyingFloatingStart',id:'catalog',format:'mp4',height:720,saveAs:true});assert(job.ok,job.error);assert.equal(tabs.length,0);assert.equal(job.height,720);assert.equal(job.saveAs,true);
 const forbidden=await dispatch({Message:'shiyingFloatingStart',id:'catalog',format:'mp4',height:1080});assert.equal(forbidden.ok,false);
 for(const caller of [{...sender,frameId:1},{...sender,url:'https://evil.test/'},{...sender,tab:{id:7,url:'https://www.bilibili.com/video/BV1234567890/'}}])assert.equal((await dispatch({Message:'shiyingFloatingJob',id:job.id},caller)).ok,false);
 records['shiyingJob:other']={id:'other',url:'https://www.bilibili.com/video/BV1234567890/'};
 assert.equal((await dispatch({Message:'shiyingFloatingJob',id:'other'})).ok,false);
 assert((await dispatch({Message:'shiyingFloatingDetails',id:job.id})).ok);assert.equal(tabs.length,1);assert(tabs[0].url.includes('shiying-task.html'));
 const second=await dispatch({Message:'shiyingPlatformStart',id:'catalog',format:'mp3',saveAs:false});assert(second.ok);assert.equal(tabs.length,1);assert.equal(second.saveAs,false);
 let preference=false;const saved=[];worker.chrome.storage.sync={get:async()=>({saveAs:preference})};worker.chrome.downloads.download=async options=>{saved.push(options);return saved.length;};worker.chrome.downloads.search=async()=>[{state:'in_progress'}];
 records['shiyingJob:'+job.id].status='verifying';await worker.engineSave({id:job.id,url:'blob:chrome-extension://'+id+'/fixture',filename:'fixture.mp4'});assert.equal(saved[0].saveAs,true);assert.equal(saved[0].filename,'fixture.mp4');
 preference=true;records['shiyingJob:'+second.id].status='verifying';await worker.engineSave({id:second.id,url:'blob:chrome-extension://'+id+'/fixture2',filename:'fixture.mp3'});assert.equal(saved[1].saveAs,false);assert.equal(saved[1].filename,'Ruxget/fixture.mp3');
 checks.push('Per-task folder choice reaches Chrome saveAs and suggested filename; later preference changes do not change an existing task');
 checks.push('Real worker start validates source, sender and available quality; floating and toolbar starts do not create tabs; details opens only on explicit request');
}
(async()=>{await workerChecks();const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 for(const url of ['https://www.bilibili.com/video/BV15z4y1U7HS/?p=2']){
  const context=await browser.newContext();
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fafbfd;font:16px system-ui}main{padding:24px}video{display:block;width:100%;max-width:800px;aspect-ratio:16/9;background:#28384e}</style><main><video></video><p>Background UI fixture, no media source</p><button id="outside">outside</button></main>'}));
  await context.addInitScript(()=>{
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const shadow=attach.call(this,options);if(this.id==='shiying-video-shortcut')window.shadow=shadow;return shadow;};
   window.sent=[];window.changes=[];window.store=JSON.parse(localStorage.getItem('quiet-test')||'{"shiyingFloating":{"hidden":false}}');window.deferRead=false;
   const get=async keys=>typeof keys==='string'?{[keys]:store[keys]}:Object.fromEntries(keys.map(k=>[k,store[k]]).filter(([,v])=>v!==undefined));
   window.change=async values=>{const changes={};for(const [key,value]of Object.entries(values)){changes[key]={oldValue:store[key],newValue:value};store[key]=value;}localStorage.setItem('quiet-test',JSON.stringify(store));window.changes.forEach(f=>f(changes,'local'));};
   window.chrome={storage:{sync:{get:async()=>({enable:true})},local:{get,set:change},onChanged:{addListener:f=>changes.push(f)}},runtime:{id:'a'.repeat(32),sendMessage:async event=>{
    sent.push(event);const url=location.hostname.includes('youtube')?'https://www.youtube.com/watch?v='+new URL(location.href).searchParams.get('v'):location.href;
    if(event.Message==='shiyingFloatingRead'){if(deferRead)await new Promise(resolve=>window.finishRead=resolve);return {ok:true,id:'catalog',url,title:'很长的标题 '+('detail '.repeat(30)),choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};}
    if(event.Message==='shiyingFloatingStart'){const job={ok:true,id:'job1',url,title:'Background task',status:'downloading',stage:'正在下载',progress:13,format:event.format,height:event.height};await change({shiyingJobIds:['job1'],'shiyingJob:job1':job});return job;}
    if(event.Message==='shiyingFloatingJob')return store['shiyingJob:'+event.id];
    if(event.Message==='shiyingFloatingCancel'){const job={...store['shiyingJob:job1'],status:'cancelled',stage:'已取消'};await change({'shiyingJob:job1':job});return job;}
    return {ok:true};
   }}};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});
  const host=page.locator('#shiying-video-shortcut');await page.mouse.move(100,100);await host.waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>sent.length),0,'hover read metadata or started a download');
  const pill=()=>page.evaluate(()=>{const r=shadow.querySelector('.open').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
  const click=async selector=>{const r=await page.evaluate(selector=>{const r=shadow.querySelector(selector).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};},selector);await page.mouse.click(r.x,r.y);};
  const visible=()=>page.evaluate(()=>!shadow.querySelector('.panel').hidden);
  const base=await pill();await page.mouse.move(base.x+20,base.y+base.height/2);assert.deepEqual(await pill(),base,'hover deformation');await click('.open');await page.waitForFunction(()=>shadow.querySelectorAll('.choice').length===3);assert(await visible());assert.equal(await page.evaluate(()=>sent.length),1);
  for(const width of [1280,736,360,320]){await page.setViewportSize({width,height:520});await page.waitForFunction(()=>{const r=shadow.querySelector('.panel').getBoundingClientRect();return r.x>=8&&r.y>=8&&r.right<=innerWidth&&r.bottom<=innerHeight;});assert(await page.evaluate(()=>shadow.querySelector('.panel').scrollWidth<=shadow.querySelector('.panel').clientWidth));}
  await page.screenshot({path:path.join(report,(url.includes('youtube')?'youtube':'bili')+'-dropdown-320.png')});
  await page.keyboard.press('Escape');assert(!await visible());await page.keyboard.press('Enter');assert(await visible(),'keyboard reopen failed');await page.mouse.click(4,4);assert(!await visible(),'outside click did not collapse');
  await click('.open');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await click('.choice');await page.waitForFunction(()=>shadow.querySelector('.panel').hidden&&shadow.querySelector('.open').textContent.includes('13%'),null,{timeout:5000}).catch(async error=>{console.error('START STATE',url,await page.evaluate(()=>({sent,store,panelHidden:shadow.querySelector('.panel').hidden})));throw error;});
  assert.equal(await page.evaluate(()=>sent.filter(e=>e.Message==='shiyingFloatingStart')[0].height),1080);
  await page.evaluate(()=>change({'shiyingJob:job1':{...store['shiyingJob:job1'],progress:47,stage:'正在合并'}}));await page.waitForFunction(()=>shadow.querySelector('.open').textContent.includes('47%'));await click('.open');assert((await page.evaluate(()=>shadow.querySelector('.note').textContent)).includes('合并'));
  assert.equal(await page.evaluate(()=>sent.filter(e=>e.Message==='shiyingFloatingRead').length),1,'progress click re-read catalog');
  await click('.hide');await host.waitFor({state:'hidden'});assert(!await visible());await page.reload();await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});await page.waitForFunction(()=>!!window.shadow);assert(await host.isHidden());
  await page.evaluate(()=>change({shiyingFloating:{...store.shiyingFloating,hidden:false}}));await host.waitFor({state:'visible'});assert(!await visible(),'restore opened a dropdown automatically');
  const r=await pill();await page.mouse.move(r.x+20,r.y+12);await page.mouse.down();await page.mouse.move(50,400,{steps:10});await page.mouse.up();assert(!await visible(),'drag opened menu');
  const saved=await page.evaluate(()=>store.shiyingFloating.position);await page.reload();await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});await host.waitFor({state:'visible'});const restored=await host.boundingBox();assert(Math.abs(restored.x-saved.x)<2&&Math.abs(restored.y-saved.y)<2);
  // Changing videos while a lazy read is pending must never revive the old menu.
  await page.evaluate(()=>{history.pushState({},'','/watch?v=mnopqrstuvw');window.dispatchEvent(new Event('yt-navigate-finish'));});if(url.includes('youtube')){await page.waitForFunction(()=>shadow.querySelector('.open').textContent==='↓ Ruxget');await page.evaluate(()=>window.deferRead=true);await click('.open');await page.waitForFunction(()=>!!window.finishRead);await page.evaluate(()=>{history.pushState({},'','/watch?v=12345678901');window.dispatchEvent(new Event('yt-navigate-finish'));});await page.waitForFunction(()=>shadow.querySelector('.panel').hidden);await page.evaluate(()=>finishRead());assert(!await visible());}
  checks.push(url+' hover stability; lazy anchored dropdown; 1280/736/360/320 bounds; Escape/outside/click collapse; quiet start; actual job events; persistent hide/toolbar restore; drag/save/reload; stale SPA read protection');await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks,errors,method:'exact sources with explicit metadata/job fixtures; no media requests, personal browser or screen interaction, no publication'},null,2));console.log('QUIET UI CHECKS PASSED '+report);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
