// The on-page floating panel in English: no visible Chinese apart from the fixture video title.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-floating-en-'));
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true});
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f6f8fc}main{padding:24px}video{display:block;width:100%;max-width:640px;aspect-ratio:16/9;background:#172942}</style><main><video></video></main>'}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const r=attach.call(this,options);if(this.id==='shiying-video-shortcut')window.floatingRoot=r;return r;};
   window.RuxgetI18n={pick:(zh,en)=>en,getLang:()=>'en',t:()=>'Open folder'};
   let mode='read';window.setMode=m=>{mode=m;};
   window.chrome={storage:{sync:{get:async()=>({enable:true}),set:async()=>{}},local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener(){},removeListener(){}}},runtime:{id:'a'.repeat(32),sendMessage:async message=>{
    if(message.Message==='shiyingFloatingRead'){if(mode==='fail')return {ok:false,error:'原站暂时没有返回视频，请稍后重新读取'};return {ok:true,id:'fixture',title:'本地清晰度样例',choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};}
    if(message.Message==='shiyingFloatingStart')return {ok:true,id:'job',title:'本地清晰度样例',status:'downloading',stage:'正在合并画面与声音',progress:40};
    return {ok:true};}}};
  });
  await page.goto('https://www.bilibili.com/video/BV15z4y1U7HS/');
  await page.addScriptTag({path:path.join(root,'js/shiying-text.js')});await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});
  const video=await page.locator('video').boundingBox();await page.mouse.move(video.x+video.width/2,video.y+video.height/2);
  await page.locator('#shiying-video-shortcut').waitFor({state:'visible'});
  const chinese=()=>page.evaluate(()=>{const r=window.floatingRoot,out=[];const walk=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let n;while((n=walk.nextNode())){const t=n.textContent.trim();const el=n.parentElement;if(t&&/[\u3400-\u9fff]/.test(t)&&el&&!el.closest('[hidden]')&&!/本地清晰度样例/.test(t))out.push(t);}for(const el of r.querySelectorAll('[title],[aria-label]'))for(const a of ['title','aria-label']){const v=el.getAttribute(a);if(v&&/[\u3400-\u9fff]/.test(v)&&!/本地清晰度样例/.test(v))out.push('@'+a+': '+v);}return out;});
  // The panel ignores synthetic clicks, so click real screen coordinates inside the closed shadow root.
  const clickIn=async selector=>{const r=await page.evaluate(sel=>{const b=window.floatingRoot.querySelector(sel).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};},selector);await page.mouse.click(r.x,r.y);};
  const open=async()=>{await clickIn('.open');await page.waitForFunction(()=>!window.floatingRoot.querySelector('.panel').hidden);await page.waitForTimeout(250);};
  await open();await page.waitForFunction(()=>window.floatingRoot.querySelectorAll('.options button').length>0);
  let found=await chinese();await page.screenshot({path:path.join(report,'panel-choices.png')});assert.deepEqual(found,[],'choices panel: '+found.join(' | '));
  assert.match(await page.evaluate(()=>window.floatingRoot.querySelector('.hide').textContent),/Hide/);
  await clickIn('.options button');await page.waitForFunction(()=>/Merging video and audio/.test(window.floatingRoot.querySelector('.note').textContent));
  found=await chinese();await page.screenshot({path:path.join(report,'panel-job.png')});assert.deepEqual(found,[],'job panel: '+found.join(' | '));
  assert.deepEqual(errors,[]);
  console.log('FLOATING ENGLISH PASSED '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
