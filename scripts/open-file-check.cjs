// 0.4.68: a finished download opens from the panel (double-click the row, or "打开" on a site download).
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
 const chrome=spawn(exe,[`--user-data-dir=${profile}`,`--remote-debugging-port=${PORT}`,'--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--headless=new','--window-size=900,800','about:blank'],{stdio:'ignore'});
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

  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('OPEN FILE CHECKS PASSED ('+checks.length+')');
 }finally{
  try{socket&&socket.close();}catch{}server.close();try{process.kill(chrome.pid);}catch{}await wait(500);
 }
 process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
