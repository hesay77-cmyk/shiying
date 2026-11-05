// Main video first, ads and previews folded (0.4.54). A local page has one big player, a second ordinary video,
// three small muted looping previews, plus an ad-network clip and a tiny clip in the media list.
// The page's players are read with the same probe the popup injects; the media list is stubbed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-focus-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const RuxgetFocus=require(path.join(root,'js','shiying-focus.js'));
const MB=1024*1024;
const kind=item=>/\.m3u8/.test(item.url)?'hls':/\.mp3/.test(item.url)?'audio':'video';
// Pure rules first.
{
 const el=(sources,extra)=>Object.assign({tag:'video',sources,width:800,height:450,visible:800*450,paused:false,muted:false,loop:false,autoplay:false,time:5,duration:600},extra);
 let result=RuxgetFocus.classify([{url:'https://v.example/main.mp4',size:50*MB},{url:'https://v.example/p.mp4',size:3*MB}],[el(['https://v.example/main.mp4']),el(['https://v.example/p.mp4'],{width:200,height:112,muted:true,loop:true,autoplay:true,paused:false,time:1})],kind);
 assert.equal(result.get('https://v.example/main.mp4'),'main');assert.equal(result.get('https://v.example/p.mp4'),'minor');
 check('the big player with sound is the main video; a small muted looping player is a preview');
 result=RuxgetFocus.classify([{url:'https://cdn.example/a/index.m3u8'},{url:'https://v.example/p.mp4',size:3*MB}],[el(['blob:https://v.example/1']),el(['https://v.example/p.mp4'],{width:200,height:112,muted:true,loop:true})],kind);
 assert.equal(result.get('https://cdn.example/a/index.m3u8'),'main');
 check('a streaming player (blob:) is matched to the only stream left');
 result=RuxgetFocus.classify([{url:'https://s0.2mdn.net/videoplayback/x.mp4',size:5*MB},{url:'https://ads.example/vast/clip.mp4',size:5*MB},{url:'https://v.example/tiny.mp4',size:200*1024},{url:'https://v.example/ok.mp4',size:9*MB}],[],kind);
 assert.deepEqual([...result.values()],['minor','minor','minor','normal']);
 check('without page players: ad-network clips, ad paths and tiny clips fold; the rest stays');
 result=RuxgetFocus.classify([{url:'https://s0.2mdn.net/a.mp4',size:5*MB},{url:'https://v.example/tiny.mp4',size:9}],[],kind);
 assert.deepEqual([...result.values()],['normal','normal']);
 check('if everything looks minor, nothing is folded');
 result=RuxgetFocus.classify([{url:'https://v.example/a.mp4',size:9*MB},{url:'https://v.example/b.mp4',size:9*MB}],[el(['https://v.example/a.mp4']),el(['https://v.example/b.mp4'],{width:480,height:270,paused:true,time:0})],kind);
 assert.deepEqual([...result.values()],['main','normal']);
 check('a second ordinary video on the page stays in the list');
}
(async()=>{
 const page=`<!doctype html><meta charset="utf-8"><title>Fixture article</title><body style="margin:0;background:#eee">
  <aside style="display:flex;gap:8px"><video src="/preview1.mp4" muted autoplay loop width="200" height="112"></video><video src="/preview2.mp4" muted autoplay loop width="200" height="112"></video><video src="/preview3.mp4" muted autoplay loop width="200" height="112"></video></aside>
  <main><video id="main" src="/main.webm" controls width="800" height="450"></video><p>Text</p><video src="/second.mp4" controls width="480" height="270"></video></main>`;
 const server=http.createServer((request,response)=>{if(request.url==='/')return response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),response.end(page);response.writeHead(404);response.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:1100,height:900},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const site=await browser.newPage();await site.goto(origin+'/');
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,origin+'/');
  const elements=await site.evaluate(`(${RuxgetFocus.probe.toString()})()`);
  assert.equal(elements.length,5);assert(elements.every(item=>item.sources[0].startsWith(origin)));
  check('the probe reads every player on the page: size, sound, loop and address');
  const media=[['main.webm',30*MB],['preview1.mp4',3*MB],['preview2.mp4',3*MB],['preview3.mp4',3*MB],['second.mp4',12*MB],['tiny.mp4',200*1024]].map(([name,size],i)=>({url:origin+'/'+name,name,ext:name.split('.').pop(),type:'video/'+name.split('.').pop(),size,requestId:'r'+i,getTime:i}));
  media.splice(2,0,{url:'https://s0.2mdn.net/videoplayback/ad-clip.mp4',name:'ad-clip.mp4',ext:'mp4',type:'video/mp4',size:5*MB,requestId:'ad',getTime:9});
  await browser.addInitScript(({media,elements})=>{
   if(location.protocol!=='chrome-extension:'||!location.pathname.endsWith('/shiying.html'))return;
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=async message=>message?.Message==='getData'?media:send(message);
   const real=chrome.scripting.executeScript.bind(chrome.scripting);
   chrome.scripting.executeScript=async options=>options?.func&&options.target?.allFrames?[{frameId:0,result:elements}]:real(options);
  },{media,elements});
  const popup=await browser.newPage();await popup.setViewportSize({width:380,height:760});
  await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
  // The players are read shortly after the list loads.
  await popup.locator('#focusNote',{hasText:'5'}).waitFor({state:'visible'});
  const names=()=>popup.locator('#mediaList .media-item h3').allInnerTexts();
  assert.deepEqual(await names(),['main.webm','second.mp4']);
  assert.equal(await popup.locator('#mediaList .media-item').first().locator('.main-tag').innerText(),'页面主视频');
  assert.match(await popup.locator('#focusNote').innerText(),/另有 5 个可能是广告、预览或很小的片段，已收起。\s*展开/);
  assert.equal(await popup.locator('#count').innerText(),'7');
  await popup.screenshot({path:path.join(report,'folded-zh.png')});
  check('the popup shows the main video first, keeps the second video, and folds 5 ads/previews/tiny clips under one line');
  await popup.locator('#focusNote').getByRole('button',{name:'展开'}).click();
  const all=await names();assert.equal(all.length,7);assert.deepEqual(all.slice(0,2),['main.webm','second.mp4']);
  assert.equal(await popup.locator('#mediaList .media-item.is-minor').count(),5);
  assert.match(await popup.locator('#focusNote').innerText(),/已放在最后[\s\S]*收起/);
  await popup.screenshot({path:path.join(report,'unfolded-zh.png')});
  await popup.locator('#focusNote').getByRole('button',{name:'收起'}).click();assert.equal((await names()).length,2);
  check('“展开” shows everything (folded ones last, dimmed); “收起” folds them again');
  await popup.fill('#search','preview');await popup.locator('#search').dispatchEvent('input');
  for(let i=0;i<20&&(await names()).length!==3;i++)await popup.waitForTimeout(50);
  assert.deepEqual(await names(),['preview1.mp4','preview2.mp4','preview3.mp4']);assert.equal(await popup.locator('#focusNote').isVisible(),false);
  await popup.fill('#search','');await popup.locator('#search').dispatchEvent('input');
  check('searching always shows every match');
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));
  await popup.reload();await popup.locator('#focusNote',{hasText:'5'}).waitFor({state:'visible'});
  assert.match(await popup.locator('#focusNote').innerText(),/5 more look like ads, previews or tiny clips, so they’re folded\.\s*Show/);
  assert.equal(await popup.locator('#mediaList .media-item').first().locator('.main-tag').innerText(),'Main video');
  assert.match(await popup.locator('#mediaList .media-item').first().innerText(),/Download[\s\S]*Copy link[\s\S]*Details[\s\S]*Desktop/);
  assert.doesNotMatch(await popup.locator('#mediaList').innerText(),/[一-鿿]/);
  await popup.screenshot({path:path.join(report,'folded-en.png')});
  check('English: labels, buttons and the fold line are all in English');
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('FOCUS CHECKS PASSED '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error('FAIL',error);process.exit(1);});
