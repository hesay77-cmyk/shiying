// Lists visible Chinese text left in the English interface (popup, its dialogs, desktop app, extension pages,
// and the inherited tool pages m3u8/mpd/json/downloader/preview/popup/options on a Chinese Chrome).
// Fixture titles are Chinese on purpose and are ignored. Exit code 1 when anything is found.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-english-scan-'));
// Fixture titles/paths are Chinese on purpose; the language switch names Chinese in Chinese by design.
const fixtureText=/一段可以安心下载的视频|沿着海岸线的旅行|公开视频列表测试|第一集|第二集|已失效的视频|拾影|归档文件|reports\\|中 = 中文|中=Chinese|^中文$/;
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
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:exe,headless:true,locale:'en-US',viewport:{width:360,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--lang=en-US','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
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
    if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',site:'bilibili',parts:2,duration:252,choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};
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
  // 0.4.71: no ⋯ or ▾ menu; who downloads comes from settings → 交给桌面版.
  await page.locator('label[for=formatAudio]').click();await record('popup-mp3',page);await page.locator('label[for=formatVideo]').click();
  await page.locator('#collectionOpen').click();await page.locator('#collectionRead').click();await page.locator('#collectionList').waitFor({state:'visible'});await record('popup-playlist',page);await page.locator('#collectionClose').click();
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetDesktopMode:'all'}));await page.waitForFunction(()=>!document.querySelector('#platformUseBrowser').hidden);await record('popup-desktop-mode',page);
  await page.locator('#platformDownload').click();await page.locator('#desktopConnectPrompt').waitFor();await record('popup-desktop-missing-dialog',page);
  await page.locator('#desktopConnectPrompt').evaluate(d=>d.close());await page.waitForFunction(()=>document.querySelector('#platformNote').textContent.length>0);await record('popup-desktop-not-connected',page);
  await page.locator('#platformDownload').click();await page.locator('#desktopConnectPrompt').waitFor();await page.locator('[data-desktop-action=chrome]').click();await page.waitForTimeout(200);await record('popup-job',page);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetDesktopMode:'never'}));
  await page.goto(`chrome-extension://${id}/shiying.html?tabId=${otherId}`);await page.waitForTimeout(800);await record('popup-other-site',page);
  await page.locator('#platformURL').fill('https://example.com/file.zip');await page.locator('#platformRead').click();await page.locator('#linkDownload').waitFor({state:'visible'});await record('popup-link-dialog',page);
  for(const name of ['ruxget-settings.html','shiying-help.html','shiying-desktop.html','shiying-task.html']){const p=await browser.newPage();await p.setViewportSize({width:900,height:900});await p.goto(`chrome-extension://${id}/${name}`);await p.waitForTimeout(800);await record('page-'+name.replace('.html',''),p);await p.close();}
 }finally{await browser.close();}
 // C. Inherited tool pages follow ruxgetUiLanguage, not Chrome's language (0.4.73: a Chinese Chrome showed m3u8/mpd in Chinese
 //    with Ruxget set to English). Chrome runs in Chinese with Ruxget in English, then English Chrome with Ruxget in Chinese,
 //    and "auto" on a Chinese Chrome; each run also checks the one-time reload after a stale or missing localStorage mirror.
 //    Media and JSON come from stub responses; downloads are stubbed so nothing is saved.
 const fixture={
  m3u8:'#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nseg0.ts\n#EXTINF:10.0,\nseg1.ts\n#EXT-X-ENDLIST\n',
  mpd:'<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"><Period><AdaptationSet mimeType="video/mp4" contentType="video"><Representation id="v1" bandwidth="800000" width="1280" height="720" codecs="avc1.64001f"><SegmentTemplate media="v1-$Number$.m4s" initialization="v1-init.mp4" duration="10" startNumber="1" timescale="1"/></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4" contentType="audio" lang="en"><Representation id="a1" bandwidth="128000" codecs="mp4a.40.2"><SegmentTemplate media="a1-$Number$.m4s" initialization="a1-init.mp4" duration="10" startNumber="1" timescale="1"/></Representation></AdaptationSet></Period></MPD>',
  json:JSON.stringify({title:'Fixture',items:[1,2,{kind:'sample'}]})};
 const media='https://media.fixture/video/';
 const toolPages=[
  ['m3u8',`m3u8.html?url=${encodeURIComponent(media+'index.m3u8')}&title=${encodeURIComponent('Fixture clip')}`],
  ['mpd',`mpd.html?url=${encodeURIComponent(media+'manifest.mpd')}`],
  ['json',`json.html?url=${encodeURIComponent('https://media.fixture/data.json')}`],
  ['downloader','downloader.html'],
  ['downloader-file',`downloader.html?JSON=${encodeURIComponent(JSON.stringify({url:media+'file.bin',requestId:'91003',name:'file.bin',ext:'bin'}))}`],
  ['preview','preview.html?tabId=TAB'],['popup','popup.html?tabId=TAB'],['options','options.html']];
 const toolRun=async(chromeLang,pref,expect)=>{
  const context=await chromium.launchPersistentContext(path.join(report,`profile-tools-${chromeLang}-${pref}`),{executablePath:exe,headless:true,locale:chromeLang,viewport:{width:1000,height:900},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,`--lang=${chromeLang}`,'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
  try{
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.protocol==='chrome-extension:')return route.continue();
    if(u.pathname.endsWith('.m3u8'))return route.fulfill({contentType:'application/vnd.apple.mpegurl',body:fixture.m3u8});
    if(u.pathname.endsWith('.mpd'))return route.fulfill({contentType:'application/dash+xml',body:fixture.mpd});
    if(u.pathname.endsWith('.json'))return route.fulfill({contentType:'application/json',body:fixture.json});
    if(/\.(ts|m4s|mp4|bin)$/.test(u.pathname))return route.fulfill({contentType:'application/octet-stream',body:Buffer.alloc(4096)});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'});});
   await context.addInitScript(()=>{
    if(location.protocol!=='chrome-extension:')return;
    chrome.downloads.download=(options,callback)=>{callback&&setTimeout(()=>callback(4242));return callback?undefined:Promise.resolve(4242);};
    const items=[{url:'https://media.fixture/video/clip.mp4',name:'clip.mp4',ext:'mp4',type:'video/mp4',size:4096,title:'Fixture page',webUrl:'https://www.example.com/page',requestId:'91001',getTime:Date.now(),favIconUrl:'img/icon16.png',requestHeaders:{referer:'https://www.example.com/page'}},
     {url:'https://media.fixture/video/index.m3u8',name:'index.m3u8',ext:'m3u8',type:'application/vnd.apple.mpegurl',size:0,title:'Fixture page',webUrl:'https://www.example.com/page',requestId:'91002',getTime:Date.now(),favIconUrl:'img/icon16.png',requestHeaders:{referer:'https://www.example.com/page'}}];
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=(...args)=>{const message=typeof args[0]==='string'?args[1]:args[0],callback=typeof args.at(-1)==='function'?args.at(-1):null;
     if(message&&message.Message==='getData'&&message.tabId!=null){const data=items.map(item=>({...item,tabId:message.tabId}));if(callback){setTimeout(()=>callback(data));return;}return Promise.resolve(data);}
     return send(...args);};
   });
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
   await worker.evaluate(p=>chrome.storage.local.set({ruxgetUiLanguage:p}),pref);
   const site=await context.newPage();await site.goto('https://www.example.com/page');
   const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('example.com/page')).id);
   let first=true;
   for(const [label,address] of toolPages){
    const name=`tool-${label}-${chromeLang}-${pref}`,p=await context.newPage(),errors=[];
    p.on('pageerror',e=>errors.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,160)+(m.location()?.url?' ('+m.location().url.slice(0,120)+')':''));});
    await p.goto(`chrome-extension://${id}/${address.replace('TAB',tabId)}`);await p.waitForTimeout(1500);
    const state=await p.evaluate(()=>({title:document.title,lang:document.documentElement.lang,reloaded:performance.getEntriesByType('navigation')[0]?.type==='reload',mirror:localStorage.getItem('ruxgetUiLanguage')}));
    const problems=[...errors];
    // Only the very first page may need the reload (if no extension page has mirrored the setting yet).
    if(state.reloaded&&!first)problems.push('reloaded although the language mirror was already set');
    if(state.mirror!==pref)problems.push(`language mirror is ${state.mirror}, expected ${pref}`);
    first=false;
    if(expect==='en'){
     if(state.lang!=='en')problems.push('html lang is '+state.lang);
     await record(name,p);
     const advanced=p.locator('.shiying-tool-heading button');
     if(await advanced.count()){await advanced.click();await record(name+'-advanced',p);await advanced.click();}
     if(label==='m3u8'){await p.locator('#mergeTs').click();await p.waitForTimeout(1500);await record(name+'-merge',p);}
     if(/[\u3400-\u9fff]/.test(state.title))problems.push('title: '+state.title);
    }else{
     await p.screenshot({path:path.join(report,name+'.png')});
     // popup.html is titled just "Ruxget"; the file download shows its progress ("1/1") as the title.
     if(state.lang!=='zh-CN'||!/[\u3400-\u9fff]/.test(state.title)&&!['popup','downloader-file'].includes(label))problems.push(`expected Chinese, got lang=${state.lang} title=${state.title}`);
     const chinese=await p.evaluate(()=>/[\u3400-\u9fff]/.test(document.body.innerText));if(!chinese)problems.push('no Chinese text on the page');
    }
    if(problems.length){results[name+' (state)']=problems;console.log('FOUND '+name+' (state)\n   '+problems.join('\n   '));}
    else if(expect!=='en')console.log('clean '+name+' (Chinese as expected)');
    await p.close();
   }
   // A stale or missing mirror (setting changed while no extension page was open) paints the wrong language first;
   // the page must then reload exactly once and end in the right language.
   for(const mirror of [expect==='en'?'zh_CN':'en',null]){
    const name=`tool-json-${chromeLang}-${pref}-mirror-${mirror||'missing'}`,address=`chrome-extension://${id}/${toolPages.find(t=>t[0]==='json')[1]}`;
    const setup=await context.newPage();await setup.goto(address);await setup.waitForTimeout(500);
    await setup.evaluate(v=>v?localStorage.setItem('ruxgetUiLanguage',v):localStorage.removeItem('ruxgetUiLanguage'),mirror);await setup.close();
    const p=await context.newPage();let loads=0;p.on('load',()=>loads++);
    await p.goto(address);await p.waitForTimeout(2000);
    const state=await p.evaluate(()=>({title:document.title,lang:document.documentElement.lang,nav:performance.getEntriesByType('navigation')[0]?.type,mirror:localStorage.getItem('ruxgetUiLanguage')}));
    const wanted=expect==='en'?'en':'zh-CN',needsReload=(mirror||(chromeLang.startsWith('zh')?'zh_CN':'en'))!==(expect==='en'?'en':'zh_CN'),problems=[];
    if(state.lang!==wanted)problems.push(`html lang is ${state.lang}, expected ${wanted} (title ${state.title})`);
    if(state.mirror!==pref)problems.push(`language mirror is ${state.mirror}, expected ${pref}`);
    if(needsReload&&state.nav!=='reload')problems.push('expected one reload, navigation type '+state.nav);
    if(loads>2)problems.push(`loaded ${loads} times`);
    if(problems.length){results[name]=problems;console.log('FOUND '+name+'\n   '+problems.join('\n   '));}else console.log(`clean ${name} (${needsReload?'reloaded once':'no reload needed'})`);
    await p.close();
   }
  }finally{await context.close();}
 };
 await toolRun('zh-CN','en','en');
 await toolRun('en-US','zh_CN','zh');
 await toolRun('zh-CN','auto','zh');
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
