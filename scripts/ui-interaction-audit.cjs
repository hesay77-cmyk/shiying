// Exact resources in isolated headless pages. No native IPC or media traffic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'shiying-ui-interaction-'));
const checks=[],issues=[];
function check(ok,name){checks.push(name);if(!ok)issues.push(name);}
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true});try{
 const context=await browser.newContext({viewport:{width:960,height:640}}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('**/*',r=>r.abort());
 const page=await context.newPage();
 const html=read('desktop/interface.html').replace('__PLUGIN_CSS__',read('css/shiying.css')).replace('__DESKTOP_CSS__',read('desktop/interface.css')).replace('__ICON__',read('img/shiying.svg')).replaceAll('__NONCE__','audit').replace('__DESKTOP_JS__',read('desktop/interface.js'));
 await page.route('http://desktop.audit/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.addInitScript(()=>{window.calls=[];window.chrome={webview:{postMessage:d=>calls.push(d),addEventListener:(_,f)=>window.emit=d=>f({data:d})}};});
 await page.goto('http://desktop.audit/');
 const job={id:'a'.repeat(16),title:'文件名'.repeat(90)+'.zip',kind:'file',typeLabel:'文件',status:'已暂停',stage:'已暂停',amount:'0 B / 未知',progress:0,percent:'0',known:false,canResume:true,canPause:false,active:false,canForget:true,metrics:[['文件大小','未知']],segments:[],url:'https://fixture.invalid/file?token='+'x'.repeat(1200),destination:'D:\\Downloads\\'+ 'File'.repeat(120)};
 const state={type:'state',jobs:[job],settings:{Folder:'D:\\Downloads',UiLanguage:'zh_CN',Connections:8,FileSlots:2,VideoSlots:1,RateKiB:0,BtUploadKiB:256},busy:false};
 const emit=d=>page.evaluate(d=>emit(d),d);
 await emit(state);
 await page.locator('.media-item').focus();await emit({...state,jobs:[{...job,amount:'1 B / 未知'}]});
 check(await page.locator('.media-item').evaluate(n=>document.activeElement===n),'task keyboard focus survives progress refresh');
 await page.locator('#inspectorActions button').first().focus();await emit({...state,jobs:[{...job,amount:'2 B / 未知'}]});
 check(await page.locator('#inspectorActions button').first().evaluate(n=>document.activeElement===n),'inspector keyboard focus survives progress refresh');
 await emit({...state,settings:{...state.settings,UiLanguage:'en'}});
 check((await page.locator('.detail-metrics').innerText()).includes('Unknown')&&(await page.locator('.meta .format').innerText())==='File','English file and unknown labels resolve in details');
 await emit(state);
 await emit({type:'bt',job:{id:job.id,title:'BT',files:[{index:1,path:'docs/'+'Long'.repeat(100)+'.txt',length:12,size:'12 B',completed:'0 B',selected:false}]}});
 await emit({...state,jobs:[{...job,amount:'3 B / 未知'}]});
 check(await page.locator('#btStart').isDisabled(),'BT stays disabled without checked files after host refresh');
 await page.locator('#btFiles input').check();await emit({...state,busy:true});await page.locator('#btNone').evaluate(n=>n.click());
 check(await page.locator('#btStart').isDisabled(),'BT selection cannot reenable submit while host is busy');
 await emit(state);await page.locator('#btChooser [data-close]').click();
 // 0.4.46: deletion of a healthy task lives in the ··· menu.
 await page.locator('button[aria-label="更多任务操作"],button[aria-label="More actions"]').first().click();await page.locator('#taskMenu button',{hasText:/删除任务|Delete task/}).click();await emit({...state,busy:true});
 check(await page.locator('#deleteConfirm').isDisabled(),'deletion cannot submit during another host operation');
 await emit(state);check(await page.locator('#deleteConfirm').isEnabled(),'deletion can submit when host is available again');
 await page.locator('#deleteConfirm').click();
 await emit({...state,busy:true});await emit({...state,busy:false});
 check(await page.locator('#deleteConfirm').isDisabled()&&await page.locator('#deleteCancel').isDisabled(),'pending deletion remains locked through unrelated state updates');
 await emit({type:'notice',text:'Fixture retained',close:'deleteDialog'});
 await page.locator('[data-command=batch]').first().evaluate(n=>n.click());await page.selectOption('#batchKind','audio');
 check(await page.locator('#batchHeight').isHidden(),'MP3 batch hides irrelevant video quality');
 await emit({...state,busy:true});await page.keyboard.press('Escape');
 check(await page.locator('#batchEditor').isVisible()&&await page.locator('#batchEditor [data-close]').isDisabled(),'batch cannot appear cancelled while its confirmation is being processed');
 await emit(state);
 await page.locator('#batchEditor [data-close]').click();
 await page.waitForFunction(()=>calls.some(c=>c.command==='cancelBatch'));
 check(true,'closing batch clears its temporary host destination');
 for(const width of [320,360,640,960]){
  await page.setViewportSize({width,height:420});await emit(state);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop fits '+width+'px');
  for(const id of ['settings','btChooser','batchEditor']){
   await page.evaluate(id=>document.getElementById(id).showModal(),id);
   check(await page.locator('#'+id).evaluate(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1;}),id+' fits '+width+'px');
   const primary=page.locator('#'+id+' button[type=submit]');await primary.scrollIntoViewIfNeeded();
   check(await primary.evaluate(n=>{const r=n.getBoundingClientRect(),d=n.closest('dialog').getBoundingClientRect();return r.bottom<=d.bottom+1;}),id+' primary can scroll into view '+width+'px');
   await page.screenshot({path:path.join(report,id+'-'+width+'.png')});await page.evaluate(id=>document.getElementById(id).close(),id);
  }
  await page.locator('.menu summary').click();
  if(process.argv.includes('--baseline'))console.log('MENU',width,await page.locator('.menu-panel').first().boundingBox());
  check(await page.locator('.menu-panel').first().evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),'menu stays in short window '+width+'px');
  await page.keyboard.press('Escape');
 }
 const popup=await context.newPage();let popupHTML=read('shiying.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await popup.setContent(popupHTML);await popup.addStyleTag({content:read('css/shiying.css')});
 await popup.evaluate(()=>{window.storageListeners=[];window.language='zh_CN';window.RuxgetI18n={pick:(zh,en)=>language==='en'?en:zh};window.ShiyingPlatformUI={url:()=>''};window.chrome={runtime:{sendMessage:async m=>({ok:true})},storage:{onChanged:{addListener:f=>storageListeners.push(f)}}};});
 await popup.addScriptTag({path:path.join(root,'js/shiying-collection-ui.js')});
 await popup.evaluate(()=>{storageListeners[0]({shiyingCollectionQueue:{newValue:{paused:false,items:[{title:'item',status:'running'}]}}},'local');});
 check((await popup.locator('#collectionQueueText').textContent()).includes('正在下载'),'active playlist never says completed');
 await popup.evaluate(()=>{language='en';document.dispatchEvent(new CustomEvent('ruxget-i18n-applied'));});
 check((await popup.locator('#collectionQueueText').textContent()).includes('Downloading'),'active playlist text follows language switch');
 await popup.evaluate(()=>{window.stopCalls=0;chrome.runtime.sendMessage=async()=>{stopCalls++;await new Promise(r=>setTimeout(r,30));return {ok:true,paused:true,items:[{title:'item',status:'cancelled'}]};};document.getElementById('collectionStop').click();document.getElementById('collectionStop').click();});
 await popup.waitForFunction(()=>document.getElementById('collectionQueueText').textContent.includes('Stopped'));
 check(await popup.evaluate(()=>stopCalls===1),'repeated stop sends only one request and shows stopped state');
 check(errors.length===0,'no uncaught page errors');
 const summary={ok:issues.length===0,checks,issues,errors,mediaDownloads:0,personalBrowserTouched:false,windowShown:false,published:false};
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({report,checks:checks.length,issues},null,2));
 if(!process.argv.includes('--baseline'))assert.deepEqual(issues,[]);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
