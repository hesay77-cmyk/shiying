// 实际插件界面检查；原站读取真实，任务页仅用明确标注的排版样例。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version;
const run=path.join(root,'reports','2026-10-12-v'+version,'界面检查-'+Date.now());fs.mkdirSync(run,{recursive:true});
const report={version,run,errors:[],checks:[],taskScreenshot:'layout fixture only'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(action,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const result=await action();if(result)return result;await wait(200)}throw new Error('界面检查超时')}
(async()=>{
 const extension=path.join(root,'build');let context;
 try{
  context=await chromium.launchPersistentContext(path.join(run,'profile'),{channel:'chromium',executablePath:process.env.SHIYING_CHROMIUM,headless:true,proxy:{server:'http://127.0.0.1:7897'},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  context.on('page',page=>page.on('pageerror',error=>report.errors.push(error.message)));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  const video=await context.newPage();await video.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ',{waitUntil:'domcontentloaded',timeout:60000});
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id,video.url());
  const popup=await context.newPage();await popup.setViewportSize({width:440,height:660});await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
  await poll(async()=>{if(await popup.locator('#platformError').isVisible())throw new Error(await popup.locator('#platformError').innerText());return !await popup.locator('#platformAudio').isDisabled()});
  report.title=await popup.locator('#platformTitle').innerText();assert(await popup.locator('.source').isHidden());assert.equal(await popup.locator('#platformQuality').inputValue(),'1080');report.panelHeight=Math.ceil((await popup.locator('body').boundingBox()).height);assert(report.panelHeight<=360);
  async function screenshot(page,name){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const body=await page.locator('body').boundingBox();await page.screenshot({path:path.join(run,name+'.png'),clip:{x:0,y:0,width:page.viewportSize().width,height:Math.ceil(body.y+body.height)}})}
  await screenshot(popup,'主界面-440');await popup.setViewportSize({width:320,height:660});await screenshot(popup,'主界面-320');
  await popup.emulateMedia({colorScheme:'dark'});assert.equal(await popup.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');await screenshot(popup,'系统深色时仍保持白底');
  await popup.setViewportSize({width:440,height:660});await popup.locator('.menu summary').click();await screenshot(popup,'菜单');await popup.locator('.menu summary').click();
  await popup.locator('#platformQuality').focus();assert(await popup.locator('#platformQuality').evaluate(node=>getComputedStyle(node).outlineStyle!=='none'));
  const taskId='ui-layout-fixture';await worker.evaluate(async id=>chrome.storage.local.set({['shiyingJob:'+id]:{id,status:'complete',progress:100,format:'mp4',height:1080,title:'下载完成页排版样例',stage:'已保存到电脑',file:'下载/拾影/视频示例.mp4',verification:{width:1920,height:1080,audioActive:true,duration:635,bytes:274367076}}}),taskId);
  const task=await context.newPage();await task.setViewportSize({width:800,height:900});await task.goto(`chrome-extension://${id}/shiying-task.html?id=${taskId}`);await task.locator('#taskResult').waitFor({state:'visible'});await screenshot(task,'下载完成页-排版样例');await task.setViewportSize({width:320,height:900});await screenshot(task,'下载完成页-320-排版样例');
  const help=await context.newPage();await help.setViewportSize({width:800,height:1200});await help.goto(`chrome-extension://${id}/shiying-help.html`);await screenshot(help,'使用说明');
  assert.deepEqual(report.errors,[]);report.checks=['真实 YouTube 自动读取','默认 1080p 与独立 MP3 入口','避免重复网页标题','440 与 320 宽无溢出','固定白底符合用户选择','菜单与键盘焦点','完成页与说明页排版'];report.passed=true;
 }finally{if(context)await context.close();fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2))}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{report.error=error.stack;fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1});
