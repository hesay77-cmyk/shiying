// Download takeover in a real browser with the store edition: Chrome's copy is paused, handed over, and only removed
// when the desktop accepts it; otherwise it finishes in Chrome. The desktop reply is stubbed in the service worker.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-takeover-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const MB=1024*1024;
(async()=>{
 // Big files trickle out over a few seconds so they are still running when the extension pauses them.
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://x');
  if(url.pathname==='/')return response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}),response.end('<!doctype html><meta charset="utf-8"><title>Files</title><a id="big" href="/big.bin?n=0" download>big</a> <a id="small" href="/small.bin" download>small</a>');
  const size=url.pathname==='/big.bin'?3*MB:url.pathname==='/small.bin'?100*1024:0;
  if(!size)return response.writeHead(404),response.end();
  const range=/bytes=(\d+)-/.exec(request.headers.range||''),start=range?Number(range[1]):0;
  response.writeHead(range?206:200,{'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Content-Length':size-start,...(range?{'Content-Range':`bytes ${start}-${size-1}/${size}`}:{})});
  let sent=start;const chunk=Buffer.alloc(64*1024,7);
  const timer=setInterval(()=>{if(response.destroyed||sent>=size){clearInterval(timer);return response.end();}const piece=chunk.subarray(0,Math.min(chunk.length,size-sent));sent+=piece.length;response.write(piece);},size>MB?60:1);
  response.on('close',()=>clearInterval(timer));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:path.join(report,'downloads'),viewport:{width:900,height:900},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>{
   globalThis.nativeCalls=[];globalThis.nativeReply={ok:true,id:'job1',name:'big.bin'};globalThis.createdIds=[];
   chrome.permissions.contains=async()=>true;
   chrome.runtime.sendNativeMessage=async(host,message)=>{nativeCalls.push({host,message});await new Promise(r=>setTimeout(r,150));return nativeReply;};
   chrome.downloads.onCreated.addListener(item=>createdIds.push(item.id));
  });
  const page=await browser.newPage();await page.goto(origin+'/');
  const configure=value=>worker.evaluate(value=>chrome.storage.local.set({ruxgetTakeover:value}),value);
  const reply=value=>worker.evaluate(value=>{globalThis.nativeReply=value;},value);
  const calls=()=>worker.evaluate(()=>nativeCalls.length);
  let n=0;
  async function start(link){
   const before=await worker.evaluate(()=>createdIds.length);
   if(link==='big')await page.evaluate(n=>{document.querySelector('#big').href='/big.bin?n='+n;},++n);
   await page.click('#'+link);
   for(let i=0;i<100;i++){const ids=await worker.evaluate(()=>createdIds);if(ids.length>before)return ids.at(-1);await page.waitForTimeout(50);}
   throw new Error('download did not start');
  }
  async function settle(downloadId){
   for(let i=0;i<200;i++){const [item]=await worker.evaluate(id=>chrome.downloads.search({id}),downloadId);if(!item||item.state!=='in_progress'||item.paused&&i>60)return item||null;await page.waitForTimeout(100);}
   throw new Error('download did not settle');
  }

  // Off by default: nothing is handed over.
  assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get('ruxgetTakeover')),{});
  let item=await settle(await start('big'));
  assert.equal(item.state,'complete');assert.equal(await calls(),0);
  check('off by default: a page download finishes in Chrome and the desktop is never contacted');

  // On, desktop accepts: Chrome's copy disappears and the desktop gets the link and source page.
  await configure({enabled:true,minMB:1,skipHosts:[]});
  let downloadId=await start("big");item=await settle(downloadId);
  // Chrome reports the cancel a moment before Ruxget erases the entry; give it a couple of seconds, as a person would see it.
  for(let i=0;item&&i<40;i++){await page.waitForTimeout(100);[item]=await worker.evaluate(id=>chrome.downloads.search({id}),downloadId);item=item||null;}
  assert.equal(item,null,'the accepted download is removed from Chrome');
  const [call]=await worker.evaluate(()=>nativeCalls);
  assert.equal(call.host,'org.shiying.desktop');assert.equal(call.message.action,'takeover');assert.equal(call.message.kind,'file');
  assert.equal(call.message.url,origin+'/big.bin?n=2');assert.equal(call.message.referer,origin+'/');assert.equal(call.message.size,3*MB);
  assert(!('cookie' in call.message)&&!('cookies' in call.message));
  check('on: the download is handed over with link, source page and size (no cookies), and removed from Chrome');

  // On, desktop refuses: the paused copy resumes and completes in Chrome.
  await reply({ok:false,error:'桌面版无法直接访问这个链接，交回 Chrome 下载'});
  item=await settle(await start('big'));
  assert.equal(item.state,'complete');assert.equal(item.totalBytes,3*MB);assert.equal(fs.statSync(item.filename).size,3*MB);assert.equal(await calls(),2);
  check('desktop refuses: Chrome resumes its own copy and the complete file is saved');

  // Desktop not installed or not running: the same fallback.
  await worker.evaluate(()=>{chrome.runtime.sendNativeMessage=async()=>{nativeCalls.push({});throw new Error('Specified native messaging host not found.');};});
  item=await settle(await start('big'));
  assert.equal(item.state,'complete');assert.equal(fs.statSync(item.filename).size,3*MB);
  check('desktop missing: the download still completes in Chrome');
  await worker.evaluate(()=>{chrome.runtime.sendNativeMessage=async(host,message)=>{nativeCalls.push({host,message});return nativeReply;};});await reply({ok:true});

  // Small files and listed sites stay in Chrome.
  const callsBefore=await calls();
  item=await settle(await start('small'));assert.equal(item.state,'complete');
  await configure({enabled:true,minMB:1,skipHosts:['127.0.0.1']});
  item=await settle(await start('big'));assert.equal(item.state,'complete');
  assert.equal(await calls(),callsBefore);
  check('files under the size limit and sites on the “never take over” list stay in Chrome');

  // Downloads Ruxget itself starts (its own MP4/MP3 saves, the fallback) are never taken over.
  await configure({enabled:true,minMB:0,skipHosts:[]});
  const own=await worker.evaluate(url=>chrome.downloads.download({url}),origin+'/small.bin');
  item=await settle(own);assert.equal(item.state,'complete');assert.equal(await calls(),callsBefore);
  // The same from an extension page, e.g. “Use Chrome” in the popup's file download sheet.
  const popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  const fromPage=await popup.evaluate(url=>chrome.downloads.download({url}),origin+'/big.bin?n=page');
  item=await settle(fromPage);assert.equal(item.state,'complete');assert.equal(await calls(),callsBefore);await popup.close();
  check('downloads started by Ruxget itself (service worker or its pages) are left alone');

  const log=await worker.evaluate(()=>chrome.storage.session.get('ruxgetTakeoverLog'));
  assert.deepEqual(log.ruxgetTakeoverLog.map(entry=>entry.result),['chrome','chrome','desktop']);
  check('the last results are kept for the settings page (session only)');

  // Settings page: the switch appears once the desktop is connected and saves the choices.
  await configure({enabled:false,minMB:1,skipHosts:[]});
  await browser.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;chrome.runtime.sendNativeMessage=async()=>({ok:true,version:'0.4.51'});const contains=chrome.permissions.contains.bind(chrome.permissions);chrome.permissions.contains=async request=>request?.permissions?.includes('nativeMessaging')?true:contains(request);chrome.permissions.request=async()=>true;});
  // The popup's ⋯ menu names the feature and opens the page at the switch.
  const menuPopup=await browser.newPage();await menuPopup.goto(`chrome-extension://${id}/shiying.html`);
  await menuPopup.locator('details.menu summary').click();
  assert.equal(await menuPopup.locator('#takeoverMenu').innerText(),'接管 Chrome 下载…');
  const [opened]=await Promise.all([browser.waitForEvent('page'),menuPopup.locator('#takeoverMenu').click()]);
  await opened.waitForLoadState();assert.match(opened.url(),/shiying-desktop\.html#takeover$/);
  await opened.locator('#takeover.is-highlight').waitFor({state:'visible'});
  await opened.waitForTimeout(600);
  const box=await opened.locator('#takeover').boundingBox(),viewport=opened.viewportSize();
  assert(box.y>=0&&box.y+box.height<=viewport.height,'the switch is scrolled into view');
  await opened.screenshot({path:path.join(report,'menu-opens-switch.png')});await opened.close();
  if(!menuPopup.isClosed())await menuPopup.close();
  check('the ⋯ menu has “接管 Chrome 下载…”, which opens the page with the switch in view');
  const settings=await browser.newPage();await settings.goto(`chrome-extension://${id}/shiying-desktop.html`);
  await settings.locator('#takeover').waitFor({state:'visible'});
  assert.equal(await settings.locator('#takeoverEnabled').isChecked(),false);assert.equal(await settings.locator('#takeoverOptions').isVisible(),false);
  await settings.locator('.takeover-switch').click();
  await settings.locator('#takeoverOptions').waitFor({state:'visible'});
  await settings.locator('#takeoverMin').fill('5');await settings.locator('#takeoverMin').press('Tab');
  await settings.locator('#takeoverSkip').fill('https://Pan.Example.com/s/1\nfoo.test, bar.test');await settings.locator('#takeoverSkip').press('Tab');
  await settings.waitForTimeout(300);
  const saved=(await worker.evaluate(()=>chrome.storage.local.get('ruxgetTakeover'))).ruxgetTakeover;
  assert.deepEqual(saved,{enabled:true,minMB:5,skipHosts:['pan.example.com','foo.test','bar.test']});
  assert.equal(await settings.locator('#takeoverLog li').count(),3);
  await settings.screenshot({path:path.join(report,'settings-on.png'),fullPage:true});
  await settings.locator('.takeover-switch').click();await settings.waitForTimeout(200);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetTakeover'))).ruxgetTakeover.enabled,false);
  check('settings page: switch, size limit and site list are saved; turning it off works');

  // ⋯ → “打开 Ruxget 桌面版” asks the desktop app to show its window.
  const openPopup=async reply=>{
   const popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
   await popup.evaluate(reply=>{chrome.runtime.sendNativeMessage=async(host,message)=>{await chrome.storage.session.set({openDesktopSent:{host,message}});if(reply==='missing')throw new Error('Specified native messaging host not found.');return {ok:true,stage:'confirm'};};},reply);
   await popup.locator('details.menu summary').click();
   assert.equal(await popup.locator('.menu button').first().innerText(),'打开 Ruxget 桌面版');
   return popup;
  };
  let menuDesktop=await openPopup("ok");
  await Promise.all([menuDesktop.waitForEvent("close"),menuDesktop.locator("#openDesktop").click()]);
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.session.get('openDesktopSent'))).openDesktopSent,{host:'org.shiying.desktop',message:{action:'show'}});
  check('⋯ menu starts with “打开 Ruxget 桌面版”, which asks the desktop app to show its window and closes the popup');
  // Not installed: the prompt's “下载安装” opens the website's download section.
  await browser.route('https://hidaydream.com/**',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Ruxget</title>'}):route.fulfill({status:204}));
  menuDesktop=await openPopup("missing");await menuDesktop.locator("#openDesktop").click();
  await menuDesktop.locator("#desktopConnectPrompt").waitFor({state:'visible'});
  const [site]=await Promise.all([browser.waitForEvent("page"),menuDesktop.locator("[data-desktop-action=install]").click()]);
  await site.waitForLoadState();assert.equal(site.url(),'https://hidaydream.com/tools/ruxget/#editions');await site.close();await menuDesktop.close();
  const wizard=await browser.newPage();await wizard.goto(`chrome-extension://${id}/shiying-desktop.html`);
  assert.equal(await wizard.locator('.installer-name').getAttribute('href'),'https://hidaydream.com/tools/ruxget/#editions');await wizard.close();
  check('desktop app missing: “下载安装” and the setup page both go to the website download section');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
