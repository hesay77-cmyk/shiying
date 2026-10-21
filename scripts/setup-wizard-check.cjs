// Desktop setup wizard states with a faked chrome API. No native host, network or real permission prompt.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-wizard-check-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true});
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:900,height:900}});
  await context.addInitScript(()=>{
   // mode: permission | missing | forbidden | ready — kept in sessionStorage so a test can flip it mid-page.
   const mode=()=>sessionStorage.getItem('mode')||'permission';
   window.requests=0;window.pings=0;
   window.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',getURL:x=>x,sendNativeMessage:async()=>{pings++;const m=mode();if(m==='missing')throw new Error('Specified native messaging host not found.');if(m==='forbidden')throw new Error('Access to the specified native messaging host is forbidden.');return {ok:true,version:'0.4.47'};}},
    permissions:{contains:async()=>mode()!=='permission',request:async()=>{requests++;if(mode()==='permission')sessionStorage.setItem('mode',sessionStorage.getItem('afterGrant')||'missing');return true;}},tabs:{create:async()=>{}}};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url=pathToFileURL(path.join(root,'shiying-desktop.html')).href;
  const step=()=>page.evaluate(()=>document.body.dataset.step);
  const current=()=>page.evaluate(()=>document.querySelector('.wizard-steps .is-current')?.dataset.step);
  const visiblePanels=()=>page.evaluate(()=>[...document.querySelectorAll('.wizard-panel')].filter(p=>!p.hidden).map(p=>p.dataset.panel));
  const open=async(mode,extra={})=>{await page.goto(url);await page.evaluate(([m,e])=>{sessionStorage.clear();sessionStorage.setItem('mode',m);for(const [k,v] of Object.entries(e))sessionStorage.setItem(k,v);},[mode,extra]);await page.reload();await page.waitForFunction(()=>document.body.dataset.step!=='checking');};
  const shot=async name=>{await page.waitForTimeout(450);await page.screenshot({path:path.join(report,name+'.png'),fullPage:true});};

  await open('permission');
  assert.equal(await step(),'install');assert.equal(await current(),'install');assert.deepEqual(await visiblePanels(),['install']);
  assert.equal(await page.evaluate(()=>requests),0);assert.equal(await page.evaluate(()=>pings),0);
  assert.equal(await page.locator('.installer-name').getAttribute('href'),'https://hidaydream.com/tools/ruxget/#editions');
  await shot('install');
  check('first visit shows only step 1 with the installer link, without asking for permission');

  await page.locator('#checkDesktopConnection').click();await page.waitForFunction(()=>requests===1&&pings>0);
  assert.equal(await step(),'install');assert.match(await page.locator('#desktopConnectionStatus').innerText(),/还没检测到桌面版/);
  await page.evaluate(()=>sessionStorage.setItem('mode','ready'));
  await page.waitForFunction(()=>document.body.dataset.step==='done',null,{timeout:8000});
  assert.equal(await page.locator('#desktopVersion').innerText(),'v0.4.47');
  check('"我已经装好了" asks once; finishing the installer later advances to done on its own');

  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.wizard-steps li')].map(li=>li.className)),['is-done','is-done','is-done is-current']);
  assert.equal(await page.locator('.wizard-steps [aria-current=step]').getAttribute('data-step'),'done');
  await shot('done');
  check('done step marks steps 1 and 2 complete and shows the version');
  const before=await page.evaluate(()=>pings);await page.waitForTimeout(3500);assert.equal(await page.evaluate(()=>pings),before);
  check('polling stops once connected');

  await open('forbidden');
  assert.equal(await step(),'connect');assert.deepEqual(await visiblePanels(),['connect']);
  assert.equal(await page.locator('#pairDesktop').getAttribute('href'),'shiying-desktop://pair/abcdefghijklmnopabcdefghijklmnop');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.wizard-steps li')].map(li=>li.className)),['is-done','is-current','']);
  await shot('connect');
  await page.evaluate(()=>sessionStorage.setItem('mode','ready'));await page.waitForFunction(()=>document.body.dataset.step==='done',null,{timeout:8000});
  check('installed but unpaired shows step 2 with the pairing link, then advances after pairing');

  await open('permission',{afterGrant:'forbidden'});await page.locator('#checkDesktopConnection').click();
  await page.waitForFunction(()=>document.body.dataset.step==='connect');
  check('granting permission on an installed but unpaired app goes straight to step 2');

  await open('missing');assert.equal(await step(),'install');assert.match(await page.locator('#desktopConnectionStatus').innerText(),/等待安装/);
  check('permission already granted but app missing waits on step 1');

  await open('ready');assert.equal(await step(),'done');
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);await shot('done-'+width);}
  await open('permission');for(const width of [360,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('install-'+width);}
  check('wizard fits 360 / 768 / 1280 widths without horizontal scroll');

  await page.setViewportSize({width:900,height:900});await page.locator('#troubleshooting summary').click();assert(await page.locator('#troubleshooting h3').first().isVisible());
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.wizard-more details')].filter(d=>d.open).length),1);
  await shot('help-open');
  check('reference help stays folded until opened');

  assert.equal(await page.locator('#desktopExtensionId').textContent(),'abcdefghijklmnopabcdefghijklmnop');
  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
