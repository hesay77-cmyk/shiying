// 纯插件实测：真实按钮、浏览器隐藏页、Chrome 保存；不启动或访问下载助手。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version,folder=path.join(root,'reports','2026-10-12-v'+version),run=path.join(folder,new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(run,{recursive:true});
const report={version,date:'2026-10-12',method:'纯扩展真实按钮 → 插件隐藏页 → Chrome 保存；独立无登录浏览器；未启动助手',results:[],playback:[],errors:[],helperRequests:[]};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function poll(action,timeout=120000){const end=Date.now()+timeout;while(Date.now()<end){const value=await action();if(value)return value;await wait(500)}throw new Error('原生插件验收超时')}
const checkpoint=()=>fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2));
(async()=>{
 let context,mediaServer;
 try{
  context=await chromium.launchPersistentContext(path.join(run,'profile'),{channel:'chromium',executablePath:process.env.SHIYING_CHROMIUM,headless:true,acceptDownloads:true,downloadsPath:path.join(run,'downloads'),locale:'en-US',proxy:{server:'http://127.0.0.1:7897'},args:[`--disable-extensions-except=${path.join(root,'build')}`,`--load-extension=${path.join(root,'build')}`,'--autoplay-policy=no-user-gesture-required']});
  context.on('page',page=>page.on('pageerror',error=>report.errors.push(error.message)));
  context.on('request',request=>{if(request.url().startsWith('http://127.0.0.1:17863/'))report.helperRequests.push(request.url())});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  let targets=[{site:'bilibili',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',formats:[{format:'mp4',height:360},{format:'mp4',height:480},{format:'mp3',height:null}]},{site:'youtube',url:'https://www.youtube.com/watch?v=aqz-KE-bpKQ',formats:[{format:'mp4',height:720},{format:'mp4',height:1080},{format:'mp3',height:null}]}];
  if(process.env.SHIYING_NATIVE_SITE)targets=targets.filter(target=>target.site===process.env.SHIYING_NATIVE_SITE);
  if(process.env.SHIYING_NATIVE_MP3_ONLY==='1')targets=targets.map(target=>({...target,formats:target.formats.filter(format=>format.format==='mp3')}));
  for(const target of targets){
   const row={...target,downloads:[]};report.results.push(row);
   const source=await context.newPage();await source.goto(target.url,{waitUntil:'domcontentloaded',timeout:60000});
   const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,source.url());
   let popup;
   for(const {format,height} of target.formats){
    popup=await context.newPage();await popup.setViewportSize({width:440,height:660});await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
    await poll(async()=>{if(await popup.locator('#platformError').isVisible())throw new Error(await popup.locator('#platformError').innerText());return !await popup.locator('#platformAudio').isDisabled()});
    row.title=await popup.locator('#platformTitle').innerText();row.choices=await popup.locator('#platformQuality option').allTextContents();
    assert((await popup.locator('#helperState').innerText()).includes('无需其他程序'));
    if(format==='mp4')await popup.locator('#platformQuality').selectOption(String(height));
    await popup.screenshot({path:path.join(run,target.site+'-界面.png'),fullPage:true});
    const oldPages=new Set(context.pages());await popup.locator(format==='mp3'?'#platformAudio':'#platformDownload').click();
    let task=await poll(()=>context.pages().find(page=>!oldPages.has(page)&&page.url().includes('shiying-task.html')),15000);const jobId=new URL(task.url()).searchParams.get('id');
    await popup.close();
    if(format==='mp3'||height===1080){await task.close();row.continuesWithoutPopupAndProgress=true;}
    let previous='';
    const job=await poll(async()=>{const state=await worker.evaluate(async id=>(await chrome.storage.local.get('shiyingJob:'+id))['shiyingJob:'+id],jobId);if(state?.stage!==previous){previous=state?.stage;console.log(target.site,format,height||'',state?.stage,state?.progress)}if(['error','cancelled'].includes(state?.status))throw new Error(state.error||state.stage);return state?.status==='complete'?state:null},900000);
    assert.equal(job.format,format);assert.equal(job.height,height);assert(job.verification.fullDecode&&job.verification.audioActive);
    assert(fs.existsSync(job.file),'Chrome 保存文件不存在');assert(path.resolve(job.file).toLowerCase().startsWith(path.resolve(run).toLowerCase()),'测试文件落到了独立目录之外');
    const stable=path.join(run,`${target.site}-${height||'声音'}.${format}`);fs.copyFileSync(job.file,stable);job.testFile=stable;job.sha256=crypto.createHash('sha256').update(fs.readFileSync(stable)).digest('hex');
    const decode=spawnSync(process.env.SHIYING_FFMPEG||path.join(root,'helper/bin/ffmpeg.exe'),['-hide_banner','-nostdin','-xerror','-err_detect','explode','-v','info','-i',stable,'-af','astats=metadata=1:reset=0','-f','null','-'],{windowsHide:true,encoding:'utf8',maxBuffer:3*1024*1024});
    fs.writeFileSync(path.join(run,`${target.site}-${height||'声音'}-decode.log`),decode.stderr);assert.equal(decode.status,0);
    assert.match(decode.stderr,format==='mp3'?/Audio: mp3/:/Audio: aac/);if(format==='mp4')assert.match(decode.stderr,new RegExp('Video:.*\\d+x'+height));else assert(!/Stream .*Video:/.test(decode.stderr));
    job.independentFullDecode=true;row.downloads.push(job);checkpoint();
    if(task.isClosed()){task=await context.newPage();await task.goto(`chrome-extension://${id}/shiying-task.html?id=${jobId}`)}
    await poll(()=>task.locator('#openFile').isVisible(),10000);await task.setViewportSize({width:900,height:850});await task.screenshot({path:path.join(run,`${target.site}-${height||'mp3'}-完成.png`)});await task.close();
   }
   await source.close();
  }
  const files=report.results.flatMap(row=>row.downloads.map(job=>({site:row.site,...job})));
  mediaServer=http.createServer((request,response)=>{const index=Number(request.url.split('/')[2]),job=files[index];if(!job){response.writeHead(404);return response.end()}const tag=job.format==='mp3'?'audio':'video';if(request.url.startsWith('/view/')){response.writeHead(200,{'Content-Type':'text/html'});return response.end(`<${tag} autoplay muted controls src="/media/${index}"></${tag}>`)}const size=fs.statSync(job.testFile).size,range=request.headers.range?.match(/bytes=(\d+)-(\d*)/),start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;response.writeHead(range?206:200,{'Content-Type':job.format==='mp3'?'audio/mpeg':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});fs.createReadStream(job.testFile,{start,end}).pipe(response)});await new Promise(resolve=>mediaServer.listen(0,'127.0.0.1',resolve));
  for(const [index,job] of files.entries()){const page=await context.newPage(),tag=job.format==='mp3'?'audio':'video';await page.goto(`http://127.0.0.1:${mediaServer.address().port}/view/${index}`);await poll(()=>page.locator(tag).evaluate(media=>media.currentTime>0.2&&media.readyState>=2),20000);const start=await page.locator(tag).evaluate(media=>({time:media.currentTime,duration:media.duration,width:media.videoWidth||0,height:media.videoHeight||0,audioBytes:media.webkitAudioDecodedByteCount,error:media.error?.message}));await page.locator(tag).evaluate(media=>{media.currentTime=media.duration-3;return media.play()});await poll(()=>page.locator(tag).evaluate(media=>media.currentTime>media.duration-2.5),20000);const end=await page.locator(tag).evaluate(media=>({time:media.currentTime,audioBytes:media.webkitAudioDecodedByteCount,error:media.error?.message}));assert(start.audioBytes>0&&end.audioBytes>0&&!start.error&&!end.error);if(job.format==='mp4')assert.equal(start.height,job.height);report.playback.push({site:job.site,format:job.format,height:job.height,start,end,passed:true});await page.close();checkpoint()}
  assert.deepEqual(report.helperRequests,[]);assert.deepEqual(report.errors,[]);report.passed=true;checkpoint();fs.writeFileSync(path.join(folder,'latest.json'),JSON.stringify({run,result:path.join(run,'result.json')},null,2));console.log('REPORT',path.join(run,'result.json'));
 }finally{if(context)await context.close();if(mediaServer)await new Promise(resolve=>mediaServer.close(resolve))}
})().catch(error=>{report.error=error.stack;checkpoint();console.error(error);process.exitCode=1});
