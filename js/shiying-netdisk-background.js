// Netdisk handoff stays within Native Messaging. The user's active downloads are never reconfigured.
(()=>{
 const C=ShiyingNetdisk,intents=new Map();let ruleSerial=1690000000;
 const errorText=error=>String(error?.message||'网盘下载失败，请重试').replace(/https?:\/\/\S+/g,'[地址]').slice(0,220);
 const trusted=sender=>sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
 async function flags(){return (await chrome.storage.local.get('shiyingNetdisks')).shiyingNetdisks||{};}
 async function enabled(id){return (await flags())[id]?.enabled===true&&await chrome.permissions.contains({permissions:['nativeMessaging','cookies'],origins:C.origins(id)});}
 async function sync(){
  const saved=await flags(),registered=await chrome.scripting.getRegisteredContentScripts(),wanted=[];
  for(const id of Object.keys(C.items))if(saved[id]?.enabled&&await enabled(id))wanted.push({id:'shiying-netdisk-'+id,matches:C.origins(id).filter(pattern=>C.items[id].pages.includes(new URL(pattern).hostname)||C.items[id].shareOrigins?.includes(pattern)),js:['js/shiying-netdisk.js','js/shiying-locale.js', 'js/shiying-netdisk-content.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true});
  const remove=registered.filter(item=>item.id.startsWith('shiying-netdisk-')&&!wanted.some(w=>w.id===item.id)).map(item=>item.id);
  if(remove.length)await chrome.scripting.unregisterContentScripts({ids:remove});
  const add=wanted.filter(item=>!registered.some(old=>old.id===item.id));if(add.length)await chrome.scripting.registerContentScripts(add);
  const update=wanted.filter(item=>{const old=registered.find(old=>old.id===item.id);return old&&(JSON.stringify(old.matches)!==JSON.stringify(item.matches)||JSON.stringify(old.js)!==JSON.stringify(item.js));});if(update.length)await chrome.scripting.updateContentScripts(update);
 }
 // Cookies for a URL, including ones the drive stored partitioned under its own site (Chrome CHIPS).
 async function cookiesFor(url,page){const site='https://'+new URL(page||url).hostname.split('.').slice(-2).join('.');const lists=await Promise.all([chrome.cookies.getAll({url}),chrome.cookies.getAll({url,partitionKey:{topLevelSite:site}}).catch(()=>[])]);const seen=new Set(),out=[];for(const c of lists.flat()){const k=c.name+'|'+c.domain+'|'+c.path;if(seen.has(k))continue;seen.add(k);out.push(c);}return out;}
 function context(sender,token){const item=intents.get(token);if(!item||item.expires<Date.now()||item.tab!==sender.tab?.id||item.document!==sender.documentId||sender.frameId!==0||C.site(sender.url)!==item.provider)throw new Error('本次下载已结束，请重新点击 Ruxget 下载');return item;}
 async function native(payload){const ping=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});if(!ping?.netdisk||!(ping.netdiskApi>=2))throw new Error('请先安装支持新版网盘下载的 Ruxget 桌面版 0.4.28 或更新版本');const result=await chrome.runtime.sendNativeMessage('org.shiying.desktop',payload);if(!result?.ok)throw new Error(result?.error||'桌面版没有接收任务，请重试');return result;}
 async function request(message,sender){
  const intent=context(sender,message.intent);if(!await enabled(intent.provider))throw new Error('这个网盘的 Ruxget 下载已关闭');
  if(++intent.requests>120)throw new Error('本次文件较多，请分批下载');
  const p=message.payload||{},u=C.api(intent.provider,p.url,p.method),headers={};
  if(u.hostname.endsWith('.share.123pan.cn')&&u.origin!==new URL(sender.url).origin)throw new Error('网盘请求超出当前分享页面');
  if(typeof p.body==='string'&&p.body.length>65536)throw new Error('网盘请求过大');
  for(const [name,raw] of Object.entries(p.headers||{})){const value=String(raw??'');if(!/^(user-agent|referer|origin|content-type|accept|authorization|platform|x-canary|x-captcha-token|x-device-id|sign-type|accesstoken|timestamp|signature|caller|cms-device|mcloud-|x-|hcy-)/i.test(name)||!/^[a-zA-Z0-9-]{1,64}$/.test(name)||value.length>8192||/[\r\n\x00]/.test(value))throw new Error('网盘请求头无效');headers[name]=value;}
  if(intent.provider==='quark'||intent.provider==='uc'){
   for(const name of Object.keys(headers))if(/^(origin|referer)$/i.test(name))delete headers[name];
   headers.Origin=new URL(sender.url).origin;headers.Referer=headers.Origin+'/';
  }
  const cookie=(await cookiesFor(u.href,sender.url)).map(item=>item.name+'='+item.value).join('; ');
  if(cookie.length>16384)throw new Error('网盘登录信息过长，请重新登录');if(cookie)headers.Cookie=cookie;
  const rules=Object.entries(headers).map(([header,value])=>({header,operation:'set',value}));const rule=++ruleSerial;
  try{
   if(rules.length)await chrome.declarativeNetRequest.updateSessionRules({addRules:[{id:rule,priority:3,action:{type:'modifyHeaders',requestHeaders:rules},condition:{initiatorDomains:[chrome.runtime.id],requestDomains:[u.hostname],tabIds:[chrome.tabs.TAB_ID_NONE],resourceTypes:['xmlhttprequest','other']}}]});
   const reply=await fetch(u.href,{method:p.method||'GET',body:p.method==='POST'?p.body:undefined,credentials:'include',signal:AbortSignal.timeout(20000)});
   try{const final=C.api(intent.provider,reply.url,p.method);if(final.hostname.endsWith('.share.123pan.cn')&&final.origin!==new URL(sender.url).origin)throw new Error();}catch{throw new Error('网盘跳转到登录页，请先完成登录或授权');}
   if(p.type==='final'){await reply.body?.cancel();return {finalUrl:reply.url,status:reply.status};}
   if(!reply.ok)throw new Error('网盘返回 HTTP '+reply.status+'，请刷新登录状态后重试');
   let size=0,text='';const reader=reply.body.getReader(),decoder=new TextDecoder();try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>2*1024*1024)throw new Error('网盘响应过大');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
   let data=text;if(p.type!=='text')try{data=JSON.parse(text);}catch{throw new Error('网盘返回了无效数据，请刷新页面并确认登录状态后重试');}
   return {data,finalUrl:reply.url,status:reply.status};
  }finally{if(rules.length)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[rule]});}
 }
 async function run(message,sender){
  const item=context(sender,message.intent);if(item.running)throw new Error('这次下载正在处理中');item.running=true;
  try{
   if(!await enabled(item.provider))throw new Error('请先启用这个网盘的 Ruxget 下载');
   const target={tabId:sender.tab.id,documentIds:[sender.documentId]};
   // 2026-11-09: drives rewritten from Ruxget's own specs use their own adapter file (spec 07); the rest keep the old one for now.
   const ownAdapters={quark:['js/ruxget-netdisk-quark.js'],aliyun:['js/ruxget-netdisk-aliyun.js'],baidu:['js/ruxget-netdisk-baidu.js'],xunlei:['js/ruxget-netdisk-xunlei.js'],uc:['js/ruxget-netdisk-quark.js'],pan123:['js/ruxget-netdisk-pan123.js']};
   if(!ownAdapters[item.provider])throw new Error('网盘尚未支持');
   await chrome.scripting.executeScript({target,world:'MAIN',files:ownAdapters[item.provider]});
   const values={};
   const result=(await chrome.scripting.executeScript({target,world:'MAIN',func:(intent,provider,values)=>globalThis.ShiyingNetdiskPage.resolve(intent,provider,values),args:[message.intent,item.provider,values]}))[0]?.result;
   if(!result?.ok)throw new Error(result?.error||'当前网盘页面未能读取所选文件');
   if(!await enabled(item.provider))throw new Error('这个网盘的 Ruxget 下载已关闭');
   if(!Array.isArray(result.files)||!result.files.length||result.files.length>100)throw new Error('一次请选择 1–100 个文件');
   const files=result.files.map((file,index)=>{C.file(item.provider,file.url);if(typeof file.title!=='string'||!file.title||file.title.length>512||typeof file.key!=='string'||file.key.length>256||/[\x00-\x1f\x7f]/.test(file.key))throw new Error('网盘文件名或标识无效');if(file.size!==undefined&&file.size!==null&&(!Number.isSafeInteger(Number(file.size))||Number(file.size)<0))throw new Error('网盘文件大小无效');for(const [key,value]of Object.entries(file.headers||{}))if(!['User-Agent','Referer','Cookie'].includes(key)||typeof value!=='string'||value.length>(key==='User-Agent'?512:16384)||/[\r\n\x00]/.test(value)||key==='Referer'&&value!==new URL(sender.url).origin+'/')throw new Error('文件请求头无效');return {...file,index};});
   if(item.provider==='baidu')for(const file of files){const cookie=(await cookiesFor(file.url,sender.url)).map(c=>c.name+'='+c.value).join('; ');if(cookie.length>16384)throw new Error('网盘登录信息过长，请重新登录');if(cookie)file.headers.Cookie=cookie;}
   if(item.provider==='quark'||item.provider==='uc'){
    const cookies=await cookiesFor(sender.url,sender.url);let pageCookie="";try{pageCookie=String((await chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[sender.frameId||0]},func:()=>document.cookie}))[0]?.result||"");}catch{}
    for(const file of files){
     // Keep the page's current download grant; the extension's cookie view may be incomplete.
     const current=file.headers.Cookie||pageCookie,names=new Set(current.split(';').map(pair=>pair.trim().split('=')[0]));
     const cookie=[current,...cookies.filter(c=>!names.has(c.name)).map(c=>c.name+'='+c.value)].filter(Boolean).join('; ');
     if(cookie.length>16384)throw new Error('网盘登录信息过长，请重新登录');if(cookie)file.headers.Cookie=cookie;
    }
   }
   const requestId=message.intent.replaceAll('-','');let added=0,chunk=[];
   const send=async()=>{if(!chunk.length)return;if(!await enabled(item.provider))throw new Error('这个网盘的 Ruxget 下载已关闭');const reply=await native({action:'netdisk',provider:item.provider,source:new URL(sender.url).origin+'/',requestId,files:chunk});added+=reply.count;chunk=[];if(typeof RuxgetDesktopTasks!=="undefined"&&Array.isArray(reply.jobs)){for(const job of reply.jobs)if(job&&job.id)await RuxgetDesktopTasks.remember(String(job.id),String(job.name||"")).catch(()=>{});RuxgetDesktopTasks.watch?.(60000)?.catch?.(()=>{});}};
   try{for(const file of files){if(new TextEncoder().encode(JSON.stringify({files:[...chunk,file]})).length>48000){await send();}if(new TextEncoder().encode(JSON.stringify(file)).length>48000)throw new Error('文件链接或登录信息过长');chunk.push(file);}await send();}catch(error){if(added>0)return {ok:true,count:added,warning:'部分文件未加入，请先查看下载任务后再重试'};throw error;}return {ok:true,count:added};
  }finally{intents.delete(message.intent);}
 }
 async function handle(message,sender){
  if(message.Message==='shiyingNetdiskAPI')return {ok:true,value:await request(message,sender)};
  if(message.Message==='shiyingNetdiskRun')return run(message,sender);
  if(message.Message==='shiyingNetdiskBegin'){const provider=C.site(sender.url);if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.documentId||!provider||!await enabled(provider))throw new Error('请在 Ruxget 插件中启用这个网盘');for(const [key,value]of intents){if(value.expires<Date.now())intents.delete(key);else if(value.document===sender.documentId)throw new Error('正在处理，请稍候');}const intent=crypto.randomUUID();intents.set(intent,{provider,tab:sender.tab.id,document:sender.documentId,expires:Date.now()+180000,requests:0});return {ok:true,intent};}
  if(message.Message==='shiyingNetdiskState'){const provider=C.site(sender.url)||message.provider;if(!provider||!C.items[provider])return {ok:true,enabled:false};if(!trusted(sender)&&sender.frameId!==0)throw new Error('页面无效');return {ok:true,provider,config:C.items[provider],...(await flags())[provider],enabled:await enabled(provider)};}
  if(message.Message==='shiyingNetdiskSync'){if(!trusted(sender))throw new Error('请从 Ruxget 插件设置');await sync();await chrome.storage.local.remove('shiyingNetdiskBaiduSealed');await chrome.storage.session.remove(['shiyingNetdiskAuthTab','shiyingNetdiskAuthError']);const tab=await chrome.tabs.get(message.tabId);if(C.site(tab.url))await chrome.scripting.executeScript({target:{tabId:tab.id},files:['js/shiying-netdisk.js','js/shiying-locale.js', 'js/shiying-netdisk-content.js']});return {ok:true};}
  if(message.Message==='shiyingNetdiskOptions'){if(!trusted(sender)&&!await enabled(C.site(sender.url)))throw new Error('这个网盘尚未启用');return native({action:message.command==='folder'?'netdiskFolder':'show'});}
  if(message.Message==='shiyingNetdiskHide'){const provider=C.site(sender.url);if(!provider)throw new Error('网盘无效');const saved=await flags();saved[provider]={...saved[provider],visible:false};await chrome.storage.local.set({shiyingNetdisks:saved});return {ok:true};}
  throw new Error('不支持的网盘操作');
 }
 const ready=(async()=>{const old=await chrome.declarativeNetRequest.getSessionRules();const ids=old.filter(rule=>rule.id>=1690000000&&rule.id<1691000000).map(rule=>rule.id);if(ids.length)await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:ids});await sync();})();
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(!message.Message?.startsWith('shiyingNetdisk'))return;ready.then(()=>handle(message,sender)).then(respond,error=>respond({ok:false,error:errorText(error)}));return true;});
 chrome.permissions.onRemoved.addListener(()=>sync().catch(()=>{}));ready.catch(()=>{});
})();
