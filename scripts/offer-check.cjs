// Desktop offer (0.4.56) in a real browser with the store edition. The desktop app is stubbed:
// - the first ordinary Chrome download of 50 MB+ opens the panel once with one card; small files never do;
// - "不用了" waits 7 days and 3 more large downloads, then 30 days; 3 answers or "不再提示" end it;
// - "改用桌面版" turns takeover on (50 MB) and moves the running file; not installed offers the download page;
// - the "大文件交给桌面版" switch and the "改用桌面版" line for running Chrome downloads;
// - the shorter ⋯ menu, opaque, with no scrolling; Chinese and English.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-offer-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const MB=1024*1024,DAY=86400000,JOB='aaaaaaaaaaaaaaaa';
// Scheduling alone, without a browser.
{
 global.chrome={storage:{local:{},session:{}}};
 const Offer=require(path.join(root,'js','ruxget-offer.js')),now=Date.now(),s=v=>Object.assign({asked:0,lastAnswerAt:0,lastShownAt:0,largeSince:0,never:false},v);
 assert.equal(Offer.due(s({}),now),true);
 assert.equal(Offer.due(s({lastShownAt:now-2*DAY}),now),false);
 assert.equal(Offer.due(s({lastShownAt:now-3*DAY}),now),true);
 assert.equal(Offer.due(s({asked:1,lastAnswerAt:now-6*DAY,largeSince:5,lastShownAt:now-6*DAY}),now),false);
 assert.equal(Offer.due(s({asked:1,lastAnswerAt:now-7*DAY,largeSince:2,lastShownAt:now-7*DAY}),now),false);
 assert.equal(Offer.due(s({asked:1,lastAnswerAt:now-7*DAY,largeSince:3,lastShownAt:now-7*DAY}),now),true);
 assert.equal(Offer.due(s({asked:2,lastAnswerAt:now-29*DAY,largeSince:9,lastShownAt:now-29*DAY}),now),false);
 assert.equal(Offer.due(s({asked:2,lastAnswerAt:now-30*DAY,largeSince:3,lastShownAt:now-30*DAY}),now),true);
 assert.equal(Offer.due(s({asked:3,lastAnswerAt:now-400*DAY,largeSince:99}),now),false);
 assert.equal(Offer.due(s({never:true}),now),false);
 assert.equal(Offer.fits({totalBytes:49*MB,url:'https://x.test/a'}),false);
 assert.equal(Offer.fits({totalBytes:50*MB,url:'blob:https://x.test/1'}),false);
 assert.equal(Offer.fits({totalBytes:80*MB,url:'https://x.test/a',byExtensionId:'abc'}),false);
 assert.equal(Offer.fits({totalBytes:80*MB,url:'https://x.test/a',incognito:true}),false);
 assert.equal(Offer.fits({fileSize:80*MB,url:'https://x.test/a'}),true);
 delete global.chrome;
 check('pacing: first time at once; then 7 days + 3 large downloads, then 30 days; at most 3; never after "不再提示"');
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
  const stub=()=>{
   globalThis.desk={installed:true};globalThis.nativeCalls=[];globalThis.opened=0;
   chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;
   chrome.action.openPopup=async()=>{globalThis.opened++;};
   chrome.runtime.sendNativeMessage=async(host,message)=>{
    nativeCalls.push(message);
    if(!desk.installed)throw new Error('Specified native messaging host not found.');
    if(message.action==='ping')return {ok:true,version:'0.4.55'};
    if(message.action==='takeover')return {ok:true,id:'aaaaaaaaaaaaaaaa',name:message.name||'big.bin'};
    if(message.action==='status')return {ok:true,running:true,active:0,jobs:[]};
    return {ok:true};
   };
  };
  await worker.evaluate(stub);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Pages ask the same stubbed desktop; whether it is installed is read from the worker's switch.
  await browser.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;
   chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;
   chrome.runtime.sendNativeMessage=async(host,message)=>{const {offerDeskMissing}=await chrome.storage.session.get('offerDeskMissing');if(offerDeskMissing)throw new Error('Specified native messaging host not found.');return message.action==='ping'?{ok:true,version:'0.4.55'}:{ok:true,running:true,active:0,jobs:[]};};});
  const site=await browser.newPage();await site.goto(origin+'/');
  const get=key=>worker.evaluate(key=>chrome.storage.local.get(key).then(value=>value[key]),key);
  const opened=()=>worker.evaluate(()=>globalThis.opened);
  const download=async name=>{site.evaluate(url=>{const a=document.createElement('a');a.href=url;a.download='';document.body.append(a);a.click();a.remove();},origin+'/'+name).catch(()=>{});
   return worker.evaluate(async name=>{for(let i=0;i<100;i++){const found=(await chrome.downloads.search({})).find(item=>(item.url||'').endsWith('/'+name));if(found&&found.totalBytes)return found.id;await new Promise(r=>setTimeout(r,100));}return null;},name);};
  const settle=()=>site.waitForTimeout(600);
  const panel=async()=>{const page=await browser.newPage();await page.setViewportSize({width:360,height:600});await page.goto(`chrome-extension://${id}/shiying.html`);await page.waitForTimeout(1200);return page;};

  await download('small.bin');await settle();
  assert.equal(await opened(),0);assert.equal(await get('ruxgetOfferCard'),undefined);
  check('a small Chrome download offers nothing');

  const big1=await download('big1.bin');await settle();
  assert.equal(await opened(),1);
  const card=await get('ruxgetOfferCard');assert.equal(card.id,big1);assert.equal(card.size,60*MB);
  await download('big2.bin');await settle();
  assert.equal(await opened(),1);
  check('the first large Chrome download opens the panel once; another one the same day does not');

  let popup=await panel();
  const cardText=()=>popup.locator('#offerCard').innerText();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  assert.match(await cardText(),/正在用 Chrome 下载 \S+（60 MB）。交给桌面版：多线程更快，断了能续传。/);
  assert.match(await cardText(),/改用桌面版[\s\S]*不用了/);assert.doesNotMatch(await cardText(),/不再提示/);
  assert.match(await cardText(),/以后 50 MB 以上的也交给它/);
  await popup.waitForTimeout(400);
  assert.equal(await popup.locator('#chromeBig li').count(),1);
  assert.doesNotMatch(await popup.locator('#chromeBig').innerText(),new RegExp((await popup.locator('#offerCard .offer-name').innerText()).split('（')[0]));
  await popup.screenshot({path:path.join(report,'card-zh.png')});
  check('the card names the running file and offers “改用桌面版” or “不用了”');
  await popup.locator('#offerCard').getByRole('button',{name:'改用桌面版'}).click();
  await popup.locator('#offerCard').waitFor({state:'hidden'});
  assert.deepEqual(await get('ruxgetTakeover'),{skipHosts:[],enabled:true,minMB:50});
  const taken=await worker.evaluate(()=>nativeCalls.filter(call=>call.action==='takeover').map(call=>call.url));
  assert.deepEqual(taken,[origin+'/big1.bin']);
  for(let i=0;i<30&&(await worker.evaluate(id=>chrome.downloads.search({id}),big1)).length;i++)await site.waitForTimeout(100);
  assert.equal((await worker.evaluate(id=>chrome.downloads.search({id}),big1)).length,0);
  assert.match(await popup.locator('#toast').innerText(),/已交给桌面版。以后 Chrome 里 50 MB 以上的文件也交给它/);
  assert.equal((await get('ruxgetOffer')).asked,1);
  assert.equal(await popup.locator('#desktopTakeover').isChecked(),true);
  assert.match(await popup.locator('#desktopRowNote').innerText(),/Chrome 里 50 MB 以上的文件会交给桌面版 · 设置/);
  await popup.screenshot({path:path.join(report,'row-on-zh.png')});
  await popup.close();
  check('“改用桌面版” turns takeover on at 50 MB and moves the running file to the desktop');

  // Takeover on: large files go straight to the desktop and nothing is offered.
  await worker.evaluate(()=>{globalThis.opened=0;});
  await download('big3.bin');await settle();
  assert.equal(await opened(),0);
  check('with takeover on, nothing is offered');

  // Switch off and on from the row.
  popup=await panel();
  await popup.locator('.desktop-switch').click();
  for(let i=0;i<20&&(await get('ruxgetTakeover')).enabled;i++)await popup.waitForTimeout(100);
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  assert.match(await popup.locator('#toast').innerText(),/已关闭/);
  await popup.waitForTimeout(400);
  assert.equal(await popup.locator('#desktopTakeover').isChecked(),false);
  // Running large Chrome downloads now show "改用桌面版".
  await popup.locator('#chromeBig li').first().waitFor({state:'visible'});
  assert.match(await popup.locator('#chromeBig').innerText(),/Chrome 正在下载 \S+（60 MB）[\s\S]*改用桌面版/);
  await popup.screenshot({path:path.join(report,'row-off-zh.png')});
  await popup.locator('#chromeBig li').first().getByRole('button',{name:'改用桌面版'}).click();
  for(let i=0;i<30&&!(await worker.evaluate(()=>nativeCalls.some(call=>call.action==='takeover'&&call.url.endsWith('/big2.bin'))));i++)await popup.waitForTimeout(100);
  assert(await worker.evaluate(()=>nativeCalls.some(call=>call.action==='takeover'&&call.url.endsWith('/big2.bin'))));
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  for(let i=0;i<30&&!/已交给桌面版/.test(await popup.locator('#toast').innerText());i++)await popup.waitForTimeout(100);
  assert.match(await popup.locator('#toast').innerText(),/^已交给桌面版$/);
  await popup.waitForTimeout(300);
  await popup.locator('.desktop-switch').click();
  for(let i=0;i<20&&!(await get('ruxgetTakeover')).enabled;i++)await popup.waitForTimeout(100);
  assert.deepEqual(await get('ruxgetTakeover'),{skipHosts:[],enabled:true,minMB:50});
  await popup.close();
  check('the row switch turns takeover off and on; a running Chrome download moves with “改用桌面版”');

  // The second offer: 7 days and 3 more large downloads after "不用了"; then "不再提示" appears.
  const old=Date.now()-8*DAY;
  await worker.evaluate(old=>chrome.storage.local.set({ruxgetTakeover:{enabled:false,minMB:50,skipHosts:[]},ruxgetOffer:{asked:1,lastAnswerAt:old,lastShownAt:old,largeSince:0,never:false}}),old);
  await worker.evaluate(()=>{globalThis.opened=0;});
  const fake=n=>worker.evaluate(n=>RuxgetOffer.note({id:9000+n,totalBytes:80*1024*1024,url:'https://files.example.test/f'+n+'.zip',filename:'C:\\D\\f'+n+'.zip',state:'in_progress'}),n);
  assert.equal(await fake(1),false);assert.equal(await fake(2),false);assert.equal(await fake(3),true);
  assert.equal(await opened(),1);assert.equal((await get('ruxgetOffer')).largeSince,3);
  popup=await panel();
  assert.match(await cardText(),/刚才用 Chrome 下载了 f3\.zip|f3\.zip/);
  assert.match(await cardText(),/不用了[\s\S]*不再提示/);
  await popup.locator('#offerCard').getByRole('button',{name:'不用了'}).click();
  await popup.locator('#offerCard').waitFor({state:'hidden'});
  const second=await get('ruxgetOffer');assert.equal(second.asked,2);assert.equal(second.largeSince,0);
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  await popup.close();
  assert.equal(await fake(4),false);
  check('after “不用了”, the next offer needs 7 days and 3 large downloads, and adds “不再提示”');
  await worker.evaluate(old=>chrome.storage.local.set({ruxgetOffer:{asked:2,lastAnswerAt:old,lastShownAt:old,largeSince:2,never:false}}),Date.now()-31*DAY);
  assert.equal(await fake(5),true);
  popup=await panel();
  await popup.locator('#offerCard').getByRole('button',{name:'不再提示'}).click();
  await popup.locator('#offerCard').waitFor({state:'hidden'});
  assert.equal((await get('ruxgetOffer')).never,true);
  await popup.close();
  await worker.evaluate(old=>chrome.storage.local.set({ruxgetOffer:Object.assign({},{asked:3,lastAnswerAt:old,lastShownAt:old,largeSince:9,never:true})}),Date.now()-400*DAY);
  assert.equal(await fake(6),false);
  check('“不再提示” or a third answer ends the automatic offer for good');

  // Not installed: the card offers the download page; the row says it is needed.
  await worker.evaluate(()=>{desk.installed=false;return chrome.storage.session.set({offerDeskMissing:true});});
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetOffer:{asked:0,lastAnswerAt:0,lastShownAt:0,largeSince:0,never:false}}));
  assert.equal(await fake(7),true);
  popup=await panel();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  assert.match(await cardText(),/大文件可以用 Ruxget 桌面版下载：多线程更快，断了能续传。免费，没有广告。/);
  assert.match(await cardText(),/下载桌面版（3 MB）[\s\S]*不用了/);
  assert.match(await popup.locator('#desktopRowNote').innerText(),/需要先安装桌面版（免费，3 MB） · 安装/);
  assert.equal(await popup.locator('#chromeBig').isVisible(),false);
  await popup.screenshot({path:path.join(report,'card-missing-zh.png')});
  const [tab]=await Promise.all([browser.waitForEvent('page'),popup.locator('#offerCard').getByRole('button',{name:'下载桌面版（3 MB）'}).click()]);
  await tab.waitForLoadState('domcontentloaded').catch(()=>{});
  assert.match(tab.url(),/hidaydream\.cloud\/\?from=ext|hidaydream\.cloud/);await tab.close();
  assert.equal((await get('ruxgetOffer')).asked,1);
  await popup.close();
  check('without the desktop app, the card and the row offer the download page instead');
  await worker.evaluate(()=>{desk.installed=true;return chrome.storage.session.remove('offerDeskMissing');});

  // The toolbar icon's right-click entry.
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetTakeover:{enabled:false,minMB:50,skipHosts:[]}}));
  // Both entries exist in the icon's menu (update fails for an id that was never created).
  assert.equal(await worker.evaluate(async()=>{try{await chrome.contextMenus.update('ruxget-action-takeover',{checked:false});await chrome.contextMenus.update('ruxget-action-desktop',{});return true;}catch(error){return error.message;}}),true);
  await worker.evaluate(()=>RuxgetOffer.fromMenu(true));
  assert.equal((await get('ruxgetTakeover')).enabled,true);
  await worker.evaluate(()=>RuxgetOffer.fromMenu(false));
  assert.equal((await get('ruxgetTakeover')).enabled,false);
  check('the icon’s right-click “大文件交给桌面版” turns takeover on and off');

  // The ⋯ menu: six items and one line of small links, opaque, no scrolling.
  popup=await panel();
  await popup.locator('details.menu summary').click();await popup.waitForTimeout(300);
  const menu=await popup.evaluate(()=>{const panel=document.querySelector('.menu-panel'),box=panel.getBoundingClientRect();return {items:[...panel.querySelectorAll(':scope > button')].map(b=>b.textContent.trim()),links:[...panel.querySelectorAll('.menu-links button')].map(b=>b.textContent.trim()),height:Math.round(box.height),scroll:panel.scrollHeight>panel.clientHeight+1,background:getComputedStyle(panel).backgroundColor};});
  assert.deepEqual(menu.items,['打开下载文件夹','普通文件下载…','分 P 勾选下载…','暂停识别','打开 Ruxget 桌面版','桌面版设置…']);
  assert.deepEqual(menu.links,['网站权限','高级工具','使用说明']);
  assert(menu.height<=300,'menu height '+menu.height);assert.equal(menu.scroll,false);
  assert.match(menu.background,/^rgb\(/);
  await popup.screenshot({path:path.join(report,'menu-zh.png')});
  const [settings]=await Promise.all([browser.waitForEvent('page'),popup.locator('#desktopHelp').click()]);
  assert.match(settings.url(),/shiying-desktop\.html$/);await settings.close();
  await popup.close();
  check('the ⋯ menu has 6 items and one line of links, about '+menu.height+' px, opaque, no scrolling');

  // English.
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en',ruxgetOffer:{asked:1,lastAnswerAt:0,lastShownAt:0,largeSince:3,never:false}}));
  assert.equal(await fake(8),true);
  popup=await panel();
  await popup.locator('#offerCard').waitFor({state:'visible'});
  assert.match(await cardText(),/Chrome is downloading f8\.zip \(|f8\.zip/);
  assert.match(await cardText(),/Chrome just downloaded f8\.zip \(80 MB\)[\s\S]*Use it from now on[\s\S]*No thanks[\s\S]*Don’t ask again/);
  assert.match(await popup.locator('.desktop-row').innerText(),/Large files to Ruxget Desktop/);
  await popup.screenshot({path:path.join(report,'card-en.png')});
  await popup.locator('details.menu summary').click();await popup.waitForTimeout(300);
  const english=await popup.evaluate(()=>[...document.querySelectorAll('.menu-panel button')].map(b=>b.textContent.trim()));
  assert(english.includes('Desktop app settings…')&&english.includes('Site access')&&english.includes('Help'),english.join('|'));
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
