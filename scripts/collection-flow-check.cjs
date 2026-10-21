// Isolated headless fixtures + real worker functions. No media, personal profile, native IPC or downloads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const productRoot=path.resolve(__dirname,'..'),root=path.resolve(process.env.SHIYING_REVIEW_ROOT||productRoot),Collection=require(path.join(root,'js/shiying-collection.js'));
// YouTube playlists are a full-edition module; load it onto the same object so the parser stays tested.
globalThis.ShiyingCollection=Collection;require(path.join(root,'js/shiying-youtube.js'));
const checks=[], report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'shiying-collection-check-'));
function check(name){checks.push(name);console.log('PASS '+name);}
function fixture(){return {metadata:{playlistMetadataRenderer:{title:'公开视频列表测试'}},contents:{playlistVideoListRenderer:{contents:[
 {playlistVideoRenderer:{videoId:'abcdefghijk',title:{runs:[{text:'第一集：开始之前'}]},lengthText:{simpleText:'4:12'},isPlayable:true}},
 {playlistVideoRenderer:{videoId:'lmnopqrstuv',title:{runs:[{text:'第二集：把想法变成作品'}]},lengthText:{simpleText:'8:36'},isPlayable:true}},
 {playlistVideoRenderer:{videoId:'wxyz1234567',title:{runs:[{text:'已失效的视频'}]},isPlayable:false}}
 ]}}};}
