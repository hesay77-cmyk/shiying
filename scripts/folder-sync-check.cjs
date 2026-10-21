// Save-folder sync with the store edition: a Ruxget save teaches the extension Chrome's download folder; the popup shows
// the real path; hand-offs to the desktop app carry it; the desktop page shows where the app saves. Native replies are stubbed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-folder-sync-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 // Answers after a short delay, so the test can register the job before Chrome finishes the file.
 const server=http.createServer((request,response)=>setTimeout(()=>{response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':2048});response.end(Buffer.alloc(2048,1));},400));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build'),downloads=path.join(report,'downloads');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:downloads,viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Before any Ruxget save the popup keeps the generic label.
  let popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  await popup.waitForFunction(()=>/下载目录 \/ Ruxget/.test(document.querySelector('#downloadLocation').textContent));await popup.close();
  // 1. Wiring: when a Ruxget save finishes, its file path reaches the folder learner.
  //    (This test browser names every download with a random id, so the real "\Ruxget\" path can't appear here.)
  const learned=await worker.evaluate(async url=>{globalThis.learnedFrom=[];const learn=ShiyingNative.learnChromeFolder;ShiyingNative.learnChromeFolder=async file=>{learnedFrom.push(file);return learn(file);};
   const downloadId=await chrome.downloads.download({url,filename:'Ruxget/video.mp4'});
   await chrome.storage.local.set({shiyingJobIds:['j'],'shiyingJob:j':{id:'j',title:'v',status:'downloading',stage:'正在保存',downloadId}});
   for(let i=0;i<100;i++){if(learnedFrom.length){const [item]=await chrome.downloads.search({id:downloadId});return {from:learnedFrom[0],file:item.filename};}await new Promise(r=>setTimeout(r,100));}
   throw new Error('the finished save never reached the folder learner');},origin+'/v');
  assert.equal(learned.from,learned.file);
  // 2. Learning: a real Chrome path for a Ruxget save gives Chrome's folder.
  const folder=path.join(downloads,'Chrome 下载');fs.mkdirSync(folder,{recursive:true});
  await worker.evaluate(file=>ShiyingNative.learnChromeFolder(file),path.join(folder,'Ruxget','video.mp4'));
  const saved={folder:(await worker.evaluate(()=>chrome.storage.local.get('ruxgetChromeFolder'))).ruxgetChromeFolder};
  assert.equal(saved.folder,folder);
  check('a finished Ruxget save teaches the extension Chrome’s download folder');
  // The popup shows the real path, shortened, with the full path on hover.
  popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  await popup.waitForFunction(()=>/Ruxget ›$/.test(document.querySelector('#downloadLocation').textContent)&&!/下载目录/.test(document.querySelector('#downloadLocation').textContent));
  const label=await popup.locator('#downloadLocation').innerText(),title=await popup.locator('#downloadLocation').getAttribute('title');
  assert.equal(label,'…\\Chrome 下载\\Ruxget ›');assert(title.includes(saved.folder+'\\Ruxget')&&/插件和桌面版都保存到/.test(title));
  await popup.screenshot({path:path.join(report,'popup-folder.png')});
  check("the popup shows where files go (…\\Chrome 下载\\Ruxget), full path on hover");
  // Hand-offs to the desktop app carry the folder.
  await popup.evaluate(()=>{chrome.runtime.sendNativeMessage=async(host,message)=>{await chrome.storage.session.set({lastNative:message});return {ok:true};};chrome.permissions.request=async()=>true;});
  await popup.locator('details.menu summary').click();await Promise.all([popup.waitForEvent('close'),popup.locator('#openDesktop').click()]);
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.session.get('lastNative'))).lastNative,{action:'show',chromeFolder:saved.folder});
  check('“打开 Ruxget 桌面版” tells the desktop app where Chrome saves');
  await worker.evaluate(()=>{globalThis.calls=[];chrome.permissions.contains=async()=>true;chrome.runtime.sendNativeMessage=async(host,message)=>{calls.push(message);return {ok:true};};return chrome.storage.local.set({ruxgetTakeover:{enabled:true,minMB:0,skipHosts:[]}});});
  const page=await browser.newPage();await page.setContent(`<a id="f" href="${origin}/big" download>f</a>`);await page.click('#f');
  for(let i=0;i<60&&!(await worker.evaluate(()=>calls.length));i++)await page.waitForTimeout(100);
  const takeover=(await worker.evaluate(()=>calls))[0];assert.equal(takeover.action,'takeover');assert.equal(takeover.chromeFolder,saved.folder);
  check('taken-over downloads carry the folder too');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetTakeover:{enabled:false}}));
  // The desktop page shows where the desktop app saves and whether it follows Chrome.
  await browser.addInitScript(folder=>{if(!location.pathname.endsWith('/shiying-desktop.html'))return;chrome.runtime.sendNativeMessage=async()=>({ok:true,version:'0.4.52',folder:folder+'\\Ruxget',followBrowser:true});const contains=chrome.permissions.contains.bind(chrome.permissions);chrome.permissions.contains=async r=>r?.permissions?.includes('nativeMessaging')?true:contains(r);},saved.folder);
  const guide=await browser.newPage();await guide.goto(`chrome-extension://${id}/shiying-desktop.html`);
  await guide.locator('#desktopFolder').waitFor({state:'visible'});
  assert.equal(await guide.locator('#desktopFolder').innerText(),'桌面版保存到：'+saved.folder+'\\Ruxget（跟随 Chrome 的下载位置，和插件在同一处）');
  await guide.screenshot({path:path.join(report,'desktop-page-folder.png')});
  check('the desktop page says where the desktop app saves and that it follows Chrome');
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
