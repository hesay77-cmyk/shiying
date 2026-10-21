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
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,acceptDownloads:true,downloadsPath:path.join(report,'downloads'),viewport:{width:380,height:640},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
 const errors=[];browser.on('page',p=>p.on('pageerror',e=>errors.push(e.message+' @ '+p.url())));
 try{
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'zh_CN'}));
  // Two finished downloads with real files, and one still running.
  const saved=async name=>worker.evaluate(async url=>{const downloadId=await chrome.downloads.download({url});for(let i=0;i<100;i++){const [item]=await chrome.downloads.search({id:downloadId});if(item?.state==='complete')return {downloadId,file:item.filename};await new Promise(r=>setTimeout(r,50));}throw new Error('fixture download did not finish');},origin+'/'+name);
  const a=await saved('keep.bin'),b=await saved('delete.bin');
  await worker.evaluate(({a,b})=>{const job=(id,title,extra)=>({id,title,format:'mp4',height:720,progress:100,stage:'下载完成',...extra});
   return chrome.storage.local.set({shiyingJobIds:['keep','gone','running'],'shiyingJob:keep':job('keep','保留文件的视频',{status:'complete',downloadId:a.downloadId,file:a.file}),'shiyingJob:gone':job('gone','要删除的视频',{status:'complete',downloadId:b.downloadId,file:b.file}),'shiyingJob:running':job('running','正在下载的视频',{status:'downloading',progress:40,stage:'正在下载画面'})});},{a,b});
  assert(fs.existsSync(a.file)&&fs.existsSync(b.file));
  const popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/shiying.html`);
  await popup.locator('#recentDownloads').waitFor({state:'visible'});await popup.locator('#recentDownloads summary').click();
  const item=jobId=>popup.locator(`#recentList li[data-id="${jobId}"]`);
  assert.equal(await popup.locator('#recentList .recent-delete').count(),3);
  check('every recent download has a delete button');

  // Finished, delete the file: needs the confirm, then the file and the record are gone.
  await item('gone').locator('.recent-delete').click();
  assert.match(await item('gone').innerText(),/删除这个下载？[\s\S]*删除文件[\s\S]*只移除记录[\s\S]*取消/);
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
  assert.match(await item('running').innerText(),/停止并删除这个下载？/);
  await item('running').getByRole('button',{name:'停止并删除'}).click();await item('running').waitFor({state:'detached'});
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('shiyingJobIds'))).shiyingJobIds,[]);
  assert.equal(await popup.locator('#recentDownloads').isVisible(),false);
  check('a running download is stopped and deleted; the empty list hides itself');

  assert.deepEqual(errors,[]);check('no page errors');
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,checks},null,2));console.log('REPORT '+report);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(1);});
