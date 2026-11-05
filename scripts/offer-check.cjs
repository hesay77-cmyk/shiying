// Desktop offer (0.4.57) in a real browser with the store edition. The desktop app is stubbed:
// - the first ordinary Chrome download of 50 MB+ (still early) opens the panel once with one card; small files,
//   nearly finished files and a second file the same day never do;
// - every automatic opening counts, answered or not: next time 7 days + 3 large downloads, then 30 days, 3 at most;
//   "不再提示" or turning takeover off ends it; files arriving together are counted once each;
// - first-time users (Chrome not yet allowed to talk to the desktop): one click asks, then either takes over
//   (installed) or turns the card into "下载桌面版" in place (missing) without opening anything by itself;
// - the "大文件交给桌面版" switch and "改用桌面版" for running Chrome downloads;
// - the shorter ⋯ menu fits even when the panel is short; Chinese and English.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-offer-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const MB=1024*1024,DAY=86400000;
// Scheduling alone, without a browser.
{
 global.chrome={storage:{local:{},session:{}}};
 const Offer=require(path.join(root,'js','ruxget-offer.js')),now=Date.now(),s=v=>Object.assign({asked:0,lastAnswerAt:0,largeSince:0,never:false},v);
 assert.equal(Offer.due(s({}),now),true);
 assert.equal(Offer.due(s({asked:1,lastAnswerAt:now-4*DAY,largeSince:9}),now),false);
 assert.equal(Offer.due(s({asked:1,lastAnswerAt:now-7*DAY,largeSince:2}),now),false);
 assert.equal(Offer.due(s({asked:1,lastAnswerAt:now-7*DAY,largeSince:3}),now),true);
 assert.equal(Offer.due(s({asked:2,lastAnswerAt:now-29*DAY,largeSince:9}),now),false);
 assert.equal(Offer.due(s({asked:2,lastAnswerAt:now-30*DAY,largeSince:3}),now),true);
 assert.equal(Offer.due(s({asked:3,lastAnswerAt:now-400*DAY,largeSince:99}),now),false);
 assert.equal(Offer.due(s({never:true}),now),false);
 assert.equal(Offer.fits({totalBytes:49*MB,url:'https://x.test/a'}),false);
 assert.equal(Offer.fits({totalBytes:50*MB,url:'blob:https://x.test/1'}),false);
 assert.equal(Offer.fits({totalBytes:80*MB,url:'https://x.test/a',byExtensionId:'abc'}),false);
 assert.equal(Offer.fits({totalBytes:80*MB,url:'https://x.test/a',incognito:true}),false);
 assert.equal(Offer.fits({fileSize:80*MB,url:'https://x.test/a'}),true);
 assert.equal(Offer.early({state:'in_progress',totalBytes:100*MB,bytesReceived:79*MB}),true);
 assert.equal(Offer.early({state:'in_progress',totalBytes:100*MB,bytesReceived:80*MB}),false);
 assert.equal(Offer.early({state:'complete',totalBytes:100*MB,bytesReceived:10*MB}),false);
 assert.equal(Offer.minFor({minMB:1}),50);assert.equal(Offer.minFor({minMB:1,minChosen:true}),1);assert.equal(Offer.minFor({minMB:20}),20);
 delete global.chrome;
 check('pacing: each automatic opening counts; 7 days + 3 large downloads, then 30 days; at most 3; only early downloads');
}
(async()=>{
 // Large files declare their size and trickle slowly, so they stay "in progress" while the panel looks at them.
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://x');
  if(url.pathname==='/')return response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),response.end('<!doctype html><meta charset="utf-8"><title>Files</title>');
  const size=url.pathname.startsWith('/big')?60*MB:url.pathname==='/small.bin'?200*1024:0;
  if(!size)return response.writeHead(404),response.end();
  response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':size,'Content-Disposition':`attachment; filename="${url.pathname.slice(1)}"`});
  if(size<MB)return response.end(Buffer.alloc(size,1));
  const chunk=Buffer.alloc(16*1024,7);const timer=setInterval(()=>{if(response.destroyed)return clearInterval(timer);response.write(chunk);},200);
  response.on('close',()=>clearInterval(timer));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:path.join(report,'downloads'),viewport:{width:360,height:600},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>{
   globalThis.desk={installed:true};globalThis.nativeCalls=[];globalThis.opened=0;
   chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;
   chrome.action.openPopup=async()=>{globalThis.opened++;};
   chrome.runtime.sendNativeMessage=async(host,message)=>{
    nativeCalls.push(message);
    if(!desk.installed)throw new Error('Specified native messaging host not found.');
    if(message.action==='ping')return {ok:true,version:'0.4.56'};
    if(message.action==='takeover')return {ok:true,id:'aaaaaaaaaaaaaaaa',name:message.name||'big.bin'};
    if(message.action==='status')return {ok:true,running:true,active:0,jobs:[]};
    return {ok:true};
   };
  });
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Pages: whether Chrome may talk to the desktop yet (offerUnpermitted) and whether it is installed (offerDeskMissing)
  // come from session storage, so each case can be set up from the worker.
  await browser.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;
   const flags=()=>chrome.storage.session.get(['offerDeskMissing','offerUnpermitted','offerRequests']);
   chrome.permissions.contains=async()=>!(await flags()).offerUnpermitted;
   chrome.permissions.request=async()=>{const {offerRequests=0}=await flags();await chrome.storage.session.set({offerUnpermitted:false,offerRequests:offerRequests+1});return true;};
   chrome.runtime.sendNativeMessage=async(host,message)=>{if((await flags()).offerDeskMissing)throw new Error('Specified native messaging host not found.');return message.action==='ping'?{ok:true,version:'0.4.56'}:{ok:true,running:true,active:0,jobs:[]};};});
  const site=await browser.newPage();await site.goto(origin+'/');
  const get=key=>worker.evaluate(key=>chrome.storage.local.get(key).then(value=>value[key]),key);
  const set=value=>worker.evaluate(value=>chrome.storage.local.set(value),value);
  const opened=()=>worker.evaluate(()=>globalThis.opened);
  const download=async name=>{site.evaluate(url=>{const a=document.createElement('a');a.href=url;a.download='';document.body.append(a);a.click();a.remove();},origin+'/'+name).catch(()=>{});
   return worker.evaluate(async name=>{for(let i=0;i<100;i++){const found=(await chrome.downloads.search({})).find(item=>(item.url||'').endsWith('/'+name));if(found&&found.totalBytes)return found.id;await new Promise(r=>setTimeout(r,100));}return null;},name);};
  const settle=()=>site.waitForTimeout(600);
  const panel=async(height=600)=>{const page=await browser.newPage();await page.setViewportSize({width:360,height});await page.goto(`chrome-extension://${id}/shiying.html`);await page.waitForTimeout(1200);return page;};
  let fakeId=9000;
  const fake=(extra={})=>worker.evaluate(item=>RuxgetOffer.note(item),Object.assign({id:++fakeId,totalBytes:80*MB,bytesReceived:0,url:`https://files.example.test/f${fakeId}.zip`,filename:`C:\\D\\f${fakeId}.zip`,state:'in_progress'},extra));
  const fresh=async(state={})=>{await set({ruxgetOffer:Object.assign({asked:0,lastAnswerAt:0,largeSince:0,never:false},state)});await worker.evaluate(()=>chrome.storage.local.remove('ruxgetOfferCard'));};
  const takeover=async value=>{await set({ruxgetTakeover:value});await site.waitForTimeout(300);};

  await download('small.bin');await settle();
  assert.equal(await opened(),0);assert.equal(await get('ruxgetOfferCard'),undefined);
  check('a small Chrome download offers nothing');

  const big1=await download('big1.bin');await settle();
  assert.equal(await opened(),1);
  const card=await get('ruxgetOfferCard');assert.equal(card.id,big1);assert.equal(card.size,60*MB);
  assert.equal((await get('ruxgetOffer')).asked,1);
  await download('big2.bin');await settle();
  assert.equal(await opened(),1);
  check('the first large Chrome download opens the panel once and counts; another one the same day does not');

  let popup=await panel();
  const cardText=()=>popup.locator('#offerCard').innerText();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  assert.match(await cardText(),/正在用 Chrome 下载 \S+（60 MB）。交给 Ruxget 桌面版：多线程更快，断了能续传。/);
  assert.match(await cardText(),/改用桌面版[\s\S]*不用了/);assert.doesNotMatch(await cardText(),/不再提示/);
  assert.match(await cardText(),/以后 Chrome 里 50 MB 以上的文件也交给它/);
  await popup.waitForTimeout(400);
  assert.equal(await popup.locator('#chromeBig li').count(),1);
  // A storage change that doesn't alter the card keeps keyboard focus where it was.
  await popup.locator('#offerCard .offer-primary').focus();
  await set({ruxgetOffer:Object.assign(await get('ruxgetOffer'),{largeSince:0})});await popup.waitForTimeout(500);
  assert.equal(await popup.evaluate(()=>document.activeElement?.className),'offer-primary');
  await popup.screenshot({path:path.join(report,'card-zh.png')});
  check('the card names the running file, isn’t repeated in the list, and keeps focus while nothing changes');
  await popup.locator('#offerCard').getByRole('button',{name:'改用桌面版'}).click();
  await popup.locator('#offerCard').waitFor({state:'hidden'});
  assert.deepEqual(await get('ruxgetTakeover'),{skipHosts:[],enabled:true,minMB:50});
  assert.deepEqual(await worker.evaluate(()=>nativeCalls.filter(call=>call.action==='takeover').map(call=>call.url)),[origin+'/big1.bin']);
  for(let i=0;i<30&&(await worker.evaluate(id=>chrome.downloads.search({id}),big1)).length;i++)await site.waitForTimeout(100);
  assert.equal((await worker.evaluate(id=>chrome.downloads.search({id}),big1)).length,0);
  assert.match(await popup.locator('#toast').innerText(),/已交给桌面版。以后 Chrome 里 50 MB 以上的文件也交给它/);
  assert.equal((await get('ruxgetOffer')).asked,1);
  assert.equal(await popup.locator('#desktopTakeover').isChecked(),true);
  assert.match(await popup.locator('#desktopRowNote').innerText(),/Chrome 里 50 MB 以上的文件会交给桌面版 · 设置/);
  await popup.close();
  check('“改用桌面版” turns takeover on at 50 MB and moves the running file to the desktop');

  await worker.evaluate(()=>{globalThis.opened=0;});
  await download('big3.bin');await settle();
  assert.equal(await opened(),0);
  check('with takeover on, nothing is offered');

  // Turning takeover off yourself is an answer: the card never opens by itself again. The list offers moving files.
  popup=await panel();
  await popup.locator('.desktop-switch').click();
  for(let i=0;i<20&&(await get('ruxgetTakeover')).enabled;i++)await popup.waitForTimeout(100);
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  assert.match(await popup.locator('#toast').innerText(),/已关闭/);
  await popup.waitForTimeout(400);
  assert.equal(await popup.locator('#desktopTakeover').isChecked(),false);
  for(let i=0;i<20&&!(await get('ruxgetOffer')).never;i++)await popup.waitForTimeout(100);
  assert.equal((await get('ruxgetOffer')).never,true);
  await popup.locator('#chromeBig li').first().waitFor({state:'visible'});
  assert.match(await popup.locator('#chromeBig').innerText(),/Chrome 正在下载 \S+（60 MB）[\s\S]*改用桌面版/);
  assert.match(await popup.locator('#chromeBig button').first().getAttribute('aria-label'),/^改用桌面版下载 \S+/);
  await popup.screenshot({path:path.join(report,'row-off-zh.png')});
  await popup.locator('#chromeBig li').first().getByRole('button').click();
  for(let i=0;i<30&&!(await worker.evaluate(()=>nativeCalls.some(call=>call.action==='takeover'&&call.url.endsWith('/big2.bin'))));i++)await popup.waitForTimeout(100);
  assert(await worker.evaluate(()=>nativeCalls.some(call=>call.action==='takeover'&&call.url.endsWith('/big2.bin'))));
  for(let i=0;i<30&&!/已交给桌面版/.test(await popup.locator('#toast').innerText());i++)await popup.waitForTimeout(100);
  await popup.waitForTimeout(300);
  await popup.locator('.desktop-switch').click();
  for(let i=0;i<20&&!(await get('ruxgetTakeover')).enabled;i++)await popup.waitForTimeout(100);
  assert.deepEqual(await get('ruxgetTakeover'),{skipHosts:[],enabled:true,minMB:50});
  await popup.close();
  await worker.evaluate(()=>{globalThis.opened=0;});await takeover({enabled:false,minMB:50,skipHosts:[]});
  await fresh({never:true});assert.equal(await fake(),false);assert.equal(await opened(),0);
  check('switching takeover off counts as “不再提示”; the switch and “改用桌面版” in the list work');

  // An unanswered card counts: nothing opens 4 days later, even after many large downloads.
  await fresh();assert.equal(await fake(),true);
  await set({ruxgetOffer:Object.assign(await get('ruxgetOffer'),{lastAnswerAt:Date.now()-4*DAY})});
  for(let n=0;n<5;n++)assert.equal(await fake(),false);
  assert.equal((await get('ruxgetOffer')).asked,1);
  // Never more than 3 times in all.
  await fresh({asked:3,lastAnswerAt:Date.now()-400*DAY,largeSince:50});assert.equal(await fake(),false);
  check('a card nobody answered still counts, and the card opens 3 times at most');

  // The second time: 7 days and 3 large downloads; "不再提示" appears from the second time on.
  await fresh({asked:1,lastAnswerAt:Date.now()-8*DAY});
  assert.equal(await fake(),false);assert.equal(await fake(),false);assert.equal(await fake(),true);
  assert.equal((await get('ruxgetOffer')).asked,2);
  popup=await panel();
  assert.match(await cardText(),/以后大文件可以交给 Ruxget 桌面版/);
  assert.match(await cardText(),/不用了[\s\S]*不再提示/);
  await popup.locator('#offerCard').getByRole('button',{name:'不用了'}).click();
  await popup.locator('#offerCard').waitFor({state:'hidden'});
  const second=await get('ruxgetOffer');assert.equal(second.asked,2);assert.equal(second.largeSince,0);
  await popup.close();
  assert.equal(await fake(),false);
  await fresh({asked:2,lastAnswerAt:Date.now()-31*DAY,largeSince:2});
  assert.equal(await fake(),true);
  popup=await panel();
  await popup.locator('#offerCard').getByRole('button',{name:'不再提示'}).click();
  await popup.locator('#offerCard').waitFor({state:'hidden'});
  assert.equal((await get('ruxgetOffer')).never,true);
  await popup.close();
  check('after “不用了”: 7 days + 3 large downloads, then 30 days; “不再提示” ends it');

  // Files arriving together are counted once each, and the panel opens once.
  await worker.evaluate(()=>{globalThis.opened=0;});await fresh();
  const same={id:++fakeId,totalBytes:80*MB,bytesReceived:0,url:'https://files.example.test/same.zip',state:'in_progress'};
  const both=await worker.evaluate(item=>Promise.all([RuxgetOffer.note(item),RuxgetOffer.note(item)]),same);
  assert.deepEqual(both.sort(),[false,true]);assert.equal(await opened(),1);
  await fresh({asked:1,lastAnswerAt:Date.now()-8*DAY});
  await worker.evaluate(base=>Promise.all([1,2,3].map(n=>RuxgetOffer.note(Object.assign({},base,{id:base.id+n,url:base.url+n})))),{id:++fakeId*10,totalBytes:80*MB,bytesReceived:0,url:'https://files.example.test/together',state:'in_progress'});
  fakeId+=1000;
  const together=await get('ruxgetOffer');assert.equal(together.asked,2);assert.equal(await opened(),2);
  // A nearly finished file only counts.
  await fresh();assert.equal(await fake({bytesReceived:70*MB}),false);assert.equal((await get('ruxgetOffer')).asked,0);
  assert.equal(await fake({state:'complete',bytesReceived:80*MB}),false);
  check('downloads arriving together are counted once each; nearly finished files never open the panel');

  // A size the person chose on the settings page is what the card promises.
  await takeover({enabled:false,minMB:20,minChosen:true,skipHosts:[]});await fresh();assert.equal(await fake(),true);
  popup=await panel();
  assert.match(await cardText(),/以后 Chrome 里 20 MB 以上的文件也交给它/);
  await popup.close();
  await takeover({enabled:false,minMB:50,skipHosts:[]});
  check('the card follows the size chosen on the settings page');

  // First-time user, desktop installed: Chrome hasn't been allowed to talk to it yet.
  await worker.evaluate(()=>chrome.storage.session.set({offerUnpermitted:true,offerRequests:0}));
  await fresh();assert.equal(await fake(),true);
  popup=await panel();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  assert.match(await cardText(),/交给 Ruxget 桌面版[\s\S]*免费，没有广告。/);
  assert.match(await cardText(),/已经装了就直接接过去；还没装的，下一步可以下载（免费，3 MB）/);
  assert.match(await popup.locator('#desktopRowNote').innerText(),/需要配套的 Ruxget 桌面版 · 还没装？下载（3 MB）/);
  await popup.screenshot({path:path.join(report,'card-unpermitted-zh.png')});
  await popup.locator('#offerCard .offer-primary').click();
  for(let i=0;i<20&&!(await get('ruxgetTakeover')).enabled;i++)await popup.waitForTimeout(100);
  assert.equal((await get('ruxgetTakeover')).enabled,true);
  assert.equal((await worker.evaluate(()=>chrome.storage.session.get('offerRequests'))).offerRequests,1);
  await popup.close();
  await takeover({enabled:false,minMB:50,skipHosts:[]});
  check('first-time user with the desktop installed: one click asks Chrome once, then takes over');

  // First-time user without the desktop: the card turns into "下载桌面版" in place; nothing opens by itself.
  await worker.evaluate(()=>chrome.storage.session.set({offerUnpermitted:true,offerDeskMissing:true}));
  await worker.evaluate(()=>{desk.installed=false;});
  await fresh();assert.equal(await fake(),true);
  popup=await panel();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  const pagesBefore=browser.pages().length;
  await popup.locator('#offerCard .offer-primary').click();
  await popup.locator('#offerCard').getByRole('button',{name:'下载桌面版（3 MB）'}).waitFor({state:'visible'});
  assert.match(await cardText(),/还没装 Ruxget 桌面版。装好后，大文件多线程下载更快，断了能续传。免费，没有广告。/);
  assert.match(await popup.locator('#toast').innerText(),/还没装桌面版：先下载安装（免费，3 MB）/);
  assert.equal(browser.pages().length,pagesBefore);
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  assert.match(await popup.locator('#desktopRowNote').innerText(),/需要先安装桌面版（免费，3 MB） · 下载/);
  assert.equal(await popup.locator('#chromeBig').isVisible(),false);
  await popup.screenshot({path:path.join(report,'card-missing-zh.png')});
  const [tab]=await Promise.all([browser.waitForEvent('page'),popup.locator('#offerCard').getByRole('button',{name:'下载桌面版（3 MB）'}).click()]);
  assert.match(tab.url(),/hidaydream\.cloud/);await tab.close();
  assert.equal((await get('ruxgetOffer')).asked,1);
  await popup.close();
  check('first-time user without the desktop: the card becomes “下载桌面版（3 MB）” in place, and only that click opens a page');
  await worker.evaluate(()=>{desk.installed=true;return chrome.storage.session.set({offerUnpermitted:false,offerDeskMissing:false});});

  // Someone who said "不用了" to the 0.4.54 hint has been asked once already.
  await worker.evaluate(()=>chrome.storage.local.remove('ruxgetOffer').then(()=>chrome.storage.local.set({ruxgetTakeoverHint:{dismissed:true,shown:1}})));
  assert.equal((await worker.evaluate(()=>RuxgetOffer.state())).asked,1);
  await worker.evaluate(()=>chrome.storage.local.remove('ruxgetTakeoverHint'));
  check('a “不用了” to the 0.4.54 hint counts as the first time');

  // The toolbar icon's right-click entries.
  assert.equal(await worker.evaluate(async()=>{try{await chrome.contextMenus.update('ruxget-action-takeover',{checked:false});await chrome.contextMenus.update('ruxget-action-desktop',{});await RuxgetOffer.menuTitles();return true;}catch(error){return error.message;}}),true);
  await worker.evaluate(()=>RuxgetOffer.fromMenu(true));
  assert.equal((await get('ruxgetTakeover')).enabled,true);
  await worker.evaluate(()=>RuxgetOffer.fromMenu(false));
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  check('the icon’s right-click “大文件交给桌面版” turns takeover on and off');

  // The ⋯ menu, also in a short panel (Chrome sizes the panel to its content).
  await fresh({never:true});
  for(const height of [600,326]){
   popup=await panel(height);
   await popup.locator('details.menu summary').click();await popup.waitForTimeout(300);
   const menu=await popup.evaluate(()=>{const panel=document.querySelector('.menu-panel'),box=panel.getBoundingClientRect();return {items:[...panel.querySelectorAll(':scope > button')].map(b=>b.textContent.trim()),links:[...panel.querySelectorAll('.menu-links button')].map(b=>b.textContent.trim()),need:Math.ceil(box.top+panel.scrollHeight),page:document.documentElement.scrollHeight,background:getComputedStyle(panel).backgroundColor};});
   assert.deepEqual(menu.items,['打开下载文件夹','普通文件下载…','分 P 勾选下载…','暂停识别','打开 Ruxget 桌面版','安装与设置桌面版…']);
   assert.deepEqual(menu.links,['网站权限','高级工具','使用说明']);
   assert(menu.page>=menu.need,`page ${menu.page} < menu ${menu.need}`);
   assert.match(menu.background,/^rgb\(/);
   if(height===600)await popup.screenshot({path:path.join(report,'menu-zh.png')});
   await popup.locator('details.menu summary').click();await popup.waitForTimeout(200);
   assert.equal(await popup.evaluate(()=>document.body.style.minHeight),'');
   await popup.close();
  }
  check('the ⋯ menu: 6 items and one line of links; the page grows to fit it even in a short panel');

  // English.
  await set({ruxgetUiLanguage:'en'});await fresh({asked:1,lastAnswerAt:0,largeSince:3});
  assert.equal(await fake(),true);
  popup=await panel();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  assert.match(await cardText(),/Next time, Ruxget Desktop can take large files[\s\S]*Use Ruxget Desktop from now on[\s\S]*No thanks[\s\S]*Don’t ask again/);
  assert.match(await popup.locator('.desktop-row').innerText(),/Large files to Ruxget Desktop/);
  assert.doesNotMatch(await popup.locator('#offerCard').innerText()+await popup.locator('.desktop-row').innerText(),/[\u4e00-\u9fff]/);
  await popup.screenshot({path:path.join(report,'card-en.png')});
  await popup.locator('details.menu summary').click();await popup.waitForTimeout(300);
  const english=await popup.evaluate(()=>[...document.querySelectorAll('.menu-panel button')].map(b=>b.textContent.trim()));
  assert(english.includes('Install & set up Ruxget Desktop…')&&english.includes('Site access')&&english.includes('Help'),english.join('|'));
  assert(!english.some(text=>/[\u4e00-\u9fff]/.test(text)),english.join('|'));
  await popup.screenshot({path:path.join(report,'menu-en.png')});
  await popup.close();
  check('English: card, row and menu are in English');

  assert.deepEqual(errors,[]);
  check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('OFFER CHECKS PASSED '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error('FAIL',error);process.exit(1);});
