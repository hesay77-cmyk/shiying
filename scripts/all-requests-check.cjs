// 0.4.77: the panel's 「显示全部请求」 and the 「来源网页（可选）」 field of 「普通文件下载…」, which replace the old
// advanced popup's request list and manual downloader. Local fixture site, isolated profile, store build.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'reports','all-requests-'+Date.now());fs.mkdirSync(report,{recursive:true});
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const body=Buffer.alloc(200*1024,7);let origin='';
const server=http.createServer((request,response)=>{const name=new URL(request.url,'http://x').pathname.slice(1);const base={'Access-Control-Allow-Origin':'*'};
 if(name==='page.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end(`<!doctype html><title>全部请求测试</title><video src="/clip.mp4" muted></video><script>fetch('/seg-001.m4s');fetch('/seg-002.m4s');fetch('/clip.hlv');</script>`);}
 if(name==='clip.mp4'){response.writeHead(200,{...base,'Content-Type':'video/mp4','Content-Length':body.length});return response.end(body);}
 if(/^seg-\d+\.ts$/.test(name)){response.writeHead(200,{...base,'Content-Type':'video/mp2t','Content-Length':body.length});return response.end(body);}
 if(name==='data.m3u8'){response.writeHead(200,{...base,'Content-Type':'application/vnd.apple.mpegurl'});return response.end('#EXTM3U\n#EXTINF:1,\nseg-001.ts\n#EXT-X-ENDLIST\n');}
 if(name==='guarded.mp4'){if(!(request.headers.referer||'').startsWith(origin+'/page.html')){response.writeHead(403,base);return response.end();}response.writeHead(200,{...base,'Content-Type':'video/mp4','Content-Length':body.length});return response.end(body);}
 response.writeHead(404,base);response.end();});
(async()=>{let context;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const extension=path.join(report,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions=[...manifest.host_permissions,'http://127.0.0.1/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const files=path.join(report,'files');fs.mkdirSync(path.join(report,'profile','Default'),{recursive:true});
 fs.writeFileSync(path.join(report,'profile','Default','Preferences'),JSON.stringify({download:{default_directory:files,prompt_for_download:false}}));
 context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true,acceptDownloads:true,downloadsPath:files,ignoreDefaultArgs:['--disable-extensions'],args:['--lang=zh-CN','--mute-audio',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
 await context.route('**/*',route=>{const u=route.request().url();return u.startsWith(origin)||/^(chrome-extension|chrome|blob|data):/.test(u)?route.continue():route.abort();});
 const dialogs=[];context.on('page',p=>p.on('dialog',d=>{dialogs.push(d.message());d.dismiss().catch(()=>{});}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 // Close the help page a first install opens.
 for(const p of context.pages())if(p.url().includes('shiying-help'))await p.close();
 const site=await context.newPage();await site.goto(origin+'/page.html');await site.waitForTimeout(1500);
 const tab=await worker.evaluate(async o=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith(o)).id,origin);
 const panel=await context.newPage();
 // The page reports what it loaded the way the panel’s own page probe does (capture itself is the engine’s job).
 const reporter=await context.newPage();await reporter.goto(`chrome-extension://${id}/shiying-help.html`);
 for(const [file,mime] of [["/seg-001.m4s","video/iso.segment"],["/seg-002.m4s","video/iso.segment"],["/clip.hlv","application/x-hlv"],["/clip.mp4","video/mp4"]]){const r=await reporter.evaluate(({href,url,mime})=>chrome.runtime.sendMessage({Message:"addMedia",href,url,mime}),{href:origin+"/page.html",url:origin+file,mime});if(process.env.DEBUG_ALL)console.log(file,JSON.stringify(r));}
 await reporter.close();await panel.setViewportSize({width:420,height:640});await panel.goto(`chrome-extension://${id}/shiying.html?tabId=${tab}`);
 if(process.env.DEBUG_ALL)console.log(JSON.stringify(await panel.evaluate(async t=>{const r=await chrome.runtime.sendMessage({Message:"getData",tabId:t});return Array.isArray(r)?r.map(i=>[i.url,i.ext,i.type]):r;},tab)));
 const toggle=panel.locator('#allRequestsToggle');await toggle.waitFor({state:'visible',timeout:10000});
 check(/显示全部请求（\d+）/.test(await toggle.innerText()),'the panel offers 显示全部请求 with a count: '+await toggle.innerText());
 check(await panel.locator('#allRequests').isHidden(),'the extra requests stay folded until asked');
 await toggle.click();const rows=panel.locator('#allRequests .request-row');await rows.first().waitFor({state:'visible'});
 const texts=await rows.allInnerTexts();check(texts.some(t=>/seg-001/.test(t)&&/切片/.test(t)),'segments are listed and labelled 切片');
 check(texts.some(t=>/clip/.test(t)&&/其他/.test(t)&&/HLV/.test(t)),'other files are listed with their type');
 const segRow=rows.filter({hasText:'seg-001'});check(await segRow.getByRole('button',{name:'下载'}).isDisabled(),'a segment cannot be downloaded alone');
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:`chrome-extension://${id}`}).catch(()=>{});
 await panel.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.copied=text;};});await segRow.getByRole('button',{name:'复制地址'}).click();await panel.waitForTimeout(300);
 const clip=await panel.evaluate(()=>window.copied||'');check(clip===origin+'/seg-001.m4s','复制地址 copies the exact address');
 await panel.screenshot({path:path.join(report,'all-requests.png'),fullPage:true});
 check(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the panel keeps its width with the list open');
 await toggle.click();check(await panel.locator('#allRequests').isHidden()&&/显示全部请求/.test(await toggle.innerText()),'收起全部请求 folds it again');
 // 来源网页（可选）: a file that needs its source page.
 // A pasted file link opens the 这个链接，怎么下？ sheet, where 更多 holds the source-page field.
 await panel.locator('#platformURL').fill(origin+'/guarded.mp4');await panel.locator('#platformRead').click();await panel.locator('#linkDownload').waitFor({state:'visible'});
 await panel.locator('#linkDownloadURL').fill(origin+'/guarded.mp4');await panel.locator('#linkRefererBox summary').click();await panel.locator('#linkDownloadReferer').fill(origin+'/page.html');
 await panel.screenshot({path:path.join(report,'referer-field.png'),fullPage:true});
 const before=await worker.evaluate(async()=>Math.max(-1,...(await chrome.downloads.search({})).map(i=>i.id)));
 const opened=context.waitForEvent('page',{timeout:15000});await panel.locator('#linkUseChrome').click();const page=await opened;
 check(page.url().includes('/file-download.html?'),'with a source page, the link opens Ruxget’s file download page');
 const done=await worker.evaluate(async after=>{for(let n=0;n<200;n++){const d=(await chrome.downloads.search({})).filter(i=>i.id>after&&i.state==='complete');if(d.length)return d[0].filename;await new Promise(r=>setTimeout(r,100));}return '';},before);
 check(done&&fs.readFileSync(done).equals(body),'the file that needs its source page is saved whole');
 // The old advanced pages carry the quiet retirement line.
 for(const name of ['popup.html','options.html']){const p=await context.newPage();await p.goto(`chrome-extension://${id}/${name}?tabId=${tab}`);await p.locator('.ruxget-retire-note').waitFor({state:'attached',timeout:5000});
  check(/后续版本中移除/.test(await p.locator('.ruxget-retire-note').innerText()),name+' says quietly that some tools go away in a later version');await p.screenshot({path:path.join(report,name+'.png')});await p.close();}
 check(dialogs.length===0,'no dialog appeared');
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({checks},null,1));console.log(`all-requests-check passed (${checks.length} checks). Report: ${report}`);
}catch(error){console.error(error);process.exitCode=1;}finally{await context?.close().catch(()=>{});server.close();}})();
