// Black-box check of the Baidu Netdisk adapter (rewrite unit 7c, spec 09-网盘-百度). No extension, no real account:
// a local page imitates pan.baidu.com's file table and hash address, a stand-in for Ruxget answers the adapter's
// bridge messages with data shaped like the observed /api/list and /api/filemetas answers, and the test reads resolve().
// RUXGET_ADAPTER points at the adapter file.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const adapter=process.env.RUXGET_ADAPTER||path.resolve(__dirname,'..','js/ruxget-netdisk-baidu.js');
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const drive={};let serial=982308838895000;
const add=(dir,name,isdir,size)=>{const item={fs_id:++serial,server_filename:name,path:(dir==='/'?'':dir)+'/'+name,isdir,size:isdir?0:size,category:isdir?6:3};(drive[dir]||(drive[dir]=[])).push(item);return item;};
const poster=add('/','海报.png',0,575809);add('/','资料',1);add('/','很多',1);const bad=add('/','坏文件.bin',0,5);const second=add('/','海报 (1).png',0,111);
add('/资料','说明.pdf',0,2048);add('/资料','2024',1);add('/资料/2024','报告.docx',0,4096);
for(let i=0;i<130;i++)add('/很多',`文件${i}.txt`,0,i);
const byPath={};for(const list of Object.values(drive))for(const item of list)byPath[item.path]=item;
const row=item=>`<tr data-id="${item.fs_id}" class="wp-s-table-skin-hoc__tr wp-s-pan-table__body-row  mouse-choose-item"><td class="wp-s-pan-table__body-row--checkbox-block is-select"><label class="u-checkbox hide-checkbox"><span class="u-checkbox__input"><input type="checkbox" class="u-checkbox__original"></span></label></td><td class="wp-s-pan-table__td"><div class="wp-s-pan-list__file-name cursor-p"><div data-title="${item.server_filename}" class="wp-s-pan-list__file-name-content"><a class="wp-s-pan-list__file-name-title-text inline-block-v-middle text-ellip list-name-text">${item.server_filename}</a></div></div></td></tr>`;
const page=dir=>`<!doctype html><meta charset="utf-8"><title>百度网盘</title><table class="wp-s-pan-table__body-table mouse-choose-box"><tbody>${(drive[dir]||[]).map(row).join('')}</tbody></table>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(page(new URL(q.url,'http://x').searchParams.get('dir')||'/'));});
function answer(payload,log,mode){
 const u=new URL(payload.url);log.push({host:u.hostname,path:u.pathname,method:payload.method,headers:payload.headers,body:payload.body,query:Object.fromEntries(u.searchParams)});
 if(u.hostname!=='pan.baidu.com'||(payload.method||'GET')!=='GET')return {ok:false,error:'网盘请求超出已授权范围'};
 if(mode==='expired')return {ok:true,value:{status:200,data:{errno:-6,request_id:1}}};
 if(u.pathname==='/api/list'){const list=drive[u.searchParams.get('dir')];if(!list)return {ok:true,value:{status:200,data:{errno:-9,request_id:2}}};
  const start=+(u.searchParams.get('start')||0),limit=Math.min(+(u.searchParams.get('limit')||100),100);
  return {ok:true,value:{status:200,data:{errno:0,guid_info:'',list:list.slice(start,start+limit),request_id:3,guid:0}}};}
 if(u.pathname==='/api/filemetas'){if(u.searchParams.get('dlink')!=='1')return {ok:true,value:{status:200,data:{errno:0,info:[]}}};
  let targets;try{targets=JSON.parse(u.searchParams.get('target'));}catch{return {ok:true,value:{status:200,data:{errno:2}}};}
  if(!Array.isArray(targets)||targets.length>20)return {ok:true,value:{status:200,data:{errno:2}}};
  if(mode==='metaerror')return {ok:true,value:{status:200,data:{errno:12,request_id:4}}};
  const info=targets.map(p=>byPath[p]).filter(Boolean).map(f=>({...f,errno:0,...(f.fs_id===bad.fs_id?{}:{dlink:`https://d.pcs.baidu.com/file/${f.fs_id}?fid=1-250528-${f.fs_id}&rt=pr&sign=x`})})).reverse();
  return {ok:true,value:{status:200,data:{errno:0,info,request_id:5}}};}
 return {ok:false,error:'网盘请求超出已授权范围'};
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true});
 const code=fs.readFileSync(adapter,'utf8');
 const run=async({dir='/',address,select=[],mode=''}={})=>{
  const tab=await browser.newPage();const log=[];await tab.exposeFunction('__ruxgetBridge',payload=>answer(payload,log,mode));
  await tab.goto(`${origin}/load?dir=${encodeURIComponent(dir)}`);
  await tab.evaluate(a=>history.replaceState(null,'',a),address||(dir==='/'?'/disk/main#/index?category=all':'/disk/main#/index?category=all&path='+encodeURIComponent(dir)));
  await tab.evaluate(()=>{window.addEventListener('message',async e=>{const d=e.data;if(e.source!==window||d?.channel!=='shiying-netdisk-request')return;const reply=await window.__ruxgetBridge(d.payload);window.postMessage({channel:'shiying-netdisk-reply',intent:d.intent,id:d.id,...reply},location.origin);});});
  await tab.evaluate(indexes=>{const rows=[...document.querySelectorAll('tr[data-id]')];for(const i of indexes){rows[i].classList.add('selected');rows[i].querySelector('label').classList.add('is-checked');rows[i].querySelector('input').checked=true;}},select);
  await tab.addScriptTag({content:code});
  const result=await tab.evaluate(()=>globalThis.ShiyingNetdiskPage.resolve('intent-1','baidu',{}));await tab.close();return {result,log};
 };
 // Row indexes in the root: 0 海报.png, 1 资料, 2 很多, 3 坏文件.bin, 4 海报 (1).png.
 let {result,log}=await run({select:[0]});
 check(result.ok&&result.files.length===1&&result.files[0].title==='海报.png'&&result.files[0].key===String(poster.fs_id)&&result.files[0].size===575809&&result.files[0].path===''&&/^https:\/\/d\.pcs\.baidu\.com\//.test(result.files[0].url),'one selected file comes back with its address, name, fs_id and size');
 check(result.files[0].headers.Referer===origin+'/'&&result.files[0].headers['User-Agent']&&!('Cookie' in result.files[0].headers),'each file carries User-Agent and the page origin as Referer, no Cookie');
 check(log.length>=2&&log.every(l=>(l.method||'GET')==='GET'&&!l.body&&(!l.headers||!Object.keys(l.headers).length)),'every call is a plain GET without body or extra headers');
 check(log.some(l=>l.path==='/api/list'&&l.query.dir==='/')&&log.some(l=>l.path==='/api/filemetas'&&JSON.parse(l.query.target).includes('/海报.png')),'the root is listed as / and the file is asked for by its full path');
 ({result}=await run({select:[0,4]}));check(result.ok&&result.files.length===2&&result.files.map(f=>f.key).join()===[poster.fs_id,second.fs_id].join(),'two files come back in page order even when filemetas answers in another order');
 ({result}=await run({select:[1]}));const paths=Object.fromEntries((result.files||[]).map(f=>[f.title,f.path]));
 check(result.ok&&paths['说明.pdf']==='资料'&&paths['报告.docx']==='资料/2024','a selected folder is expanded with relative paths: '+JSON.stringify(paths));
 ({result,log}=await run({select:[2]}));check(result.ok&&result.files.length===100&&/100/.test(result.warning||''),'130 files give the first 100 and a warning');
 check(log.filter(l=>l.path==='/api/list'&&l.query.dir==='/很多').length>=2,'a long folder is read page by page');
 check(log.filter(l=>l.path==='/api/filemetas').every(l=>JSON.parse(l.query.target).length<=20),'download addresses are asked for at most 20 at a time');
 ({result}=await run({dir:'/资料',select:[0]}));check(result.ok&&result.files[0]?.title==='说明.pdf'&&result.files[0].path==='','inside a folder, the current folder comes from the path in the address');
 ({result}=await run({select:[]}));check(result.ok===false&&/勾选/.test(result.error),'nothing selected says to select something');
 ({result}=await run({select:[0,3]}));check(result.ok&&result.files.length===1&&/1 个文件未能获取/.test(result.warning||''),'a file without dlink is skipped with a warning');
 ({result}=await run({select:[3]}));check(result.ok===false&&/未能获取下载地址/.test(result.error),'no address at all is an error');
 ({result}=await run({select:[0],mode:'expired'}));check(result.ok===false&&/登录已失效/.test(result.error),'errno -6 says the login has expired');
 ({result}=await run({select:[0],mode:'metaerror'}));check(result.ok===false&&/错误码 12/.test(result.error),'another errno is shown with its number');
 ({result}=await run({select:[0],address:'/disk/main#/recent'}));check(result.ok===false&&/我的文件/.test(result.error),'outside 我的文件 it asks to use 我的文件');
 ({result}=await run({select:[0],address:'/s/1abcDEF'}));check(result.ok===false&&/保存到自己的百度网盘/.test(result.error),'a share page asks to save to one’s own drive first');
 console.log(`netdisk-baidu-check passed (${checks.length} checks).`);
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close().catch(()=>{});server.close();}})();
