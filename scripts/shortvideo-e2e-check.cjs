// End to end with the real store extension: page reader → catalog → engine download → full decode check → save → MP3 tags.
// 快手 and 抖音 pages and their video servers are served over HTTPS on this machine (host-resolver mapping, self-signed cert).
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),fixtures=process.env.RUXGET_SV_FIXTURES||path.join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-sv-fixtures'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-sv-e2e-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const page=(script)=>`<!doctype html><meta charset="utf-8"><title>fixture</title><main><div id="player"><video muted></video></div></main><script>${script}</script>`;
const ksPage=page(`document.getElementById('player').__vueParentComponent={props:{author:{name:'快手样例作者'},videoInfo:{id:'3xfixture',caption:'快手样例',duration:4000,coverUrl:'',photoUrl:'https://v23-3.kwaicdn.com/clip-480.mp4',manifest:{adaptationSet:[{representation:[{url:'https://v23-3.kwaicdn.com/clip-720.mp4',width:720,height:1280},{url:'https://v23-3.kwaicdn.com/clip-480.mp4',width:480,height:854}]}]}}},parent:null};`);
const dyPage=page(`document.getElementById('player').__reactFiber$x={memoizedProps:{awemeInfo:{awemeId:'7412345678901234567',desc:'抖音样例',authorInfo:{nickname:'抖音作者'},video:{duration:4000,width:720,height:1280,bitRateList:[{width:720,height:1280,isH265:false,dataSize:1689720,playAddr:[{src:'https://v26-web.douyinvod.com/clip-720.mp4'}]}],playAddr:[]}}},return:null};`);
(async()=>{
 const served=[];
 const server=https.createServer({key:fs.readFileSync(fixtures+'/key.pem'),cert:fs.readFileSync(fixtures+'/cert.pem')},(request,response)=>{
  const host=request.headers.host||'',url=new URL(request.url,'https://'+host);served.push({host,path:url.pathname,referer:request.headers.referer||''});
  if(/kuaishou/.test(host))return response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),response.end(ksPage);
  if(/douyin\.com/.test(host)&&!/douyinvod/.test(host))return response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),response.end(dyPage);
  const file=path.join(fixtures,path.basename(url.pathname));
  if(!/\.mp4$/.test(file)||!fs.existsSync(file))return response.writeHead(404),response.end();
  // Like the real 抖音 CDN: refuse requests without the page as Referer.
  if(/douyinvod/.test(host)&&!/^https:\/\/www\.douyin\.com\//.test(request.headers.referer||''))return response.writeHead(403,{'Access-Control-Allow-Origin':'*'}),response.end('forbidden');
  const data=fs.readFileSync(file),range=/bytes=(\d+)-(\d*)/.exec(request.headers.range||'');
  const start=range?Number(range[1]):0,end=range&&range[2]?Number(range[2]):data.length-1;
  response.writeHead(range?206:200,{'Content-Type':'video/mp4','Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})});
  response.end(data.subarray(start,end+1));
 });
 // Chrome host mapping cannot change the port, so the fixture server takes the standard HTTPS port on loopback.
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(443,'127.0.0.1',resolve);});
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 // Store edition, plus page access for the two fixture sites (stands in for the activeTab grant a toolbar click gives).
 const extension=path.join(report,'extension');fs.cpSync(path.join(root,'build'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions.push('https://www.kuaishou.com/*','https://www.douyin.com/*');fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const map=['www.kuaishou.com','v23-3.kwaicdn.com','www.douyin.com','v26-web.douyinvod.com'].map(h=>`MAP ${h} 127.0.0.1`).join(',');
 const downloads=path.join(report,'downloads');fs.mkdirSync(downloads);
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:downloads,viewport:{width:360,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,`--host-resolver-rules=${map}`,'--ignore-certificate-errors','--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Playwright stores downloads under random names; record the name Ruxget asks Chrome for.
  await worker.evaluate(()=>{const download=chrome.downloads.download.bind(chrome.downloads);globalThis.requestedNames=[];chrome.downloads.download=options=>{requestedNames.push(options.filename);return download(options);};});
  const jobDone=async()=>{for(let i=0;i<120;i++){const job=await worker.evaluate(async()=>{const {shiyingJobIds:ids=[]}=await chrome.storage.local.get('shiyingJobIds');const key='shiyingJob:'+ids.at(-1);return (await chrome.storage.local.get(key))[key];});if(job&&['complete','error','cancelled'].includes(job.status))return job;await new Promise(r=>setTimeout(r,500));}throw new Error('job did not finish');};
  const popupFor=async url=>{const site=await browser.newPage();await site.goto(url);await site.waitForTimeout(500);const tabId=await worker.evaluate(async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id,url);const popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);return popup;};

  // 快手: no server permission needed.
  const ks=await popupFor('https://www.kuaishou.com/short-video/3xfixture');
  await ks.waitForFunction(()=>!document.querySelector('#platformDownload').disabled,null,{timeout:30000}).catch(async error=>{console.log('POPUP STATE',JSON.stringify(await ks.evaluate(()=>({card:!document.querySelector('#platformCard').hidden,title:document.querySelector('#platformTitle')?.textContent,meta:document.querySelector('#platformMeta')?.textContent,error:document.querySelector('#platformError')?.textContent,mainError:document.querySelector('#error')?.textContent,empty:document.querySelector('#empty')?.innerText}))),'SERVED',JSON.stringify(served.slice(0,6)));throw error;});
  assert.equal(await ks.locator('#platformTitle').innerText(),'快手样例');assert.match(await ks.locator('#platformMeta').innerText(),/快手\s+0:04/);
  assert.deepEqual(await ks.locator('#platformQuality option').allInnerTexts(),['720p','480p']);assert.equal(await ks.locator('#collectionOpen').isVisible(),false);
  await ks.screenshot({path:path.join(report,'kuaishou-popup.png')});
  check('快手 page read in the popup: title, duration, 720p/480p, no parts button');
  await ks.locator('#platformDownload').click();let job=await jobDone();
  assert.equal(job.status,'complete',job.error);assert.equal(job.verification.height,1280);assert.equal(job.verification.width,720);assert.equal(job.verification.audioActive,true);assert.equal(job.verification.fullDecode,true);assert(job.verification.videoFrames>=100);
  const mp4=await worker.evaluate(async downloadId=>(await chrome.downloads.search({id:downloadId}))[0],job.downloadId);
  assert.equal(mp4.state,'complete');assert.match(await worker.evaluate(()=>requestedNames.at(-1)),/快手样例-720p\.mp4$/);assert.equal(fs.statSync(mp4.filename).size,fs.statSync(fixtures+'/clip-720.mp4').size);
  check('快手 MP4: downloaded, every frame decoded, sound present, saved as “快手样例-720p.mp4”, byte-identical');
  // After a finished download the choices sit behind “下载选项”.
  if(await ks.locator('#platformChoices').isVisible())await ks.locator('#platformChoices').click();
  await ks.locator('label[for=formatAudio]').click();await ks.locator('#platformDownload').click();job=await jobDone();
  assert.equal(job.status,'complete',job.error);assert.equal(job.verification.audio,'mp3');
  const mp3=await worker.evaluate(async downloadId=>(await chrome.downloads.search({id:downloadId}))[0],job.downloadId);
  const bytes=fs.readFileSync(mp3.filename);assert.equal(bytes.subarray(0,3).toString(),'ID3');
  const text=frame=>{const at=bytes.indexOf(Buffer.from(frame));const size=bytes.readUInt32BE(at+4);return bytes.subarray(at+13,at+10+size).toString('utf16le').replace(/\0+$/,'');};
  assert.equal(text('TIT2'),'快手样例');assert.equal(text('TPE1'),'快手样例作者');
  assert(served.some(r=>r.path==='/clip-480.mp4'),'MP3 uses the smallest file');
  check('快手 MP3: made from the smallest file, tagged with title and author');

  // 抖音: asks for its video servers once, then sends the page as Referer.
  const dy=await popupFor('https://www.douyin.com/video/7412345678901234567');
  await dy.waitForFunction(()=>!document.querySelector('#platformDownload').disabled,null,{timeout:30000});
  assert.equal(await dy.locator('#platformTitle').innerText(),'抖音样例');
  await dy.evaluate(()=>{window.requested=[];chrome.permissions.request=async request=>{requested.push(request);return false;};});
  await dy.locator('label[for=formatVideo]').click();await dy.locator('#platformDownload').click();
  await dy.waitForFunction(()=>!document.querySelector('#platformError').hidden);
  assert.deepEqual(await dy.evaluate(()=>requested),[{origins:['https://*.douyinvod.com/*','https://*.douyincdn.com/*']}]);
  assert.match(await dy.locator('#platformError').innerText(),/需要允许访问这个网站的视频服务器/);
  check('抖音: the first download asks for its video servers; declining explains why nothing started');
  await dy.evaluate(()=>{chrome.permissions.request=async request=>{requested.push(request);return true;};});
  await dy.locator('#platformDownload').click();await jobDone().catch(()=>{});
  const rules=await worker.evaluate(()=>chrome.declarativeNetRequest.getSessionRules());
  const rule=rules.find(r=>r.condition.requestDomains?.includes('douyinvod.com'));
  assert(rule,'a Referer rule for the 抖音 video servers');assert.equal(rule.action.requestHeaders.find(h=>h.header==='Referer').value,'https://www.douyin.com/video/7412345678901234567');
  check('抖音: the download registers the page as Referer for its video servers');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
