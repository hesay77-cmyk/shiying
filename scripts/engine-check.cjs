// Black-box check of the media recognition engine (rewrite unit 6, spec 05-识别引擎): a local site plays and fetches
// media; the test reads what the engine recorded through the panel's messages (getData, addMedia, clearData, enable)
// and the toolbar badge. RUXGET_EXTENSION points at the extension to load (default: build/).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(process.env.RUXGET_REPORTS||path.join(root,'reports'),'engine-'+Date.now());fs.mkdirSync(report,{recursive:true});
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const small=Buffer.alloc(200*1024,1),big=Buffer.alloc(2*1024*1024,2);let origin='',other='';
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://x'),name=url.pathname.slice(1),base={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
 if(request.method==='OPTIONS'){response.writeHead(204,base);return response.end();}
 const send=(type,data,extra={})=>{response.writeHead(200,{...base,'Content-Type':type,'Content-Length':data.length,...extra});response.end(data);};
 if(name.endsWith('.html')){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end(`<!doctype html><title>${name}</title><body>${name}</body>`);}
 if(name==='clip.mp4'||name==='again.mp4')return send('video/mp4',small);
 if(name==='big.mp4')return send('video/mp4',big);
 if(name==='list.m3u8')return send('application/vnd.apple.mpegurl',Buffer.from('#EXTM3U\n'));
 if(name==='manifest.mpd')return send('application/dash+xml',Buffer.from('<MPD/>'));
 if(name==='seg.m4s')return send('video/iso.segment',small);
 if(name==='seg.ts')return send('video/mp2t',small);
 if(name==='app.js')return send('text/javascript',Buffer.from('1'));
 if(name==='data.json')return send('application/json',Buffer.from('{}'));
 if(name==='noext')return send('video/mp4',small);
 if(name==='download')return send('application/octet-stream',small,{'Content-Disposition':'attachment; filename="clip.mp3"'});
 response.writeHead(404,base);response.end();
});
(async()=>{let context;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;origin='http://127.0.0.1:'+port;other='http://localhost:'+port;
 const extension=path.join(report,'extension');fs.cpSync(process.env.RUXGET_EXTENSION||path.join(root,'build'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions=[...(manifest.host_permissions||[]).filter(p=>!p.includes('localhost')),'http://127.0.0.1/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 fs.mkdirSync(path.join(report,'profile'),{recursive:true});
 context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--lang=zh-CN','--mute-audio','--autoplay-policy=no-user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
  if(process.env.ENGINE_ROUTE)await context.route('**/*',route=>{const u=route.request().url();return u.startsWith(origin)||u.startsWith(other)||/^(chrome-extension|chrome|blob|data):/.test(u)?route.continue():route.abort();});
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 // Right after install the extension resets its stored list once (first-run setup); start after that.
 await new Promise(r=>setTimeout(r,4000));
 for(const p of context.pages())if(p.url().startsWith('chrome-extension://'))await p.close();
 const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/${process.env.RUXGET_PANEL||'shiying-help.html'}`);
 const send=message=>panel.evaluate(m=>chrome.runtime.sendMessage(m),message);
 const site=await context.newPage();await site.goto(origin+'/page.html');
 const tab=await panel.evaluate(async o=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith(o+'/page.html')).id,origin);
 const list=async()=>{for(let n=0;n<20;n++){const r=await send({Message:'getData',tabId:tab});if(r!=='error')return Array.isArray(r)?r:[];await site.waitForTimeout(250);}return [];};
 const settle=()=>site.waitForTimeout(2000);
 const get=(file,headers={})=>site.evaluate(({u,h})=>fetch(u,{headers:h}).then(r=>r.arrayBuffer()).then(b=>b.byteLength).catch(e=>String(e)),{u:origin+'/'+file,h:headers});
 const badge=()=>panel.evaluate(t=>chrome.action.getBadgeText({tabId:t}),tab);
 // 1. A playing video.
 // 1. A video the page loads (fetched; a <video> with fake bytes is not always requested in headless Chromium).
  const fetched=await get('clip.mp4');if(process.env.DEBUG_ENGINE)console.log('DEBUG fetch',fetched);await settle();
 // The first capture waits for the tab details; give it a few seconds.
 let items=[];for(let n=0;n<20&&!items.some(x=>x.url.endsWith('/clip.mp4'));n++){items=await list();if(!items.some(x=>x.url.endsWith('/clip.mp4')))await site.waitForTimeout(300);}let clip=items.find(i=>i.url.endsWith('/clip.mp4'));
 check(clip&&clip.ext==='mp4'&&Number(clip.size)===small.length&&clip.tabId===tab&&clip.webUrl===origin+'/page.html'&&clip.title==='page.html','a loaded MP4 is recorded with its type, size, tab and page'+(clip?'':' — got '+JSON.stringify(items).slice(0,300)+' fetch '+fetched));
 check(await badge()==='1','the toolbar badge counts it');
 // 2. Playlists and segments.
 for(const f of ['list.m3u8','manifest.mpd','seg.m4s'])await get(f);await settle();items=await list();
 check(['list.m3u8:m3u8','manifest.mpd:mpd','seg.m4s:m4s'].every(pair=>{const [f,e]=pair.split(':');return items.some(i=>i.url.endsWith('/'+f)&&i.ext===e);}),'m3u8, mpd and m4s requests are recorded');
 // 3. Not media.
 for(const f of ['seg.ts','app.js','data.json'])await get(f);await settle();items=await list();
 check(!items.some(i=>/seg\.ts|app\.js|data\.json/.test(i.url)),'ts (off by default), scripts and JSON are not recorded');
 // 4. Type without an extension; 5. attachment name.
 await get('noext');await get('download?id=1');await settle();items=await list();
 check(items.some(i=>i.url.endsWith('/noext')&&i.ext==='mp4'),'a video/mp4 response without an extension is recorded as mp4');
 check(items.some(i=>i.url.includes('/download?id=1')&&i.name==='clip.mp3'),'an attachment is named after its Content-Disposition file name');
 // 7. Duplicates.
 const before=items.length;await get('clip.mp4');await settle();check((await list()).length===before,'the same address is recorded once');
 // 8. Kept request headers.
 await get('again.mp4',{'Authorization':'Bearer t','X-Auth-Token':'abc','X-Other':'no'});await settle();
 const again=(await list()).find(i=>i.url.endsWith('/again.mp4'));const h=again?.requestHeaders||{};
 check(h.referer===origin+'/page.html'&&h.authorization==='Bearer t'&&h['x-auth-token']==='abc'&&!('x-other' in h)&&!('user-agent' in h)&&!('cookie' in h),'only the headers a download may need are kept: '+JSON.stringify(h));
 // 6. Size conditions from the settings.
 const ext=await panel.evaluate(()=>chrome.storage.sync.get('Ext').then(r=>r.Ext));
 const rules=(ext||[]).length?ext:null;
 await panel.evaluate(rules=>{const list=(rules||[{ext:'mp4',size:0,operator:'>=',unit:'KB',state:true}]).map(r=>r.ext==='mp4'?{...r,size:1024,operator:'>=',unit:'KB'}:r);if(!rules)list.push({ext:'m3u8',size:0,operator:'>=',unit:'KB',state:true});return chrome.storage.sync.set({Ext:list});},rules);
 await site.waitForTimeout(500);await send({Message:'clearData',tabId:tab,type:true});
 await get('clip.mp4?v=2');await get('big.mp4');await settle();items=await list();
 check(!items.some(i=>i.url.includes('clip.mp4?v=2'))&&items.some(i=>i.url.endsWith('/big.mp4')),'with mp4 set to >= 1024 KB, a 200 KB file is skipped and a 2 MB one recorded');
 await panel.evaluate(rules=>rules?chrome.storage.sync.set({Ext:rules}):chrome.storage.sync.remove('Ext'),rules);await site.waitForTimeout(500);
 // 9. A site without access; addMedia.
 const outside=await context.newPage();await outside.goto(other+'/page.html');await outside.evaluate(u=>fetch(u).then(r=>r.arrayBuffer()),other+'/clip.mp4');await outside.waitForTimeout(1200);
 const outsideTab=await panel.evaluate(async o=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith(o)).id,other);
 const outsideList=await send({Message:'getData',tabId:outsideTab});check(!Array.isArray(outsideList)||!outsideList.length,'a site without access records nothing');
 const refused=await send({Message:'addMedia',href:other+'/page.html',url:other+'/clip.mp4',mime:'video/mp4'});check(refused?.ok===false,'addMedia for a site without access is refused');
 const added=await send({Message:'addMedia',href:origin+'/page.html',url:origin+'/from-page.webm',mime:'video/webm'});await settle();
 check(added==='ok'&&(await list()).some(i=>i.url.endsWith('/from-page.webm')&&i.type==='video/webm'),'addMedia from the page is recorded for its tab');await outside.close();
 // popupAddData broadcast.
 await panel.evaluate(()=>{window.broadcasts=[];chrome.runtime.onMessage.addListener(m=>{if(m.Message==='popupAddData')window.broadcasts.push(m.data.url);});});
 await get('list.m3u8?b=1');await settle();check(await panel.evaluate(()=>window.broadcasts.some(u=>u.includes('list.m3u8?b=1'))),'every new item is announced with popupAddData');
 // 11. Pause.
 const off=await send({Message:'enable'});check(off===false,'enable switches recognition off');await get('clip.mp4?off=1');await settle();check(!(await list()).some(i=>i.url.includes('off=1')),'nothing is recorded while off');
 const on=await send({Message:'enable'});check(on===true,'and on again');
 // 12. Blocked sites.
 await panel.evaluate(o=>chrome.storage.sync.set({blockUrl:[{url:o+'/*',state:true}],blockUrlWhite:false}),origin);await site.goto(origin+'/page.html');await site.waitForTimeout(500);
 await get('clip.mp4?blocked=1');await settle();check(!(await list()).some(i=>i.url.includes('blocked=1')),'a blocked site records nothing');
 await panel.evaluate(()=>chrome.storage.sync.set({blockUrl:[],blockUrlWhite:false}));await site.goto(origin+'/page.html');await site.waitForTimeout(500);
 // 13. The list survives the service worker stopping.
 await get('clip.mp4?keep=1');await settle();
 const cdp=await context.newCDPSession(site);await cdp.send('ServiceWorker.enable').catch(()=>{});await cdp.send('ServiceWorker.stopAllWorkers').catch(()=>{});await site.waitForTimeout(1500);
 check((await list()).some(i=>i.url.includes('keep=1')),'the list is still there after the background stops and wakes again');
 // 16–17. (spec 05 v2) The badge counts what can be downloaded alone, not a player's pieces or variant playlists.
 if(process.env.RUXGET_IMPL==='new'){
  await site.goto(origin+'/badge.html');await site.waitForTimeout(800);
  const add=(url,mime)=>panel.evaluate(({href,url,mime})=>chrome.runtime.sendMessage({Message:'addMedia',href,url,mime}),{href:origin+'/badge.html',url,mime});
  await add(origin+'/dash/manifest.mpd','application/dash+xml');
  for(let i=1;i<=15;i++){await add(origin+`/dash/v720/seg_${i}.m4v`,'video/mp4');await add(origin+`/dash/a128/seg_${i}.m4a`,'audio/mp4');}
  await settle();check(await badge()==='1',`a DASH playlist with 30 pieces under its folder counts as 1 (badge ${await badge()})`);
  await site.goto(origin+'/badge2.html');await site.waitForTimeout(800);
  const add2=(url,mime)=>panel.evaluate(({href,url,mime})=>chrome.runtime.sendMessage({Message:'addMedia',href,url,mime}),{href:origin+'/badge2.html',url,mime});
  await add2(origin+'/hls/master.m3u8','application/vnd.apple.mpegurl');await add2(origin+'/hls/720/index.m3u8','application/vnd.apple.mpegurl');await add2(origin+'/hls/1080/index.m3u8','application/vnd.apple.mpegurl');
  await settle();check(await badge()==='1',`an HLS master with two variant playlists below it counts as 1 (badge ${await badge()})`);
  await site.goto(origin+'/page.html');await site.waitForTimeout(500);
 }
 // 10. Navigation and closing.
 await site.goto(origin+'/other.html');await site.waitForTimeout(800);const afterNav=await send({Message:'getData',tabId:tab});
 check(!Array.isArray(afterNav)||!afterNav.length,'navigating to another page clears the tab’s list');check(!(await badge()),'and its badge');
 await get('clip.mp4?close=1');await settle();await site.close();await panel.waitForTimeout(800);
 let dropped=false;for(let n=0;n<40&&!dropped;n++){const all=await send({Message:'getAllData'});dropped=all!=='error'&&(!all||!all[tab]||!all[tab].length);if(!dropped)await panel.waitForTimeout(1000);}
 check(dropped,'closing the tab drops its list (within 40 s)');
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({checks},null,1));console.log(`engine-check passed (${checks.length} checks). Report: ${report}`);
}catch(error){console.error(error);process.exitCode=1;}finally{await context?.close().catch(()=>{});server.close();}})();
