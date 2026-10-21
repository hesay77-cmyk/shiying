// Lists visible Chinese text left in the English interface (popup, its dialogs, desktop app, extension pages).
// Fixture titles are Chinese on purpose and are ignored. Exit code 1 when anything is found.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-english-scan-'));
// Fixture titles/paths are Chinese on purpose; the language switch names Chinese in Chinese by design.
const fixtureText=/一段可以安心下载的视频|沿着海岸线的旅行|公开视频列表测试|第一集|第二集|已失效的视频|拾影|归档文件|reports\\|中 = 中文|中=Chinese/;
const collect=()=>{const out=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){const text=node.textContent.trim();if(!/[\u3400-\u9fff]/.test(text))continue;const el=node.parentElement;if(!el||el.closest('script,style,template,[hidden]'))continue;const s=getComputedStyle(el);const r=el.getBoundingClientRect();if(s.display==='none'||s.visibility==='hidden'||r.width===0||r.height===0)continue;out.push(text.slice(0,80));}
 for(const el of document.querySelectorAll('[placeholder],[title],[aria-label]'))for(const attr of ['placeholder','title','aria-label']){const v=el.getAttribute(attr);if(v&&/[\u3400-\u9fff]/.test(v)&&el.getClientRects().length)out.push('@'+attr+': '+v.slice(0,80));}
 return [...new Set(out)];};
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const exe=process.env.SHIYING_CHROMIUM||undefined;
 const results={};const record=async(name,page)=>{await page.waitForTimeout(300);const found=(await page.evaluate(collect)).filter(t=>!fixtureText.test(t));results[name]=found;await page.screenshot({path:path.join(report,name+'.png')});console.log((found.length?'FOUND ':'clean ')+name+(found.length?'\n   '+found.join('\n   '):''));};
 // A. Extension popup and pages.
 const extension=path.join(report,'extension');fs.mkdirSync(extension);
 for(const dir of ['js','css','img','lib','catch-script','_locales'])fs.cpSync(path.join(root,dir),path.join(extension,dir),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name==='manifest.json')fs.copyFileSync(path.join(root,name),path.join(extension,name));
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:exe,headless:true,locale:'en-US',viewport:{width:360,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--lang=en-US','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 try{
  await browser.route('**/*',route=>new URL(route.request().url()).protocol==='chrome-extension:'?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));
  const site=await browser.newPage();await site.goto('https://www.bilibili.com/video/BV15z4y1U7HS/');
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('BV15z4y1U7HS')).id);
  const other=await browser.newPage();await other.goto('https://example.com/page');
  const otherId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('example.com')).id);
  await browser.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:')return;
   chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;
   chrome.runtime.sendNativeMessage=async()=>{throw new Error('Specified native messaging host not found.');};
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=async message=>{
    if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',site:'bilibili',duration:252,choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};
    if(message.Message==='shiyingPlatformDesktop')return {ok:true,payload:{action:'add'}};
    if(message.Message==='shiyingCollectionRead')return {ok:true,id:'list',title:'公开视频列表测试',entries:[{url:'https://www.bilibili.com/video/BV15z4y1U7HS/?p=1',title:'第一集',duration:'4:12',available:true},{url:'https://www.bilibili.com/video/BV15z4y1U7HS/?p=2',title:'已失效的视频',duration:'',available:false}],hasMore:true};
    if(message.Message==='shiyingPlatformStart')return {ok:true,id:'job',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',status:'downloading',stage:'Downloading',progress:30};
    if(message.Message==='getData')return [];
    return send(message);
   };
  });
  const page=await browser.newPage();page.on('pageerror',e=>console.log('pageerror',e.message));
  await page.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await page.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);
  await record('popup-video',page);
  await page.locator('.menu summary').click();await record('popup-top-menu',page);await page.locator('.menu summary').click();
  await page.locator('#platformMethod').click();await page.waitForFunction(()=>document.querySelector('#desktopMethodStatus').dataset.state!=='checking');await record('popup-method-menu',page);await page.keyboard.press('Escape');
  await page.locator('label[for=formatAudio]').click();await record('popup-mp3',page);await page.locator('label[for=formatVideo]').click();
  await page.locator('#platformMethod').click();await page.locator('[data-method=desktop]').click();await page.locator('#platformDownload').click();await page.locator('#desktopConnectPrompt').waitFor();await record('popup-desktop-missing-dialog',page);await page.locator('[data-desktop-action=chrome]').click();
  await page.locator('#collectionOpen').click();await page.locator('#collectionRead').click();await page.locator('#collectionList').waitFor({state:'visible'});await record('popup-playlist',page);await page.locator('#collectionClose').click();
  await page.locator('#platformDownload').click();await page.waitForTimeout(200);await record('popup-job',page);
  await page.goto(`chrome-extension://${id}/shiying.html?tabId=${otherId}`);await page.waitForTimeout(800);await record('popup-other-site',page);
  await page.locator('.menu').evaluate(m=>m.open=true);await page.locator('#ordinaryDownload').click();await record('popup-link-dialog',page);
  for(const name of ['shiying-help.html','shiying-desktop.html','shiying-task.html']){const p=await browser.newPage();await p.setViewportSize({width:900,height:900});await p.goto(`chrome-extension://${id}/${name}`);await p.waitForTimeout(800);await record('page-'+name.replace('.html',''),p);await p.close();}
 }finally{await browser.close();}
 // B. Desktop app (embedded interface from the latest native report) in English.
 const native=path.join(root,'reports',fs.readdirSync(path.join(root,'reports')).filter(n=>n.startsWith('plugin-native-')).sort().at(-1));
 const desk=await chromium.launch({executablePath:exe,headless:true});
 try{
  const context=await desk.newContext({viewport:{width:1100,height:700},locale:'en-US'});
  await context.addInitScript(()=>{const handlers=[];window.hostCommands=[];window.chrome={webview:{postMessage:data=>window.hostCommands.push(data),addEventListener:(_,h)=>handlers.push(h)}};window.emitHost=data=>handlers.forEach(h=>h({data}));});
  const page=await context.newPage();await page.goto(pathToFileURL(path.join(native,'interface.html')).href);await page.waitForFunction(()=>hostCommands.some(c=>c.command==='ready'));
  const state=JSON.parse(fs.readFileSync(path.join(native,'initial-state.json'),'utf8').replace(/^\uFEFF/,''));state.settings.UiLanguage='en';
  await page.evaluate(s=>emitHost(s),state);await page.waitForTimeout(300);
  await record('desktop-main',page);
  const first=page.locator('[data-focus$="-details"]').first();if(await first.count()){await first.click();await record('desktop-details',page);}
  const more=page.locator('button[aria-label="More actions"]').first();if(await more.count()){await more.click();await record('desktop-task-menu',page);await page.keyboard.press('Escape');}
  const settings=page.locator('[data-command=settings]').first();if(await settings.count()){await settings.evaluate(b=>b.click());await record('desktop-settings',page);await page.keyboard.press('Escape');}
 }finally{await desk.close();}
 const total=Object.values(results).reduce((n,list)=>n+list.length,0);
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({total,results},null,2));console.log('TOTAL '+total+'\nREPORT '+report);process.exit(total?1:0);
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(2);});
