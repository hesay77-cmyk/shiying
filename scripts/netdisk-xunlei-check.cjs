// Black-box check of the Xunlei drive adapter (rewrite unit 7d, spec 10-网盘-迅雷). No extension, no real account:
// a local page imitates pan.xunlei.com's file list and its localStorage login data, a stand-in for Ruxget answers the
// adapter's bridge messages with data shaped like the observed api-pan.xunlei.com answers, and the test reads resolve().
// RUXGET_ADAPTER points at the adapter file.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const adapter=process.env.RUXGET_ADAPTER||path.resolve(__dirname,'..','js/ruxget-netdisk-xunlei.js');
const checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const CID='Tq7cLientIdAbc12',DEV='0123456789abcdef0123456789abcdef';let serial=0;const id=()=>'VP'+(++serial).toString(36).padStart(22,'x')+'A1';
const drive={},byId={};const add=(parent,name,folder,size)=>{const item={kind:folder?'drive#folder':'drive#file',id:id(),parent_id:parent,name,size:folder?'0':String(size)};(drive[parent]||(drive[parent]=[])).push(item);byId[item.id]=item;return item;};
const ROOT='VProotfolderxxxxxxxxxxA1';
const poster=add(ROOT,'海报.png',false,575809);const docs=add(ROOT,'资料',true);const many=add(ROOT,'很多',true);const bad=add(ROOT,'坏文件.bin',false,5);const odd=add(ROOT,'备用.png',false,111);
add(docs.id,'说明.pdf',false,2048);const y=add(docs.id,'2024',true);add(y.id,'报告.docx',false,4096);
for(let i=0;i<130;i++)add(many.id,`文件${i}.txt`,false,i);
const li=item=>`<li data-file-id="${item.id}" class="SourceListItem__item--XxpOC normal-item"><div class="SourceListItem__main--c9HnH"><div class="SourceListItem__checkbox--wP+8J"><div><label class="FileCheckBox__checkbox--HYwz8"><input type="checkbox" class="FileCheckBox__input--Z7wzZ xlpfont"> <span class="td-checkbox__label"></span></label></div></div><div class="SourceListItem__content--bJbFo"><div class="SourceListItem__title--fq2DG"><div class="SourceListItem__name--y6dVw"><a title="${item.name}"><span class="highlight-text">${item.name}</span></a></div></div></div></div></li>`;
const page=`<!doctype html><meta charset="utf-8"><title>迅雷云盘</title><ul class="pan-list">${drive[ROOT].map(li).join('')}</ul>`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(page);});
const fail=(status,error,description)=>({ok:true,value:{status,data:{error,error_code:status===401?16:9,error_description:description}}});
function answer(payload,log,mode){
 const u=new URL(payload.url),h=Object.fromEntries(Object.entries(payload.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));log.push({path:u.pathname,method:payload.method||'GET',headers:h,query:Object.fromEntries(u.searchParams)});
 if(u.hostname!=='api-pan.xunlei.com'||(payload.method||'GET')!=='GET')return {ok:false,error:'网盘请求超出已授权范围'};
 if(h.authorization!=='Bearer test-access')return fail(401,'unauthenticated','未登录');
 if(h['x-captcha-token']!=='test-captcha'||h['x-device-id']!==DEV)return fail(400,'captcha_invalid','验证码无效');
 if(h['x-client-id']!==CID)return fail(400,'invalid_argument','请求参数错误');
 if(mode==='expired')return fail(401,'unauthenticated','登录已过期');
 if(mode==='captcha')return fail(400,'captcha_invalid','验证码无效');
 if(u.pathname==='/drive/v1/files'){const list=drive[u.searchParams.get('parent_id')]||[];let filters;try{filters=JSON.parse(u.searchParams.get('filters'));}catch{return fail(400,'invalid_argument','请求参数错误');}
  if(filters?.trashed?.eq!==false)return fail(400,'invalid_argument','请求参数错误');
  const start=+(u.searchParams.get('page_token')||0),limit=Math.min(+(u.searchParams.get('limit')||50),100),next=start+limit<list.length?String(start+limit):'';
  return {ok:true,value:{status:200,data:{kind:'drive#fileList',next_page_token:next,files:list.slice(start,start+limit)}}};}
 const m=u.pathname.match(/^\/drive\/v1\/files\/([^/]+)$/);
 if(m){const f=byId[m[1]];if(!f)return fail(404,'file_not_found','文件不存在');
  const link=`https://vod0781-aliyun04-vip-lixian.xunlei.com/download/?fid=${f.id}&g=x`;
  const extra=f.kind==='drive#folder'||f===bad?{web_content_link:'',links:{}}:f===odd?{web_content_link:'',links:{'application/octet-stream':{url:link+'&alt=1',token:'',expire:'2026-11-10T00:00:00Z'}}}:{web_content_link:link,links:{'application/octet-stream':{url:link,token:'',expire:'2026-11-10T00:00:00Z'}}};
  return {ok:true,value:{status:200,data:{...f,mime_type:'application/octet-stream',phase:'PHASE_TYPE_COMPLETE',trashed:false,medias:[],...extra}}};}
 return {ok:false,error:'网盘请求超出已授权范围'};
}
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||'E:/ai/.tmp/shiying-browser/chromium-1234/chrome-win64/chrome.exe',headless:true});
 const code=fs.readFileSync(adapter,'utf8');
 const run=async({select=[],mode='',login='full',address='/?path=%2FRuxget%E6%B5%8B%E8%AF%95'}={})=>{
  const tab=await browser.newPage();const log=[];await tab.exposeFunction('__ruxgetBridge',payload=>answer(payload,log,mode));
  await tab.goto(origin+'/');
  await tab.evaluate(({address,login,CID,DEV})=>{history.replaceState(null,'',address);localStorage.clear();localStorage.setItem('xlPanHomeRoutes','[]');localStorage.setItem('captcha_OtherClientXyz99','{"token":"wrong"}');
   if(login!=='none')localStorage.setItem('credentials_'+CID,JSON.stringify({token_type:'Bearer',access_token:'test-access',refresh_token:'r',expires_in:43200,sub:'1',user_id:'1'}));
   if(login==='full'){localStorage.setItem('captcha_'+CID,JSON.stringify({token:'test-captcha',expires_at:'1794161242000'}));localStorage.setItem('deviceid','wdi10.'+DEV+'xR4ndomTailCharacters00000000000');}},{address,login,CID,DEV});
  await tab.evaluate(()=>{window.addEventListener('message',async e=>{const d=e.data;if(e.source!==window||d?.channel!=='shiying-netdisk-request')return;const reply=await window.__ruxgetBridge(d.payload);window.postMessage({channel:'shiying-netdisk-reply',intent:d.intent,id:d.id,...reply},location.origin);});});
  await tab.evaluate(indexes=>{const rows=[...document.querySelectorAll('li[data-file-id]')];for(const i of indexes){rows[i].querySelector('input').checked=true;rows[i].classList.add('SourceListItem__active--4U0f4');rows[i].querySelector('label').classList.add('is-checked');}},select);
  await tab.addScriptTag({content:code});
  const result=await tab.evaluate(()=>globalThis.ShiyingNetdiskPage.resolve('intent-1','xunlei',{}));await tab.close();return {result,log};
 };
 // Row indexes: 0 海报.png, 1 资料, 2 很多, 3 坏文件.bin, 4 备用.png (address only in links).
 let {result,log}=await run({select:[0]});
 check(result.ok&&result.files.length===1&&result.files[0].title==='海报.png'&&result.files[0].key===poster.id&&result.files[0].size===575809&&result.files[0].path===''&&/^https:\/\/vod0781-aliyun04-vip-lixian\.xunlei\.com\//.test(result.files[0].url),'one selected file comes back with its address, name, id and numeric size');
 check(result.files[0].headers.Referer===origin+'/'&&result.files[0].headers['User-Agent']&&!('Cookie' in result.files[0].headers),'each file carries User-Agent and the page origin as Referer, no Cookie');
 check(log.length>=1&&log.every(l=>l.method==='GET'&&l.headers.authorization==='Bearer test-access'&&l.headers['x-captcha-token']==='test-captcha'&&l.headers['x-client-id']===CID&&l.headers['x-device-id']===DEV),'every call is a GET with the four login headers, client id taken from the key name');
 ({result}=await run({select:[0,4]}));check(result.ok&&result.files.length===2&&result.files[0].key===poster.id&&result.files[1].key===odd.id&&/alt=1/.test(result.files[1].url),'files come back in page order; links is used when web_content_link is empty');
 ({result}=await run({select:[1]}));const paths=Object.fromEntries((result.files||[]).map(f=>[f.title,f.path]));
 check(result.ok&&paths['说明.pdf']==='资料'&&paths['报告.docx']==='资料/2024','a selected folder is expanded with relative paths: '+JSON.stringify(paths));
 ({result,log}=await run({select:[2]}));check(result.ok&&result.files.length===100&&/100/.test(result.warning||''),'130 files give the first 100 and a warning');
 check(log.filter(l=>l.path==='/drive/v1/files'&&l.query.parent_id===many.id).length>=2,'a long folder is read page by page with next_page_token');
 ({result}=await run({select:[]}));check(result.ok===false&&/勾选/.test(result.error),'nothing selected says to select something');
 ({result}=await run({select:[0,3]}));check(result.ok&&result.files.length===1&&/1 个文件未能获取/.test(result.warning||''),'a file without an address is skipped with a warning');
 ({result}=await run({select:[3]}));check(result.ok===false&&/未能获取下载地址/.test(result.error),'no address at all is an error');
 ({result}=await run({select:[0],mode:'expired'}));check(result.ok===false&&/登录已过期/.test(result.error),'an expired login says so');
 ({result}=await run({select:[0],mode:'captcha'}));check(result.ok===false&&/重新验证/.test(result.error),'an invalid captcha token asks to refresh');
 ({result}=await run({select:[0],login:'none'}));check(result.ok===false&&/登录迅雷云盘/.test(result.error),'no credentials asks to log in');
 ({result}=await run({select:[0],login:'partial'}));check(result.ok===false&&/不完整/.test(result.error),'missing captcha token or device id says the login data is incomplete');
 ({result}=await run({select:[0],address:'/s/VNabc123'}));check(result.ok===false&&/保存到自己的迅雷云盘/.test(result.error),'a share page asks to save to one’s own drive first');
 console.log(`netdisk-xunlei-check passed (${checks.length} checks).`);
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close().catch(()=>{});server.close();}})();
