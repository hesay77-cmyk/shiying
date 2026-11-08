// 0.4.81: a pasted file link saved with "用 Chrome 下载" lands in the Ruxget folder, like every other download, and keeps
// the name Chrome picks (Content-Disposition first). Real Chromium on raw DevTools (Playwright renames downloads and
// skips Chrome's file-name step), loopback server only, nothing is opened.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||os.tmpdir(),'ruxget-paste-folder-'));
const checks=[];function check(value,name){if(!value)throw new Error(name);checks.push(name);console.log('PASS '+name);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch{}await wait(150);}return last;}
const server=http.createServer((q,r)=>{
 const u=new URL(q.url,'http://x');
 if(u.pathname==='/sample-5s.mp4')return r.writeHead(200,{'Content-Type':'video/mp4','Content-Length':2048}),r.end(Buffer.alloc(2048,1));
 if(u.pathname==='/get')return r.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="report.pdf"','Content-Length':512}),r.end(Buffer.alloc(512,2));
 if(u.pathname==='/other.bin')return r.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':256}),r.end(Buffer.alloc(256,3));
 r.writeHead(200,{'Content-Type':'text/html'});r.end('<!doctype html><title>x</title>');
});
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(report,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
 const profile=path.join(report,'profile'),downloads=path.join(report,'downloads');fs.mkdirSync(path.join(profile,'Default'),{recursive:true});fs.mkdirSync(downloads);
 fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({download:{default_directory:downloads,prompt_for_download:false},browser:{has_seen_welcome_page:true}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const exe=process.env.SHIYING_CHROMIUM;const PORT=9300+Math.floor(Math.random()*500);
 const chrome=spawn(exe,[`--user-data-dir=${profile}`,`--remote-debugging-port=${PORT}`,'--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--headless=new','--mute-audio','--window-size=900,800','about:blank'],{stdio:'ignore'});
 let socket;
 try{
  const version=await until(async()=>(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(),20000);
  socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const send=(method,params={},sessionId)=>new Promise(r=>{const id=++seq;pending.set(id,r);socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const attach=async targetId=>(await send('Target.attachToTarget',{targetId,flatten:true})).result.sessionId;
  const ev=async(expr,s)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},s);if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,400));return r.result?.result?.value;};
  const loaded=await send('Extensions.loadUnpacked',{path:extension});const id=loaded.result?.id;if(!id)throw new Error('load '+JSON.stringify(loaded));
  const created=await send('Target.createTarget',{url:`chrome-extension://${id}/shiying.html`});const pp=await attach(created.result.targetId);
  await until(()=>ev(`document.readyState==='complete'&&typeof chromeIntoRuxget==='function'`,pp));await wait(500);
  const save=async url=>{const did=await ev(`chromeIntoRuxget(${JSON.stringify(url)},false)`,pp);return until(()=>ev(`chrome.downloads.search({id:${did}}).then(l=>l[0]&&l[0].state==='complete'&&l[0].filename)`,pp));};
  const mp4=await save(origin+'/sample-5s.mp4');
  check(mp4===path.join(downloads,'Ruxget','sample-5s.mp4')&&fs.existsSync(mp4),'a pasted MP4 link saved by Chrome goes to Ruxget\ ('+mp4+')');
  const named=await save(origin+'/get?id=7');
  check(named===path.join(downloads,'Ruxget','report.pdf'),'the server’s own file name is kept ('+named+')');
  const again=await save(origin+'/sample-5s.mp4');
  check(again===path.join(downloads,'Ruxget','sample-5s (1).mp4'),'a second copy gets “ (1)” instead of replacing the first ('+again+')');
  // Another download started meanwhile (not through the paste box) is left alone.
  const plain=await ev(`chrome.downloads.download({url:${JSON.stringify(origin+'/other.bin')}})`,pp);
  const plainName=await until(()=>ev(`chrome.downloads.search({id:${plain}}).then(l=>l[0]&&l[0].state==='complete'&&l[0].filename)`,pp));
  check(plainName===path.join(downloads,'other.bin'),'other downloads are not moved ('+plainName+')');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('PASTE FOLDER CHECKS PASSED ('+checks.length+')');
 }finally{try{socket&&socket.close();}catch{}server.close();try{process.kill(chrome.pid);}catch{}await wait(500);}
 process.exit(0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
