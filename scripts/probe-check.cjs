// Black-box check of 页面播放器探测 (rewrite unit 8, spec 06): hidden playlists found from page requests, and media a
// MediaSource player appends recorded and saved. Local site, store build (RUXGET_EXTENSION to override), ffmpeg checks.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const {build}=require('./dash-fixtures.cjs');
const root=path.resolve(__dirname,'..'),report=path.join(process.env.RUXGET_REPORTS||path.join(root,'reports'),'probe-'+Date.now());fs.mkdirSync(report,{recursive:true});
const ffmpeg=process.env.RUXGET_FFMPEG||'ffmpeg',media=build(path.join(process.env.RUXGET_TMP||report,'dash-fixtures'),ffmpeg),set=path.join(media,'template');
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const playlist='#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:2.0,\nseg0.ts\n#EXT-X-ENDLIST\n';
// The MediaSource player: fetches the fixture's video (stream0) and audio (stream2) pieces and appends them; it keeps
// what it appended so the test can compare the saved files byte for byte.
const player=`<!doctype html><title>MSE 播放器</title><video id=v muted autoplay></video><script>
window.appended={video:[],audio:[]};const ms=new MediaSource();v.src=URL.createObjectURL(ms);
ms.addEventListener('sourceopen',async()=>{const tracks=[['video','video/mp4; codecs="avc1.64001f"',0,3],['audio','audio/mp4; codecs="mp4a.40.2"',2,4]];
 await Promise.all(tracks.map(async([kind,type,id,count])=>{const sb=ms.addSourceBuffer(type);const parts=['init-stream'+id+'.m4s'];for(let i=1;i<=count;i++)parts.push('chunk-stream'+id+'-'+String(i).padStart(5,'0')+'.m4s');
  for(const part of parts){const data=new Uint8Array(await (await fetch('/media/'+part)).arrayBuffer());for(const b of data)window.appended[kind].push(b);await new Promise(r=>{sb.addEventListener('updateend',r,{once:true});sb.appendBuffer(data);});}}));
 window.done=true;});</script>`;
const server=http.createServer((request,response)=>{const url=new URL(request.url,'http://x');const p=url.pathname;
 const html=body=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(body);};
 if(p==='/hidden.html')return html(`<!doctype html><title>藏起来的播放列表</title><script>fetch('/api/play?id=1').then(r=>r.text()).then(t=>window.got=t.length);</script>`);
 if(p==='/json.html')return html(`<!doctype html><title>接口里的地址</title><script>fetch('/api/info').then(r=>r.json()).then(j=>window.got=j);</script>`);
 if(p==='/mse.html')return html(player);
 if(p==='/other.html')return html('<!doctype html><title>其他网站</title>');
 if(p==='/api/play'){response.writeHead(200,{'Content-Type':'text/plain'});return response.end(playlist);}
 if(p==='/api/info'){response.writeHead(200,{'Content-Type':'application/json'});return response.end(JSON.stringify({data:{url:`http://${request.headers.host}/v/index.m3u8?t=1`}}));}
 if(p.startsWith('/media/')){const file=path.join(set,path.basename(p));if(fs.existsSync(file)){response.writeHead(200,{'Content-Type':'video/iso.segment'});return response.end(fs.readFileSync(file));}}
 response.writeHead(404);response.end();});
