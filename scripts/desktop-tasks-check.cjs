// Light takeover (0.4.54) in a real browser with the store edition. The desktop app is stubbed in the service worker:
// - the toolbar icon shows "↓N" on every tab while the desktop downloads, "✓" briefly when it finishes, then each tab's
//   own media count again;
// - "最近下载" lists the handed-over desktop tasks with progress, and deletes them after an inline confirm;
// No window or pop-up is ever opened. (The desktop offer that replaced the 0.4.54 hint is checked in offer-check.cjs.)
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-desktop-tasks-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
const A='aaaaaaaaaaaaaaaa',B='bbbbbbbbbbbbbbbb',C='cccccccccccccccc',MB=1024*1024;
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>{
   globalThis.calls=[];
   globalThis.desk={running:true,jobs:[]};
   chrome.permissions.contains=async()=>true;
   chrome.runtime.sendNativeMessage=async(host,message)=>{
    calls.push(message);
    if(message.action==='ping')return {ok:true,version:'0.4.53'};
    if(message.action==='status'){const ids=message.ids||[];const shown=desk.jobs.filter(job=>ids.includes(job.id)||desk.running&&job.state==='active');
     return {ok:true,running:desk.running,active:desk.running?desk.jobs.filter(job=>job.state==='active').length:0,jobs:shown.map(job=>Object.assign({},job,{state:!desk.running&&job.state==='active'?'paused':job.state,speed:desk.running?job.speed:''}))};}
    if(message.action==='forget'){desk.jobs=desk.jobs.filter(job=>job.id!==message.id);return {ok:true,id:message.id};}
    return {ok:true};
   };
  });
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Pages see the same stubbed desktop (they ask the worker, and "show" goes straight to the desktop).
  await browser.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;chrome.permissions.contains=async()=>true;globalThis.shown=0;chrome.runtime.sendNativeMessage=async(host,message)=>{if(message?.action==='show')globalThis.shown++;return {ok:true};};});
  const site=await browser.newPage();await site.goto('about:blank');
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(tab=>tab.url==='about:blank').id);
  const badge=tab=>worker.evaluate(tab=>chrome.action.getBadgeText(tab===undefined?{}:{tabId:tab}),tab);
  // The sniffer's own count on this tab before anything is handed over.
  await worker.evaluate(tab=>{cacheData[tab]=[{},{}];SetIcon({number:2,tabId:tab});},tabId);
  assert.equal(await badge(tabId),'2');

  // Two handed-over tasks: one downloading, one finished.
  await worker.evaluate(({A,B})=>{desk.jobs=[{id:A,title:'系统镜像.iso',state:'active',progress:45.2,speed:'3.2 MB/s',error:''},{id:B,title:'安装包.zip',state:'done',progress:100,speed:'',error:''}];},{A,B});
  await worker.evaluate(async({A,B})=>{await RuxgetDesktopTasks.remember(B,'安装包.zip');await RuxgetDesktopTasks.remember(A,'系统镜像.iso');},{A,B});
  for(let i=0;i<40&&await badge(tabId)!=='↓1';i++)await site.waitForTimeout(100);
  assert.equal(await badge(tabId),'↓1');assert.equal(await badge(),'↓1');
  await worker.evaluate(tab=>SetIcon({number:3,tabId:tab}),tabId);assert.equal(await badge(tabId),'↓1');
  check('while the desktop downloads, the icon shows ↓1 on every tab, over the media count');
  const statusCalls=await worker.evaluate(()=>calls.filter(call=>call.action==='status'));
  assert(statusCalls.length>=1&&statusCalls.every(call=>!('chromeFolder' in call)));
  assert.equal(await worker.evaluate(()=>calls.some(call=>call.action==='show')),false);
  check('progress is read with “status” only; the desktop window is never opened by itself');

  // Popup (0.4.69): nothing to download on this page, so it opens on 已下载, which counts the running download.
  let popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  const item=job=>popup.locator(`#recentList li[data-id="${job}"]`);
  await item(A).waitFor({state:'visible'});
  assert.equal(await popup.evaluate(()=>document.body.dataset.view),'downloads');assert.equal(await popup.locator('#tabDownloads .tab-count').innerText(),'1');
  assert.match(await item(A).innerText(),/系统镜像\.iso[\s\S]*桌面版 · 45% · 3\.2 MB\/s/);
  assert.equal(await item(A).locator('.recent-bar').count(),1);
  assert.match(await item(B).innerText(),/安装包\.zip[\s\S]*桌面版 · 下载完成/);
  assert.equal(await popup.locator('#recentList li').first().getAttribute('data-id'),A);
  await popup.screenshot({path:path.join(report,'popup-zh.png')});
  check('“最近下载” opens by itself and shows the desktop tasks with progress, running first');
  // Progress moves without reopening.
  await worker.evaluate(A=>{desk.jobs.find(job=>job.id===A).progress=71;},A);
  for(let i=0;i<40&&!/71%/.test(await item(A).innerText());i++)await popup.waitForTimeout(100);
  assert.match(await item(A).innerText(),/71%/);
  check('progress updates live while the popup is open');
  await item(A).locator('.recent-open').click();
  assert.equal(await popup.evaluate(()=>globalThis.shown),1);
  check('clicking a desktop task shows it in the desktop window (only on click)');

  // Delete the finished one, keep its file.
  await item(B).locator('.recent-delete').click();
  assert.match(await item(B).innerText(),/删除「[^」]+」？[\s\S]*删除文件[\s\S]*只移除记录[\s\S]*取消/);
  await item(B).getByRole('button',{name:'只移除记录'}).click();await item(B).waitFor({state:'detached'});
  let forget=await worker.evaluate(()=>calls.filter(call=>call.action==='forget'));
  assert.deepEqual(forget.map(call=>[call.id,call.deleteFiles]),[[B,false]]);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetDesktopJobs'))).ruxgetDesktopJobs.some(entry=>entry.id===B),false);
  check('a finished desktop task: “只移除记录” keeps the file');
  // Stop and delete the running one.
  await item(A).locator('.recent-delete').click();
  assert.match(await item(A).innerText(),/停止并删除「[^」]+」？/);
  await popup.screenshot({path:path.join(report,'confirm-zh.png')});
  await item(A).getByRole('button',{name:'停止并删除'}).click();await item(A).waitFor({state:'detached'});
  forget=await worker.evaluate(()=>calls.filter(call=>call.action==='forget'));
  assert.deepEqual(forget.at(-1),{action:'forget',id:A,deleteFiles:true});
  for(let i=0;i<40&&await badge(tabId)!=='2';i++)await popup.waitForTimeout(100);
  assert.equal(await badge(tabId),'2');
  check('a running desktop task: “停止并删除” deletes it, and the tab gets its media count back (no ✓)');
  await popup.close();

  // Finishing: ✓ for a few seconds, then the media count again.
  await worker.evaluate(C=>{desk.jobs=[{id:C,title:'视频合集.zip',state:'active',progress:90,speed:'1 MB/s',error:''}];return RuxgetDesktopTasks.remember(C,'视频合集.zip');},C);
  for(let i=0;i<40&&await badge(tabId)!=='↓1';i++)await site.waitForTimeout(100);
  await worker.evaluate(C=>{Object.assign(desk.jobs.find(job=>job.id===C),{state:'done',progress:100,speed:''});},C);
  for(let i=0;i<40&&await badge(tabId)!=='✓';i++)await site.waitForTimeout(100);
  assert.equal(await badge(tabId),'✓');
  await site.waitForTimeout(6500);
  assert.equal(await badge(tabId),'2');assert.equal(await badge(),'');
  check('a finished download shows ✓ for a few seconds, then the media count returns');

  // A desktop that stops answering: the count stays briefly, then clears instead of getting stuck.
  await worker.evaluate(C=>{desk.running=true;desk.jobs=[{id:C,title:'视频合集.zip',state:'active',progress:40,speed:'1 MB/s',error:''}];return RuxgetDesktopTasks.watch(0);},C);
  for(let i=0;i<40&&await badge(tabId)!=='↓1';i++)await site.waitForTimeout(100);
  assert.equal(await badge(tabId),'↓1');
  await worker.evaluate(()=>{globalThis.realNative=chrome.runtime.sendNativeMessage;chrome.runtime.sendNativeMessage=async()=>{throw new Error('Native host has exited.');};});
  await site.waitForTimeout(4000);assert.equal(await badge(tabId),'↓1');
  for(let i=0;i<250&&await badge(tabId)!=='2';i++)await site.waitForTimeout(100);
  assert.equal(await badge(tabId),'2');
  await worker.evaluate(()=>{chrome.runtime.sendNativeMessage=globalThis.realNative;});
  check('if the desktop stops answering, the count clears after a few tries instead of getting stuck');

  // Desktop closed: tasks still listed (from its saved list), nothing counts as running.
  await worker.evaluate(C=>{desk.running=false;desk.jobs=[{id:C,title:'视频合集.zip',state:'active',progress:50,speed:'1 MB/s',error:''}];},C);
  await worker.evaluate(()=>RuxgetDesktopTasks.poll());
  assert.equal(await badge(tabId),'2');
  popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  await popup.locator('#tabDownloads').click();
  await item(C).waitFor({state:'visible'});assert.match(await item(C).innerText(),/桌面版 · 已暂停 · 50%/);
  check('with the desktop app closed, its task shows as paused and the icon shows no count');
  await popup.close();

  // English.
  await worker.evaluate(({A})=>{desk.running=true;desk.jobs=[{id:A,title:'disk-image.iso',state:'active',progress:12,speed:'5 MB/s',error:''}];return Promise.all([chrome.storage.local.set({ruxgetUiLanguage:'en'}),RuxgetDesktopTasks.remember(A,'disk-image.iso')]);},{A});
  popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  await item(A).waitFor({state:'visible'});
  assert.match(await item(A).innerText(),/Desktop · 12% · 5 MB\/s/);
  await item(A).locator('.recent-delete').click();assert.match(await item(A).innerText(),/Stop and delete “[^”]+”\?/);
  await popup.screenshot({path:path.join(report,'popup-en.png')});
  check('English: desktop tasks and the confirm are in English');
  await popup.close();

  assert.deepEqual(errors,[]);
  check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));
  console.log('DESKTOP TASK CHECKS PASSED '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error);process.exit(1);});
