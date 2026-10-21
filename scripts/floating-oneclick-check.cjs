// Floating button one-click mode: off by default; when on, a click downloads with the remembered format and quality.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-oneclick-'));
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true});
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main style="padding:24px"><video style="display:block;width:640px;height:360px;background:#172942"></video></main>'}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const r=attach.call(this,options);if(this.id==='shiying-video-shortcut')window.floatingRoot=r;return r;};
   // Persistent fake storage so the toggle and the remembered preference survive across calls.
   const local=JSON.parse(sessionStorage.getItem('local')||'{}'),listeners=[];window.sent=[];
   const save=()=>sessionStorage.setItem('local',JSON.stringify(local));
   window.chrome={storage:{sync:{get:async()=>({enable:true,saveAs:false}),set:async()=>{}},local:{get:async key=>key in local?{[key]:local[key]}:{},set:async values=>{for(const [k,v] of Object.entries(values)){const old=local[k];local[k]=v;listeners.forEach(f=>f({[k]:{oldValue:old,newValue:v}},'local'));}save();}},onChanged:{addListener:f=>listeners.push(f),removeListener(){}}},
    runtime:{id:'a'.repeat(32),sendMessage:async message=>{sent.push(message);
     if(message.Message==='shiyingFloatingRead')return {ok:true,id:'fixture',title:'本地清晰度样例',choices:[{height:1080,label:'1080p'},{height:720,label:'720p'},{height:480,label:'480p'}],audioAvailable:true};
     if(message.Message==='shiyingFloatingStart')return {ok:true,id:'job',title:'本地清晰度样例',status:'downloading',stage:'正在准备下载',progress:1};
     return {ok:true};}}};
  });
  await page.goto('https://www.bilibili.com/video/BV15z4y1U7HS/');
  await page.addScriptTag({path:path.join(root,'js/shiying-floating.js')});
  const video=await page.locator('video').boundingBox();await page.mouse.move(video.x+video.width/2,video.y+video.height/2);
  await page.locator('#shiying-video-shortcut').waitFor({state:'visible'});
  const clickIn=async selector=>{const r=await page.evaluate(sel=>{const b=window.floatingRoot.querySelector(sel).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};},selector);await page.mouse.click(r.x,r.y);};
  const starts=()=>page.evaluate(()=>sent.filter(m=>m.Message==='shiyingFloatingStart'));

  // Off by default: a click opens the options, nothing starts.
  await clickIn('.open');await page.waitForFunction(()=>!window.floatingRoot.querySelector('.panel').hidden);
  assert.equal(await page.evaluate(()=>window.floatingRoot.querySelector('.one-click').checked),false);assert.equal((await starts()).length,0);
  await page.waitForFunction(()=>window.floatingRoot.querySelectorAll('.options button').length>0);
  await page.screenshot({path:path.join(report,'panel-with-toggle.png')});
  console.log('PASS one-click is off by default and the panel shows the toggle');

  // Turn it on, remember MP3 / 720p, close the panel.
  await clickIn('.one-click');await page.waitForFunction(()=>window.floatingRoot.querySelector('.one-click').checked);
  await page.evaluate(()=>chrome.storage.local.set({shiyingVideoPreference:{format:'mp4',height:720}}));
  await clickIn('.open');await page.waitForFunction(()=>window.floatingRoot.querySelector('.panel').hidden);
  assert.match(await page.evaluate(()=>window.floatingRoot.querySelector('.open').title),/一键下载/);

  // A click now downloads directly at the remembered quality.
  await clickIn('.open');await page.waitForFunction(()=>sent.some(m=>m.Message==='shiyingFloatingStart'));
  assert.deepEqual((await starts()).map(m=>[m.format,m.height]),[['mp4',720]]);
  assert.equal(await page.evaluate(()=>window.floatingRoot.querySelector('.panel').hidden),true);
  console.log('PASS one-click downloads with the remembered format and quality without opening the panel');

  // While a download runs, a click opens the panel again so the toggle can be switched off.
  await clickIn('.open');await page.waitForFunction(()=>!window.floatingRoot.querySelector('.panel').hidden);
  assert.equal((await starts()).length,1);
  console.log('PASS a running download keeps the panel reachable');
  assert.deepEqual(errors,[]);console.log('FLOATING ONE-CLICK PASSED '+report);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
