// 0.4.72: every page a person can open, and the desktop app's interface in all its states (menus, sheets, mini window,
// English), must use the light look: no leftover dark-blue surfaces from the old theme and no text that is hard to read.
// It walks every visible element and reports (1) old-palette surfaces: a background or border-less panel whose colour is
// dark and blue-ish (blue clearly above red), or near-black, and (2) text whose contrast with what is behind it is below
// 3:1. Store edition in a throwaway headless Chromium; native host and site reading are faked. Screenshots in the report.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'build');
const report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-light-check-'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Runs in the page: returns the problems found among the visible elements.
const AUDIT=()=>{
  const parse=value=>{const m=String(value).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
  const lum=c=>{const f=n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
  const blend=(top,bottom)=>({r:top.r*top.a+bottom.r*(1-top.a),g:top.g*top.a+bottom.g*(1-top.a),b:top.b*top.a+bottom.b*(1-top.a),a:1});
  // Effective colour behind an element: blend its own and its ancestors' backgrounds over white.
  const behind=el=>{const stack=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0)stack.push(c);if(c&&c.a>=.98)break;if(n.tagName==='DIALOG'&&n.open)break;}let color={r:255,g:255,b:255,a:1};for(let i=stack.length-1;i>=0;i--)color=blend(stack[i],color);return color;};
  const visible=el=>{const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;const r=el.getBoundingClientRect();return r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;};
  const name=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/).slice(0,2).join('.'):'');
  const problems=[];
  for(const el of document.querySelectorAll('body *')){
    if(!visible(el)||['SCRIPT','STYLE','svg','path','PROGRESS','IMG','VIDEO','CANVAS','OPTION'].includes(el.tagName))continue;
    const s=getComputedStyle(el),own=parse(s.backgroundColor);
    if(own&&own.a>.5){const L=lum(own),blueish=own.b>own.r+12&&own.b>=own.g-10;
      if((L<.25&&blueish)||L<.012)problems.push({what:'dark surface',el:name(el),color:s.backgroundColor});}
    const text=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(text){const fg=parse(s.color);if(fg&&fg.a>.05){const bg=behind(el),f=fg.a<1?blend(fg,bg):fg,a=lum(f),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      if(ratio<3)problems.push({what:'low contrast '+ratio.toFixed(2),el:name(el),text:el.textContent.trim().slice(0,30),color:s.color,on:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`});}}
  }
  return problems;
};
const results=[];
let scheme='light';
async function audit(page,label){label=label+' ['+scheme+' system]';await wait(350);const problems=await page.evaluate(AUDIT);await page.screenshot({path:path.join(report,label.replace(/[^\w-]+/g,'_')+'.png'),fullPage:true}).catch(()=>{});results.push({label,problems});console.log((problems.length?'FAIL ':'PASS ')+label+(problems.length?' '+JSON.stringify(problems.slice(0,6)):''));}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,args:['--mute-audio','--autoplay-policy=user-gesture-required']});
 try{
  // Windows in light and in dark mode: pages must stay light either way (old pages had dark-mode rules).
  for(scheme of ['light','dark']){
  // ---- desktop app interface (the real embedded document from plugin-native-check) ----
  const nativeDir=fs.readdirSync(path.join(root,'reports')).filter(n=>n.startsWith('plugin-native-')).sort().at(-1);
  if(!nativeDir)throw new Error('run plugin-native-check first');
  const native=path.join(root,'reports',nativeDir),base=JSON.parse(fs.readFileSync(path.join(native,'initial-state.json'),'utf8').replace(/^\uFEFF/,''));
  const context=await browser.newContext({viewport:{width:920,height:640},colorScheme:scheme});
  await context.addInitScript(()=>{const handlers=[];window.hostCommands=[];window.chrome={webview:{postMessage:d=>window.hostCommands.push(d),addEventListener:(_,h)=>handlers.push(h)}};window.emitHost=data=>handlers.forEach(h=>h({data}));});
  const page=await context.newPage();await page.goto(pathToFileURL(path.join(native,'interface.html')).href);await page.waitForFunction(()=>hostCommands.some(c=>c.command==='ready'));
  const snapshot=structuredClone(base),template=snapshot.jobs[0];
  snapshot.jobs=[{...structuredClone(template),id:'a'.repeat(16),title:'large-file.bin',kind:'file',status:'下载中',stage:'正在下载 · 8 MiB/s',progress:40,percent:'40',active:true,canPause:true},{...structuredClone(template),id:'b'.repeat(16),title:'失败的任务.mp4',kind:'video',status:'失败',error:'下载失败',progress:10,percent:'10',active:false,canResume:true}];
  const emit=data=>page.evaluate(d=>emitHost(d),data);
  await emit(snapshot);await audit(page,'desktop list');
  await page.locator('.menu summary').click();await audit(page,'desktop menu');await page.keyboard.press('Escape');await page.locator('.menu summary').click().catch(()=>{});
  await page.evaluate(()=>{for(const d of document.querySelectorAll('details[open]'))d.open=false;});
  await page.locator('.media-item').first().click();await audit(page,'desktop inspector');
  for(const [label,data] of [['desktop close question',{type:'closeAsk',active:1}],['desktop info',{type:'info',title:'关于 Ruxget',lines:['版本 0.4.72','免费开源，无广告。']}],['desktop editor',{type:'editor',context:{token:'t',url:'https://example.test/a.zip',kind:'file',height:1080,folder:'D:\\Downloads',categorize:true}}]]){
   await emit(data);await audit(page,label);await page.evaluate(()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();});}
  await page.locator('.menu summary').click();await page.getByRole('button',{name:'下载设置',exact:true}).click();await audit(page,'desktop settings');await page.evaluate(()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();});
  await emit({...snapshot,mini:true});await audit(page,'desktop mini');await emit({...snapshot,mini:false,jobs:[]});await audit(page,'desktop empty');
  await page.setViewportSize({width:360,height:600});await emit(snapshot);await audit(page,'desktop narrow');
  await context.close();
  // ---- extension pages ----
  const profile=path.join(report,'profile-'+scheme);
  const ext=await chromium.launchPersistentContext(profile,{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:900,height:720},colorScheme:scheme,ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--host-resolver-rules=MAP * ~NOTFOUND']});
  try{
   const worker=ext.serviceWorkers()[0]||await ext.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
   await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
   await ext.route('**/*',route=>new URL(route.request().url()).protocol==='chrome-extension:'?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
   const pages=['shiying.html','ruxget-settings.html','shiying-help.html','shiying-desktop.html','shiying-get-desktop.html','shiying-task.html','options.html','popup.html','m3u8.html','mpd.html','downloader.html','json.html','preview.html'];
   for(const file of pages){const p=await ext.newPage();p.on('pageerror',()=>{});await p.goto(`chrome-extension://${id}/${file}`).catch(()=>{});await wait(900);
    if(file==='shiying.html'){await p.setViewportSize({width:360,height:560});await audit(p,'extension '+file+' page');await p.locator('#tabDownloads').click().catch(()=>{});await audit(p,'extension '+file+' downloads');}
    else await audit(p,'extension '+file);
    // Everything folded open too, and on the desktop guide a finished step, so states that only show later are covered.
    const opened=await p.evaluate(()=>{const all=[...document.querySelectorAll('details')];all.forEach(d=>d.open=true);const steps=document.querySelectorAll('.wizard-steps li');if(steps.length>1){steps[0].classList.add('is-done');steps[1].classList.add('is-current');}for(const el of document.querySelectorAll('[hidden]'))if(el.closest('.wizard-more,.takeover-card,.help-details'))el.hidden=false;return all.length+steps.length;});
    if(opened)await audit(p,'extension '+file+' expanded');
    await p.close();}
  }finally{await ext.close();}
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify(results,null,2));
 const failed=results.filter(r=>r.problems.length);
 console.log(failed.length?`LIGHT THEME CHECK FAILED (${failed.length} of ${results.length}) ${report}`:`LIGHT THEME CHECK PASSED (${results.length}) ${report}`);
 process.exitCode=failed.length?1:0;
})().catch(error=>{console.error(error);process.exit(2);});
