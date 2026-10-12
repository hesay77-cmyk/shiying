// Unmodified product manifest. Native permission approval remains a manual UI check.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),run=path.join(root,'.checks','access-'+Date.now());fs.mkdirSync(run,{recursive:true});
(async()=>{
 const server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end('<title>未授权网站样本</title><video src="/video.mp4"></video>')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const extension=path.join(root,'build');let context;
 try{
  context=await chromium.launchPersistentContext(path.join(run,'profile'),{executablePath:process.env.SHIYING_CHROMIUM,headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  const origins=(await worker.evaluate(()=>chrome.permissions.getAll())).origins;
  assert(!origins.some(origin=>/<all_urls>|:\/\/\*\//.test(origin)));assert(!origins.some(origin=>origin.includes('127.0.0.1')));
  const site=await context.newPage();await site.goto('http://127.0.0.1:'+server.address().port+'/');
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,site.url());
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await popup.locator('#allowSite').waitFor({state:'visible'});
  assert.equal(await popup.locator('.media-item').count(),0);
  // Simulate the user's denial, without interacting with a native prompt.
  await popup.evaluate(()=>{chrome.permissions.request=async request=>{globalThis.testRequest=request;return false}});await popup.locator('#allowSite').click();
  await popup.getByText('未授权，已有下载和已允许的网站仍可使用',{exact:true}).waitFor();
  const request=await popup.evaluate(()=>globalThis.testRequest);assert.deepEqual(request.origins,['http://127.0.0.1/*']);
  assert(!(await worker.evaluate(()=>chrome.permissions.getAll())).origins.some(origin=>origin.includes('127.0.0.1')));
  assert.equal(await worker.evaluate(tabId=>(cacheData[tabId]||[]).length,tabId),0);
  const blocked=await popup.evaluate(url=>chrome.runtime.sendMessage({Message:'addMedia',href:url,url:url+'video.mp4',mime:'video/mp4'}),site.url());assert.equal(blocked.ok,false);
  const settings=await context.newPage();await settings.goto(`chrome-extension://${id}/shiying-help.html#site-access`);await settings.locator('#sitePermissionForm').waitFor();
  await settings.evaluate(()=>{chrome.permissions.request=async request=>{globalThis.testRequest=request;return false}});
  await settings.locator('#sitePermissionURL').fill('https://cdn.example/video.mp4');await settings.locator('#sitePermissionForm button').click();
  await settings.getByText('未授权，网站访问范围保持原样。',{exact:true}).waitFor();assert.deepEqual((await settings.evaluate(()=>globalThis.testRequest)).origins,['https://cdn.example/*']);
  const report={passed:true,initialOrigins:origins,unapprovedSiteCapture:false,concreteRequest:true,denialCallback:'simulated',nativeApproval:'manual verification required',unapprovedMediaRejected:true,siteSettings:true};
  fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(context)await context.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
