// A cancelled and deleted download must start again from 0%: nothing may come back from Chrome's HTTP cache.
// Runs the real engine page on a piece-by-piece (chunked) download from a slow local server whose media is cacheable.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-cancel-cache-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const MB=1024*1024,SIZE=40*MB;
(async()=>{
 const served=[];
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://x'),[start,end]=(url.searchParams.get('range')||'').split('-').map(Number);
  if(!(end>=start))return response.writeHead(400),response.end();
  served.push(start);
  // Like CDN media: cacheable for a day. Each piece takes a moment, so the test can cancel part-way.
  setTimeout(()=>{response.writeHead(200,{'Content-Type':'video/mp4','Cache-Control':'public, max-age=86400','Access-Control-Allow-Origin':'*','Content-Length':end-start+1});response.end(Buffer.alloc(end-start+1,5));},250);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  const engine=await browser.newPage();await engine.goto(`chrome-extension://${id}/shiying-engine.html`);
  const catalog={chunked:true,muxed:true,title:'缓存测试',duration:10,video:[{height:720,url:origin+'/media.mp4',bytes:SIZE,backups:[]}],audio:[]};
  const run=jobId=>worker.evaluate(async({jobId,catalog})=>{const job={id:jobId,title:'缓存测试',format:'mp4',height:720,status:'downloading',stage:'正在准备',progress:0};
   await chrome.storage.local.set({['shiyingJob:'+jobId]:job,shiyingJobIds:[jobId]});return chrome.runtime.sendMessage({Message:'shiyingEngineRun',catalog,job});},{jobId,catalog});
  const progress=jobId=>worker.evaluate(async jobId=>(await chrome.storage.local.get('shiyingJob:'+jobId))['shiyingJob:'+jobId],jobId);
  const until=async(test,what)=>{for(let i=0;i<200;i++){if(await test())return;await engine.waitForTimeout(50);}throw new Error('timed out: '+what);};

  // First download: let two pieces arrive, then cancel and delete it the way the popup does.
  await run('first');await until(()=>served.length>=2,'two pieces of the first download');
  // The popup's delete runs this in the background (a service worker can't message itself, so call it directly).
  await worker.evaluate(()=>deletePlatformJob('first',false));
  await until(async()=>!(await progress('first')),'the first download to be deleted');
  const beforeSecond=served.length;
  check('the first download is cancelled and deleted part-way ('+beforeSecond+' of 5 pieces fetched)');

  // Second download of the same video: the server must send the first piece again, and progress starts near 0.
  await run('second');await until(()=>served.length>beforeSecond,'the second download to ask the server');
  assert.equal(served[beforeSecond],0,'the second download starts from the first piece');
  const early=await progress('second');assert(early.progress<30,'progress starts near 0, not where the deleted download stopped ('+early.progress+'%)');
  await until(()=>served.filter(start=>start===8*MB).length>=2,'the second piece to be fetched again');
  check('the second download fetches from the server again from 0%, nothing from the browser cache');
  await worker.evaluate(()=>chrome.runtime.sendMessage({Message:'shiyingEngineCancel',id:'second'}));

  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks,served},null,2));console.log('REPORT '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
