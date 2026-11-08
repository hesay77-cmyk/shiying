// Delete from the popup's "最近下载" with the store edition: the file and record go only after a confirm;
// "只移除记录" keeps the file; a running download is stopped. Local fixture files only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-recent-delete-'));
const checks=[];function check(name){checks.push(name);console.log('PASS '+name);}
(async()=>{
 const server=http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':4096});response.end(Buffer.alloc(4096,1));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'ignore'});
 const extension=path.join(root,'build');
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:path.join(report,'downloads'),viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Two finished downloads with real files, and one still running.
  const saved=async name=>worker.evaluate(async url=>{const downloadId=await chrome.downloads.download({url});for(let i=0;i<100;i++){const [item]=await chrome.downloads.search({id:downloadId});if(item?.state==='complete')return {downloadId,file:item.filename};await new Promise(r=>setTimeout(r,50));}throw new Error('fixture download did not finish');},origin+'/'+name);
  const a=await saved('keep.bin'),b=await saved('delete.bin');
  await worker.evaluate(({a,b})=>{const job=(id,title,extra)=>({id,title,format:'mp4',height:720,progress:100,stage:'下载完成',createdAt:new Date().toISOString(),...extra});
   return chrome.storage.local.set({shiyingJobIds:['keep','gone','running'],'shiyingJob:keep':job('keep','保留文件的视频',{status:'complete',downloadId:a.downloadId,file:a.file}),'shiyingJob:gone':job('gone','要删除的视频',{status:'complete',downloadId:b.downloadId,file:b.file}),'shiyingJob:running':job('running','正在下载的视频',{status:'downloading',progress:40,stage:'正在下载画面'})});},{a,b});
  assert(fs.existsSync(a.file)&&fs.existsSync(b.file));
  const popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  await popup.locator('#tabDownloads').click();
  const item=jobId=>popup.locator(`#recentList li[data-id="${jobId}"]`);
  assert.equal(await popup.locator('#recentList .recent-delete').count(),3);
  check('every recent download has a delete button');

  // Finished, delete the file: needs the confirm, then the file and the record are gone.
  await item('gone').locator('.recent-delete').click();
  assert.match(await item('gone').innerText(),/删除「[^」]+」？[\s\S]*删除文件[\s\S]*只移除记录[\s\S]*取消/);
  await popup.screenshot({path:path.join(report,'confirm.png')});
  await item('gone').getByRole('button',{name:'取消'}).click();
  assert.equal(await item('gone').locator('.recent-open').count(),1);assert(fs.existsSync(b.file));
  check('the bin only asks; “取消” leaves the download untouched');
  await item('gone').locator('.recent-delete').click();await item('gone').getByRole('button',{name:'删除文件'}).click();
  await item('gone').waitFor({state:'detached'});
  for(let i=0;i<40&&fs.existsSync(b.file);i++)await popup.waitForTimeout(50);
  assert(!fs.existsSync(b.file),'the file is deleted from disk');
  assert.deepEqual(await worker.evaluate(id=>chrome.downloads.search({id}),b.downloadId),[]);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('shiyingJob:gone')))['shiyingJob:gone'],undefined);
  check('“删除文件” deletes the saved file, its Chrome entry and the record');

  // Finished, remove from the list only: the file stays.
  await item('keep').locator('.recent-delete').click();await item('keep').getByRole('button',{name:'只移除记录'}).click();
  await item('keep').waitFor({state:'detached'});assert(fs.existsSync(a.file),'the file is kept');
  check('“只移除记录” removes it from the list and keeps the file');

  // Running: stop and delete.
  await item('running').locator('.recent-delete').click();
  assert.match(await item('running').innerText(),/停止并删除「[^」]+」？/);
  await item('running').getByRole('button',{name:'停止并删除'}).click();await item('running').waitFor({state:'detached'});
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('shiyingJobIds'))).shiyingJobIds,[]);
  assert.equal(await popup.locator('#recentEmpty').isVisible(),true);
  check('a running download is stopped and deleted; the empty list says so');

  await popup.close();

  // The download card on a video page: “删除文件” for a saved file, “移除记录” for a cancelled one; two clicks each.
  const VIDEO='https://www.bilibili.com/video/BV15z4y1U7HS/';
  await browser.route('https://www.bilibili.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Fixture</title><video></video>'}));
  await browser.addInitScript(url=>{if(location.protocol!=='chrome-extension:'||!location.pathname.endsWith('/shiying.html'))return;const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url,title:'卡片里的视频',site:'bilibili',duration:60,choices:[{height:720,label:'720p'}],audioAvailable:true,subtitles:[]};return send(message);};},VIDEO);
  const site=await browser.newPage();await site.goto(VIDEO);
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,VIDEO),jobUrl=await worker.evaluate(url=>ShiyingPlatform.source(url).url,VIDEO);
  const c=await saved('card.bin');
  const setJob=values=>worker.evaluate(({values,jobUrl})=>chrome.storage.local.set({shiyingJobIds:['card'],'shiyingJob:card':{id:'card',url:jobUrl,title:'卡片里的视频',format:'mp4',height:720,...values}}),{values,jobUrl});
  await setJob({status:'complete',progress:100,stage:'下载完成',downloadId:c.downloadId,file:c.file});
  let card=await browser.newPage();await card.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
  await card.locator('#platformDelete').waitFor({state:'visible'});assert.equal(await card.locator('#platformDelete').innerText(),'删除文件');
  await card.locator('#platformDelete').click();assert.equal(await card.locator('#platformDelete').innerText(),'再点一次确认删除');assert(fs.existsSync(c.file),'one click only arms the button');
  await card.screenshot({path:path.join(report,'card-armed.png')});
  await card.locator('#platformDelete').click();await card.locator('#platformJob').waitFor({state:'hidden'});
  for(let i=0;i<40&&fs.existsSync(c.file);i++)await card.waitForTimeout(50);assert(!fs.existsSync(c.file),'the saved file is deleted');
  check('download card: “删除文件” needs a second click, then deletes the file and clears the card');
  await card.close();
  await setJob({status:'cancelled',progress:38,stage:'已取消'});
  card=await browser.newPage();await card.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
  await card.locator('#platformDelete').waitFor({state:'visible'});assert.equal(await card.locator('#platformDelete').innerText(),'移除记录');
  await card.locator('#platformDelete').click();await card.locator('#platformDelete').click();await card.locator('#platformJob').waitFor({state:'hidden'});
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('shiyingJobIds'))).shiyingJobIds,[]);
  check('download card: a cancelled download can be removed (“移除记录”)');
  await card.close();

  // 0.4.81: the saved file was deleted outside Chrome. The card, “已下载” and a double-click all say so; nothing asks
  // for the “open files” permission; “删除文件” becomes removing the record.
  const m=await saved('moved.bin'),o=await saved('outside.bin');fs.unlinkSync(m.file);fs.unlinkSync(o.file);
  await setJob({status:'complete',progress:100,stage:'下载完成，文件和声音已检查',downloadId:m.downloadId,file:m.file,createdAt:new Date().toISOString()});
  // Chrome looks for removed files at most once every 10 seconds; the downloads above just used that turn.
  await new Promise(r=>setTimeout(r,11000));
  await browser.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;window.asked=[];chrome.permissions.request=async p=>{asked.push(p);return false;};});
  card=await browser.newPage();await card.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
  await card.waitForFunction(()=>document.querySelector('#platformStage')?.textContent==='文件已被移动或删除',null,{timeout:5000});
  assert.equal(await card.locator('#platformOpen').isVisible(),false,'no 打开 for a file that is gone');
  assert.equal(await card.locator('#platformDelete').innerText(),'移除记录');
  await card.locator('#platformJob').dblclick({position:{x:8,y:8}});
  await card.waitForFunction(()=>/文件已不在原来的位置/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:3000});
  assert.deepEqual(await card.evaluate(()=>asked),[],'nothing asks for a permission');
  check('download card: a file deleted outside Chrome shows “文件已被移动或删除”, no 打开, and a double-click explains it without asking for a permission');
  const list=await browser.newPage();await list.goto(`chrome-extension://${id}/shiying.html`);await list.locator('#tabDownloads').click();
  const row=jobId=>list.locator(`#recentList li[data-id="${jobId}"]`);
  await list.waitForFunction(ids=>ids.every(i=>/文件已被移动或删除/.test(document.querySelector(`#recentList li[data-id="${i}"]`)?.textContent||'')),['card','chrome-'+o.downloadId],{timeout:5000});
  for(const r of ['card','chrome-'+o.downloadId]){assert.doesNotMatch(await row(r).innerText(),/双击打开|下载完成/);assert.equal(await row(r).locator('.recent-show').count(),0);}
  check('已下载: a site video and a Chrome download whose files are gone say so, without “下载完成 · 双击打开” or the folder button');
  await row('card').locator('.recent-open').dblclick();
  await list.waitForFunction(()=>/文件已不在原来的位置/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:3000});
  assert.deepEqual(await list.evaluate(()=>asked),[]);
  await row('chrome-'+o.downloadId).locator('.recent-delete').click();assert.match(await row('chrome-'+o.downloadId).innerText(),/文件已不在，从列表移除？/);
  await row('chrome-'+o.downloadId).getByRole('button',{name:'移除'}).click();await row('chrome-'+o.downloadId).waitFor({state:'detached'});
  assert.match(await list.locator('#toast').innerText(),/^已从列表移除$/);
  check('已下载: a double-click explains the file is gone; the bin only removes the record');
  await list.close();
  await card.locator('#platformDelete').click();assert.equal(await card.locator('#platformDelete').innerText(),'再点一次移除记录');
  await card.locator('#platformDelete').click();await card.locator('#platformJob').waitFor({state:'hidden'});
  assert.match(await card.locator('#toast').innerText(),/已移除记录/);
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('shiyingJobIds'))).shiyingJobIds,[]);
  check('download card: for a file that is gone, the button only removes the record');
  await card.close();await site.close();

  // The progress page offers the same.
  const d=await saved('task.bin');
  await worker.evaluate(d=>chrome.storage.local.set({shiyingJobIds:['task'],'shiyingJob:task':{id:'task',url:'https://example.test/v',title:'进度页里的视频',format:'mp4',height:720,status:'complete',progress:100,stage:'下载完成',downloadId:d.downloadId,file:d.file,verification:{width:1280,height:720}}}),d);
  const task=await browser.newPage();await task.goto(`chrome-extension://${id}/shiying-task.html?id=task`);
  await task.locator('#deleteTask').waitFor({state:'visible'});assert.equal(await task.locator('#deleteTask').innerText(),'删除文件');
  await task.locator('#deleteTask').click();assert(fs.existsSync(d.file));await task.locator('#deleteTask').click();
  await task.waitForFunction(()=>document.body.dataset.status==='deleted');
  for(let i=0;i<40&&fs.existsSync(d.file);i++)await task.waitForTimeout(50);assert(!fs.existsSync(d.file));
  assert.equal(await task.locator('#taskStage').innerText(),'文件已删除');
  check('progress page: “删除文件” (two clicks) deletes the file');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