function parserChecks(){
 assert.equal(Collection.source('https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890').url,'https://www.youtube.com/playlist?list=PL1234567890');
 for(const url of ['https://youtube.com.evil.test/playlist?list=PL1234567890','http://www.youtube.com/playlist?list=PL1234567890','https://x:y@www.youtube.com/playlist?list=PL1234567890'])assert.throws(()=>Collection.source(url));
 const data=fixture(),html='<script>var ytInitialData = '+JSON.stringify(data)+';</script>';
 const parsed=Collection.youtube(Collection.initialData(html));assert.equal(parsed.entries.length,3);assert.equal(parsed.entries[2].available,false);assert.equal(parsed.title,'公开视频列表测试');
 data.contents.playlistVideoListRenderer.contents.push({playlistVideoRenderer:{...data.contents.playlistVideoListRenderer.contents[0].playlistVideoRenderer}},{continuationItemRenderer:{}});
 const more=Collection.youtube(data);assert.equal(more.entries.length,3);assert.equal(more.hasMore,true);
 assert.throws(()=>Collection.initialData('<html>Sign in</html>'));
 const modern={contents:{items:[{lockupViewModel:{contentId:'abcdefghijk',contentType:'LOCKUP_CONTENT_TYPE_VIDEO',metadata:{lockupMetadataViewModel:{title:{content:'Modern item'}}},rendererContext:{commandContext:{onTap:{innertubeCommand:{watchEndpoint:{playlistId:'PL1234567890'}}}}}}}]}};
 assert.equal(Collection.youtube(modern,'PL1234567890').entries[0].title,'Modern item');assert.throws(()=>Collection.youtube(modern,'PL9876543210'));
 check('Playlist URL validation, balanced JSON, unavailable entries, duplicates and partial-list disclosure');
}
async function workerChecks(){
 const records={},session={},listeners=[],storageListeners=[],alarms=new Map(),starts=[];
 const store=values=>({get:async key=>typeof key==='string'?{[key]:values[key]}:Object.fromEntries((key||Object.keys(values)).filter(k=>k in values).map(k=>[k,values[k]])),set:async input=>Object.assign(values,structuredClone(input)),remove:async key=>delete values[key]});
 const id='a'.repeat(32),sender={id,url:'chrome-extension://'+id+'/shiying.html'};
 const worker=vm.createContext({console,URL,AbortSignal,crypto,setTimeout,clearTimeout,importScripts(){},ShiyingCollection:Collection,NATIVE_JOB_PREFIX:'shiyingJob:',chrome:{
  storage:{local:store(records),session:store(session),onChanged:{addListener:f=>storageListeners.push(f)}},alarms:{create:async(k,v)=>alarms.set(k,v),clear:async k=>alarms.delete(k),onAlarm:{addListener(){}}},
  runtime:{id,getURL:p=>'chrome-extension://'+id+'/'+p,onMessage:{addListener:f=>listeners.push(f)}}},
  platformRead:async({url})=>({id:url,choices:[{height:1080},{height:720}]}),
  platformStart:async event=>{starts.push(event);const job={id:'job'+starts.length,url:event.id,status:'downloading',collectionId:event.collectionId};records['shiyingJob:'+job.id]=job;records.shiyingJobIds=[...(records.shiyingJobIds||[]),job.id];return job;},
  jobSnapshot:async jobId=>records['shiyingJob:'+jobId],cancelPlatformJob:async jobId=>records['shiyingJob:'+jobId].status='cancelled'
 });
 vm.runInContext(fs.readFileSync(path.join(root,'js/shiying-collection-background.js'),'utf8'),worker);
 const dispatch=(event,caller=sender)=>new Promise(resolve=>listeners[0](event,caller,resolve));
 session['shiyingCollection:list']={id:'list',at:Date.now(),title:'test',entries:Collection.youtube(fixture()).entries};
 for(const indices of [[],[0,0],[2],[-1],[100]])assert.equal((await dispatch({Message:'shiyingCollectionStart',id:'list',indices,format:'mp4',height:1080})).ok,false);
 assert.equal(starts.length,0);
 const response=await dispatch({Message:'shiyingCollectionStart',id:'list',indices:[1,0],format:'mp3',height:720});assert(response.ok,response.error);
 await vm.runInContext('collectionPump',worker);assert.equal(starts.length,1);assert.equal(starts[0].format,'mp3');assert(starts[0].id.endsWith('lmnopqrstuv'));
 await Promise.all([vm.runInContext('pumpCollection()',worker),vm.runInContext('pumpCollection()',worker)]);assert.equal(starts.length,1);
 records['shiyingJob:job1'].status='error';records['shiyingJob:job1'].error='fixture failure';await vm.runInContext('pumpCollection()',worker);assert.equal(starts.length,2);assert(starts[1].id.endsWith('abcdefghijk'));
 assert.equal((await dispatch({Message:'shiyingCollectionStart',id:'list',indices:[0],format:'mp4',height:720})).ok,false);
 await dispatch({Message:'shiyingCollectionStop'});assert.equal(records.shiyingCollectionQueue.paused,true);assert.equal(records['shiyingJob:job2'].status,'cancelled');assert.equal(alarms.size,0);
 await vm.runInContext('pumpCollection()',worker);assert.equal(starts.length,2);
 const next=await dispatch({Message:'shiyingCollectionStart',id:'list',indices:[0],format:'mp4',height:720});assert(next.ok,next.error);await vm.runInContext('collectionPump',worker);assert.equal(starts.length,3);await dispatch({Message:'shiyingCollectionStop'});
 check('Real queue validates selection, respects order/format, avoids duplicate starts, isolates failures and stops cleanly');
}
async function browserChecks(){
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const extension=path.join(report,'extension');fs.mkdirSync(extension);
 for(const dir of ['js','css','img','lib','catch-script','_locales'])fs.cpSync(path.join(root,dir),path.join(extension,dir),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name==='manifest.json')fs.copyFileSync(path.join(root,name),path.join(extension,name));
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:440,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{
  await browser.route('**/*',route=>new URL(route.request().url()).protocol==='chrome-extension:'?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title><p>No media</p>'}));
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  const expectedVersion=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version;assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().version),expectedVersion);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const site=await browser.newPage();await site.goto('https://www.bilibili.com/video/BV15z4y1U7HS/');
  const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url?.includes('BV15z4y1U7HS')).id);
  await browser.addInitScript(({entries})=>{
    if(location.protocol!=='chrome-extension:')return;
    window.testCalls=[];window.delayCollection=false;const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendNativeMessage=async()=>{throw new Error('Native communication blocked by fixture');};chrome.downloads.download=async()=>{throw new Error('Download blocked by fixture');};
    chrome.runtime.sendMessage=async message=>{
      testCalls.push(message);
      if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',site:'bilibili',duration:252,choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};
      if(message.Message==='shiyingPlatformStart'){await new Promise(r=>setTimeout(r,30));return {ok:true,id:'job',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',status:'downloading',stage:'正在下载',progress:12};}
      if(message.Message==='shiyingCollectionRead'){if(delayCollection)await new Promise(resolve=>window.resolveCollection=resolve);return {ok:true,id:'list',title:'公开视频列表测试',entries,hasMore:true};}
      if(message.Message==='shiyingCollectionStart')return {ok:true,id:'queue',items:message.indices.map(i=>({...entries[i],status:'waiting'}))};
      if(message.Message==='shiyingCollectionState')return {ok:true};
      if(message.Message==='getData')return [];
      return send(message);
    };
  },{entries:Collection.youtube(fixture()).entries});
  const page=await browser.newPage();const url=`chrome-extension://${id}/shiying.html?tabId=${tabId}`;await page.goto(url);
  await page.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);
  assert.equal(await page.locator('#extensionVersion').textContent(),'Ruxget · '+expectedVersion);await page.locator('.menu summary').click();await page.locator('#extensionVersion').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(report,'plugin-version.png')});await page.locator('.menu summary').click();
  for(const width of [320,360,440]){await page.setViewportSize({width,height:640});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(report,'single-'+width+'.png')});}
  await page.locator('label[for=formatAudio]').click();assert.equal(await page.locator('#platformQuality').isVisible(),false);assert.match(await page.locator('#platformDownload').innerText(),/MP3/);
  for(const language of ['en','zh_CN']){
   await page.evaluate(async language=>RuxgetI18n.setLanguage(language),language);
   assert.match(await page.locator('label[for=formatAudio]').innerText(),/MP3/);assert.match(await page.locator('#platformDownload').innerText(),/MP3/);
   for(const width of [320,360,440]){await page.setViewportSize({width,height:640});assert(await page.locator('label[for=formatAudio]').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(report,'mp3-'+language+'-'+width+'.png')});}
  }
  const contrast=await page.locator('#platformQuality option').first().evaluate(option=>({color:getComputedStyle(option).color,background:getComputedStyle(option).backgroundColor}));assert.equal(contrast.background,'rgb(16, 29, 41)');assert.equal(contrast.color,'rgb(245, 248, 252)');

  await page.reload();await page.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);assert.equal(await page.locator('#formatAudio').isChecked(),true);
  assert(await page.locator('label[for=formatAudio]').isVisible());assert.match(await page.locator('label[for=formatAudio]').innerText(),/MP3/);await page.locator('#platformDownload').evaluate(b=>{b.click();b.click();});await page.waitForFunction(()=>testCalls.some(c=>c.Message==='shiyingPlatformStart'));
  assert.equal(await page.evaluate(()=>testCalls.filter(c=>c.Message==='shiyingPlatformStart').length),1);assert.equal(await page.evaluate(()=>testCalls.find(c=>c.Message==='shiyingPlatformStart').format),'mp3');
  // The tab is a watch page opened from a playlist (list=), so the card offers list selection.
  assert.equal(await page.locator('#collectionOpen').isVisible(),true);await page.locator('#collectionOpen').click();await page.locator('#collectionURL').fill('https://www.bilibili.com/video/BV15z4y1U7HS/');await page.locator('#collectionRead').click();await page.locator('#collectionList').waitFor({state:'visible'});
  assert.equal(await page.locator('#collectionItems input:checked').count(),0);assert.equal(await page.locator('#collectionItems input:disabled').count(),1);assert(await page.locator('#collectionStart').isDisabled());
  await page.locator('#collectionAll').check();assert.equal(await page.locator('#collectionItems input:checked').count(),2);await page.locator('#collectionAll').uncheck();
  await page.locator('#collectionItems input').nth(1).check();await page.locator('#collectionSearch').fill('第一集');assert.equal(await page.locator('#collectionItems label:visible').count(),1);assert.equal(await page.locator('#collectionItems input:checked').count(),1);await page.locator('#collectionSearch').fill('');
  for(const width of [320,440]){await page.setViewportSize({width,height:640});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const bounds=await page.locator('#collectionSheet').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+.5);await page.screenshot({path:path.join(report,'playlist-'+width+'.png')});}
  await page.locator('#collectionStart').click();const batch=await page.evaluate(()=>testCalls.find(c=>c.Message==='shiyingCollectionStart'));assert.deepEqual(batch.indices,[1]);assert.equal(batch.format,'mp4');assert(await page.locator('#collectionQueue').isVisible());
  await page.locator('#collectionClose').click();await page.locator('.menu').evaluate(menu=>menu.open=true);await page.locator('#collectionMenu').click();assert.equal(await page.locator('#collectionURL').inputValue(),'https://www.bilibili.com/video/BV15z4y1U7HS/');await page.locator('#collectionURL').fill('https://www.bilibili.com/video/BV1234567890/');assert.equal(await page.locator('#collectionList').isVisible(),false);await page.keyboard.press('Escape');assert.equal(await page.locator('#collectionSheet').isVisible(),false);
  check('Actual extension UI: 320/360/440 widths, remembered format, single-click guard, unchecked list, unavailable items, search, exact selection and Escape');
  // Render the actual desktop resources with a local host double; no native app is started.
  const desktop=await browser.newPage();let html=fs.readFileSync(path.join(productRoot,'desktop/interface.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'css/shiying.css'),'utf8')+'\n'+fs.readFileSync(path.join(productRoot,'desktop/interface.css'),'utf8');
  html=html.replace('__PLUGIN_CSS__',fs.readFileSync(path.join(root,'css/shiying.css'),'utf8')).replace('__DESKTOP_CSS__',fs.readFileSync(path.join(productRoot,'desktop/interface.css'),'utf8')).replace('__ICON__',fs.readFileSync(path.join(root,'img/shiying.svg'),'utf8')).replaceAll('__NONCE__','fixture').replace('__DESKTOP_JS__',fs.readFileSync(path.join(productRoot,'desktop/interface.js'),'utf8'));
  await desktop.addInitScript(()=>{window.hostCalls=[];window.chrome={webview:{postMessage:message=>hostCalls.push(message),addEventListener:(name,fn)=>window.deliver=fn}};});
  await desktop.route('http://desktop.fixture/',route=>route.fulfill({contentType:'text/html',body:html}));await desktop.goto('http://desktop.fixture/');await desktop.addStyleTag({content:css});
  await desktop.evaluate(version=>deliver({data:{type:'state',version:version,jobs:[],settings:{Folder:'C:\\Downloads\\Ruxget',UiLanguage:'zh_CN'},busy:false}}),expectedVersion);
  assert.equal(await desktop.locator('#appVersion').textContent(),'Ruxget · '+expectedVersion);
  await desktop.evaluate(()=>deliver({data:{type:'editor',context:{token:'editor-token',url:'https://www.youtube.com/playlist?list=PL1234567890',kind:'video',height:1080,folder:'C:\\Downloads\\Ruxget',categorize:false}}}));
  assert.match(await desktop.locator('#confirmAdd').innerText(),/读取列表/);await desktop.locator('#confirmAdd').click();
  const request=await desktop.evaluate(()=>hostCalls.find(c=>c.command==='readCollection'));assert(request);assert.equal(await desktop.evaluate(()=>hostCalls.filter(c=>c.command==='add').length),0);
  await desktop.evaluate(({request,entries})=>deliver({data:{type:'collection',token:request.token,request:request.request,catalog:{title:'公开视频列表测试',entries,hasMore:false}}}),{request,entries:Collection.youtube(fixture()).entries});
  assert(await desktop.locator('#confirmAdd').isDisabled());await desktop.locator('#editorListItems input').nth(1).check();
  await desktop.setViewportSize({width:960,height:720});await desktop.screenshot({path:path.join(report,'desktop-playlist.png')});
  await desktop.selectOption('#editorKind','audio');assert.equal(await desktop.locator('#editorListItems input:checked').count(),1);await desktop.locator('#confirmAdd').click();const chosen=await desktop.evaluate(()=>hostCalls.find(c=>c.command==='addCollection'));assert.deepEqual(chosen.indices,[1]);assert.equal(chosen.token,'editor-token');assert.equal(chosen.kind,'audio');
  // Changing the URL invalidates a late read result.
  await desktop.locator('#editorURL').fill('https://www.youtube.com/playlist?list=PL9876543210');await desktop.evaluate(({request,entries})=>deliver({data:{type:'collection',token:request.token,request:request.request,catalog:{title:'stale',entries}}}),{request,entries:Collection.youtube(fixture()).entries});assert.equal(await desktop.locator('#editorList').isVisible(),false);
  check('Actual desktop UI: read before add, unchecked selection, exact host payload, busy controls and stale-result rejection');
  assert.deepEqual(errors,[]);check('No unhandled page errors in extension or desktop fixtures');
 }finally{await browser.close();}
}
(async()=>{parserChecks();await workerChecks();await browserChecks();fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks,testedPluginRoot:root,downloadsStarted:0,personalBrowserTouched:false,screensAndMouseUsed:false},null,2));console.log('REPORT '+report);})().catch(error=>{fs.writeFileSync(path.join(report,'failure.txt'),error.stack);console.error(error);console.log('REPORT '+report);process.exitCode=1;});
