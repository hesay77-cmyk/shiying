// Black-box check of the "file that needs its source headers" download (rewrite unit 2, spec 01-文件下载页).
// It drives only the public entry the panel uses (Message 'shiyingDownload'), a local fixture server and Chrome's
// download list, so the old page and the clean-room page are held to the same test.
// RUXGET_IMPL=new also runs the checks the spec marks as new behaviour.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(process.env.RUXGET_REPORTS||path.join(root,'reports'),'file-download-'+Date.now());fs.mkdirSync(report,{recursive:true});
const NEW=process.env.RUXGET_IMPL==='new';
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const bytes=(size,seed)=>{const out=Buffer.alloc(size);let x=seed>>>0||1;for(let i=0;i<size;i++){x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;out[i]=x&255;}return out;};
const body=bytes(5*1024*1024,7),small=bytes(300*1024,9);
const hits={};
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://x'),name=url.pathname.slice(1);hits[name]=(hits[name]||0)+1;
 const base={'Access-Control-Allow-Origin':'*','Content-Type':'video/mp4'};
 const referer=request.headers.referer||'',cookie=request.headers.cookie||'';
 const send=(data,extra={})=>{response.writeHead(200,{...base,'Content-Length':data.length,...extra});response.end(data);};
 if(request.method==='OPTIONS'){response.writeHead(204,{...base,'Access-Control-Allow-Headers':'*'});return response.end();}
 if(name==='page.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end('<!doctype html><title>来源网页</title><p>fixture');}
 if(name==='ref.bin')return referer.startsWith(origin+'/page.html')?send(body):(response.writeHead(403,base),response.end());
 if(name==='cookie.bin')return /(?:^|;\s*)session=abc123(?:;|$)/.test(cookie)?send(small):(response.writeHead(403,base),response.end());
 if(name==='range-only.bin')return request.headers.range==='bytes=0-'?(response.writeHead(206,{...base,'Content-Length':small.length,'Content-Range':`bytes 0-${small.length-1}/${small.length}`}),response.end(small)):(response.writeHead(403,base),response.end());
 if(name==='always403.bin'){response.writeHead(403,base);return response.end();}
 if(name==='nolength.bin'){if(!referer)return response.writeHead(403,base),response.end();response.writeHead(200,base);let i=0;const t=setInterval(()=>{response.write(small.subarray(i,i+64*1024));i+=64*1024;if(i>=small.length){clearInterval(t);response.end();}},30);return;}
 if(name==='slow.bin'){if(!referer)return response.writeHead(403,base),response.end();response.writeHead(200,{...base,'Content-Length':small.length});let i=0;const t=setInterval(()=>{if(response.destroyed)return clearInterval(t);response.write(small.subarray(i,i+8*1024));i+=8*1024;if(i>=small.length){clearInterval(t);response.end();}},120);request.on('close',()=>clearInterval(t));return;}
 if(name==='drop.bin'){if(!referer)return response.writeHead(403,base),response.end();response.writeHead(200,{...base,'Content-Length':small.length});response.write(small.subarray(0,1000));return setTimeout(()=>response.destroy(),50);}
 response.writeHead(404,base);response.end();
});
let origin='';
(async()=>{let context;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const extension=path.join(report,'extension');fs.cpSync(process.env.RUXGET_EXTENSION||path.join(root,'build'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
 // The person has granted this site (the panel asks before downloading); the test grants it up front.
 manifest.host_permissions=[...(manifest.host_permissions||[]),'http://127.0.0.1/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const files=path.join(report,'files');fs.mkdirSync(path.join(report,'profile','Default'),{recursive:true});
 fs.writeFileSync(path.join(report,'profile','Default','Preferences'),JSON.stringify({download:{default_directory:files,prompt_for_download:false},intl:{selected_languages:'zh-CN'}}));
 context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true,acceptDownloads:true,downloadsPath:files,ignoreDefaultArgs:['--disable-extensions'],args:['--lang=zh-CN','--mute-audio',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
 await context.route('**/*',route=>{const u=route.request().url();return u.startsWith(origin)||u.startsWith('chrome-extension:')||u.startsWith('chrome:')||u.startsWith('blob:')||u.startsWith('data:')?route.continue():route.abort();});
 const dialogs=[],names=[];context.on('page',p=>{p.on('dialog',d=>{dialogs.push(d.message());d.dismiss().catch(()=>{});});p.on('download',d=>names.push(d.suggestedFilename()));});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 const source=await context.newPage();await source.goto(origin+'/page.html');
 // Playwright saves downloads under random names; let Chrome use the names the page asks for, as for a real person.
 await (await context.newCDPSession(source)).send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:files});
 const sourceTab=await worker.evaluate(async o=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith(o)).id,origin);
 const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/${process.env.RUXGET_PANEL||'shiying-help.html'}`);
 const lastId=()=>worker.evaluate(async()=>Math.max(-1,...(await chrome.downloads.search({})).map(i=>i.id)));
 // Start one download the way the panel does and return the tool page that opens for it.
 const start=async(file,extra={})=>{
  const opened=context.waitForEvent('page',{timeout:15000});
  const answer=await panel.evaluate(({data,tab})=>chrome.runtime.sendMessage({Message:'shiyingDownload',tabId:tab,data}),{tab:sourceTab,data:{url:origin+'/'+file,ext:'mp4',type:'video/mp4',title:extra.title||file.replace(/\.bin$/,''),webUrl:origin+'/page.html',requestHeaders:extra.noReferer?{}:{referer:origin+'/page.html'},...(extra.cookie?{cookie:extra.cookie}:{})}});
  assert.equal(answer?.ok,true,'the background accepted '+file+': '+JSON.stringify(answer));
  const page=await opened;await page.waitForLoadState('domcontentloaded');return page;
 };
 const finished=async(after,timeout=30000)=>worker.evaluate(async({after,timeout})=>{const end=Date.now()+timeout;while(Date.now()<end){const done=(await chrome.downloads.search({})).filter(i=>i.id>after&&i.state==='complete');if(done.length)return done.map(i=>({id:i.id,filename:i.filename,bytes:i.bytesReceived}));await new Promise(r=>setTimeout(r,100));}return [];},{after,timeout});
 const closes=async(page,ms)=>{try{await page.waitForEvent('close',{timeout:ms});return true;}catch{return page.isClosed();}};
 const text=async page=>page.isClosed()?'':page.evaluate(()=>document.body.innerText);

 // 1. Referer-only file: the saved file equals the original, then the page closes itself.
 let before=await lastId();let page=await start('ref.bin');let done=await finished(before);
 check(done.length===1&&fs.readFileSync(done[0].filename).equals(body),'a 5 MB file that needs its source page is saved byte for byte');
 check(await closes(page,5000),'the download page closes itself after the file is saved');
 // 2. Cookie.
 before=await lastId();page=await start('cookie.bin',{cookie:'session=abc123'});done=await finished(before);
 check(done.length===1&&fs.readFileSync(done[0].filename).equals(small),'a file that needs a cookie is saved byte for byte');await closes(page,5000);
 // 3. Server that answers only a range request: one automatic retry succeeds.
 before=await lastId();page=await start('range-only.bin');done=await finished(before);
 check(done.length===1&&fs.readFileSync(done[0].filename).equals(small),'a server that rejects the first request but answers a range request still gives the file');await closes(page,5000);
 // 4. Always 403: an inline message, no dialog, the page stays open.
 before=await lastId();page=await start('always403.bin');
 await page.waitForFunction(()=>/403/.test(document.body.innerText),null,{timeout:15000});
 check(!page.isClosed()&&dialogs.length===0,'a refused file shows the status code in the page, without a dialog');
 check(!NEW||await page.getByRole('button',{name:/重新下载/}).first().waitFor({state:'visible',timeout:5000}).then(()=>true,()=>false),'the card offers 重新下载 after a refusal');
 check((await finished(before,1500)).length===0,'nothing is saved for a refused file');
 await page.screenshot({path:path.join(report,'error-403.png'),fullPage:true});await page.close();
 // 5. No Content-Length.
 before=await lastId();page=await start('nolength.bin');done=await finished(before);
 check(done.length===1&&fs.readFileSync(done[0].filename).equals(small),'a file without a size is saved whole');await closes(page,5000);
 // 6. Stop, then retry: exactly one complete file.
 before=await lastId();page=await start('slow.bin');
 await page.waitForFunction(()=>/KB|MB/.test(document.body.innerText),null,{timeout:10000});
 await page.screenshot({path:path.join(report,'progress.png'),fullPage:true});
 await page.getByRole('button',{name:/停止下载/}).first().click();
 await page.getByRole('button',{name:/重新下载/}).first().waitFor({state:'visible',timeout:5000});
 check((await finished(before,1000)).length===0,'stopping saves nothing');
 await page.getByRole('button',{name:/重新下载/}).first().click();done=await finished(before,40000);
 check(done.length===1&&fs.readFileSync(done[0].filename).equals(small),'stop then 重新下载 gives one complete file');await closes(page,5000);
 // 7. Windows-unsafe characters in the name.
 before=await lastId();page=await start('cookie.bin',{cookie:'session=abc123',title:'a:b?'});done=await finished(before);
 check(done.length===1,'a title with characters Windows forbids still saves (exact names are checked by hand: Playwright renames downloads)');await closes(page,5000);
 if(NEW){
  // 8. Network drop: retried, then an inline network message.
  hits['drop.bin']=0;page=await start('drop.bin');
  await page.waitForFunction(()=>/网络/.test(document.body.innerText),null,{timeout:20000});
  check(hits['drop.bin']>=4,'a dropped connection is retried three times before giving up');await page.close();
  // 9. Closing the page mid-download clears its header rule.
  page=await start('slow.bin');await page.waitForFunction(()=>/KB|MB/.test(document.body.innerText),null,{timeout:10000});await page.close();
  await new Promise(r=>setTimeout(r,800));
  const rules=await worker.evaluate(async()=>(await chrome.declarativeNetRequest.getSessionRules()).map(r=>r.condition.urlFilter||r.condition.regexFilter||''));
  check(!rules.some(r=>r.includes('slow.bin')),'closing the page mid-download removes its temporary header rule');
  // 10. Empty form and narrow layout.
  page=await context.newPage();await page.goto(`chrome-extension://${id}/file-download.html`);
  check(await page.locator('input').count()>=2,'opened without a task, the page shows the address and source-page form');
  await page.setViewportSize({width:360,height:700});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the page fits 360 px without sideways scrolling');
  await page.screenshot({path:path.join(report,'form-360.png'),fullPage:true});await page.close();
 }
 check(dialogs.length===0,'no dialog appeared at any point');
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({impl:NEW?'new':'current',checks},null,1));
 console.log(`file-download-check passed (${checks.length} checks, ${NEW?'new':'current'} implementation). Report: ${report}`);
}catch(error){console.error(error);process.exitCode=1;}finally{await context?.close().catch(()=>{});server.close();}})();
