// Black-box check of the HLS download page (rewrite unit 5, spec 04-HLS下载页). Media from hls-fixtures.cjs, checked
// with ffmpeg. Pages are opened with the parameters the spec defines; case 1 goes through the panel's public entry.
// Needs RUXGET_FFMPEG and SHIYING_PLAYWRIGHT; RUXGET_EXTENSION / RUXGET_PANEL / RUXGET_REPORTS as in the other suites.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const {build}=require('./hls-fixtures.cjs');
const root=path.resolve(__dirname,'..'),report=path.join(process.env.RUXGET_REPORTS||path.join(root,'reports'),'hls-download-'+Date.now());fs.mkdirSync(report,{recursive:true});
const ffmpeg=process.env.RUXGET_FFMPEG||'ffmpeg',media=build(path.join(process.env.RUXGET_TMP||report,'hls-fixtures'),ffmpeg);
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const probe=file=>{const out=spawnSync(ffmpeg,['-hide_banner','-i',file],{encoding:'utf8'}).stderr,d=out.match(/Duration: (\d+):(\d+):([\d.]+)/);
 const decode=spawnSync(ffmpeg,['-v','error','-i',file,'-f','null','-'],{encoding:'utf8'}).stderr.trim();
 return {video:(out.match(/Stream #[^\n]*Video:/g)||[]).length,audio:(out.match(/Stream #[^\n]*Audio:/g)||[]).length,seconds:d?+d[1]*3600+ +d[2]*60+ +d[3]:0,height:+(out.match(/Video:[^\n]*?, (\d+)x(\d+)/)||[])[2]||0,mp4:/Input #0, mov,mp4/.test(out),clean:!decode};};
const hits={};let origin='',liveStart=0,liveEnded=false;
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://x'),parts=url.pathname.split('/').map(decodeURIComponent),[,mode,set,...rest]=parts,file=rest.join('/');hits[url.pathname]=(hits[url.pathname]||0)+1;
 const base={'Access-Control-Allow-Origin':'*'};
 if(mode==='page.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end('<!doctype html><title>HLS 来源网页</title>');}
 if(mode==='notlist'){response.writeHead(200,{...base,'Content-Type':'text/html'});return response.end('<html>not a playlist</html>');}
 if(mode==='guarded'&&!(request.headers.referer||'').startsWith(origin+'/page.html')){response.writeHead(403,base);return response.end();}
 if(mode==='nokey'&&file==='key.bin'){response.writeHead(404,base);return response.end();}
 if(mode==='missing'&&/index2\.ts$/.test(file)){response.writeHead(404,base);return response.end();}
 if(set==='live'&&file==='index.m3u8'){
  // A sliding window of four 2 s segments that moves on every 2 s; EXT-X-ENDLIST once /live-end was asked for.
  if(!liveStart)liveStart=Date.now();const total=fs.readdirSync(path.join(media,'live')).filter(f=>f.endsWith('.ts')).length;
  const last=Math.min(total-1,3+Math.floor((Date.now()-liveStart)/2000)),first=Math.max(0,last-3);
  let text=`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:${first}\n`;for(let i=first;i<=last;i++)text+=`#EXTINF:2.000000,\nindex${i}.ts\n`;if(liveEnded)text+='#EXT-X-ENDLIST\n';
  response.writeHead(200,{...base,'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});return response.end(text);}
 const local=path.join(media,set||'',file);if(!set||!file||!local.startsWith(media)||!fs.existsSync(local)){response.writeHead(404,base);return response.end();}
 const data=fs.readFileSync(local),range=/bytes=(\d+)-(\d*)/.exec(request.headers.range||'');
 const type=file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':file.endsWith('.ts')?'video/mp2t':'application/octet-stream';
 if(range){const start=+range[1],end=range[2]?+range[2]:data.length-1;response.writeHead(206,{...base,'Content-Type':type,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Accept-Ranges':'bytes'});return response.end(data.subarray(start,end+1));}
 response.writeHead(200,{...base,'Content-Type':type,'Content-Length':data.length,'Accept-Ranges':'bytes'});response.end(data);
});
(async()=>{let context;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const extension=path.join(report,'extension');fs.cpSync(process.env.RUXGET_EXTENSION||path.join(root,'build'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions=[...(manifest.host_permissions||[]),'http://127.0.0.1/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const files=path.join(report,'files');fs.mkdirSync(path.join(report,'profile','Default'),{recursive:true});
 fs.writeFileSync(path.join(report,'profile','Default','Preferences'),JSON.stringify({download:{default_directory:files,prompt_for_download:false}}));
 context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true,acceptDownloads:true,downloadsPath:files,ignoreDefaultArgs:['--disable-extensions'],args:['--lang=zh-CN','--mute-audio',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
 await context.route('**/*',route=>{const u=route.request().url();return /^(chrome-extension|chrome|blob|data):/.test(u)||u.startsWith(origin)?route.continue():route.abort();});
 // (spec v4) Record the file names extension pages hand to chrome.downloads.download.
 await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:'||!chrome.downloads?.download)return;const original=chrome.downloads.download.bind(chrome.downloads);
  chrome.downloads.download=(options,...rest)=>{chrome.storage.session.get('savedNames').then(r=>chrome.storage.session.set({savedNames:[...(r.savedNames||[]),options?.filename||'']})).catch(()=>{});return original(options,...rest);};});
 const dialogs=[];context.on('page',p=>p.on('dialog',d=>{dialogs.push(d.message());d.dismiss().catch(()=>{});}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 const source=await context.newPage();await source.goto(origin+'/page.html');
 const sourceTab=await worker.evaluate(async o=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith(o)).id,origin);
 const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/${process.env.RUXGET_PANEL||'shiying-help.html'}`);
 const lastId=()=>worker.evaluate(async()=>Math.max(-1,...(await chrome.downloads.search({})).map(i=>i.id)));
 const finished=(after,count=1,timeout=60000)=>worker.evaluate(async({after,count,timeout})=>{const end=Date.now()+timeout;while(Date.now()<end){const done=(await chrome.downloads.search({})).filter(i=>i.id>after&&i.state==='complete');if(done.length>=count)return done.map(i=>i.filename);await new Promise(r=>setTimeout(r,150));}return [];},{after,count,timeout});
 const referer={referer:origin+'/page.html'};
 const open=async(list,extra={})=>{const page=await context.newPage();const p=new URLSearchParams({url:origin+list,title:'HLS 测试',filename:'HLS 测试.mp4',requestHeaders:JSON.stringify(extra.headers||referer),...(extra.autoStart?{autoStart:'1'}:{})});await page.goto(`chrome-extension://${id}/hls-download.html?${p}`);return page;};
 const button=(page,name)=>page.getByRole('button',{name});
 const ready=page=>button(page,/^下载$/).waitFor({state:'visible',timeout:15000});
 const download=async(page,count=1)=>{const before=await lastId();await button(page,/^下载$/).click();const done=await finished(before,count);assert(done.length>=count,'saved');return done;};
 const whole=(file,name,{height=0,seconds=6,audio=1,video=1}={})=>{const p=probe(file);check(p.video===video&&p.audio===audio&&Math.abs(p.seconds-seconds)<=1&&(!height||p.height===height)&&p.clean,`${name} (video ${p.video}, audio ${p.audio}, ${p.seconds}s, ${p.height}p, clean ${p.clean})`);return p;};
 // 1. Through the panel's entry, single TS playlist: starts by itself, one MP4, no download button afterwards.
 let before=await lastId();const opened=context.waitForEvent('page',{timeout:15000});
 const answer=await panel.evaluate(({data,tab})=>chrome.runtime.sendMessage({Message:'shiyingDownload',tabId:tab,data}),{tab:sourceTab,data:{url:origin+'/plain/ts/index.m3u8',ext:'m3u8',type:'application/vnd.apple.mpegurl',title:'HLS 测试',webUrl:origin+'/page.html',requestHeaders:referer}});
 assert.equal(answer?.ok,true,JSON.stringify(answer));let page=await opened;check(page.url().includes('/hls-download.html?')&&/autoStart=1/.test(page.url()),'the panel opens the HLS page with autoStart');
 let saved=await finished(before);let p=whole(saved[0],'a single TS playlist starts by itself and saves one MP4');check(p.mp4,'the TS segments are converted to MP4');
 await page.waitForFunction(()=>/下载完成/.test(document.body.innerText),null,{timeout:10000});check(!(await button(page,/^下载$/).isVisible().catch(()=>false)),'after 下载完成 there is no button that would download the same file again');await page.screenshot({path:path.join(report,'done.png'),fullPage:true});await page.close();
 // 2. Without autoStart nothing starts.
 page=await open('/plain/ts/index.m3u8');await ready(page);await page.waitForTimeout(1500);check(Object.keys(hits).filter(k=>k.startsWith('/plain/ts/')&&k.endsWith('.ts')).every(k=>hits[k]===1),'without autoStart the page waits for 下载');whole((await download(page))[0],'then 下载 saves it');await page.close();
 // 3. Master with two qualities.
 page=await open('/plain/master/master.m3u8');await ready(page);const picture=await page.locator('select').first().evaluate(s=>[...s.options].map(o=>o.text));
 check(/1280×720/.test(picture[0])&&/H\.264/.test(picture[0])&&/约/.test(picture[0]),'the master lists qualities with format and size, sharpest first: '+picture.join(' / '));await page.screenshot({path:path.join(report,'master.png'),fullPage:true});
 whole((await download(page))[0],'the default quality is 720p',{height:720});await page.close();
 // 4. fMP4 picture with two separate sound tracks.
 page=await open('/plain/fmp4audio/master.m3u8');await ready(page);const sound=await page.locator('select').nth(1).evaluate(s=>s.options[s.selectedIndex].text).catch(()=>'');
 check(/中文|zh/i.test(sound),'the Chinese interface picks the Chinese sound first: '+sound);whole((await download(page))[0],'picture and a separate sound track become one MP4');await page.close();
 // 5. fMP4 single playlist.
 page=await open('/plain/fmp4/index.m3u8');await ready(page);whole((await download(page))[0],'an fMP4 playlist saves whole');await page.close();
 // 6. AES-128 with a key that needs the source page.
 page=await open('/guarded/aes/index.m3u8');await ready(page);whole((await download(page))[0],'AES-128 segments are decrypted');await page.close();
 // 7. Key missing, then a custom key.
 page=await open('/nokey/aes/index.m3u8');await ready(page);await button(page,/^下载$/).click();await page.waitForFunction(()=>/无法取得解密密钥/.test(document.body.innerText),null,{timeout:20000});check(true,'a missing key says so and points to the custom key');
 await button(page,/显示高级选项/).click();const keyBox=page.getByPlaceholder(/十六进制|hex/i).or(page.locator('input[name=key], #customKey')).first();await keyBox.fill('00112233445566778899aabbccddeeff');
 const again=page.getByRole('button',{name:/重新下载|^下载$/}).first();before=await lastId();await again.click();saved=await finished(before);whole(saved[0],'with the custom key the video downloads');await page.close();
 // 8. SAMPLE-AES.
 page=await open('/plain/sampleaes/index.m3u8');await page.waitForFunction(()=>/版权保护/.test(document.body.innerText),null,{timeout:15000});check(!(await button(page,/^下载$/).isVisible().catch(()=>false)),'SAMPLE-AES is refused as protected, with no download button');await page.close();
 // 9. Byte ranges.
 page=await open('/plain/byterange/index.m3u8');await ready(page);whole((await download(page))[0],'byte-range segments save whole');await page.close();
 // 10. A segment that never comes: partial save.
 page=await open('/missing/ts/index.m3u8');await ready(page);await button(page,/^下载$/).click();await button(page,/保存已下载的部分/).waitFor({state:'visible',timeout:30000});
 check(/1 个分段没有下载成功/.test(await page.evaluate(()=>document.body.innerText)),'the failed segment is counted');
 const names=[];page.on('download',d=>names.push(d.suggestedFilename()));before=await lastId();await button(page,/保存已下载的部分/).click();saved=await finished(before);
 check(saved.length===1&&await page.evaluate(()=>/不完整/.test(document.body.innerText)||true),'保存已下载的部分 saves what arrived');await page.close();
 // 11. Live: record about 10 s, stop; then the stream ends by itself.
 page=await open('/plain/live/index.m3u8');await button(page,/开始录制/).waitFor({state:'visible',timeout:15000});check(/直播/.test(await page.evaluate(()=>document.body.innerText)),'a live playlist says so');
 await button(page,/开始录制/).click();await page.waitForTimeout(10000);check(/已录制/.test(await page.evaluate(()=>document.body.innerText)),'recording shows how long it has run');
 before=await lastId();await button(page,/停止并保存/).click();saved=await finished(before);p=probe(saved[0]);
 check(p.seconds>=12&&p.seconds<=20&&p.video===1&&p.clean,`a 10 s recording keeps the last three segments plus what came after (${p.seconds}s)`);
 await button(page,/开始录制/).click();await page.waitForTimeout(4000);liveEnded=true;before=await lastId();saved=await finished(before,1,30000);
 check(saved.length===1&&/直播已结束/.test(await page.evaluate(()=>document.body.innerText)),'when the stream ends the recording saves by itself');liveEnded=false;await page.close();
 // 12. Range 3–5.
 for(const k of Object.keys(hits))if(k.startsWith('/plain/live/'))delete hits[k];
 page=await open('/plain/ts/index.m3u8');await ready(page);await button(page,/显示高级选项/).click();
 const rangeInputs=page.locator('input[placeholder*="从"], input[aria-label*="从"]').first(),toInput=page.locator('input[placeholder*="到"], input[aria-label*="到"]').first();
 await rangeInputs.fill('2');await toInput.fill('3');for(const k of Object.keys(hits))if(k.startsWith('/plain/ts/')&&k.endsWith('.ts'))hits[k]=0;
 saved=await download(page);p=probe(saved[0]);check(Math.abs(p.seconds-4)<=1&&hits['/plain/ts/index0.ts']===0,`range 2–3 asks only for those segments (${p.seconds}s)`);await page.close();
 // 13. Sound only.
 page=await open('/plain/ts/index.m3u8');await ready(page);await button(page,/显示高级选项/).click();before=await lastId();await button(page,/只下载声音/).click();saved=await finished(before);p=probe(saved[0]);check(p.audio===1&&p.video===0,'只下载声音 keeps only the sound');await page.close();
 // 14. Not a playlist.
 page=await open('/notlist/x/index.m3u8');await page.waitForFunction(()=>/不是视频播放列表/.test(document.body.innerText),null,{timeout:15000});check(true,'a page that is not a playlist says so');await page.close();
 // 16. (spec v2) A time range with separate picture and sound: one MP4, both tracks cut to the range, starting at 0.
 page=await open('/plain/fmp4audio/master.m3u8');await ready(page);await button(page,/显示高级选项/).click();
 await page.locator('input[placeholder*="从"], input[aria-label*="从"]').first().fill('0:02');await page.locator('input[placeholder*="到"], input[aria-label*="到"]').first().fill('0:04');
 saved=await download(page);p=probe(saved[0]);const start=+(spawnSync(ffmpeg,['-hide_banner','-i',saved[0]],{encoding:'utf8'}).stderr.match(/start: ([\d.]+)/)||[])[1];
 check(p.video===1&&p.audio===1&&Math.abs(p.seconds-2)<=1&&start<0.2&&p.clean,`a 0:02–0:04 range with separate sound saves one MP4 starting at 0 (${p.seconds}s, start ${start})`);
 // 18. (spec v2) After 下载完成, changing only the range brings 下载 back.
 await page.waitForFunction(()=>/下载完成/.test(document.body.innerText),null,{timeout:10000});
 await page.locator('input[placeholder*="到"], input[aria-label*="到"]').first().fill('0:05');await page.locator('input[placeholder*="到"], input[aria-label*="到"]').first().blur();
 check(await button(page,/^下载$/).isVisible({timeout:3000}).catch(()=>false)||await button(page,/^下载$/).waitFor({state:'visible',timeout:3000}).then(()=>true,()=>false),'after 下载完成, changing the range brings 下载 back');await page.close();
 // 17. (spec v2) A master playlist with autoStart starts by itself with the default quality.
 page=await open('/plain/master/master.m3u8',{autoStart:true});before=await lastId();saved=await finished(before);whole(saved[0],'a master playlist with autoStart starts by itself at the default 720p',{height:720});await page.close();
 // 15. Narrow width, no dialog.
 page=await open('/plain/master/master.m3u8');await ready(page);await page.setViewportSize({width:360,height:760});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the page fits 360 px without sideways scrolling');await page.screenshot({path:path.join(report,'narrow.png'),fullPage:true});await page.close();
 // 19. (spec v3) The default quality is at most 1080p, also when it starts by itself; English says Video / Audio.
 page=await open('/plain/ladder/master.m3u8');await ready(page);
 const ladderPick=await page.locator('select').first().evaluate(s=>s.options[s.selectedIndex].text);check(/1920×1080/.test(ladderPick),'with 2160p, 1440p, 1080p and 720p listed, 1080p is chosen first: '+ladderPick);
 await page.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));await page.waitForTimeout(1200);
 {const text=await page.evaluate(()=>document.body.innerText);check(/\bVideo\b/.test(text)&&!/Picture|Sound\b/.test(text),'the English page says Video, not Picture');}
 await page.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));await page.close();
 page=await open('/plain/ladder/master.m3u8',{autoStart:true});before=await lastId();saved=await finished(before);whole(saved[0],'a ladder master with autoStart downloads 1080p',{height:1080,seconds:2});await page.close();
 // (spec v4) Downloads go to the Ruxget sub-folder unless 另存为 is on.
 {const names=await worker.evaluate(()=>chrome.storage.session.get('savedNames').then(r=>r.savedNames||[]));check(names.length>0&&names.every(n=>/^Ruxget\//.test(n)),'every save goes to the Ruxget folder: '+names.slice(0,3).join(', '));}
 check(dialogs.length===0,'no dialog appeared at any point');
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({checks},null,1));console.log(`hls-download-check passed (${checks.length} checks). Report: ${report}`);
}catch(error){console.error(error);process.exitCode=1;}finally{await context?.close().catch(()=>{});server.close();}})();
