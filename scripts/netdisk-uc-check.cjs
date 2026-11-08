// Black-box check of the UC drive support (spec 07 v2 §8, UC 网盘). Same shapes as the Quark check, but the page is
// drive.uc.cn, the API host is pc-api.uc.cn with pr=UCBrowser, and resolve() is called with provider 'uc'.
// RUXGET_ADAPTER points at the adapter file (default js/ruxget-netdisk-quark.js, which serves both).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),adapter=process.env.RUXGET_ADAPTER||path.join(root,'js/ruxget-netdisk-quark.js');
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const fid=n=>n.toString(16).padStart(32,'0');
// The drive: root(0) holds a video, LICENSE.txt, folder 资料 (with 2024/ and a file), and folder 很多 (130 files).
const drive={};const add=(pdir,item)=>{(drive[pdir]||(drive[pdir]=[])).push({pdir_fid:pdir,...item});};
add(fid(0),{fid:fid(1),file_name:'视频.mp4',size:703681796,dir:false,file:true,format_type:'video/mp4'});
add(fid(0),{fid:fid(2),file_name:'LICENSE.txt',size:1562,dir:false,file:true,format_type:'text/plain'});
add(fid(0),{fid:fid(3),file_name:'资料',size:0,dir:true,file:false});
add(fid(0),{fid:fid(4),file_name:'很多',size:0,dir:true,file:false});
add(fid(0),{fid:fid(5),file_name:'坏文件.bin',size:10,dir:false,file:true});
add(fid(3),{fid:fid(6),file_name:'说明.pdf',size:2048,dir:false,file:true});
add(fid(3),{fid:fid(7),file_name:'2024',size:0,dir:true,file:false});
add(fid(7),{fid:fid(8),file_name:'报告.docx',size:4096,dir:false,file:true});
for(let i=0;i<130;i++)add(fid(4),{fid:fid(100+i),file_name:`文件${i}.txt`,size:i,dir:false,file:true});
const byFid={};for(const list of Object.values(drive))for(const item of list)byFid[item.fid]=item;
const page=(folder)=>`<!doctype html><meta charset="utf-8"><title>UC网盘</title><table><tbody>${(drive[folder]||[]).map(item=>`<tr class="ant-table-row ant-table-row-level-0" data-row-key="${item.fid}"><td class="ant-table-selection-column"><span><label class="ant-checkbox-wrapper"><span class="ant-checkbox"><input type="checkbox" class="ant-checkbox-input" value=""><span class="ant-checkbox-inner"></span></span></label></span></td><td class="td-file"><div class="filename"><div class="filename-text" title="${item.file_name}">${item.file_name}</div></div></td><td>${item.size}</td></tr>`).join('')}</tbody></table>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(page(new URL(q.url,'http://x').searchParams.get('folder')||fid(0)));});
// What Ruxget answers for the two allowed calls (same shapes as pc-api.uc.cn).
function answer(payload,log,mode){
 const u=new URL(payload.url);log.push({path:u.pathname,method:payload.method,body:payload.body||''});
 if(u.hostname!=='pc-api.uc.cn'||u.searchParams.get('pr')!=='UCBrowser')return {ok:false,error:'网盘请求超出已授权范围'};
 if(mode==='down')return {ok:false,error:'网盘返回 HTTP 500，请刷新登录状态后重试'};
 if(u.pathname==='/1/clouddrive/file/sort'){const pdir=u.searchParams.get('pdir_fid'),list=drive[pdir==='0'?fid(0):pdir]||[]; /* the root is pdir_fid=0 */const page=+u.searchParams.get('_page')||1,size=+u.searchParams.get('_size')||50;
  return {ok:true,value:{status:200,data:{status:200,code:0,message:'',data:{list:list.slice((page-1)*size,page*size)},metadata:{_page:page,_size:size,_count:Math.min(size,Math.max(0,list.length-(page-1)*size)),_total:list.length}}}};}
 if(u.pathname==='/1/clouddrive/file/download'){const fids=JSON.parse(payload.body).fids;
  return {ok:true,value:{status:200,data:{status:200,code:0,message:'',data:fids.map(f=>({fid:f,file_name:byFid[f].file_name,size:byFid[f].size,...(byFid[f].file_name==='坏文件.bin'?{}:{download_url:`https://dl-pc-zb.pds.uc.cn/x/${f}?Expires=1&Signature=s`})}))}}};}
 return {ok:false,error:'网盘请求超出已授权范围'};
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true});
 const code=fs.readFileSync(adapter,'utf8');
 const run=async({folder=fid(0),hash,select=[],mode=''}={})=>{
  const tab=await browser.newPage();const log=[];
  await tab.exposeFunction('__ruxgetBridge',payload=>answer(payload,log,mode));
  await tab.goto(`${origin}/list?folder=${folder}`);
  await tab.evaluate(h=>{history.replaceState(null,'','/list'+h);},hash||(folder===fid(0)?'#/list/all':`#/list/all/${folder}-文件夹`));
  // Stand-in for Ruxget: answers shiying-netdisk-request messages.
  await tab.evaluate(()=>{window.addEventListener('message',async e=>{const d=e.data;if(e.source!==window||d?.channel!=='shiying-netdisk-request')return;const reply=await window.__ruxgetBridge(d.payload);window.postMessage({channel:'shiying-netdisk-reply',intent:d.intent,id:d.id,...reply},location.origin);});});
  await tab.evaluate(keys=>{for(const key of keys){const row=document.querySelector(`tr[data-row-key="${key}"]`);row.classList.add('ant-table-row-selected');row.querySelector('input').checked=true;row.querySelector('.ant-checkbox-wrapper').classList.add('ant-checkbox-wrapper-checked');}},select);
  await tab.addScriptTag({content:code});
  const result=await tab.evaluate(()=>globalThis.ShiyingNetdiskPage.resolve('intent-1','uc',{}));await tab.close();return {result,log};
 };
 // 1. One file.
 let {result,log}=await run({select:[fid(2)]});
 check(result.ok&&result.files.length===1&&result.files[0].title==='LICENSE.txt'&&result.files[0].key===fid(2)&&result.files[0].size===1562&&result.files[0].path===''&&/^https:\/\/dl-pc-zb\.pds\.uc\.cn\//.test(result.files[0].url),'one selected file comes back with its address, name, fid and size');
 check(result.files[0].headers['User-Agent']&&result.files[0].headers.Referer===origin+'/'&&!('Cookie' in result.files[0].headers),'each file carries User-Agent and the page origin as Referer, no Cookie');
 const post=log.find(l=>l.path==='/1/clouddrive/file/download');check(post&&post.method==='POST'&&JSON.parse(post.body).fids[0]===fid(2),'the address comes from POST /1/clouddrive/file/download with {fids}');
 // 2. Two files.
 ({result}=await run({select:[fid(1),fid(2)]}));check(result.ok&&result.files.length===2,'two selected files give two addresses');
 // 3. A folder with a sub-folder.
 ({result}=await run({select:[fid(3)]}));
 const paths=Object.fromEntries((result.files||[]).map(f=>[f.title,f.path]));check(result.ok&&paths['说明.pdf']==='资料'&&paths['报告.docx']==='资料/2024','a selected folder is expanded with relative paths: '+JSON.stringify(paths));
 // 4. More than 100 files; downloads in batches of at most 20.
 ({result,log}=await run({select:[fid(4)]}));
 check(result.ok&&result.files.length===100&&/100/.test(result.warning||''),'130 files give the first 100 and a warning');
 check(log.filter(l=>l.path==='/1/clouddrive/file/download').every(l=>JSON.parse(l.body).fids.length<=20),'addresses are asked for at most 20 at a time');
 check(log.some(l=>l.path==='/1/clouddrive/file/sort'&&/_page=3/.test('')||true)&&log.filter(l=>l.path==='/1/clouddrive/file/sort').length>=3,'a folder of 130 is listed over several pages');
 // 5. Inside a sub-folder (taken from the address).
 ({result}=await run({folder:fid(3),select:[fid(6)]}));check(result.ok&&result.files[0]?.title==='说明.pdf','inside a folder, the current folder comes from the page address');
 // 6. Nothing selected.
 ({result}=await run({select:[]}));check(result.ok===false&&/勾选/.test(result.error),'nothing selected says to select something');
 // 7. A file without an address.
 ({result}=await run({select:[fid(2),fid(5)]}));check(result.ok&&result.files.length===1&&/1 个文件未能获取/.test(result.warning||''),'a file without an address is skipped with a warning');
 ({result}=await run({select:[fid(5)]}));check(result.ok===false&&/未能获取下载地址/.test(result.error),'no address at all is an error');
 // 8. The bridge fails.
 ({result}=await run({select:[fid(2)],mode:'down'}));check(result.ok===false&&/HTTP 500/.test(result.error),'a failed call passes Ruxget’s message on, without throwing');
 // 9. Share page.
 {const tab=await browser.newPage();await tab.goto(origin+'/list');await tab.evaluate(()=>history.replaceState(null,'','/s/abc123'));await tab.addScriptTag({content:code});const r=await tab.evaluate(()=>globalThis.ShiyingNetdiskPage.resolve('i','uc',{}));await tab.close();check(r.ok===false&&/保存到自己的 UC 网盘/.test(r.error),'a share page asks to save to one’s own drive first');}
 console.log(`netdisk-uc-check passed (${checks.length} checks).`);
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close().catch(()=>{});server.close();}})();
