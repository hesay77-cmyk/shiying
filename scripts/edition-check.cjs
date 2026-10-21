// Store edition (build/) refuses YouTube; full edition (build-full/) supports it. Real unpacked extensions, fixture pages only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-edition-check-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const VIDEO='https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890';
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 async function open(edition){
  const extension=path.join(root,edition);
  const browser=await chromium.launchPersistentContext(path.join(report,edition+'-profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:1100,height:700},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--host-resolver-rules=MAP * ~NOTFOUND']});
  await browser.route('**/*',route=>new URL(route.request().url()).protocol==='chrome-extension:'?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Fixture</title><main style="padding:24px"><video style="display:block;width:640px;height:360px;background:#172942"></video></main>'}));
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const site=await browser.newPage();await site.goto(VIDEO);await site.waitForTimeout(1500);
  const box=await site.locator('video').boundingBox();await site.mouse.move(box.x+box.width/2,box.y+box.height/2);await site.waitForTimeout(800);
  const shortcut=await site.locator('#shiying-video-shortcut').count();
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('watch?v=abcdefghijk')).id);
  return {browser,worker,site,shortcut,tabId,id:new URL(worker.url()).hostname};
 }
 // Store edition.
 {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'build/manifest.json'),'utf8'));
  assert(!/youtube|googlevideo/i.test(JSON.stringify(manifest)));assert(!fs.existsSync(path.join(root,'build/js/shiying-youtube.js')));
  const {browser,worker,shortcut,tabId,id}=await open('build');
  try{
   assert.equal(shortcut,0,'store edition must not add a button on YouTube');
   assert.equal(await worker.evaluate(()=>typeof globalThis.RuxgetFullEdition),'undefined');
   assert.equal(await worker.evaluate(()=>{try{ShiyingPlatform.source('https://www.youtube.com/watch?v=abcdefghijk');return 'accepted';}catch(e){return e.message;}}),'这个入口目前支持 B站视频');
   assert.equal(await worker.evaluate(()=>ShiyingAccess.origin('https://www.youtube.com/watch?v=abcdefghijk')),null);
   const page=await browser.newPage();await page.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await page.waitForTimeout(1500);
   assert.equal(await page.locator('#platformCard').isVisible(),false,'store popup must not read YouTube');
   assert.equal(await page.locator('#siteAccess').isVisible(),false,'store popup must not offer to allow YouTube');
   await page.screenshot({path:path.join(report,'store-popup-on-youtube.png')});
   check('store edition: no YouTube permission, module, page button, reader or site grant');
  }finally{await browser.close();}
 }
 // Full edition.
 {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'build-full/manifest.json'),'utf8'));
  assert(manifest.host_permissions.includes('https://www.youtube.com/*')&&manifest.host_permissions.includes('https://*.googlevideo.com/*'));assert.match(manifest.version_name,/完整版/);
  const {browser,worker,shortcut,tabId,id}=await open('build-full');
  try{
   assert.equal(shortcut,1,'full edition shows the page button on YouTube');
   assert.equal(await worker.evaluate(()=>ShiyingPlatform.source('https://youtu.be/abcdefghijk').url),'https://www.youtube.com/watch?v=abcdefghijk');
   assert.equal(await worker.evaluate(()=>ShiyingCollection.source('https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890').url),'https://www.youtube.com/playlist?list=PL1234567890');
   assert.equal(await worker.evaluate(()=>typeof ShiyingPlatform.readers.youtube),'function');
   await browser.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Fixture video',site:'youtube',siteName:'YouTube',listUrl:'https://www.youtube.com/playlist?list=PL1234567890',duration:120,choices:[{height:720,label:'720p'}],audioAvailable:true,subtitles:[]};if(message.Message==='getData')return [];return send(message);};});
   const page=await browser.newPage();await page.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await page.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);
   assert.match(await page.locator('#platformMeta').innerText(),/YouTube/);
   assert.equal(await page.locator('#collectionOpen').isVisible(),true);assert.match(await page.locator('#collectionOpen').innerText(),/播放列表/);
   await page.screenshot({path:path.join(report,'full-popup-on-youtube.png')});
   check('full edition: YouTube permissions, page button, link and playlist resolvers, popup reads YouTube');
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
