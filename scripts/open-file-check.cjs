// 0.4.68: a finished download opens from the panel (double-click the row, or "打开" on a site download). 0.4.69: also from "最近下载".
// Real Chrome, real Chrome downloads, raw DevTools protocol, loopback server only. The test copy lists the optional
// "downloads.open" as granted so no permission dialog is needed; chrome.downloads.open is checked for a real user
// gesture without launching any program (it is called on a download that is still running, which Chrome rejects
// only after the gesture check).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||os.tmpdir(),'ruxget-open-file-'));
const checks=[];function check(value,name){if(!value)throw new Error(name);checks.push(name);console.log('PASS '+name);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch{}await wait(150);}return last;}
const MB=1048576;
const server=http.createServer((q,r)=>{
 const u=new URL(q.url,'http://x');
 if(u.pathname==='/')return r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),r.end('<!doctype html><meta charset=utf-8><title>Share page</title><p>files</p>');
 if(u.pathname==='/quick.mp4')return r.writeHead(200,{'Content-Type':'video/mp4','Content-Length':MB}),r.end(Buffer.alloc(MB,1));
 // Never finishes while the test runs.
 if(u.pathname==='/slow.bin'){r.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':500*MB});const t=setInterval(()=>r.destroyed?clearInterval(t):r.write(Buffer.alloc(16384,2)),200);r.on('close',()=>clearInterval(t));return;}
 r.writeHead(404);r.end();
});
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'build','manifest.json'),'utf8'));
 check(manifest.optional_permissions.includes('downloads.open')&&!manifest.permissions.includes('downloads.open'),'downloads.open is optional, so updating never disables the extension');
 const extension=path.join(report,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
 manifest.permissions.push('downloads.open');manifest.optional_permissions=manifest.optional_permissions.filter(p=>p!=='downloads.open');fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const profile=path.join(report,'profile'),downloads=path.join(report,'downloads');fs.mkdirSync(path.join(profile,'Default'),{recursive:true});fs.mkdirSync(downloads);
 fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({download:{default_directory:downloads,prompt_for_download:false},browser:{has_seen_welcome_page:true}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const exe=fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':process.env.SHIYING_CHROMIUM;
 const PORT=9300+Math.floor(Math.random()*500);
 const chrome=spawn(exe,[`--user-data-dir=${profile}`,`--remote-debugging-port=${PORT}`,'--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--headless=new','--mute-audio','--autoplay-policy=user-gesture-required','--window-size=900,800','about:blank'],{stdio:'ignore'});
 let socket;
 try{
  const version=await until(async()=>(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(),20000);
  socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const send=(method,params={},sessionId)=>new Promise(r=>{const id=++seq;pending.set(id,r);socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const attach=async targetId=>(await send('Target.attachToTarget',{targetId,flatten:true})).result.sessionId;
  const ev=async(expr,s,gesture=false)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,userGesture:gesture},s);if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,400));return r.result?.result?.value;};
  const loaded=await send('Extensions.loadUnpacked',{path:extension});const id=loaded.result?.id;if(!id)throw new Error('load '+JSON.stringify(loaded));
  const sw=await until(async()=>(await send('Target.getTargets')).result.targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(id)));
  const ss=await attach(sw.targetId);
  const page=(await send('Target.getTargets')).result.targetInfos.find(t=>t.type==='page');const ps=await attach(page.targetId);
  await send('Page.navigate',{url:origin+'/'},ps);await wait(800);
  const tabId=await ev(`chrome.tabs.query({}).then(t=>t.find(x=>x.url.startsWith('${origin}')).id)`,ss);
  const created=await send('Target.createTarget',{url:`chrome-extension://${id}/shiying.html?tabId=${tabId}`});const pp=await attach(created.result.targetId);
  await until(()=>ev(`document.readyState==='complete'&&!!window.RuxgetI18n&&!!window.RuxgetOpen`,pp));await wait(600);
  // Real mouse double-click at an element's centre (gives Chrome a genuine user activation).
  const dblclick=async selector=>{const box=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+Math.min(60,r.width/2),y:r.y+Math.min(20,r.height/2)};})()`,pp);
   for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},pp);
   for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:2},pp);};

  // 1. Media row: download a detected video in Chrome, wait for it to finish, then double-click the row.
  await ev(`chrome.runtime.sendMessage({Message:'popupAddData',data:{tabId:${tabId},url:'${origin}/quick.mp4',name:'quick.mp4',ext:'mp4',type:'video/mp4',size:${MB},title:'Share page',webUrl:'${origin}/',requestId:'r1'}})`,ss);
  await until(()=>ev(`!!document.querySelector('.media-item .download-button')`,pp));
  await ev(`window.opened=[];window.realOpen=chrome.downloads.open;chrome.downloads.open=async id=>{opened.push({id,active:navigator.userActivation.isActive});};'ok'`,pp);
  await dblclick('.media-item');await wait(400);
  check((await ev(`opened.length`,pp))===0,'a row that was not downloaded does not open anything on double-click');
  await ev(`document.querySelector('.media-item .download-button').click()`,pp,true);
  const done=await until(()=>ev(`chrome.downloads.search({url:'${origin}/quick.mp4'}).then(l=>l.find(d=>d.state==='complete'))`,ss));
  check(done,'Chrome finished the download');
  check(await until(()=>ev(`document.querySelector('.media-item .item-status').textContent==='下载完成 · 双击打开'`,pp)),'the finished row says it opens on double-click');
  await dblclick('.media-item .resource-name, .media-item h3, .media-item');await until(()=>ev(`opened.length>0`,pp),3000);
  const opened=await ev(`opened`,pp);
  check(opened.length===1&&opened[0].id===done.id,'double-clicking the finished row opens that download ('+JSON.stringify(opened)+')');
  check(opened[0].active,'the open call still carries the double-click as a user gesture');
  await ev(`opened.length=0;document.querySelector('.media-item .download-button').focus()`,pp);
  await dblclick('.media-item .download-button');await wait(400);
  check((await ev(`opened.length`,pp))===0,'double-clicking a button in the row does not open the file');

  // 2. The real chrome.downloads.open passes Chrome's gesture check after RuxgetOpen's own checks
  //    (a still-running download is rejected only after that check, so nothing gets launched).
  const slow=await ev(`chrome.downloads.download({url:'${origin}/slow.bin'})`,ss);
  await until(()=>ev(`chrome.downloads.search({id:${slow}}).then(l=>l[0]&&l[0].state==='in_progress'&&l[0].bytesReceived>0)`,ss));
  await ev(`(()=>{chrome.downloads.open=realOpen;window.said=[];const real=chrome.downloads.search.bind(chrome.downloads);chrome.downloads.search=q=>real(q).then(l=>l.map(d=>({...d,state:'complete',exists:true})));
   const probe=document.createElement('div');probe.id='probe';probe.textContent='probe';probe.style.cssText='position:fixed;left:10px;top:10px;width:120px;height:40px;z-index:99999;background:#fff';document.body.append(probe);
   probe.addEventListener('dblclick',()=>RuxgetOpen.file(${slow},t=>said.push(t)));return typeof chrome.downloads.open;})()`,pp);
  await dblclick('#probe');const viaClick=await until(()=>ev(`said[0]`,pp),5000);
  check(/complete/i.test(viaClick||'')&&!/再打开一次/.test(viaClick),'with a real double-click Chrome accepts the gesture ('+viaClick+')');
  await wait(6000);// let the double-click's activation expire
  await ev(`said.length=0;RuxgetOpen.file(${slow},t=>said.push(t))`,pp,false);const noGesture=await until(()=>ev(`said[0]`,pp),5000);
  check(/请再打开一次/.test(noGesture||''),'without a gesture the person is told to open it once more ('+noGesture+')');
  await ev(`chrome.downloads.cancel(${slow})`,ss);

  // 3. Unfinished downloads are refused by RuxgetOpen itself.
  await ev(`(()=>{const real=chrome.downloads.search;chrome.downloads.search=q=>Promise.resolve([{id:q.id,state:'in_progress'}]);said.length=0;return RuxgetOpen.file(7,t=>said.push(t));})()`,pp,true);
  check((await ev(`said[0]`,pp))==='文件还没下载完成','an unfinished download is not opened');
  await ev(`chrome.downloads.search=q=>Promise.resolve([{id:q.id,state:'complete',exists:false}]);said.length=0;RuxgetOpen.file(7,t=>said.push(t))`,pp,true);
  check((await ev(`said[0]`,pp))==='文件已不在原来的位置，可能被移动或删除了','a moved or deleted file is explained');

  // 4. Site downloads (B站 etc.): the job capsule gets "打开" only once the file is saved by Chrome.
  const html=fs.readFileSync(path.join(root,'shiying.html'),'utf8'),ui=fs.readFileSync(path.join(root,'js','shiying-platform-ui.js'),'utf8');
  check(html.includes('id="platformOpen"')&&html.indexOf('js/ruxget-open.js')<html.indexOf('js/shiying-platform-ui.js'),'the panel loads the opener before the site-download card');
  check(/platformOpen'\)\.hidden=!\(job\.status==='complete'&&Number\.isInteger\(job\.downloadId\)\)/.test(ui)&&ui.includes("$('#platformJob').addEventListener('dblclick'"),'the site-download card opens only finished Chrome files');
  const privacy=fs.readFileSync(path.join(root,'PRIVACY.md'),'utf8');check(privacy.includes('downloads.open'),'privacy notes explain downloads.open');

  // 5. "最近下载" (0.4.69): double-click (or Enter) opens a finished file without the desktop window. One click on a
  //    finished row does nothing, so even a slow double-click can't bring up the desktop window or a tab first; the old
  //    single-click target moved to the small button beside the bin. Unfinished rows keep their one click.
  const centre=selector=>ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+Math.min(60,r.width/2),y:r.y+Math.min(14,r.height/2)};})()`,pp);
  const press=async(box,count)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:count},pp);};
  const click=async selector=>press(await centre(selector),1);
  // Two clicks the given time apart; Windows still counts up to 500 ms as a double-click. between() runs in the gap.
  const slowDouble=async(selector,gap,between)=>{const box=await centre(selector);await press(box,1);await wait(gap/2);if(between)await between();await wait(gap/2);await press(box,2);};
  await ev(`(async()=>{window.opened=[];chrome.downloads.open=async id=>{opened.push({id,active:navigator.userActivation.isActive});};
   chrome.downloads.search=q=>Promise.resolve([{id:q.id,state:'complete',exists:true}]);
   window.said=[];window.notify=t=>said.push(t);window.native=[];window.nativeReply={ok:true};
   chrome.runtime.sendNativeMessage=async(host,m)=>{native.push(m.action+(m.id?':'+m.id:''));return m.action==='open'?nativeReply:{ok:true};};
   window.tabsMade=[];chrome.tabs.create=async o=>{tabsMade.push(o.url);return {};};window.shown=[];chrome.downloads.show=id=>{shown.push(id);};
   window.desktopStatus=n=>chrome.storage.session.set({ruxgetDesktopStatus:{at:Date.now(),running:true,active:1,jobs:[{id:'0123456789abcdef',title:'setup.exe',state:'done',progress:100,at:Date.now()-1000},{id:'1111111111111111',title:'big.iso',state:'active',progress:n,at:Date.now()}]}});
   await desktopStatus(40);
   await chrome.storage.local.set({shiyingJobIds:['site1'],'shiyingJob:site1':{id:'site1',title:'site video',status:'complete',format:'mp4',height:720,progress:100,stage:'下载完成',downloadId:${done.id},createdAt:new Date(Date.now()-5000).toISOString()}});
   return 'ok';})()`,pp);
  const row=id=>`#recentList li[data-id="${id}"]`,DESK=row('0123456789abcdef')+' .recent-open',ACTIVE=row('1111111111111111')+' .recent-open',SITE=row('site1')+' .recent-open';
  check(await until(()=>ev(`!!document.querySelector('${DESK}')&&!!document.querySelector('${SITE}')`,pp)),'the recent list shows a finished desktop download and a finished site download');
  await ev(`RuxgetTabs.show('downloads',true);document.querySelector('${DESK}').scrollIntoView()`,pp);await wait(200);
  check(await ev(`/双击打开/.test(document.querySelector('${DESK}').textContent)&&/双击打开/.test(document.querySelector('${SITE}').textContent)&&!/双击打开/.test(document.querySelector('${ACTIVE}').textContent)`,pp),'finished rows say they open on double-click; a running one does not');
  check(await ev(`!!document.querySelector('${row('0123456789abcdef')} .recent-show')&&!!document.querySelector('${row('site1')} .recent-show')&&!document.querySelector('${row('1111111111111111')} .recent-show')`,pp),'finished rows have the small “view” button; a running one does not');
  await dblclick(DESK);await wait(700);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['open:0123456789abcdef']),'double-clicking a finished desktop download opens it and does not bring up the desktop window ('+JSON.stringify(await ev(`native`,pp))+')');
  await ev(`native.length=0`,pp);await click(DESK);await wait(900);
  check((await ev(`native.length+tabsMade.length`,pp))===0,'one click on a finished row does nothing');
  await ev(`native.length=0`,pp);await slowDouble(DESK,450);await wait(700);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['open:0123456789abcdef']),'a slow double-click (450 ms) opens the file and never shows the desktop window ('+JSON.stringify(await ev(`native`,pp))+')');
  await ev(`native.length=0;window.renders=0;new MutationObserver(()=>renders++).observe(document.querySelector('#recentList'),{childList:true})`,pp);
  await slowDouble(DESK,400,()=>ev(`desktopStatus(55)`,pp));await wait(1200);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['open:0123456789abcdef']),'a progress refresh during the double-click doesn’t lose it ('+JSON.stringify(await ev(`native`,pp))+')');
  check((await ev(`renders>0&&/55%/.test(document.querySelector('${ACTIVE}').textContent)`,pp)),'…and the refresh still happens right after');
  await ev(`native.length=0`,pp);await click(row('0123456789abcdef')+' .recent-show');await wait(200);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['reveal:0123456789abcdef']),'the small folder button shows a desktop download in its folder, without the desktop window');
  check((await ev(`document.querySelector('${row('0123456789abcdef')} .recent-show').title`,pp))==='在文件夹中显示','…and says so');
  await ev(`native.length=0;nativeReply={ok:false,error:'不支持的浏览器操作'};chrome.runtime.sendNativeMessage=async(host,m)=>{native.push(m.action+(m.id?':'+m.id:''));return m.action==='show'?{ok:true}:nativeReply;}`,pp);
  await click(row('0123456789abcdef')+' .recent-show');await wait(300);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['reveal:0123456789abcdef'])&&(await ev(`said.includes('请把 Ruxget 桌面版更新到最新版，就能在这里打开文件夹')`,pp)),'an older desktop app gets a quiet update hint, never its window');
  await ev(`nativeReply={ok:true};chrome.runtime.sendNativeMessage=async(host,m)=>{native.push(m.action+(m.id?':'+m.id:''));return m.action==='open'?nativeReply:{ok:true};}`,pp);
  await ev(`native.length=0;document.querySelector('${DESK}').focus()`,pp);
  for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})},pp);
  await wait(300);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['open:0123456789abcdef']),'Enter on a finished row opens it too');
  await ev(`native.length=0;nativeReply={ok:false,error:'不支持的浏览器操作'};said.length=0`,pp);await dblclick(DESK);
  check(await until(()=>ev(`said.includes('请把 Ruxget 桌面版更新到最新版，就能在这里双击打开')`,pp),3000),'an older desktop app gets a quiet update hint, not its window');
  await ev(`nativeReply={ok:false,error:'文件已不在原来的位置，可能被移动或删除了'};said.length=0`,pp);await dblclick(DESK);
  check(await until(()=>ev(`said.includes('文件已不在原来的位置，可能被移动或删除了')`,pp),3000),'the desktop app’s reason is passed on when it can’t open the file');
  await ev(`said.length=0;chrome.runtime.sendNativeMessage=undefined`,pp);await dblclick(DESK);
  check(await until(()=>ev(`said.includes('桌面版没有响应')`,pp),3000),'with the desktop connection taken back, a double-click explains itself instead of failing silently');
  await ev(`chrome.runtime.sendNativeMessage=async(host,m)=>{native.push(m.action+(m.id?':'+m.id:''));return {ok:true};};native.length=0`,pp);await click(ACTIVE);await wait(100);
  check(JSON.stringify(await ev(`native`,pp))===JSON.stringify(['show']),'a running desktop download still shows the desktop app on one click, without waiting');
  await ev(`native.length=0;opened.length=0;tabsMade.length=0;document.querySelector('${SITE}').scrollIntoView()`,pp);await dblclick(SITE);await wait(700);
  const siteOpened=await ev(`opened`,pp);
  check(siteOpened.length===1&&siteOpened[0].id===done.id&&siteOpened[0].active,'double-clicking a finished site download opens it with Chrome, as a user gesture ('+JSON.stringify(siteOpened)+')');
  check((await ev(`tabsMade.length+native.length`,pp))===0,'…without opening the progress page or touching the desktop app');
  await click(row('site1')+' .recent-show[title="在文件夹中显示"]');await wait(300);
  check((await ev(`shown.length===1&&shown[0]===${done.id}&&tabsMade.length===0`,pp)),'its small folder button shows the saved file in its folder');
  await click(row('site1')+' .recent-show[title="下载详情"]');await wait(300);
  check((await ev(`tabsMade.length===1&&tabsMade[0].includes('shiying-task.html?id=site1')`,pp)),'a finished site video keeps its 下载详情 button');
  const taskHtml=fs.readFileSync(path.join(root,'shiying-task.html'),'utf8'),taskJs=fs.readFileSync(path.join(root,'js','shiying-task.js'),'utf8');
  check(taskHtml.includes('id="openTaskFile"')&&taskHtml.indexOf('js/ruxget-open.js')<taskHtml.indexOf('js/shiying-task.js')&&taskJs.includes('RuxgetOpen.file(savedDownload'),'the progress page can open the saved file itself');
  const text=fs.readFileSync(path.join(root,'js','shiying-text.js'),'utf8');
  check(['桌面版里已经没有这个下载了','这个程序没有“来自网络”的安全标记，已打开它所在的文件夹，请确认后再运行','没有能打开这种文件的程序'].every(s=>text.includes(`'${s}'`))&&text.includes('打不开这个文件：'),'the desktop app’s open messages have English');

  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('OPEN FILE CHECKS PASSED ('+checks.length+')');
 }finally{
  try{socket&&socket.close();}catch{}server.close();try{process.kill(chrome.pid);}catch{}await wait(500);
 }
 process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
