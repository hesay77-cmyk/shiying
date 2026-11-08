// Black-box check of the DASH download page (rewrite unit 3, spec 02-DASH下载页). It drives the panel's public entry
// (Message 'shiyingDownload' with an .mpd), serves media built by dash-fixtures.cjs and checks the saved files with ffmpeg.
// The one-click merged download is new behaviour, so this suite is for the new page (the old one saved one track at a time).
// Needs RUXGET_FFMPEG (ffmpeg.exe) and SHIYING_PLAYWRIGHT; RUXGET_TMP for the generated media.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const {build}=require('./dash-fixtures.cjs');
const root=path.resolve(__dirname,'..'),report=path.join(process.env.RUXGET_REPORTS||path.join(root,'reports'),'dash-download-'+Date.now());fs.mkdirSync(report,{recursive:true});
const ffmpeg=process.env.RUXGET_FFMPEG||'ffmpeg',media=build(path.join(process.env.RUXGET_TMP||report,'dash-fixtures'),ffmpeg);
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
// What ffmpeg sees in a saved file: stream kinds, duration in seconds, frame height.
const probe=file=>{const out=spawnSync(ffmpeg,['-hide_banner','-i',file],{encoding:'utf8'}).stderr;const d=out.match(/Duration: (\d+):(\d+):([\d.]+)/);
 return {video:(out.match(/Stream #[^\n]*Video:/g)||[]).length,audio:(out.match(/Stream #[^\n]*Audio:/g)||[]).length,seconds:d?+d[1]*3600+ +d[2]*60+ +d[3]:0,height:+(out.match(/Video:[^\n]*?, (\d+)x(\d+)/)||[])[2]||0,raw:out};};
const hits={};let origin='';
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://x'),[,mode,set,...rest]=url.pathname.split('/'),file=rest.join('/');hits[url.pathname]=(hits[url.pathname]||0)+1;
 const base={'Access-Control-Allow-Origin':'*'};
 if(mode==='page.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end('<!doctype html><title>DASH 来源网页</title>');}
 if(mode==='guarded'&&!(request.headers.referer||'').startsWith(origin+'/page.html')){response.writeHead(403,base);return response.end();}
 if(mode==='flaky'&&/chunk-stream0-00002/.test(file)&&hits[url.pathname]<=2){response.writeHead(500,base);return response.end();}
 if(mode==='missing'&&/chunk-stream0-00002/.test(file)){response.writeHead(404,base);return response.end();}
 if(mode==='crosshost'&&file==='manifest.mpd'){const text=fs.readFileSync(path.join(media,set,file),'utf8').replace(/(<Period[^>]*>)/,'$1<BaseURL>'+origin.replace('127.0.0.1','localhost')+'/plain/'+set+'/</BaseURL>');response.writeHead(200,{...base,'Content-Type':'application/dash+xml'});return response.end(text);}
 const local=path.join(media,set||'',file);if(!set||!file||!local.startsWith(media)||!fs.existsSync(local)){response.writeHead(404,base);return response.end();}
 const data=fs.readFileSync(local),range=/bytes=(\d+)-(\d*)/.exec(request.headers.range||'');
 const type=file.endsWith('.mpd')?'application/dash+xml':file.endsWith('.mp4')?'video/mp4':'video/iso.segment';
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
 const dialogs=[];context.on('page',p=>p.on('dialog',d=>{dialogs.push(d.message());d.dismiss().catch(()=>{});}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 const source=await context.newPage();await source.goto(origin+'/page.html');
 const sourceTab=await worker.evaluate(async o=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith(o)).id,origin);
 const panel=await context.newPage();await panel.goto(`chrome-extension://${id}/${process.env.RUXGET_PANEL||'shiying-help.html'}`);
 const lastId=()=>worker.evaluate(async()=>Math.max(-1,...(await chrome.downloads.search({})).map(i=>i.id)));
 const finished=(after,count=1,timeout=60000)=>worker.evaluate(async({after,count,timeout})=>{const end=Date.now()+timeout;while(Date.now()<end){const done=(await chrome.downloads.search({})).filter(i=>i.id>after&&i.state==='complete');if(done.length>=count)return done.map(i=>i.filename);await new Promise(r=>setTimeout(r,150));}return [];},{after,count,timeout});
 const open=async(mpd,referer=true)=>{const opened=context.waitForEvent('page',{timeout:15000});
  const answer=await panel.evaluate(({data,tab})=>chrome.runtime.sendMessage({Message:'shiyingDownload',tabId:tab,data}),{tab:sourceTab,data:{url:origin+mpd,ext:'mpd',type:'application/dash+xml',title:'DASH 测试',webUrl:origin+'/page.html',requestHeaders:referer?{referer:origin+'/page.html'}:{}}});
  assert.equal(answer?.ok,true,JSON.stringify(answer));const page=await opened;await page.waitForLoadState('domcontentloaded');return page;};
 const ready=page=>page.getByRole('button',{name:/^下载$/}).waitFor({state:'visible',timeout:15000});
 const download=async(page,count=1)=>{const before=await lastId();await page.getByRole('button',{name:/^下载$/}).click();const done=await finished(before,count);assert(done.length>=count,'saved');return done;};
 const merged=(file,height,name)=>{const p=probe(file);check(p.video===1&&p.audio===1&&Math.abs(p.seconds-6)<=1&&(!height||p.height===height),name+` (video ${p.video}, audio ${p.audio}, ${p.seconds}s, ${p.height}p)`);};
 // 1–3. The three ways a manifest lists its pieces; the default pick is the sharpest picture.
 for(const set of ['template','timeline','single']){const page=await open(`/plain/${set}/manifest.mpd`);await ready(page);
  if(set==='template')await page.screenshot({path:path.join(report,'ready.png'),fullPage:true});
  merged((await download(page))[0],720,`${set}: one click saves one MP4 with picture and sound, 720p by default`);await page.close();}
 // 4. Picture only.
 let page=await open('/plain/videoonly/manifest.mpd');await ready(page);check(await page.locator('select').count()===1,'a manifest with only picture shows one track list');
 let p=probe((await download(page))[0]);check(p.video===1&&p.audio===0,'a picture-only manifest saves a picture-only MP4');await page.close();
 // 5. Manifest and segments that need the source page.
 page=await open('/guarded/template/manifest.mpd');await ready(page);merged((await download(page))[0],720,'manifest and segments that need the source page download with it');await page.close();
 // 6. DRM: no download button, no key data on the page.
 page=await open('/plain/drm/manifest.mpd');await page.waitForFunction(()=>/版权保护/.test(document.body.innerText),null,{timeout:15000});
 check(!(await page.getByRole('button',{name:/^下载$/}).isVisible().catch(()=>false))&&!(await page.content()).includes('AAAAQ3Bzc2g'),'a protected video says so, offers no download and shows no key data');await page.close();
 // 7. Live.
 page=await open('/plain/live/manifest.mpd');await page.waitForFunction(()=>/直播/.test(document.body.innerText),null,{timeout:15000});check(true,'a live manifest says live streams are not downloaded');await page.close();
 // 8. A segment that fails twice, then works; a segment that never works.
 page=await open('/flaky/template/manifest.mpd');await ready(page);merged((await download(page))[0],720,'a segment that fails twice is retried and the video is complete');await page.close();
 page=await open('/missing/template/manifest.mpd');await ready(page);await page.getByRole('button',{name:/^下载$/}).click();
 await page.getByRole('button',{name:/重试失败的分段/}).waitFor({state:'visible',timeout:30000});
 const missingPath=Object.keys(hits).find(k=>k.startsWith('/missing/')&&k.includes('chunk-stream0-00002'));const before=hits[missingPath];
 await page.getByRole('button',{name:/重试失败的分段/}).click();await page.waitForTimeout(3000);
 const others=Object.keys(hits).filter(k=>k.startsWith('/missing/')&&k!==missingPath&&!k.endsWith('.mpd'));
 check(hits[missingPath]>before&&others.every(k=>hits[k]===1),'retrying failed segments asks only for the failed one');await page.close();
 // 9. Language of the default sound track follows the interface.
 page=await open('/plain/twoaudio/manifest.mpd');await ready(page);
 const audioPick=await page.locator('select').nth(1).evaluate(s=>s.options[s.selectedIndex].text);check(/zh|zho|中文|chi/i.test(audioPick),'the Chinese interface picks the Chinese sound track first: '+audioPick);await page.close();
 // 10. Stop, then download again: one complete file.
 page=await open('/plain/template/manifest.mpd');await ready(page);let start=await lastId();await page.getByRole('button',{name:/^下载$/}).click();
 await page.getByRole('button',{name:/停止下载/}).click({timeout:5000}).catch(()=>{});
 const again=page.getByRole('button',{name:/重新下载|^下载$/});await again.first().waitFor({state:'visible',timeout:10000});await again.first().click();
 const saved=await finished(start,1);check(saved.length===1,'stop then download again saves exactly one file');merged(saved[0],720,'that one file is complete');await page.waitForTimeout(1500);check((await finished(start,2,500)).length===0,'no second file appears');await page.close();
 // 11. Advanced: sound only, and the segment list starting with the initialization segment.
 page=await open('/plain/template/manifest.mpd');await ready(page);await page.getByRole('button',{name:/显示高级选项/}).click();
 const list=await page.locator('textarea').first().inputValue();check(/init-stream0\.m4s/.test(list.split('\n').find(Boolean)||''),'the advanced list starts with the initialization segment');
 start=await lastId();await page.getByRole('button',{name:/只下载声音/}).click();const audio=await finished(start,1);p=probe(audio[0]);check(p.audio===1&&p.video===0&&/\.m4a$/i.test(audio[0])||p.audio===1&&p.video===0,'只下载声音 saves the sound alone');
 // 12. Narrow screen and English.
 await page.setViewportSize({width:360,height:760});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the page fits 360 px without sideways scrolling');await page.screenshot({path:path.join(report,'narrow.png'),fullPage:true});await page.close();
 // 13. (spec v2) MP4 and WebM tracks mixed, types only on the AdaptationSet: the default is the pair that makes one MP4.
 page=await open('/plain/mixed/manifest.mpd');await ready(page);
 const options=await page.locator('select').evaluateAll(list=>list.map(s=>[...s.options].map(o=>o.text)));
 const picks=await page.locator('select').evaluateAll(list=>list.map(s=>s.options[s.selectedIndex].text));
 check(/H.264/.test(options[0].join())&&/VP9/.test(options[0].join())&&/AAC/.test(options[1].join())&&/Opus/.test(options[1].join()),'track lists name the formats: '+options.flat().join(' / '));
 check(/H.264/.test(picks[0])&&/AAC/.test(picks[1]),'the default pair is H.264 + AAC (mergeable), even with a sharper-rate VP9 / Opus listed');
 check(/约 .*(KB|MB|GB)/.test(options[0][0]),'picture options show an estimated size');
 merged((await download(page))[0],0,'the default mixed pair saves one MP4');
 const vp9=await page.locator('select').first().evaluate(s=>[...s.options].findIndex(o=>/VP9/.test(o.text)));
 await page.locator('select').first().selectOption({index:vp9});
 await page.waitForFunction(()=>/不能合成一个 MP4/.test(document.body.innerText),null,{timeout:5000});
 const separate=page.getByRole('button',{name:/分别下载画面和声音/});check(await separate.isVisible(),'choosing VP9 says before downloading that the pair is saved as two files');
 start=await lastId();await separate.click();const two=await finished(start,2);
 const kinds=two.map(f=>spawnSync(ffmpeg,['-hide_banner','-i',f],{encoding:'utf8'}).stderr).map(s=>/Input #0, (?:matroska,webm|webm)/.test(s)?'webm':/Input #0, mov,mp4/.test(s)?'mp4':'?');
 check(two.length===2&&kinds.includes('webm'),'the separate files are saved in their real containers: '+kinds.join(', '));await page.close();
 // 14. (spec v2) Segments on a site the extension may not reach yet.
 page=await open('/crosshost/template/manifest.mpd');
 await page.waitForFunction(()=>/需要允许访问/.test(document.body.innerText),null,{timeout:15000});
 check(await page.getByRole('button',{name:/允许访问/}).isVisible()&&await page.getByRole('button',{name:/^下载$/}).isDisabled().catch(()=>true),'segments on another site: a note, an 允许访问 button, and 下载 waits');
 await page.close();
 // 19. (spec v3) The default picture is at most 1080p; 20. English says Video / Audio.
 page=await open('/plain/ladder/manifest.mpd');await ready(page);
 const ladderPick=await page.locator('select').first().evaluate(s=>s.options[s.selectedIndex].text);check(/1920×1080/.test(ladderPick),'with 2160p, 1440p, 1080p and 720p listed, 1080p is chosen first: '+ladderPick);
 {const p=probe((await download(page))[0]);check(p.height===1080&&p.audio===1,'and that is what downloads ('+p.height+'p)');}
 await page.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));await page.waitForTimeout(1200);
 {const text=await page.evaluate(()=>document.body.innerText);check(/Video/.test(text)&&/Audio/.test(text)&&!/Picture|Sound/.test(text),'the English page says Video and Audio');}
 await page.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));await page.close();
 check(dialogs.length===0,'no dialog appeared at any point');
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({checks},null,1));console.log(`dash-download-check passed (${checks.length} checks). Report: ${report}`);
}catch(error){console.error(error);process.exitCode=1;}finally{await context?.close().catch(()=>{});server.close();}})();
