/* Adapted from LinkSwift 1.1.3, Hmjz100 and 油小猴, AGPL-3.0-or-later.
 * Source and changes: third-party-source/LinkSwift-1.1.3.user.js, scripts/build-netdisk.py.
 * This adapter has no userscript manager, remote code, page theme changes or download UI.
 */
(()=>{
 'use strict';
 if(globalThis.ShiyingNetdiskPage)return;
 const unsafeWindow=window;
 const clean=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
 globalThis.ShiyingNetdiskPage={async resolve(intent,provider,values={}){
  const pending=new Map();let serial=0,output=null,expected=[],requests=0;
  const onReply=e=>{if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='shiying-netdisk-reply'||e.data.intent!==intent)return;const item=pending.get(e.data.id);if(!item)return;pending.delete(e.data.id);clearTimeout(item.timer);e.data.ok?item.resolve(e.data.value):item.reject(new Error(e.data.error||'网盘请求失败'));};
  window.addEventListener('message',onReply);
  const call=(action,payload)=>new Promise((resolve,reject)=>{if(++requests>120)return reject(new Error('本次文件数量较多，请分批选择文件下载'));const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('网盘请求超时，请重试'));},25000);pending.set(id,{resolve,reject,timer});window.postMessage({channel:'shiying-netdisk-request',intent,id,action,payload},location.origin);});
  const fail=text=>{throw new Error(clean(text)||'未能获取下载地址，请刷新网盘后重试');};
  const message={error:fail,warning:fail,info:fail,success:fail};
  const Swal={fire:async options=>fail(options.html||options.title),close(){}};
  const $=selector=>Array.from(document.querySelectorAll(selector));
  const $doc={find:()=>({html(){}})};
  const GM_openInTab=()=>fail('首次下载需要百度网盘授权，请在Ruxget插件内点击“百度授权”后重试');
  const temp={main:null,page:'',mode:'aria2',links:[],glinks:[],swalDefault:{}};
  /*LINKSWIFT_CONFIGURATION*/
  const memory={...values},storage=new Map();
  const recordKey=item=>String(item.fs_id??item.fileId??item.fid??item.FileId??item.contentID??item.contentId??item.id??'');
  const base={
   /*LINKSWIFT_HELPERS*/
   clone:value=>JSON.parse(JSON.stringify(value)),
   getStorage(key){if(storage.has(key))return storage.get(key);const value=localStorage.getItem(key);try{return JSON.parse(value);}catch{return value;}},
   setStorage(key,value){if(key)storage.set(key,value);},
   getValue:key=>memory[key],setValue:(key,value)=>{memory[key]=value;},delValue:key=>{delete memory[key];},
   sleep:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(1000,ms))),
   async get(url,headers={},type='json'){return (await call('api',{url:String(url),headers,method:'GET',type})).data;},
   async post(url,data,headers={},type='json'){const form=data instanceof URLSearchParams;return (await call('api',{url:String(url),headers:form?{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',...headers}:headers,method:'POST',body:typeof data==='string'||form?String(data):JSON.stringify(data),type})).data;},
   async getFinal(url,headers={},usingGET=false,returnURL=true){const result=await call('api',{url:String(url),headers,method:usingGET?'GET':'HEAD',type:'final'});return returnURL?result.finalUrl:result;},
   getMirrorList:()=>[],showMainDialog(){},
   generateDom([items,mapper]){
    if(!Array.isArray(items)||!items.length)fail('没有可下载的文件，请先勾选文件');
    if(items.length>100)fail('一次最多下载 100 个文件，请分批选择');
    expected=temp.main.getSelectedList().filter(item=>!mapper.isFolder(item)).map(recordKey);
    output=items.filter(item=>!mapper.isFolder(item)).map(item=>({url:mapper.getFileLink(item),title:mapper.getFileName(item),size:mapper.getFileSize(item),key:recordKey(item)}));
    return '';
   }
  };
  /*LINKSWIFT_ADAPTERS*/
  const baiduSelected=$baidu.getSelectedList;
  $baidu.getSelectedList=function(){
   if(temp.page==='share'){
    const rows=[...document.querySelectorAll('[data-file-key]')].filter(node=>node.getClientRects().length);
    if(rows.length){
     const keys=rows.filter(node=>node.querySelector('[role=checkbox][aria-checked=true]')).map(node=>node.getAttribute('data-file-key'));
     if(!keys.length)return [];
     const files=unsafeWindow.yunData?.file_list||unsafeWindow.locals?.dump?.().file_list?.value;
     const selected=Array.isArray(files)?files.filter(item=>keys.includes(String(item.fs_id))):[];
     if(new Set(keys).size!==keys.length||selected.length!==keys.length)fail('网盘列表刚刚发生变化，请刷新后重新勾选文件');
     return base.clone(selected);
    }
   }
   const selected=baiduSelected.call(this);if(selected.length||temp.page!=='share')return selected;
   // The new single-file preview has no selectable list. Never select a whole share implicitly.
   const files=unsafeWindow.yunData?.file_list;
   if(document.querySelector('.bottom_download_btn')&&!document.querySelector('.JS-list-view-item,.file-list,.wp-s-core-pan')&&Array.isArray(files)&&files.length===1&&files[0].isdir===0)return base.clone(files);
   return [];
  };
  // Cached grants arrive from the isolated extension; a fresh grant requires its explicit button.
  $baidu.getToken=async()=>fail('首次下载需要百度网盘授权，请在Ruxget插件内点击“百度授权”后重试');
  const adapters={baidu:$baidu,aliyun:$aliyun,mcloud:$mcloud,tcloud:$tcloud,xunlei:$xunlei,quark:$quark,uc:$uc,pan123:$123pan};
  try{
   const main=adapters[provider];if(!main)fail('当前网盘尚未支持');temp.main=main;temp.page=main.detectPage();const modern123=provider==='pan123'&&/^[a-z0-9-]+\.share\.123pan\.cn$/.test(location.hostname)&&/^\/123pan\/[^/]+\/?$/.test(location.pathname);if(modern123)temp.page='share';
   const selected=base.clone(main.getSelectedList());if(!selected.length)fail('请先在网盘里勾选需要下载的文件');if(selected.length>100)fail('一次最多下载 100 个文件，请分批选择');main.getSelectedList=()=>selected;
   if(provider==='baidu'&&temp.page==='share'&&selected.every(item=>item.isdir===1))fail('请打开文件夹后，再勾选需要下载的文件');
   if(modern123){
    const files=selected.filter(item=>item.Type===0),shareKey=location.pathname.split('/').filter(Boolean)[1],token=base.getStorage('authorToken'),apiHeaders={'Content-Type':'application/json','Platform':'web',...(typeof token==='string'&&token?{'Authorization':'Bearer '+token}:{})};
    if(!files.length)fail('请打开文件夹后再勾选需要下载的文件');
    const traffic=await base.post(location.origin+'/api/share/download/traffic/check',{shareKey,fileIds:files.map(item=>item.FileId)},apiHeaders);
    if(traffic.code!==0)fail(traffic.message||'网盘未允许这次下载，请回到原网页查看');
    if(['isBlocked','isTrafficExceeded','isPay'].some(key=>traffic.data?.[key]===true||traffic.data?.[key]===1))fail(traffic.data?.desc1||'源站要求处理下载权限或流量配额，请使用原下载按钮查看；本次未创建下载');
    main.getFileUrl=async(item,index)=>{const res=await base.post(location.origin+'/api/v2/share/download/info',{ShareKey:shareKey,FileID:item.FileId,S3keyFlag:item.S3KeyFlag,Size:item.Size,Etag:item.Etag},apiHeaders);if(res.code!==0)fail(res.message||'网盘未返回可用下载地址');const data=res.data,prefix=data?.dispatchList?.[0]?.prefix;if(String(data?.fileId)!==String(item.FileId)||typeof prefix!=='string'||typeof data?.downloadPath!=='string'||!/^\/[^/]/.test(data.downloadPath))fail('网盘返回的下载信息与所选文件不一致');const server=new URL(prefix);if(server.pathname!=='/'||server.search||server.hash)fail('网盘下载线路格式已变化，请刷新后重试');return {index,downloadUrl:new URL(data.downloadPath,server).href};};
   }
   await main.getLink();if(!output?.length)fail('没有取得可下载的文件，请进入文件夹后勾选文件');for(const file of output)if(typeof file.url!=='string'||!/^https:\/\//.test(file.url))fail(file.url||'网盘未返回可用下载地址，请重新登录或刷新后重试');
   const folders=provider==='baidu'&&temp.page!=='share'&&selected.some(item=>item.isdir===1);
   if(!folders&&output.length!==expected.length)fail('部分所选文件没有取得下载地址，请刷新后重新勾选；本次尚未加入下载');
   const chosen=new Set(expected);if(!folders&&!chosen.has('')&&(new Set(output.map(file=>file.key)).size!==output.length||output.some(file=>!chosen.has(file.key))))fail('网盘返回的文件与所选内容不一致，请刷新后重新勾选');
   const headers={'User-Agent':navigator.userAgent,'Referer':location.origin+'/'};
   if(provider==='baidu')headers['User-Agent']=config.$baidu.api.ua.downloadLink;
   if(provider==='quark'||provider==='uc'){headers['User-Agent']=config['$'+provider].api.ua.downloadLink;headers.Cookie=document.cookie;}
   return {ok:true,files:output.map(item=>({...item,headers}))};
  }catch(error){return {ok:false,error:error instanceof TypeError?'网盘登录信息或页面结构已变化，请刷新网盘并重新登录后重试':clean(error.message||error)};}
  finally{window.removeEventListener('message',onReply);for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('本次读取已结束'));}pending.clear();}
 }};
})();
