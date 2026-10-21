// Actual Chrome MV3 -> native host -> named pipe -> actual WinForms confirmation.
// Only site reading is a fixture. Native Messaging, extension messages and UI are real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),run=path.join(root,'reports','native-browser-'+Date.now());fs.mkdirSync(run,{recursive:true});
const alias='org.shiying.desktop.review'+Date.now();
const powershell=path.join(process.env.WINDIR||'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const registryScript=path.join(run,'review-host.ps1');
fs.writeFileSync(registryScript,`param([string]$HostName,[string]$Manifest,[switch]$Remove)
$ErrorActionPreference='Stop'
if($HostName -notmatch '^org\\.shiying\\.desktop\\.review[0-9]+$'){throw 'Unexpected review host'}
$registryPath='Software\\Google\\Chrome\\NativeMessagingHosts\\'+$HostName
$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryPath)
if($Remove){
  if($key){$saved=$key.GetValue('');$children=$key.SubKeyCount;$key.Dispose();if($saved -ne $Manifest -or $children -ne 0){throw 'Review host changed; refusing cleanup'};[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($registryPath)}
}else{
  if($key){$key.Dispose();throw 'Review key already exists; refusing overwrite'}
  $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath);$key.SetValue('',$Manifest);$key.Dispose()
}
`,{encoding:'utf8'});
const registry=remove=>execFileSync(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',registryScript,'-HostName',alias,'-Manifest',path.join(run,'native-host.json'),...(remove?['-Remove']:[])],{windowsHide:true,encoding:'utf8'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(action,ms=12000){const end=Date.now()+ms;while(Date.now()<end){const value=await action();if(value)return value;await wait(100);}throw new Error('review timeout');}
(async()=>{
 let context,server,registered=false;const errors=[];
 try{
  const extension=path.join(run,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
  manifest.permissions.push('nativeMessaging');manifest.optional_permissions=manifest.optional_permissions.filter(item=>item!=='nativeMessaging');fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest,null,2));
  const helper=path.join(extension,'js','shiying-desktop.js');let text=fs.readFileSync(helper,'utf8');assert.equal(text.split("'org.shiying.desktop'").length,2);fs.writeFileSync(helper,text.replace("'org.shiying.desktop'",JSON.stringify(alias)));
  const host=path.join(run,'Host.Check.exe');fs.copyFileSync(path.join(root,'desktop','Shiying.Check.exe'),host);
  context=await chromium.launchPersistentContext(path.join(run,'profile'),{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],proxy:{server:'http://127.0.0.1:7897'}});
  await context.route('**/*',route=>route.request().url().startsWith('chrome-extension://')?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local review fixture</title><p>Read fixture only</p>'}));
  const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});
  const boot=await context.newPage();await boot.goto(`chrome-extension://${id}/shiying-desktop.html`);
  const health=await boot.evaluate(async()=>{try{return await chrome.runtime.sendMessage({Message:'shiyingPlatformHealth'});}catch(error){return {error:error.message};}});
  fs.writeFileSync(path.join(run,'health.json'),JSON.stringify(health));
  const worker=await until(()=>context.serviceWorkers().find(worker=>worker.url().startsWith('chrome-extension://'+id+'/'))).catch(async error=>{fs.writeFileSync(path.join(run,'targets.json'),JSON.stringify(await cdp.send('Target.getTargets'),null,2));throw error;});
  const url='https://www.youtube.com/watch?v=abcdefghijk',catalogId='native-review-catalog';
  const catalog={id:catalogId,site:'youtube',url,title:'本机联动验收样例',duration:24,createdAt:Date.now(),video:[{height:1080,url:'https://r1.googlevideo.com/video1080',codec:'avc1'},{height:720,url:'https://r1.googlevideo.com/video720',codec:'avc1'}],audio:[{url:'https://r1.googlevideo.com/audio',codec:'mp4a'}],choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}]};
  await worker.evaluate(async catalog=>chrome.storage.session.set({['shiyingCatalog:'+catalog.id]:catalog}),catalog);
  fs.writeFileSync(path.join(run,'native-host.json'),JSON.stringify({name:alias,description:'Temporary isolated Shiying QA host',path:host,type:'stdio',allowed_origins:[`chrome-extension://${id}/`]},null,2));registry(false);registered=true;
  server=spawn(path.join(root,'desktop','Shiying.Check.exe'),['--native-review-server',run],{windowsHide:true,stdio:['ignore','pipe','pipe']});server.stderr.on('data',data=>errors.push(data.toString()));
  await until(()=>fs.existsSync(path.join(run,'ready.json')));await wait(300);
  const source=await context.newPage();await source.goto(url);
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,url);
  const popup=await context.newPage();popup.on('pageerror',error=>errors.push(error.message));
  await popup.addInitScript(catalog=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(event,...rest)=>event.Message==='shiyingPlatformRead'?Promise.resolve({ok:true,id:catalog.id,site:catalog.site,url:catalog.url,title:catalog.title,duration:catalog.duration,choices:catalog.choices,audioAvailable:true}):original(event,...rest);},catalog);
  await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await popup.waitForFunction(()=>!document.querySelector('#platformDesktop').disabled);
  await popup.selectOption('#platformQuality','720');await popup.click('#platformDesktop');
  await until(async()=>{const error=await popup.locator('#platformError').innerText();if(error)throw new Error(error);return (await popup.locator('#platformNote').innerText()).includes('桌面窗口确认');});
  await until(()=>fs.existsSync(path.join(run,'confirmation.json')));const confirmation=JSON.parse(fs.readFileSync(path.join(run,'confirmation.json'),'utf8'));
  assert.equal(confirmation.url,url);assert.equal(confirmation.quality,'720p');assert(confirmation.urlReadOnly&&confirmation.qualityLocked);assert.equal(confirmation.tasksBeforeConfirmation,0);
  await popup.screenshot({path:path.join(run,'browser-confirmed.png')});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(run,'summary.json'),JSON.stringify({ok:true,method:'real Chrome MV3, background desktop payload, real Native Messaging and named pipe, real WinForms confirmation; site reading fixture only',qaChanges:['required native permission in isolated test copy','unique temporary host alias'],personalProfileUsed:false,productionRegistryChanged:false,confirmation},null,2));
  console.log('ACTUAL BROWSER NATIVE FLOW PASSED',run);
 }finally{
  if(context)await context.close();if(server&&server.exitCode===null){await Promise.race([new Promise(resolve=>server.once('exit',resolve)),wait(5000)]);if(server.exitCode===null)server.kill();}
  if(registered){registry(true);fs.writeFileSync(path.join(run,'registry-cleanup.json'),JSON.stringify({ok:true,removedOnlyOwnTemporaryAlias:alias}));}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
