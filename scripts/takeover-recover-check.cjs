// 0.4.68: what a stopped service worker leaves behind is undone when it starts again, and a download the person
// paused themselves is never resumed by a refused hand-over. Real Chrome, real downloads, raw DevTools protocol,
// loopback server only; the desktop app is stubbed in the service worker.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||os.tmpdir(),'ruxget-takeover-recover-'));
const checks=[];function check(value,name){if(!value)throw new Error(name);checks.push(name);console.log('PASS '+name);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch{}await wait(150);}return last;}
const MB=1048576;
const server=http.createServer((q,r)=>{
 const u=new URL(q.url,'http://x');
 if(u.pathname==='/')return r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),r.end('<!doctype html><meta charset=utf-8><title>Page</title><p>files</p>');
 if(u.pathname.startsWith('/slow')){const total=400*MB,m=/bytes=(\d+)-/.exec(q.headers.range||''),start=m?Number(m[1]):0;
  r.writeHead(m?206:200,{'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Content-Length':total-start,...(m?{'Content-Range':`bytes ${start}-${total-1}/${total}`}:{})});
  const t=setInterval(()=>r.destroyed?clearInterval(t):r.write(Buffer.alloc(16384,2)),100);r.on('close',()=>clearInterval(t));return;}
 r.writeHead(404);r.end();
});
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(report,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
 const profile=path.join(report,'profile'),downloads=path.join(report,'downloads');fs.mkdirSync(path.join(profile,'Default'),{recursive:true});fs.mkdirSync(downloads);
 fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({download:{default_directory:downloads,prompt_for_download:false},browser:{has_seen_welcome_page:true}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const exe=fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':process.env.SHIYING_CHROMIUM;
 const PORT=9300+Math.floor(Math.random()*500);
 const chrome=spawn(exe,[`--user-data-dir=${profile}`,`--remote-debugging-port=${PORT}`,'--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--headless=new','--mute-audio','--autoplay-policy=user-gesture-required','about:blank'],{stdio:'ignore'});
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
  await until(()=>ev(`typeof RuxgetTakeover==='object'`,ss));
  await ev(`(()=>{globalThis.ui=[];const real=chrome.downloads.setUiOptions.bind(chrome.downloads);chrome.downloads.setUiOptions=o=>{ui.push(o.enabled);return real(o);};return 'ok';})()`,ss);
  const state=d=>ev(`chrome.downloads.search({id:${d}}).then(l=>l[0]&&{state:l[0].state,paused:l[0].paused})`,ss);

  // 1. Someone who never used takeover: a worker start leaves Chrome's bubble alone.
  await ev(`RuxgetTakeover.recover()`,ss);
  check((await ev(`ui.length`,ss))===0,'without takeover, starting the worker never touches Chrome’s download bubble');

  // 2. A worker that stopped mid-hand-over: bubble shut and a download paused for the hand-over.
  const a=await ev(`chrome.downloads.download({url:'${origin}/slow-a.bin'})`,ss);
  await until(async()=>(await state(a))?.state==='in_progress');await ev(`chrome.downloads.pause(${a})`,ss);
  await ev(`chrome.downloads.setUiOptions({enabled:false}).then(()=>chrome.storage.session.set({ruxgetUiHeld:true,ruxgetPausedForHandOver:[${a}]}))`,ss);
  await ev(`ui.length=0;RuxgetTakeover.uiHold=0;RuxgetTakeover.running.clear();RuxgetTakeover.recover()`,ss);
  check(JSON.stringify(await ev(`ui`,ss))==='[true]','the restarted worker turns Chrome’s bubble back on');
  check((await state(a)).paused===false,'the download paused for the hand-over is resumed');
  check(JSON.stringify(await ev(`chrome.storage.session.get(['ruxgetUiHeld','ruxgetPausedForHandOver'])`,ss))==='{"ruxgetPausedForHandOver":[]}','nothing is left to undo afterwards');
  await ev(`chrome.downloads.cancel(${a})`,ss);

  // 3. holdUi keeps the session note in step with the hold count.
  await ev(`RuxgetTakeover.holdUi(true)`,ss);await wait(200);
  check((await ev(`chrome.storage.session.get('ruxgetUiHeld')`,ss)).ruxgetUiHeld===true,'a hold is remembered for the session');
  await ev(`RuxgetTakeover.holdUi(false)`,ss);await wait(200);
  check((await ev(`chrome.storage.session.get('ruxgetUiHeld')`,ss)).ruxgetUiHeld===undefined,'and forgotten when the hold ends');

  // 4. A download the person paused, then "桌面下载" that the desktop refuses: it stays paused.
  await ev(`chrome.runtime.sendNativeMessage=async()=>({ok:false,error:'这个链接需要网页登录或验证，交回 Chrome 下载'});chrome.permissions.contains=async()=>true;'ok'`,ss);
  const b=await ev(`chrome.downloads.download({url:'${origin}/slow-b.bin'})`,ss);
  await until(async()=>(await state(b))?.state==='in_progress');await ev(`chrome.downloads.pause(${b})`,ss);await until(async()=>(await state(b)).paused);
  const refused=await ev(`chrome.downloads.search({id:${b}}).then(([item])=>RuxgetTakeover.handOver(item,{own:true}))`,ss);
  check(refused.result==='chrome','the desktop refusal keeps the file in Chrome');
  await wait(800);
  check((await state(b)).paused===true,'a download the person paused stays paused after a refused hand-over');
  check(JSON.stringify((await ev(`chrome.storage.session.get('ruxgetPausedForHandOver')`,ss)).ruxgetPausedForHandOver||[])==='[]','a person’s own pause is not recorded as a hand-over pause');

  // 5. A running download refused by the desktop resumes, and its record is cleared.
  const c=await ev(`chrome.downloads.download({url:'${origin}/slow-c.bin'})`,ss);
  await until(async()=>(await state(c))?.state==='in_progress');
  await ev(`chrome.downloads.search({id:${c}}).then(([item])=>RuxgetTakeover.handOver(item,{own:true}))`,ss);await wait(800);
  check((await state(c)).paused===false&&(await state(c)).state==='in_progress','a running download refused by the desktop carries on in Chrome');
  check(JSON.stringify((await ev(`chrome.storage.session.get('ruxgetPausedForHandOver')`,ss)).ruxgetPausedForHandOver||[])==='[]','the hand-over pause record is cleared when the hand-over ends');
  await ev(`Promise.all([${b},${c}].map(d=>chrome.downloads.cancel(d).catch(()=>{})))`,ss);

  // 7. A hand-over that starts while recover() runs keeps its note, so a second worker stop still restores the bubble.
  await ev(`(async()=>{await chrome.storage.session.set({ruxgetUiHeld:true});RuxgetTakeover.uiHold=0;const r=RuxgetTakeover.recover();RuxgetTakeover.holdUi(true);await r;await new Promise(x=>setTimeout(x,300));return 1;})()`,ss);
  check((await ev(`chrome.storage.session.get('ruxgetUiHeld')`,ss)).ruxgetUiHeld===true,'a hold that begins during recovery keeps its session note');
  await ev(`RuxgetTakeover.holdUi(false)`,ss);await wait(300);
  check((await ev(`chrome.storage.session.get('ruxgetUiHeld')`,ss)).ruxgetUiHeld===undefined,'and the note goes once that hold ends');

  // 8. A worker that stopped after the desktop accepted a file (logged) but before cancelling: no second copy.
  const d=await ev(`chrome.downloads.download({url:'${origin}/slow-d.bin'})`,ss);
  await until(async()=>(await state(d))?.state==='in_progress');await ev(`chrome.downloads.pause(${d})`,ss);
  await ev(`chrome.storage.local.get('ruxgetTakeoverLog').then(({ruxgetTakeoverLog:l=[]})=>chrome.storage.local.set({ruxgetTakeoverLog:[...l,{id:${d},result:'desktop',url:'x'}]})).then(()=>chrome.storage.session.set({ruxgetPausedForHandOver:[${d}]}))`,ss);
  await ev(`RuxgetTakeover.running.clear();RuxgetTakeover.recover()`,ss);
  check(await until(async()=>{const x=await state(d);return !x||x.state!=='in_progress';},5000),'a file the desktop already took is cancelled in Chrome, not resumed');

  // 9. A download a stopped worker left paused is not mistaken for the person's own pause.
  await ev(`chrome.runtime.sendNativeMessage=async()=>({ok:false});'ok'`,ss);
  const e=await ev(`chrome.downloads.download({url:'${origin}/slow-e.bin'})`,ss);
  await until(async()=>(await state(e))?.state==='in_progress');await ev(`chrome.downloads.pause(${e})`,ss);await until(async()=>(await state(e)).paused);
  await ev(`chrome.storage.session.set({ruxgetPausedForHandOver:[${e}]})`,ss);
  const left=await ev(`chrome.downloads.search({id:${e}}).then(([item])=>RuxgetTakeover.handOver(item,{own:true}))`,ss);await wait(800);
  check(left.error==='desktop'&&(await state(e)).paused===false,'a download left paused by a stopped hand-over resumes when the desktop refuses it');
  await ev(`chrome.downloads.cancel(${e})`,ss);

  // 6. English text for the desktop's refusal reasons.
  const text=fs.readFileSync(path.join(root,'js','shiying-text.js'),'utf8');
  for(const zh of ['这个链接需要网页登录或验证，交回 Chrome 下载','桌面版无法直接访问这个链接，交回 Chrome 下载','服务器没有直接给出文件','桌面版正忙，请稍后'])check(text.includes(`'${zh}':`),'English for “'+zh+'”');

  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('TAKEOVER RECOVER CHECKS PASSED ('+checks.length+')');
 }finally{
  try{socket&&socket.close();}catch{}server.close();try{process.kill(chrome.pid);}catch{}await wait(500);
 }
 process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
