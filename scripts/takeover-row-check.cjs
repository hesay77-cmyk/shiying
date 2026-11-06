// The panel's media rows and download takeover, in a real browser with real Chrome downloads (raw DevTools protocol,
// no Playwright download handling). The desktop is stubbed in the service worker; loopback server only.
// 0.4.64: with takeover on, "下载" on a plain file goes to the desktop like any web download, and "桌面下载" on a link
// Chrome is already downloading moves that download instead of starting a second copy.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||os.tmpdir(),'ruxget-takeover-row-'));
const checks=[];function check(value,name){if(!value)throw new Error(name);checks.push(name);console.log('PASS '+name);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch{}await wait(150);}return last;}
const MB=1048576,SIZE=120*MB;
const server=http.createServer((q,r)=>{
 const u=new URL(q.url,'http://x');
 if(u.pathname==='/')return r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),r.end('<!doctype html><meta charset=utf-8><title>Share page</title><p>files</p>');
 // A fast 3 MB file that Chrome finishes at once (for the "too late" case).
 if(u.pathname==='/quick.zip')return r.writeHead(200,{'Content-Type':'application/zip','Content-Length':3*MB}),r.end(Buffer.alloc(3*MB,1));
 if(!u.pathname.startsWith('/file/'))return r.writeHead(404),r.end();
 const m=/bytes=(\d+)-(\d*)/.exec(q.headers.range||''),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),SIZE-1):SIZE-1;
 r.writeHead(m?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(m?{'Content-Range':`bytes ${start}-${end}/${SIZE}`}:{})});
 let sent=start;const chunk=Buffer.alloc(128*1024,7);
 const t=setInterval(()=>{if(r.destroyed||sent>end){clearInterval(t);return r.end();}const p=chunk.subarray(0,Math.min(chunk.length,end-sent+1));sent+=p.length;r.write(p);},40);
 r.on('close',()=>clearInterval(t));
});
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(report,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
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
  const ev=async(expr,s)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,userGesture:true},s);if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,400));return r.result?.result?.value;};
  const loaded=await send('Extensions.loadUnpacked',{path:extension});const id=loaded.result?.id;if(!id)throw new Error('load '+JSON.stringify(loaded));
  const sw=await until(async()=>(await send('Target.getTargets')).result.targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(id)));
  const ss=await attach(sw.targetId);
  // Desktop stub: replies after a short probe delay; reply can be switched per case.
  await ev(`(async()=>{globalThis.native=[];globalThis.reply={ok:true,id:'job1',name:'clip.mp4'};chrome.permissions.contains=async()=>true;globalThis.ui=[];const realUi=chrome.downloads.setUiOptions.bind(chrome.downloads);chrome.downloads.setUiOptions=o=>{ui.push(o.enabled);return realUi(o);};
   chrome.runtime.sendNativeMessage=async(h,m)=>{native.push({action:m.action,url:m.url,name:m.name,referer:m.referer});if(m.action!=='takeover')return {ok:true};await new Promise(r=>setTimeout(r,300));return reply;};return 'ok';})()`,ss);
  const page=(await send('Target.getTargets')).result.targetInfos.find(t=>t.type==='page');const ps=await attach(page.targetId);
  await send('Page.navigate',{url:origin+'/'},ps);await wait(800);
  const tabId=await ev(`chrome.tabs.query({}).then(t=>t.find(x=>x.url.startsWith('${origin}')).id)`,ss);
  const takeover=enabled=>ev(`chrome.storage.local.set({ruxgetTakeover:{enabled:${enabled},minMB:50,minChosen:true,skipHosts:[]},ruxgetOffer:{asked:3,never:true}})`,ss);
  const list=()=>ev(`chrome.downloads.search({}).then(l=>l.map(d=>({id:d.id,state:d.state,error:d.error||'',url:d.url,paused:d.paused,byExt:!!d.byExtensionId})))`,ss);
  const calls=()=>ev(`native.filter(c=>c.action==='takeover')`,ss);
  const adds=pp=>ev(`window.adds.length`,pp);
  const notice=pp=>ev(`document.body.innerText`,pp);
  let n=0;
  // A fresh panel for the share page with one detected video (the same message the worker sends when it sees media).
  async function panel(){
   const created=await send('Target.createTarget',{url:`chrome-extension://${id}/shiying.html?tabId=${tabId}`});const pp=await attach(created.result.targetId);
   await until(()=>ev(`document.readyState==='complete'&&!!window.RuxgetI18n`,pp));await wait(600);
   const url=`${origin}/file/clip${++n}.mp4`;
   await ev(`chrome.runtime.sendMessage({Message:'popupAddData',data:{tabId:${tabId},url:'${url}',name:'clip${n}.mp4',ext:'mp4',type:'video/mp4',size:${SIZE},title:'Share page',webUrl:'${origin}/',requestId:'r${n}'}})`,ss);
   await until(()=>ev(`!!document.querySelector('.media-item .desktop-button')`,pp));
   await ev(`window.adds=[];chrome.permissions.request=async()=>true;chrome.runtime.sendNativeMessage=async(h,m)=>{adds.push(m.action);return {ok:true,stage:'confirm'};};'ok'`,pp);
   return {pp,url,close:()=>send('Target.closeTarget',{targetId:created.result.targetId})};
  }
  const row=(pp,what)=>ev(`document.querySelector('.media-item:not(template *) ${what}').click();'ok'`,pp);
  const statusText=pp=>ev(`document.querySelector('.media-item .item-status').textContent`,pp);
  const reset=()=>ev(`(async()=>{for(const d of await chrome.downloads.search({}))try{await chrome.downloads.cancel(d.id);}catch{}await chrome.downloads.erase({});native.length=0;reply={ok:true,id:'job1',name:'clip.mp4'};await chrome.storage.session.remove(['ruxgetOwnDownloads','ruxgetTakeableDownloads']);await chrome.storage.local.remove('ruxgetTakeoverLog');return 'ok';})()`,ss);

  // 1. Takeover on: "下载" on a 120 MB video goes to the desktop; Chrome's copy is cancelled and erased.
  await takeover(true);let p=await panel();await row(p.pp,'.download-button');
  let moved=await until(async()=>{const c=await calls(),l=await list();return c.length===1&&!l.some(d=>d.state==='in_progress')&&{c,l};});
  check(moved&&moved.c[0].url===p.url,'takeover on: the panel\'s "下载" hands the file to the desktop');
  check(moved&&!moved.l.some(d=>d.state==='in_progress'||d.state==='complete'),'takeover on: Chrome keeps no copy of it');
  check(moved&&moved.c[0].name==='Share page.mp4'&&moved.c[0].referer===origin+'/','the desktop gets the panel file name and the page it came from');
  check(await until(async()=>(await statusText(p.pp)).includes('已交给桌面版')),'the row says the desktop has it, not "interrupted"');
  const bubble=await ev('ui',ss);check(bubble.includes(false)&&bubble[bubble.length-1]===true,'the Chrome download bubble is shut during the hand-over and opened again afterwards');
  // 1b. "桌面下载" afterwards adds nothing: the file is already in the desktop.
  await row(p.pp,'.desktop-button');await wait(1200);
  check((await adds(p.pp))===0&&(await calls()).length===1&&(await notice(p.pp)).includes('已经交给 Ruxget 桌面版'),'"桌面下载" after the hand-over sends nothing more and says so');
  // A second click within a few seconds sends it on purpose (say the desktop task failed or was deleted).
  await row(p.pp,'.desktop-button');
  check(await until(async()=>(await adds(p.pp))===1),'clicking "桌面下载" again right away sends it again on purpose');
  // Refusing the connection: one refusal message, no prompt loop and nothing added.
  await ev(`window.adds=[];chrome.permissions.request=async()=>false;chrome.permissions.contains=async()=>false;document.querySelector('#error').hidden=true;'ok'`,p.pp);
  await row(p.pp,'.desktop-button');await wait(800);
  check((await adds(p.pp))===0&&(await ev(`!document.querySelector('#error').hidden&&document.querySelector('#error').textContent.includes('未允许连接桌面版')`,p.pp)),'refusing the connection adds nothing and says so once');
  await p.close();await reset();

  // 1c. Takeover on, "桌面下载" clicked while the hand-over is still waiting for the desktop: one hand-over, no second task.
  await ev(`globalThis.slow=true;const quick=chrome.runtime.sendNativeMessage;chrome.runtime.sendNativeMessage=async(h,m)=>{if(m.action==='takeover'&&globalThis.slow)await new Promise(r=>setTimeout(r,2500));return quick(h,m);};'ok'`,ss);
  p=await panel();await row(p.pp,'.download-button');
  await until(async()=>(await ev(`chrome.downloads.search({}).then(l=>l.some(d=>d.paused))`,ss)));await row(p.pp,'.desktop-button');
  moved=await until(async()=>{const l=await list();return !l.some(d=>d.state==='in_progress')&&(await calls()).length>=1&&l;},12000);await wait(1500);
  check(moved&&(await calls()).length===1&&(await adds(p.pp))===0,'a second click during the hand-over shares it: one desktop task');
  await ev(`delete globalThis.slow;'ok'`,ss);await p.close();await reset();

  // 2. Takeover off: "下载" stays in Chrome, the desktop is never asked.
  // As right after the worker wakes: the takeover setting is not read yet.
  await takeover(false);await ev(`ui.length=0;RuxgetTakeover.known=null;'ok'`,ss);p=await panel();await row(p.pp,'.download-button');
  const kept=await until(async()=>(await list()).find(d=>d.url===p.url&&d.state==='in_progress'));await wait(1200);
  check(kept&&(await calls()).length===0&&(await list()).some(d=>d.url===p.url&&d.state==='in_progress'),'takeover off: the panel\'s "下载" stays in Chrome');
  check(!(await ev('ui',ss)).includes(false),'takeover off: the Chrome download bubble is never touched, even right after the worker wakes');
  check(!(await ev(`chrome.storage.session.get('ruxgetTakeableDownloads').then(v=>(v.ruxgetTakeableDownloads||[]).length)`,ss)),'takeover off: no marker is left that could later override a "use Chrome" choice');

  // 3. Same panel, takeover still off: "桌面下载" on the link Chrome is downloading moves it rather than adding a second copy.
  await row(p.pp,'.desktop-button');
  moved=await until(async()=>{const c=await calls(),l=await list();return c.length===1&&!l.some(d=>d.url===p.url&&d.state==='in_progress')&&{c,l};});
  check(moved&&moved.c[0].url===p.url,'"桌面下载" while Chrome downloads the same link hands that download over');
  check(moved&&!moved.l.some(d=>d.state==='in_progress'),'Chrome\'s copy stops, so the file is downloaded once');
  check(await until(async()=>(await statusText(p.pp)).includes('已交给桌面版')),'the row says the desktop has it');
  check((await adds(p.pp))===0,'no second, separate desktop task is added');
  await p.close();await reset();

  // 4. Takeover on, desktop refuses the link: Chrome keeps it, and the restarted copy is never handed over again.
  await takeover(true);await ev(`reply={ok:false,error:'桌面版无法直接访问这个链接，交回 Chrome 下载'};'ok'`,ss);p=await panel();await row(p.pp,'.download-button');
  const back=await until(async()=>(await calls()).length>=1&&(await list()).find(d=>d.url===p.url&&d.state==='in_progress'&&!d.paused));await wait(2000);
  check(back&&(await calls()).length===1&&(await list()).filter(d=>d.url===p.url&&d.state==='in_progress').length===1,'a refused file finishes in Chrome, asked once, one copy');
  await p.close();await reset();

  // 4b. Reached too late (0.4.65): Chrome has already finished, so nothing is sent and the reason is kept with its timing.
  await takeover(false);
  const quick=await ev(`new Promise(done=>chrome.downloads.download({url:'${origin}/quick.zip'},id=>{const check=()=>chrome.downloads.search({id}).then(([d])=>d&&d.state==='complete'?done(d):setTimeout(check,100));check();}))`,ss);
  // As if Chrome had started it from a page (not one of Ruxget's own), with takeover on for files of 1 MB and up.
  await ev(`chrome.storage.session.remove('ruxgetOwnDownloads').then(()=>chrome.storage.local.set({ruxgetTakeover:{enabled:true,minMB:1,minChosen:true,skipHosts:[]}}))`,ss);
  await ev(`native.length=0;RuxgetTakeover.handle(${JSON.stringify(Object.assign({},quick,{state:"in_progress",bytesReceived:0,byExtensionId:"",byExtensionName:""}))}).then(()=>'ok')`,ss);
  const late=(await ev(`chrome.storage.local.get('ruxgetTakeoverLog').then(v=>v.ruxgetTakeoverLog||[])`,ss))[0];
  check((await calls()).length===0&&late&&late.result==='chrome'&&late.error==='late'&&late.percent===100&&late.lagMs>=0,'a download Chrome has already finished is left alone, and the log says why and how late');
  const page2=await send('Target.createTarget',{url:`chrome-extension://${id}/shiying-desktop.html#takeover`});const dp=await attach(page2.result.targetId);
  check(await until(async()=>(await ev(`document.querySelector('#takeoverLog')?.textContent||''`,dp)).includes('来得太晚')),'the settings page shows that reason in plain words');
  await send('Target.closeTarget',{targetId:page2.result.targetId});await reset();

  // 5. Takeover on, "另存为" chosen in settings: the person picks the place in Chrome, nothing is handed over.
  await ev(`chrome.storage.sync.set({saveAs:true})`,ss);
  check((await ev(`fetch('/js/shiying-background.js').then(r=>r.text()).then(t=>t.includes("!saveAs && typeof RuxgetTakeover !== 'undefined' && (await RuxgetTakeover.settings()).enabled"))`,ss)),'"save as" downloads are left to Chrome');

  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('TAKEOVER ROW CHECKS PASSED ('+checks.length+')');
 }finally{
  try{socket&&socket.close();}catch{}server.close();try{process.kill(chrome.pid);}catch{}await wait(500);
 }
 process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
