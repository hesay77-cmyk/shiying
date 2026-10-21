// Real extension upgrade and recovery in an isolated headless profile; no live media.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'reports','floating-recovery-'+Date.now());
const source=path.resolve(process.argv[2]||path.join(root,'build')),extension=path.join(report,'extension');
fs.mkdirSync(report,{recursive:true});fs.cpSync(source,extension,{recursive:true});
const manifestPath=path.join(extension,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
const targetVersion=manifest.version;manifest.version='0.4.28';fs.writeFileSync(manifestPath,JSON.stringify(manifest));
const checks=[],errors=[],downloads=[];let context,worker,media=0;
(async()=>{try{
 context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',channel:'chromium',headless:true,viewport:{width:1100,height:720},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
 await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(request.resourceType()==='media'){media++;return route.abort();}if(request.resourceType()==='document'&&['www.youtube.com','www.bilibili.com'].includes(url.hostname))return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>浮钮恢复样例</title><style>body{margin:0}video{display:block;width:800px;height:450px;background:#29465b}</style><video></video>'});return url.protocol==='chrome-extension:'?route.continue():route.abort();});
 context.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>{downloads.push(download.suggestedFilename());download.cancel();});});
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).hostname;assert.equal(id,'ngklfiicdldbiangnpolcbnicnkjgkfp');
 const saved={ruxgetUiLanguage:'zh_CN',shiyingFloating:{hidden:false,position:{x:500,y:32}},shiyingJobIds:['recovery-check'],'shiyingJob:recovery-check':{id:'recovery-check',url:'https://fixture.invalid/',status:'paused',progress:17},shiyingNetdiskBaiduGrant:{sealed:'fixture-only-do-not-use',createdAt:12345},shiyingNetdisks:{baidu:{enabled:false,visible:false}}};
 await worker.evaluate(values=>chrome.storage.local.set(values),saved);
 const pages=[];for(const url of ['https://www.bilibili.com/video/BV15z4y1U7HS/']){const page=await context.newPage();await page.goto(url);await page.locator('#shiying-video-shortcut').waitFor({state:'visible'});pages.push(page);}
 const manager=await context.newPage();await manager.goto('chrome://extensions');
 await manager.evaluate(()=>new Promise(resolve=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true},resolve)));
 async function reload(version){
  manifest.version=version;fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  const next=context.waitForEvent('serviceworker',{timeout:15000});
  await manager.evaluate(id=>new Promise((resolve,reject)=>chrome.developerPrivate.reload(id,{failQuietly:true},()=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve())),id);
  try{worker=await next;}catch(error){const info=await manager.evaluate(id=>chrome.developerPrivate.getExtensionInfo(id),id);fs.writeFileSync(path.join(report,'reload-diagnostic.json'),JSON.stringify({workers:context.serviceWorkers().map(item=>item.url()),state:info.state,disableReasons:info.disableReasons,runtimeErrors:info.runtimeErrors,manifestErrors:info.manifestErrors},null,2));throw error;}
  await worker.evaluate(()=>chrome.runtime.getManifest());
 }
 const original=await pages[0].locator('#shiying-video-shortcut').elementHandle();
 await reload(targetVersion);
 await pages[0].waitForFunction(element=>!element.isConnected,original);
 for(const page of pages){await page.locator('#shiying-video-shortcut').waitFor({state:'visible'});assert.equal(await page.locator('#shiying-video-shortcut').count(),1);}
 assert.deepEqual(await worker.evaluate(keys=>chrome.storage.local.get(keys),Object.keys(saved)),saved);
 assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().version),targetVersion);
 checks.push('actual version upgrade restores exactly one float on already-open Bilibili pages without refreshing or moving the pointer; tasks, sealed grant, visibility and position survive');
 const page=pages[0],tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,page.url());
 // Simulate a site's DOM rebuild removing our host, then open the actual toolbar page.
 await page.locator('#shiying-video-shortcut').evaluate(node=>node.remove());
 let panel=await context.newPage();await panel.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
 await page.locator('#shiying-video-shortcut').waitFor({state:'visible'});
 assert.equal(await page.locator('#shiying-video-shortcut').count(),1);
 checks.push('opening the actual extension panel repairs a missing host without a video refresh');
 await panel.getByRole('button',{name:'隐藏浮钮',exact:true}).click();
 for(const p of pages)await p.locator('#shiying-video-shortcut').waitFor({state:'hidden'});
 await reload(targetVersion+'.1');
 for(const p of pages){await p.locator('#shiying-video-shortcut').waitFor({state:'attached'});assert(await p.locator('#shiying-video-shortcut').isHidden());}
 const hidden=await worker.evaluate(async()=>(await chrome.storage.local.get('shiyingFloating')).shiyingFloating);assert.deepEqual(hidden,{...saved.shiyingFloating,hidden:true});
 checks.push('an explicitly hidden control stays hidden after another real upgrade, with its saved position retained');
 await page.locator('#shiying-video-shortcut').evaluate(node=>node.remove());
 panel=await context.newPage();await panel.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await panel.getByRole('button',{name:'显示浮钮',exact:true}).click();
 for(const p of pages)await p.locator('#shiying-video-shortcut').waitFor({state:'visible'});
 assert.equal(await page.locator('#shiying-video-shortcut').count(),1);
 assert.deepEqual(await worker.evaluate(async()=>(await chrome.storage.local.get('shiyingFloating')).shiyingFloating),saved.shiyingFloating);
 checks.push('the real Show button restores a missing host immediately, keeps the dragged position and creates no duplicate');
 await worker.evaluate(position=>chrome.storage.local.set({shiyingFloating:{position}}),saved.shiyingFloating.position);
 await panel.getByRole('button',{name:'显示浮钮',exact:true}).click();
 assert.deepEqual(await worker.evaluate(async()=>(await chrome.storage.local.get('shiyingFloating')).shiyingFloating),saved.shiyingFloating);
 checks.push('a default hover-only preference offers Show, and one click explicitly displays the float instead of hiding it first');
 assert.deepEqual(errors,[]);assert.deepEqual(downloads,[]);assert.equal(media,0);
 const result={ok:true,pluginVersion:targetVersion,checks,errors,personalBrowserUsed:false,mediaDownloaded:false,published:false};fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify(result,null,2));console.log('FLOATING RECOVERY CHECK PASSED',report,JSON.stringify(result));
}finally{if(context)await context.close();}})().catch(error=>{fs.writeFileSync(path.join(report,'error.txt'),error.stack);console.error(error);process.exitCode=1;});
