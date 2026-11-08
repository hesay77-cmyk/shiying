// Black-box check of the 123 Pan adapter (rewrite unit 7e, spec 11-网盘-123云盘). No extension, no real account:
// a local page imitates yun.123pan.cn's virtual file table, address and localStorage token, a stand-in for Ruxget
// answers the adapter's bridge messages with data shaped like the observed api.123278.com answers, and the test reads resolve().
// RUXGET_ADAPTER points at the adapter file.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const adapter=process.env.RUXGET_ADAPTER||path.resolve(__dirname,'..','js/ruxget-netdisk-pan123.js');
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
let serial=74688000;const drive={},byId={};
const add=(parent,name,folder,size)=>{const item={FileId:++serial,FileName:name,Type:folder?1:0,Size:folder?0:size,ContentType:'0',S3KeyFlag:folder?'':`1852459445-0`,Etag:folder?'':(serial*7919).toString(16).padStart(32,'0'),ParentFileId:parent,Status:0,Trashed:false,DownloadUrl:''};(drive[parent]||(drive[parent]=[])).push(item);byId[item.FileId]=item;return item;};
const ROOT=74770410;
const poster=add(ROOT,'海报.png',false,575809);const docs=add(ROOT,'资料',true);const many=add(ROOT,'很多',true);const bad=add(ROOT,'坏文件.bin',false,5);const extra=add(ROOT,'备用.png',false,111);
add(docs.FileId,'说明.pdf',false,2048);const y=add(docs.FileId,'2024',true);add(y.FileId,'报告.docx',false,4096);
for(let i=0;i<130;i++)add(many.FileId,`文件${i}.txt`,false,i);
add(0,'Ruxget测试',true);
const row=item=>`<div class="mfy_h-table-module__row__P-Wnd mfy_h-table-module__virtualRow__LIeXI editable-row" role="row" data-row-key="${item.FileId}" draggable="true"><div class="mfy_h-table-module__virtualCell__4fRpa mfy_h-table-module__selectionColumn__-4eMY" role="cell"><label class="mfy_h-checkbox-module__root__ZzybL mfy_h-table-module__selectionCheckbox__5hqZo"><input type="checkbox"></label></div><div class="mfy_h-table-module__virtualCell__4fRpa mfy-table-row" role="cell"><div class="table-list-file-name"><div class="file-name-wrapper"><span class="text_LLXR0 table-file-name">${item.FileName}</span></div></div></div></div>`;
const page=folder=>`<!doctype html><meta charset="utf-8"><title>123云盘</title><div class="mfy_h-table-module__virtualRowSlot__vnzuN">${(drive[folder]||[]).map(row).join('')}</div>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(page(+(new URL(q.url,'http://x').searchParams.get('homeFilePath')||0)));});
const PAGE=50;
function answer(payload,log,mode){
 const u=new URL(payload.url),h=Object.fromEntries(Object.entries(payload.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));let body=null;try{body=payload.body?JSON.parse(payload.body):null;}catch{}
 log.push({path:u.pathname,method:payload.method||'GET',headers:h,query:Object.fromEntries(u.searchParams),body});
 if(u.hostname!=='api.123278.com')return {ok:false,error:'网盘请求超出已授权范围'};
 if([...u.searchParams.keys()].some(k=>/^\d+$/.test(k)))return {ok:true,value:{status:200,data:{code:400,message:'unexpected signature parameter'}}};
 if(h.authorization!=='Bearer test-token'||mode==='expired')return {ok:true,value:{status:200,data:{code:20101,message:'未登录',data:null}}};
 if(u.pathname==='/b/api/file/list/new'&&(payload.method||'GET')==='GET'){const list=drive[+u.searchParams.get('parentFileId')]||[];
  const pageNo=+(u.searchParams.get('Page')||1),start=(pageNo-1)*PAGE;if(start>0&&u.searchParams.get('next')!==String(start))return {ok:true,value:{status:200,data:{code:400,message:'bad cursor'}}};
  const next=start+PAGE<list.length?String(start+PAGE):'-1';
  return {ok:true,value:{status:200,data:{code:0,message:'ok',data:{Next:next,Len:Math.min(PAGE,list.length-start),IsFirst:pageNo===1,Expired:false,Total:list.length,InfoList:list.slice(start,start+PAGE)}}}};}
 if(u.pathname==='/b/api/v2/file/download_info'&&payload.method==='POST'){
  if(!/^application\/json/.test(h['content-type']||''))return {ok:true,value:{status:200,data:{code:400,message:'bad content type'}}};
  const f=byId[body?.fileId];if(!f||body.etag!==f.Etag||body.s3keyFlag!==f.S3KeyFlag||body.driveId!==0||body.size!==f.Size)return {ok:true,value:{status:200,data:{code:5113,message:'文件信息不符'}}};
  if(mode==='quota')return {ok:true,value:{status:200,data:{code:5066,message:'今日下载流量已用完'}}};
  if(f===bad)return {ok:true,value:{status:200,data:{code:0,message:'ok',data:{dispatchList:[],downloadPath:'',fileId:f.FileId}}}};
  return {ok:true,value:{status:200,data:{code:0,message:'ok',data:{dispatchList:[{prefix:'https://42-4-59-150-v3.pd1.cjjd19.com',isp:'下载线路一'},{prefix:'https://42-4-59-151-v3.pd1.cjjd19.com',isp:'下载线路二'}],downloadPath:`/user-other-free-download-cdn.123295.com/123-707/${f.Etag}/c-m8010?v=5&t=1&s=x&filename=${encodeURIComponent(f.FileName)}`,fileId:f.FileId}}}};}
 if(u.pathname==='/b/api/file/download_info')return {ok:true,value:{status:200,data:{code:0,message:'ok',data:{DownloadUrl:'https://web-pro2.cjjd18.com/download-v2/?params=x&is_s3=0'}}}};
 return {ok:false,error:'网盘请求超出已授权范围'};
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true});
 const code=fs.readFileSync(adapter,'utf8');
 const run=async({folder=ROOT,address,select=[],mode='',token='test-token'}={})=>{
  const tab=await browser.newPage();const log=[];await tab.exposeFunction('__ruxgetBridge',payload=>answer(payload,log,mode));
  await tab.goto(`${origin}/?remember=yes${folder?'&homeFilePath='+folder:''}`);
  await tab.evaluate(({address,token})=>{if(address)history.replaceState(null,'',address);localStorage.clear();localStorage.setItem('previousDirectoryId','"999"');if(token!==null)localStorage.setItem('authorToken',token);},{address,token});
  await tab.evaluate(()=>{window.addEventListener('message',async e=>{const d=e.data;if(e.source!==window||d?.channel!=='shiying-netdisk-request')return;const reply=await window.__ruxgetBridge(d.payload);window.postMessage({channel:'shiying-netdisk-reply',intent:d.intent,id:d.id,...reply},location.origin);});});
  await tab.evaluate(indexes=>{const rows=[...document.querySelectorAll('[role=row][data-row-key]')];for(const i of indexes){rows[i].querySelector('input').checked=true;rows[i].classList.add('mfy_h-table-module__rowSelected__SS40i');rows[i].querySelector('label').classList.add('mfy_h-checkbox-module__checked__wQSPh');}},select);
  await tab.addScriptTag({content:code});
  const result=await tab.evaluate(()=>globalThis.ShiyingNetdiskPage.resolve('intent-1','pan123',{}));await tab.close();return {result,log};
 };
 // Row indexes in the folder: 0 海报.png, 1 资料, 2 很多, 3 坏文件.bin, 4 备用.png.
 let {result,log}=await run({select:[0]});
 check(result.ok&&result.files.length===1&&result.files[0].title==='海报.png'&&result.files[0].key===String(poster.FileId)&&result.files[0].size===575809&&result.files[0].path===''&&result.files[0].url.startsWith('https://42-4-59-150-v3.pd1.cjjd19.com/user-other-free-download-cdn.123295.com/'),'one selected file comes back with prefix + downloadPath, name, id and size');
 check(result.files[0].headers.Referer===origin+'/'&&result.files[0].headers['User-Agent']&&!('Cookie' in result.files[0].headers),'each file carries User-Agent and the page origin as Referer, no Cookie');
 check(log.every(l=>l.headers.authorization==='Bearer test-token'&&![...Object.keys(l.query)].some(k=>/^\d+$/.test(k))),'every call carries the token and no signature parameter');
 check(log.some(l=>l.path==='/b/api/file/list/new'&&l.query.parentFileId===String(ROOT))&&!log.some(l=>l.path==='/b/api/file/download_info'),'the folder comes from homeFilePath and only the v2 address call is used');
 ({result}=await run({select:[4,0]}));check(result.ok&&result.files.length===2&&result.files.map(f=>f.key).join()===[poster.FileId,extra.FileId].join(),'two files come back in page order');
 ({result}=await run({select:[1]}));const paths=Object.fromEntries((result.files||[]).map(f=>[f.title,f.path]));
 check(result.ok&&paths['说明.pdf']==='资料'&&paths['报告.docx']==='资料/2024','a selected folder is expanded with relative paths: '+JSON.stringify(paths));
 ({result,log}=await run({select:[2]}));check(result.ok&&result.files.length===100&&/100/.test(result.warning||''),'130 files give the first 100 and a warning');
 check(log.filter(l=>l.path==='/b/api/file/list/new'&&l.query.parentFileId===String(many.FileId)).length>=2,'a long folder is read page by page with Next');
 ({result,log}=await run({folder:0,select:[0]}));check(log.some(l=>l.path==='/b/api/file/list/new'&&l.query.parentFileId==='0'),'the root folder (no homeFilePath) is listed as 0');
 ({result}=await run({select:[]}));check(result.ok===false&&/勾选/.test(result.error),'nothing selected says to select something');
 ({result}=await run({select:[0,3]}));check(result.ok&&result.files.length===1&&/1 个文件未能获取/.test(result.warning||''),'a file without an address is skipped with a warning');
 ({result}=await run({select:[3]}));check(result.ok===false&&/未能获取下载地址/.test(result.error),'no address at all is an error');
 ({result}=await run({select:[0],mode:'expired'}));check(result.ok===false&&/登录已过期/.test(result.error),'code 20101 says the login has expired');
 ({result}=await run({select:[0],mode:'quota'}));check(result.ok===false&&/123 云盘返回错误：今日下载流量已用完/.test(result.error),'another error code shows the drive’s message');
 ({result}=await run({select:[0],token:null}));check(result.ok===false&&/登录 123 云盘/.test(result.error),'no token asks to log in');
 ({result}=await run({select:[0],token:'"test-token"'}));check(result.ok&&result.files.length===1,'a JSON-quoted token is unwrapped');
 ({result}=await run({select:[0],address:'/s/abcd-1234'}));check(result.ok===false&&/保存到自己的 123 云盘/.test(result.error),'a share page asks to save to one’s own drive first');
 console.log(`netdisk-pan123-check passed (${checks.length} checks).`);
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close().catch(()=>{});server.close();}})();
