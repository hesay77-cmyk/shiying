// Black-box check of the Aliyun Drive adapter (rewrite unit 7b, spec 08-网盘-阿里云盘). No extension, no real account:
// a local page imitates www.alipan.com's file cards and its localStorage token, a stand-in for Ruxget answers the
// adapter's bridge messages with data shaped like the observed API answers, and the test reads resolve().
// RUXGET_ADAPTER points at the adapter file.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const adapter=process.env.RUXGET_ADAPTER||path.resolve(__dirname,'..','js/ruxget-netdisk-aliyun.js');
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const id=n=>'f'+n.toString(16).padStart(39,'0');const DRIVE='3477787250';
const drive={};const add=(parent,item)=>{(drive[parent]||(drive[parent]=[])).push({drive_id:DRIVE,parent_file_id:parent,...item});};
add('root',{file_id:id(1),name:'海报.png',type:'file',size:575809,mime_type:'image/png'});
add('root',{file_id:id(2),name:'资料',type:'folder'});
add('root',{file_id:id(3),name:'很多',type:'folder'});
add('root',{file_id:id(4),name:'坏文件.bin',type:'file',size:5});
add('root',{file_id:id(9),name:'海报.png',type:'file',size:111});
add(id(2),{file_id:id(5),name:'说明.pdf',type:'file',size:2048});
add(id(2),{file_id:id(6),name:'2024',type:'folder'});
add(id(6),{file_id:id(7),name:'报告.docx',type:'file',size:4096});
for(let i=0;i<130;i++)add(id(3),{file_id:id(100+i),name:`文件${i}.txt`,type:'file',size:i});
const byId={};for(const list of Object.values(drive))for(const item of list)byId[item.file_id]=item;
const card=item=>`<div class="drop-wrapper---T27s"><div class="drag-wrapper---smTQ"><div class="node-card-container--TLrx5"><div class="outer-wrapper--JCodp" data-is-selected="false"><div class="node-card--wp9KL"><div class="info--YLxTD"><p class="title--HvI83">${item.name}</p></div></div></div></div></div></div>`;
const page=folder=>`<!doctype html><meta charset="utf-8"><title>阿里云盘</title><div class="list">${(drive[folder]||[]).map(card).join('')}</div>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(page(new URL(q.url,'http://x').searchParams.get('folder')||'root'));});
function answer(payload,log,mode){
 const u=new URL(payload.url),body=payload.body?JSON.parse(payload.body):{};log.push({host:u.hostname,path:u.pathname,headers:payload.headers||{},body});
 const h=Object.fromEntries(Object.entries(payload.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 if(h.authorization!=='Bearer test-access-token'||h['x-device-id']!=='test-device')return {ok:true,value:{status:401,data:{code:'AccessTokenInvalid',message:'AccessToken is invalid'}}};
 if(mode==='expired')return {ok:true,value:{status:401,data:{code:'AccessTokenExpired',message:'expired'}}};
 if(u.hostname==='user.aliyundrive.com'&&u.pathname==='/v2/user/get')return {ok:true,value:{status:200,data:{default_drive_id:'111',resource_drive_id:DRIVE,backup_drive_id:'111'}}};
 if(u.pathname==='/adrive/v3/file/list'){if(body.drive_id!==DRIVE)return {ok:true,value:{status:404,data:{code:'NotFound.ParentFileId',message:'wrong drive'}}};
  const list=drive[body.parent_file_id]||[];const start=body.marker?+body.marker:0,limit=Math.min(body.limit||20,100),next=start+limit<list.length?String(start+limit):'';
  return {ok:true,value:{status:200,data:{items:list.slice(start,start+limit),next_marker:next}}};}
 if(u.pathname==='/v2/file/get_download_url'){const f=byId[body.file_id];if(!f)return {ok:true,value:{status:404,data:{code:'NotFound.File',message:'not found'}}};
  return {ok:true,value:{status:200,data:{file_id:f.file_id,drive_id:DRIVE,size:f.size,expiration:'2026-11-09T06:00:00Z',...(f.name==='坏文件.bin'?{}:{url:`https://cn-hangzhou-data.aliyundrive.net/x/${f.file_id}?di=bj29`})}}};}
 return {ok:false,error:'网盘请求超出已授权范围'};
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true});
 const code=fs.readFileSync(adapter,'utf8');
 const run=async({folder='root',pathname,select=[],mode='',token=true}={})=>{
  const tab=await browser.newPage();const log=[];await tab.exposeFunction('__ruxgetBridge',payload=>answer(payload,log,mode));
  await tab.goto(`${origin}/drive?folder=${folder}`);
  await tab.evaluate(({p,token})=>{history.replaceState(null,'',p);if(token)localStorage.setItem('token',JSON.stringify({access_token:'test-access-token',device_id:'test-device',default_drive_id:'111',token_type:'Bearer'}));else localStorage.removeItem('token');},{p:pathname||(folder==='root'?'/drive/file/all':'/drive/file/all/'+folder),token});
  await tab.evaluate(()=>{window.addEventListener('message',async e=>{const d=e.data;if(e.source!==window||d?.channel!=='shiying-netdisk-request')return;const reply=await window.__ruxgetBridge(d.payload);window.postMessage({channel:'shiying-netdisk-reply',intent:d.intent,id:d.id,...reply},location.origin);});});
  await tab.evaluate(indexes=>{const cards=[...document.querySelectorAll('[data-is-selected]')];for(const i of indexes)cards[i].setAttribute('data-is-selected','true');},select);
  await tab.addScriptTag({content:code});
  const result=await tab.evaluate(()=>globalThis.ShiyingNetdiskPage.resolve('intent-1','aliyun',{}));await tab.close();return {result,log};
 };
 // Card indexes in the root: 0 海报.png, 1 资料, 2 很多, 3 坏文件.bin, 4 海报.png (a second file with the same name).
 let {result,log}=await run({select:[0]});
 check(result.ok&&result.files.length===1&&result.files[0].title==='海报.png'&&result.files[0].key===id(1)&&result.files[0].size===575809&&result.files[0].path===''&&/^https:\/\/cn-hangzhou-data\.aliyundrive\.net\//.test(result.files[0].url),'one selected file comes back with its address, name, id and size');
 check(result.files[0].headers.Referer===origin+'/'&&result.files[0].headers['User-Agent']&&!('Cookie' in result.files[0].headers),'each file carries User-Agent and the page origin as Referer, no Cookie');
 check(log.every(l=>Object.keys(l.headers).some(k=>/^authorization$/i.test(k))&&Object.keys(l.headers).some(k=>/^x-device-id$/i.test(k))&&!Object.keys(l.headers).some(k=>/x-signature/i.test(k))),'every call carries authorization and x-device-id, never x-signature');
 check(log.some(l=>l.path==='/v2/user/get')&&log.filter(l=>l.path==='/adrive/v3/file/list').every(l=>l.body.drive_id===DRIVE),'the resource drive from /v2/user/get is used, not the token’s default drive');
 ({result}=await run({select:[4]}));check(result.ok&&result.files[0]?.key===id(9),'two cards with the same name map in page order');
 ({result}=await run({select:[0,4]}));check(result.ok&&result.files.length===2&&new Set(result.files.map(f=>f.key)).size===2,'both same-named files come back once each');
 ({result}=await run({select:[1]}));const paths=Object.fromEntries((result.files||[]).map(f=>[f.title,f.path]));
 check(result.ok&&paths['说明.pdf']==='资料'&&paths['报告.docx']==='资料/2024','a selected folder is expanded with relative paths: '+JSON.stringify(paths));
 ({result,log}=await run({select:[2]}));check(result.ok&&result.files.length===100&&/100/.test(result.warning||''),'130 files give the first 100 and a warning');
 check(log.filter(l=>l.path==='/adrive/v3/file/list'&&l.body.parent_file_id===id(3)).length>=2,'a long folder is read page by page with next_marker');
 ({result}=await run({folder:id(2),select:[0]}));check(result.ok&&result.files[0]?.title==='说明.pdf','inside a folder, the current folder comes from the address');
 ({result}=await run({select:[]}));check(result.ok===false&&/选中/.test(result.error),'nothing selected says to select something');
 ({result}=await run({select:[0,3]}));check(result.ok&&result.files.length===1&&/1 个文件未能获取/.test(result.warning||''),'a file without an address is skipped with a warning');
 ({result}=await run({select:[3]}));check(result.ok===false&&/未能获取下载地址/.test(result.error),'no address at all is an error');
 ({result}=await run({select:[0],mode:'expired'}));check(result.ok===false&&/登录已过期/.test(result.error),'an expired login says so');
 ({result}=await run({select:[0],token:false}));check(result.ok===false&&/登录阿里云盘/.test(result.error),'no token asks to log in');
 ({result}=await run({select:[0],pathname:'/drive/album'}));check(result.ok===false&&/全部文件/.test(result.error),'outside 全部文件 it asks to use 全部文件');
 ({result}=await run({select:[0],pathname:'/s/abc123'}));check(result.ok===false&&/保存到自己的阿里云盘/.test(result.error),'a share page asks to save to one’s own drive first');
 console.log(`netdisk-aliyun-check passed (${checks.length} checks).`);
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close().catch(()=>{});server.close();}})();
