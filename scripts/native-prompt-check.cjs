// No installed native host or public download is used. --browser adds isolated UI checks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),code=fs.readFileSync(path.join(root,'js/shiying-native.js'),'utf8')+'\nglobalThis.api=ShiyingNative;';
async function bridgeCase({granted=true,error='',response={ok:true},factoryError=''}={}){
 const calls={native:0,opened:[]};const context={URL,navigator:{userAgent:'review'},chrome:{permissions:{request:async()=>granted},runtime:{getURL:x=>'chrome-extension://review/'+x,sendNativeMessage:async()=>{calls.native++;if(error)throw new Error(error);return response;}},tabs:{create:async x=>calls.opened.push(x)}}};
 vm.createContext(context);vm.runInContext(code,context);let result;
 try{result=await context.api.send(()=>{if(factoryError)throw new Error(factoryError);return {action:'add',url:'https://review.example/file.bin'};});}catch(e){result={error:e.message,cancelled:!!e.cancelled,reason:e.connectionIssue};}
 return {calls,result};
}
async function main(){
 const checks=[];const check=(value,name)=>{assert(value,name);checks.push(name);};
 let c=await bridgeCase({granted:false});check(c.calls.native===0&&c.calls.opened.length===0,'denied permission does not launch or offer installation');
 c=await bridgeCase();check(c.result.ok&&c.calls.opened.length===0,'connected host sends normally');
 for(const [error,reason] of [['Specified native messaging host not found.','missing'],['Access to the specified native messaging host is forbidden.','connection'],['Failed to start native messaging host.','connection'],['Native host has exited.','connection'],['Error when communicating with the native messaging host.','connection']]){
  c=await bridgeCase({error});check(c.result.cancelled&&c.result.reason===reason&&c.calls.opened[0].url.endsWith('?reason='+reason),error);
 }
 c=await bridgeCase({response:{ok:false,error:'File not found; forbidden download'}});check(!c.result.cancelled&&c.calls.opened.length===0,'application errors never imply a missing host');
 c=await bridgeCase({factoryError:'Source not found'});check(c.calls.native===0&&c.calls.opened.length===0,'source errors never offer desktop installation');
 c=await bridgeCase({error:'Unexpected transport problem'});check(!c.result.cancelled&&c.calls.opened.length===0,'unrecognized failures retain their original error');
 if(!process.argv.includes('--browser')){console.log(JSON.stringify({ok:true,checks},null,2));return;}
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const report=fs.mkdtempSync(path.join(process.env.SHIYING_TEST_OUTPUT||os.tmpdir(),'shiying-native-prompt-')),project=path.join(report,'package');fs.mkdirSync(project);
 for(const name of ['css','js','img','lib','catch-script','_locales'])fs.cpSync(path.join(root,name),path.join(project,name),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name==='manifest.json')fs.copyFileSync(path.join(root,name),path.join(project,name));
 fs.mkdirSync(path.join(project,'scripts'));fs.copyFileSync(path.join(root,'scripts/package.cjs'),path.join(project,'scripts/package.cjs'));
 const pack=require('node:child_process').spawnSync(process.execPath,[path.join(project,'scripts/package.cjs')],{encoding:'utf8',windowsHide:true});assert.equal(pack.status,0,pack.stderr);
 const extension=path.join(project,'build');check(fs.existsSync(path.join(extension,'shiying-get-desktop.html'))&&fs.existsSync(path.join(extension,'_locales/en/messages.json')),'clean package includes helper and English catalog');
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));manifest.background.service_worker='review-background.js';manifest.permissions.push('nativeMessaging');manifest.optional_permissions=manifest.optional_permissions.filter(x=>x!=='nativeMessaging');fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(extension,'review-background.js'),"globalThis.reviewOpened=[];chrome.permissions.request=async()=>true;chrome.runtime.sendNativeMessage=async()=>{throw new Error('Specified native messaging host not found.')};chrome.tabs.create=async x=>{reviewOpened.push(x);return x;};importScripts('/js/background.js');");
 let context;try{
  context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM,headless:true,ignoreDefaultArgs:['--disable-extensions'],viewport:{width:360,height:660},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});context.setDefaultTimeout(10000);
  const errors=[],systemDialogs=[];context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{systemDialogs.push(d.message());d.dismiss();});});
  await context.route('**/*',r=>{const u=new URL(r.request().url());return u.protocol==='chrome-extension:'?r.continue():u.hostname==='review.example'?r.fulfill({contentType:'text/html',body:'<!doctype html><title>Download fixture</title><p>Fixture only</p>'}):r.abort();});
  await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;window.review={mode:'missing',granted:true,native:0,opened:[],downloads:[]};chrome.permissions.request=async()=>review.granted;chrome.tabs.create=async x=>{review.opened.push(x);return x;};chrome.downloads.download=async x=>{review.downloads.push(x);return 123;};chrome.runtime.sendNativeMessage=async()=>{review.native++;if(review.mode==='ok')return {ok:true};if(review.mode==='business')return {ok:false,error:'File not found'};throw new Error(review.mode==='missing'?'Specified native messaging host not found.':review.mode==='forbidden'?'Access to the specified native messaging host is forbidden.':'Native host has exited.');};});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  const website=await context.newPage();await website.goto('https://review.example/page');const tab=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(x=>x.url==='https://review.example/page').id);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/shiying.html?tabId=${tab}`);await page.evaluate(()=>RuxgetI18n.ready());await page.evaluate(()=>document.querySelector('#ordinaryDownload').click());await page.locator('#linkDownloadURL').fill('https://review.example/file.bin');
  const openPrompt=async(mode='missing')=>{await page.evaluate(m=>review.mode=m,mode);await page.locator('#linkUseDesktop').click();await page.locator('#desktopConnectPrompt').waitFor({state:'visible'});};
  await openPrompt();check((await page.locator('#desktopConnectTitle').innerText()).includes('还没有连接'),'missing connection has its own explanation');
  for(const width of [320,360,440]){await page.setViewportSize({width,height:660});check(await page.locator('#desktopConnectPrompt').evaluate(el=>el.scrollWidth<=el.clientWidth),'prompt has no horizontal overflow at '+width);await page.screenshot({path:path.join(report,'prompt-'+width+'.png')});}
  await page.locator('[data-desktop-action=chrome]').click();await page.waitForFunction(()=>!document.querySelector('#linkUseDesktop').disabled);
  check(await page.locator('#linkUseChrome').isEnabled()&&await page.locator('#linkDownloadError').isHidden(),'continue Chrome returns without a red cancellation error');
  check((await page.locator('#linkDownloadURL').inputValue())==='https://review.example/file.bin'&&await page.evaluate(()=>review.downloads.length===0&&review.opened.length===0),'continuing preserves URL and starts nothing');
  await openPrompt();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#linkUseDesktop').disabled);check(await page.locator('#linkDownloadError').isHidden(),'Escape quietly returns to the previous choice');
  await openPrompt();await page.locator('[data-desktop-action=install]').click();await page.waitForFunction(()=>review.opened.length===1);check((await page.evaluate(()=>review.opened[0].url))==='https://github.com/hesay77-cmyk/shiying/releases/latest','install opens the official release page only after a click');
  await page.waitForFunction(()=>!document.querySelector('#linkUseDesktop').disabled);await openPrompt('forbidden');
  check((await page.locator('#desktopConnectTitle').innerText()).includes('暂时无法连接')&&await page.locator('[data-desktop-action=repair]').evaluate(el=>el.classList.contains('download-button')),'pairing failure prioritizes repair rather than reinstall');
  await page.locator('[data-desktop-action=repair]').click();await page.waitForFunction(()=>review.opened.length===2);check((await page.evaluate(()=>review.opened[1].url)).endsWith('shiying-desktop.html#connection'),'repair opens the existing connection page');
  await page.waitForFunction(()=>!document.querySelector('#linkUseDesktop').disabled);await page.evaluate(()=>review.mode='business');await page.locator('#linkUseDesktop').click();await page.locator('#linkDownloadError').waitFor({state:'visible'});check(await page.locator('#desktopConnectPrompt').count()===0,'file errors do not show installation guidance');
  await page.evaluate(()=>{document.querySelector('#linkDownloadError').hidden=true;review.mode='missing';review.granted=false;});await page.locator('#linkUseDesktop').click();await page.locator('#linkDownloadError').waitFor({state:'visible'});check(await page.locator('#desktopConnectPrompt').count()===0,'denied connection permission does not show installation guidance');
  await page.evaluate(()=>{review.granted=true;document.querySelector('#linkDownloadError').hidden=true;});await page.locator('#linkUseChrome').click();await page.waitForFunction(()=>review.downloads.length===1);check(await page.locator('#linkDownload').isHidden(),'original Chrome download choice still works through a blocked download spy');
  const background=await worker.evaluate(async()=>{reviewOpened=[];try{await ShiyingNative.send(()=>({action:'add',url:'https://review.example/file.bin'}));}catch(e){return {cancelled:e.cancelled,reason:e.connectionIssue,opened:reviewOpened};}});
  check(background.cancelled&&background.opened[0].url.includes('shiying-get-desktop.html?reason=missing'),'worker opens an extension helper instead of injecting into the webpage');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));const helper=await context.newPage();await helper.goto(`chrome-extension://${id}/shiying-get-desktop.html?reason=connection`);await helper.locator('#desktopConnectPrompt').waitFor({state:'visible'});
  check((await helper.locator('#desktopConnectTitle').innerText()).startsWith('Cannot connect'),'standalone helper respects the selected English language');await helper.screenshot({path:path.join(report,'helper-en.png')});
  check(systemDialogs.length===0,'no blocking system dialogs appear');check(errors.length===0,'no unhandled browser errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks,errors,systemDialogs,nativeHostContacted:false,personalBrowserUsed:false,realDownloadsStarted:false},null,2));console.log(JSON.stringify({ok:true,report,checks},null,2));
 }finally{await context?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