(async()=>{let context;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const extension=path.join(report,'extension');fs.cpSync(process.env.RUXGET_EXTENSION||path.join(root,'build'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions=[...manifest.host_permissions,'http://127.0.0.1/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const files=path.join(report,'files');fs.mkdirSync(path.join(report,'profile'),{recursive:true});
 context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true,acceptDownloads:true,downloadsPath:files,ignoreDefaultArgs:['--disable-extensions'],args:['--lang=zh-CN','--mute-audio','--autoplay-policy=no-user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-networking']});
 const dialogs=[];context.on('page',p=>p.on('dialog',d=>{dialogs.push(d.message());d.dismiss().catch(()=>{});}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 await new Promise(r=>setTimeout(r,4000));for(const p of context.pages())if(p.url().startsWith('chrome-extension://'))await p.close();
 const tabOf=async page=>worker.evaluate(async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id,page.url());
 const panelFor=async page=>{const panel=await context.newPage();await panel.setViewportSize({width:380,height:640});await panel.goto(`chrome-extension://${id}/shiying.html?tabId=${await tabOf(page)}`);await panel.waitForTimeout(1500);return panel;};
 const listed=(panel,re)=>panel.evaluate(src=>document.body.innerText.match(new RegExp(src))!==null,re);
 const toggle=panel=>panel.getByRole('button',{name:/找出网页里藏起来的视频/});
 const enable=async(site,panel)=>{const reload=site.waitForEvent('load',{timeout:15000});await toggle(panel).click();await reload;await site.waitForTimeout(1500);};
 // 1–2. A playlist fetched from an address with no extension and the wrong type.
 const site=await context.newPage();await site.goto(origin+'/hidden.html');await site.waitForFunction(()=>window.got>0);
 let panel=await panelFor(site);check(!(await listed(panel,'api/play')),'without the probe, a playlist behind /api/play (text/plain) is not found');
 check(await toggle(panel).isVisible(),'the panel offers 找出网页里藏起来的视频 (页面播放器探测) on an allowed site');
 await enable(site,panel);await panel.close();panel=await panelFor(site);
 check(await listed(panel,'(api/play|m3u8|网页|play)')&&(await panel.evaluate(t=>chrome.runtime.sendMessage({Message:'getData',tabId:t}),await tabOf(site))||[]).some(i=>/api\/play/.test(i.url)&&/m3u8/.test(i.ext)),'with the probe on (the page reloaded), the hidden playlist is listed as m3u8');
 check(/正在找网页里藏起来的视频/.test(await panel.evaluate(()=>document.body.innerText)),'the panel says it is looking for hidden videos (the probe is on)');await panel.screenshot({path:path.join(report,'probe-on.png'),fullPage:true});
 // 3. An address inside JSON.
 await site.goto(origin+'/json.html');await site.waitForFunction(()=>window.got);await site.waitForTimeout(1200);
 const data=await worker.evaluate(async u=>{const t=(await chrome.tabs.query({})).find(x=>x.url===u);return t?t.id:0;},site.url());
 const items=await panel.evaluate(t=>chrome.runtime.sendMessage({Message:'getData',tabId:t}),data);check((items||[]).some(i=>/\/v\/index\.m3u8\?t=1/.test(i.url)),'a playlist address inside a JSON answer is listed (same site, probe still on)');
 // 4–5. MediaSource recording, save, clear.
 await site.goto(origin+'/mse.html');await site.waitForFunction(()=>window.done===true,null,{timeout:30000});await site.waitForTimeout(1500);
 await panel.close();panel=await panelFor(site);const card=panel.locator('text=从网页播放器录下的内容');await card.waitFor({timeout:10000});
 const sizes=await site.evaluate(()=>({video:window.appended.video.length,audio:window.appended.audio.length}));
 check(true,'a 从网页播放器录下的内容 card appears for the MediaSource player');await panel.screenshot({path:path.join(report,'cache-card.png'),fullPage:true});
 const saved=[];site.on('download',d=>saved.push(d));
 await panel.getByRole('button',{name:/^保存$/}).click();for(let i=0;i<50&&saved.length<2;i++)await site.waitForTimeout(200);
 check(saved.length===2,'保存 gives two files (picture and sound)');
 const bodies=await Promise.all(saved.map(async d=>({name:d.suggestedFilename(),data:fs.readFileSync(await d.path())})));
 const expectV=Buffer.from(await site.evaluate(()=>window.appended.video)),expectA=Buffer.from(await site.evaluate(()=>window.appended.audio));
 check(bodies.some(b=>b.data.equals(expectV))&&bodies.some(b=>b.data.equals(expectA)),`the saved files are exactly what the player appended (${sizes.video} and ${sizes.audio} bytes)`);
 for(const b of bodies){const file=path.join(report,'saved-'+b.name.replace(/[^\w.\u4e00-\u9fff-]/g,'_'));fs.writeFileSync(file,b.data);}
 const probes=bodies.map(b=>{const f=path.join(report,'check-'+bodies.indexOf(b)+(b.data.equals(expectV)?'.mp4':'.m4a'));fs.writeFileSync(f,b.data);return spawnSync(ffmpeg,['-hide_banner','-i',f],{encoding:'utf8'}).stderr;});
 check(probes.some(s=>/Video:/.test(s))&&probes.some(s=>/Audio:/.test(s)&&!/Video:/.test(s)),'ffmpeg reads a picture track from one file and a sound track from the other');
 await panel.getByRole('button',{name:/清空记录/}).click();await panel.waitForTimeout(1200);
 check(!/已记录 [1-9]/.test(await panel.evaluate(()=>document.body.innerText))||/已记录 0/.test(await panel.evaluate(()=>document.body.innerText)),'清空记录 sets the recorded sizes back to zero');
 // 6. Turning it off.
 const reload=site.waitForEvent('load',{timeout:15000});await panel.getByRole('button',{name:/关闭/}).first().click();await reload;await panel.close();
 await site.goto(origin+'/hidden.html');await site.waitForFunction(()=>window.got>0);await site.waitForTimeout(1000);
 await worker.evaluate(()=>0);panel=await panelFor(site);
 const after=await panel.evaluate(t=>chrome.runtime.sendMessage({Message:'getData',tabId:t}),await tabOf(site));
 check(!(after||[]).some(i=>/api\/play/.test(i.url))&&!/已开启/.test(await panel.evaluate(()=>document.body.innerText)),'after 关闭 the page is back to normal: nothing hidden is reported');
 // 7. Another site turns it off.
 await enable(site,panel);await site.goto(origin.replace('127.0.0.1','localhost')+'/other.html').catch(()=>{});await site.waitForTimeout(800);
 await site.goto(origin+'/hidden.html');await site.waitForFunction(()=>window.got>0);await site.waitForTimeout(1000);await panel.close();panel=await panelFor(site);
 check(!/已开启/.test(await panel.evaluate(()=>document.body.innerText)),'going to another site turns the probe off');
 await panel.setViewportSize({width:360,height:640});check(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the panel fits 360 px');
 check(dialogs.length===0,'no dialog appeared');
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({checks},null,1));console.log(`probe-check passed (${checks.length} checks). Report: ${report}`);
}catch(error){console.error(error);process.exitCode=1;}finally{await context?.close().catch(()=>{});server.close();}})();
