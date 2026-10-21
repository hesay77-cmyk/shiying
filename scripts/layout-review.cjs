// Real Chrome rendering of exact page/CSS sources with explicit layout and job fixtures.
// This checks presentation, not a logged-in download or installed native host.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const project=path.resolve(__dirname,'..'),root=process.env.SHIYING_LAYOUT_ROOT||project;
const baseline=process.argv.includes('--baseline'),report=path.join(project,'reports',`layout-${baseline?'before':'after'}-${Date.now()}`);
fs.mkdirSync(report,{recursive:true});
const longURL='https://media.example.test/stream/'+ 'signed_asset_'.repeat(32)+'.mp4?token='+'a'.repeat(1200)+'&expires=1792222222';
const longName='很长的下载文件名'+ 'UnbrokenFileName'.repeat(18)+'.mp4';
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  if(file.endsWith('.html')){
   let html=fs.readFileSync(file,'utf8');
   if(!file.endsWith('shiying-task.html'))html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   if(['downloader.html','m3u8.html','mpd.html'].some(name=>file.endsWith(name)))html=html.replace('</head>','<script src="js/shiying-tools.js" defer></script></head>');
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
  }
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'image/png');fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 const records=[],errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext();const origin=`http://127.0.0.1:${server.address().port}`;
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await context.addInitScript(({url,name})=>{
   const mode=new URLSearchParams(location.search).get('fixture');
   const done=mode==='complete'||mode==='unverified';
   const job={ok:true,id:'fixture',title:name,url,format:'mp4',height:1080,status:done?'complete':mode==='error'?'error':'downloading',stage:done?'已保存':mode==='error'?'下载失败':'正在下载画面和声音',progress:done?100:42.5,error:mode==='error'?'原站拒绝下载，请重新获取地址：'+url:'',file:'C:\\Users\\用户\\Downloads\\拾影\\'+name,verification:mode==='unverified'?{}:{width:1920,height:1080,audioActive:true,duration:59.8,bytes:8388608,fullDecode:true}};
   window.chrome={runtime:{sendMessage:async()=>job}};
  },{url:longURL,name:longName});
  const cases=[['platform','shiying.html'],['media','shiying.html'],['downloading','shiying-task.html'],['complete','shiying-task.html'],['unverified','shiying-task.html'],['error','shiying-task.html'],['direct','downloader.html'],['hls','m3u8.html'],['dash','mpd.html']];
  for(const [fixture,file]of cases){
   const page=await context.newPage();await page.goto(origin+'/'+file+'?id=fixture&fixture='+fixture);
   if(file==='shiying-task.html')await page.waitForFunction(()=>document.body.dataset.status);
   else await page.evaluate(({fixture,url,name})=>{
    const $=s=>document.querySelector(s);
    if(fixture==='platform'){
     document.body.classList.add('platform-mode');$('#platformEntry').hidden=false;$('#platformCard').hidden=false;$('#platformTitle').textContent=name;$('#platformMeta').textContent='YouTube　6:24';
     $('#platformQuality').replaceChildren(new Option('1080p','1080'));$('#platformQuality').disabled=false;$('#platformDownload').disabled=false;$('#platformAudio').disabled=false;$('#platformURL').value=url;
     const desktop=$('#platformDesktop');if(desktop)desktop.disabled=false;
    }else if(fixture==='media'){
     $('#platformEntry').hidden=false;$('#platformCard').hidden=true;$('#platformURL').value=url;$('#empty').hidden=true;$('#mediaArea').hidden=false;$('#pageTitle').textContent=name;$('#pageHost').textContent='media.example.test';
     const row=$('#mediaTemplate').content.firstElementChild.cloneNode(true);row.querySelector('h3').textContent=name;row.querySelector('.format').textContent='MP4';row.querySelector('.size').textContent='72.5 MB';row.querySelector('.item-details').hidden=false;row.querySelector('.resource-url').textContent=url;$('#mediaList').append(row);
    }else if(fixture==='direct'){
     $('#getURL').classList.remove('hide');$('#url').value=url;$('#referer').value=url;
     const row=document.createElement('div');row.className='downItem';row.innerHTML='<div class="explain"></div><div class="down-file-progress">正在下载 · 42.5 MB / 100 MB</div><div class="progress-container"><div class="progress-wrapper"><div class="progress-bar" style="--progress:42.5%"><div class="progress"></div><span class="progress-text" data-text="42.5%">42.5%</span></div></div><button class="cancel-btn">暂停下载</button></div>';row.querySelector('.explain').textContent=name;$('#downBox').append(row);
    }else if(fixture==='hls'){
     $('#loading').classList.add('hide');$('#m3u8').classList.remove('hide');$('#m3u8_url').textContent=url;$('#m3u8_url').href=url;$('#m3u8Custom').classList.remove('hide');$('#baseUrl').value=url;$('#referer').value=url;
     for(const element of document.querySelectorAll('details'))element.open=true;
    }else if(fixture==='dash'){
     $('#mpd_url').textContent=url;$('#mpd_url').href=url;$('#mpdUrl').value=url;for(const item of document.querySelectorAll('section.hide'))item.classList.remove('hide');
    }
   },{fixture,url:longURL,name:longName});
   for(const width of [320,440,900,1366]){
    await page.setViewportSize({width,height:900});
    const issues=await page.evaluate(()=>{
     const bad=[];if(document.documentElement.scrollWidth>innerWidth+1)bad.push({type:'page-overflow',pixels:document.documentElement.scrollWidth-innerWidth});
     for(const node of document.querySelectorAll('input:not([type=checkbox]):not([type=range]),textarea,select,.explain,.task-status,#taskError,dd,.downItem,.wrapper1080,.wrapper1024')){
      if(!node.getClientRects().length||node.checkVisibility&&!node.checkVisibility())continue;const b=node.getBoundingClientRect(),style=getComputedStyle(node),id=node.id||node.className||node.tagName;
      if(b.right>innerWidth+1)bad.push({type:'element-outside-window',id,pixels:Math.round(b.right-innerWidth)});
      if(!/INPUT|TEXTAREA|SELECT/.test(node.tagName)&&style.overflowX==='visible'&&node.scrollWidth>node.clientWidth+2)bad.push({type:'text-outside-container',id,pixels:node.scrollWidth-node.clientWidth});
      const box=node.closest('.optionBox');if(box&&/INPUT|TEXTAREA/.test(node.tagName)){
       const bounds=box.getBoundingClientRect(),css=getComputedStyle(box),right=bounds.right-parseFloat(css.paddingRight)-parseFloat(css.borderRightWidth);
       if(b.right>right+1){let nodeInfo=node.parentElement,ancestors=[];for(let n=0;n<4&&nodeInfo;n++,nodeInfo=nodeInfo.parentElement){const rect=nodeInfo.getBoundingClientRect(),cs=getComputedStyle(nodeInfo);ancestors.push({tag:nodeInfo.tagName,id:nodeInfo.id,class:nodeInfo.className,left:rect.left,right:rect.right,width:rect.width,display:cs.display,padding:cs.padding,boxSizing:cs.boxSizing});}bad.push({type:'field-outside-content',id,pixels:Math.round(b.right-right),ancestors});}
      }
     }return bad;
    });
    records.push({fixture,width,issues});
    if(width===320||width===900)await page.screenshot({path:path.join(report,`${fixture}-${width}.png`)});
   }
   if(!baseline&&fixture==='unverified'){
    assert(!(await page.locator('#resultIntegrity').innerText()).includes('完整检查通过'));
    assert(!(await page.locator('#resultAudio').innerText()).includes('静音'));
   }
   if(!baseline&&fixture==='complete')assert((await page.locator('#resultIntegrity').innerText()).includes('1 分 0 秒'));
   if(fixture==='platform'||fixture==='media')assert.equal(await page.locator('#platformURL').inputValue(),longURL);
   await page.close();
  }
  const violations=records.filter(item=>item.issues.length);const result={baseline,root,method:'exact HTML/CSS rendering with explicit UI/job fixtures, no external requests',checks:records.length,violations,errors};
  fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({report,checks:records.length,failedCases:violations.length,issues:violations.slice(0,6)},null,2));
  if(!baseline){assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);}
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
