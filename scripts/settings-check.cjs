// Ruxget's own settings page (0.4.71, the gear in the panel), store edition. The native host is faked inside the page
// (no real desktop app is reached), Chrome's permission prompt is a fixture; nothing downloads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-settings-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
 assert.equal(manifest.options_ui.page,'ruxget-settings.html');assert(fs.existsSync(path.join(extension,'ruxget-settings.html')));
 for(const name of ['ruxget-settings.html','js/ruxget-settings.js','js/ruxget-desktop-get.js','css/ruxget-settings.css'])assert.doesNotMatch(fs.readFileSync(path.join(extension,name),'utf8'),/youtube/i,name);
 check('the store build opens ruxget-settings.html as its options page, and its files name no blocked site');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:900,height:900},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  // Pages: whether Chrome may talk to the desktop yet (granted) and the faked replies come from localStorage.
  await browser.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:')return;
   window.nativeCalls=[];window.permissionRequests=0;
   chrome.permissions.contains=async()=>localStorage.getItem('granted')==='1';
   chrome.permissions.request=async()=>{permissionRequests++;localStorage.setItem('granted','1');return true;};
   chrome.runtime.sendNativeMessage=async(host,message)=>{nativeCalls.push(message);if(localStorage.getItem('missing'))throw new Error('Specified native messaging host not found.');return message.action==='ping'?{ok:true,version:'0.4.70'}:{ok:true};};
  });
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  const url=`chrome-extension://${id}/ruxget-settings.html`;
  const page=await browser.newPage();
  const ready=async()=>{await page.goto(url);await page.waitForFunction(()=>document.querySelector('#desktopStatus').textContent.length>0&&document.querySelector('#versionText').textContent.length>0);};
  await ready();

  assert.equal(await page.title(),'Ruxget · 设置');
  assert.equal(await page.locator('input[name=desktopMode][value=never]').isChecked(),true);
  assert.equal(await page.locator('#desktopStatus').innerText(),'还没允许插件连接桌面版');
  assert.equal(await page.getByRole('button',{name:'下载桌面版',exact:true}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'已安装？连接桌面版'}).isVisible(),true);assert.equal(await page.locator('#desktopFacts').isVisible(),true);
  assert.equal(await page.locator('#saveAs').isChecked(),false);assert.equal(await page.locator('#floating').isChecked(),true);assert.equal(await page.locator('#recognize').isChecked(),true);
  assert.equal(await page.locator('input[name=language][value=zh_CN]').isChecked(),true);
  assert.equal(await page.locator('#versionText').innerText(),'版本 '+manifest.version);
  assert.equal(await page.locator('a.desktop-get').innerText(),'下载 Ruxget 桌面版（免费，3 MB）');assert.equal(await page.locator('a.desktop-get').getAttribute('href'),'https://hidaydream.cloud/desktop/?from=ext');
  assert.equal(await page.locator('#helpLink').getAttribute('href'),'shiying-help.html');assert.equal(await page.locator('#advancedLink').getAttribute('href'),'options.html');
  assert.equal(await page.locator('#sitesLink').getAttribute('href'),'shiying-help.html#site-access');
  assert.match(await page.locator('#privacyLink').getAttribute('href'),/PRIVACY\.md$/);
  assert.equal(await page.locator('#siteLink').innerText(),'Ruxget 桌面版介绍');assert.equal(await page.locator('#siteLink').getAttribute('href'),'https://hidaydream.cloud/desktop/?from=ext');assert.equal(await page.locator('#siteLink').getAttribute('target'),'_blank');
  assert.equal(await page.evaluate(()=>nativeCalls.length),0);assert.equal(await page.evaluate(()=>permissionRequests),0);
  await page.screenshot({path:path.join(report,'settings-zh.png'),fullPage:true});
  check('first visit: 从不 chosen, says Chrome isn’t allowed to talk to the desktop app yet, asks nothing and calls nothing by itself; links and version are there');

  await page.getByRole('button',{name:'已安装？连接桌面版'}).click();
  await page.waitForFunction(()=>/桌面版已连接（0\.4\.70）/.test(document.querySelector('#desktopStatus').textContent));
  assert.equal(await page.evaluate(()=>permissionRequests),1);assert.equal(await page.getByRole('button',{name:'打开桌面版'}).isVisible(),true);assert.equal(await page.locator('#desktopFacts').isVisible(),false);
  assert.equal(await page.locator('input[name=desktopMode][value=never]').isChecked(),true,'connecting changes no choice');
  check('「连接桌面版」 asks Chrome once, then shows the connected version and 「打开桌面版」');

  await page.evaluate(()=>localStorage.setItem('missing','1'));await ready();
  assert.equal(await page.locator('#desktopStatus').innerText(),'还没装桌面版（免费，3 MB）');
  const pages=browser.pages().length;await page.locator('input[name=desktopMode][value=all]').click();
  await page.waitForFunction(()=>/先安装桌面版/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.locator('input[name=desktopMode][value=never]').isChecked(),true);assert.equal(browser.pages().length,pages,'no page opens by itself');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetDesktopMode'))).ruxgetDesktopMode,undefined);
  await page.evaluate(()=>localStorage.removeItem('missing'));
  check('without the desktop app, choosing 全部 says to install it first, keeps 从不 and opens nothing');

  await ready();await page.locator('input[name=desktopMode][value=large]').check();
  await page.waitForFunction(()=>/已设为：大文件和长视频交给桌面版/.test(document.querySelector('#toast').textContent));
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetDesktopMode'))).ruxgetDesktopMode,'large');
  const panel=await browser.newPage();await panel.goto(`chrome-extension://${id}/shiying.html`);await panel.waitForTimeout(600);
  await page.locator('input[name=desktopMode][value=never]').check();await page.waitForFunction(()=>/已设为：从不交给桌面版/.test(document.querySelector('#toast').textContent));
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetDesktopMode:'all'}));await page.waitForFunction(()=>document.querySelector('input[name=desktopMode][value=all]').checked);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetDesktopMode:'never'}));await page.waitForFunction(()=>document.querySelector('input[name=desktopMode][value=never]').checked);
  check('an open settings page follows a choice made elsewhere (icon menu, desktop page, offer card)');
  check('choosing 大文件和长视频 with the desktop app connected saves it, with a quiet note on the page');

  await page.locator('#saveAs').check();await page.waitForFunction(()=>/保存时会询问文件夹/.test(document.querySelector('#toast').textContent));
  assert.equal((await worker.evaluate(()=>chrome.storage.sync.get('saveAs'))).saveAs,true);
  await panel.waitForFunction(()=>document.querySelector('#saveAs').checked);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#saveAs').checked);
  await page.locator('#saveAs').uncheck();await panel.waitForFunction(()=>!document.querySelector('#saveAs').checked);
  await page.locator('#subtitles').check();await page.waitForFunction(()=>/下载视频时会一起保存字幕/.test(document.querySelector('#toast').textContent));
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetSaveSubtitles'))).ruxgetSaveSubtitles,true);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#subtitles').checked);await page.locator('#subtitles').uncheck();
  check('「下载视频时一起保存字幕」 is saved and remembered');
  check('「每次保存时选择文件夹」 is saved, the open panel’s downloads follow it at once, and it is remembered');

  await page.locator('#recognize').uncheck();await page.waitForFunction(()=>/已暂停识别/.test(document.querySelector('#toast').textContent));
  assert.equal((await worker.evaluate(()=>chrome.storage.sync.get('enable'))).enable,false);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#versionText').textContent.length>0);assert.equal(await page.locator('#recognize').isChecked(),false);
  await page.locator('#recognize').check();await page.waitForFunction(()=>/已恢复识别/.test(document.querySelector('#toast').textContent));
  assert.equal((await worker.evaluate(()=>chrome.storage.sync.get('enable'))).enable,true);
  check('「识别网页里的视频和音频」 pauses and resumes detection');

  await page.locator('#floating').uncheck();await page.waitForFunction(()=>/已关闭网页下载浮钮/.test(document.querySelector('#toast').textContent));
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('shiyingFloating'))).shiyingFloating.hidden,true);
  await page.locator('#floating').check();assert.equal((await worker.evaluate(()=>chrome.storage.local.get('shiyingFloating'))).shiyingFloating.hidden,false);
  check('「在视频网页上显示下载浮钮」 hides and shows the page button');

  await page.locator('label:has(input[name=language][value=en])').click();
  await page.waitForFunction(()=>document.querySelector('#desktopTitle').textContent==='Hand downloads to the desktop app');
  assert.equal(await page.title(),'Ruxget · Settings');assert.equal(await page.evaluate(()=>document.documentElement.lang),'en');
  assert.equal(await page.locator('#siteLink').innerText(),'About Ruxget Desktop');
  assert.equal(await page.locator('#versionText').innerText(),'Version '+manifest.version);assert.equal(await page.locator('a.desktop-get').innerText(),'Get Ruxget Desktop (free, 3 MB)');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetUiLanguage'))).ruxgetUiLanguage,'en');
  assert.doesNotMatch((await page.locator('main').innerText()).replace('中文',''),/[一-鿿]/);
  await page.screenshot({path:path.join(report,'settings-en.png'),fullPage:true});
  await panel.reload();await panel.waitForFunction(()=>document.querySelector('#tabPage span').textContent!=='本页视频');
  assert.equal(await panel.locator('#openSettings').getAttribute('aria-label'),'Settings');await panel.close();
  await page.locator('label:has(input[name=language][value=auto])').click();await page.waitForTimeout(300);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('ruxgetUiLanguage'))).ruxgetUiLanguage,'auto');
  await page.locator('label:has(input[name=language][value=zh_CN])').click();await page.waitForFunction(()=>document.querySelector('#desktopTitle').textContent==='交给桌面版');
  check('the language choice switches the page at once and the panel follows');

  for(const width of [360,900]){await page.setViewportSize({width,height:800});await page.waitForTimeout(150);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no sideways scroll at '+width);
   await page.screenshot({path:path.join(report,'settings-'+width+'.png'),fullPage:true});}
  check('the page fits 360 and 900 px widths without sideways scrolling');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
