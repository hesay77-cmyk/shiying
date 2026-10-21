// Ruxget 纯浏览器流程：原站读取，插件内合并/转换，Chrome 保存。GPL-3.0。
importScripts('/js/shiying-core.js','/js/shiying-platform.js','/js/shiying-shortvideo.js');
const NATIVE_JOB_PREFIX='shiyingJob:',NATIVE_CATALOG_PREFIX='shiyingCatalog:';
let engineCreation;
async function ensureFloatingControl(tabId){
 if(!Number.isInteger(tabId))throw new Error('请先切换到视频页');
 const tab=await chrome.tabs.get(tabId);
 ShiyingPlatform.source(tab.url);
 await chrome.scripting.executeScript({target:{tabId},files:['js/shiying-locale.js', 'js/shiying-floating.js']});
 return {};
}
async function restoreOpenFloatingControls(){
 const matches=chrome.runtime.getManifest().content_scripts.find(script=>script.js?.includes('js/shiying-floating.js'))?.matches;
 if(!matches?.length)return;
 const tabs=await chrome.tabs.query({url:matches});
 for(const tab of tabs)try{await ensureFloatingControl(tab.id);}catch{/* Closed, restricted or non-video tabs need no control. */}
}
chrome.runtime.onInstalled?.addListener(()=>restoreOpenFloatingControls().catch(()=>{}));
async function sourceTab(source,requestedId){
 const tabs=await chrome.tabs.query({});
 const matching=tabs.filter(tab=>{try{return ShiyingPlatform.source(tab.url).url===source.url}catch{return false}});
 let tab=matching.find(tab=>tab.id===requestedId)||matching[0];
 if(!tab){tab=await chrome.tabs.create({url:source.url,active:false});tab.shiyingOwned=true;}
 if(tab.status!=='complete')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(changed);reject(new Error('视频网页加载超时，请重新读取'))},45000);function changed(id,info){if(id===tab.id&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(changed);resolve()}}chrome.tabs.onUpdated.addListener(changed);chrome.tabs.get(tab.id).then(current=>{if(current.status==='complete')changed(tab.id,{status:'complete'})})});
 return tab;
}
async function platformRead(event){
 const source=ShiyingPlatform.source(event.url),tab=await sourceTab(source,event.tabId);
 let catalog;
 try{
 if(source.site==='bilibili'){
  const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:ShiyingPlatform.readBilibiliPage,args:[source.url]});
  if(result.result?.error)throw new Error(result.result.error);
  catalog=ShiyingPlatform.bilibiliCatalog(source,result.result);
 }else if(ShiyingPlatform.readers[source.site])catalog=await ShiyingPlatform.readers[source.site](source,tab);
 else throw new Error('这个入口目前支持 B站视频');
 if(!Number.isFinite(catalog.duration)||catalog.duration<=0)throw new Error('没读到完整视频时长，请重新读取');
 catalog.id=crypto.randomUUID();catalog.createdAt=Date.now();
 const previous=(await chrome.storage.session.get('shiyingCatalogIds')).shiyingCatalogIds||[];
 if(previous.length>=20)await chrome.storage.session.remove(NATIVE_CATALOG_PREFIX+previous.shift());
 await chrome.storage.session.set({[NATIVE_CATALOG_PREFIX+catalog.id]:catalog,shiyingCatalogIds:[...previous,catalog.id]});
 return {id:catalog.id,site:catalog.site,url:catalog.url,title:catalog.title,duration:catalog.duration,choices:catalog.choices,audioAvailable:true,native:true,siteName:catalog.siteName,listUrl:catalog.listUrl,muxed:!!catalog.muxed,mediaOrigins:ShiyingPlatform.mediaOrigins?.[catalog.site]||[],subtitles:(catalog.subtitles||[]).map(({lang,name})=>({lang,name}))};
 }finally{if(event.collection&&tab.shiyingOwned)await chrome.tabs.remove(tab.id).catch(()=>{});}
}
async function jobRead(id){const job=(await chrome.storage.local.get(NATIVE_JOB_PREFIX+id))[NATIVE_JOB_PREFIX+id];if(!job)throw new Error('没有找到下载记录，请重新开始');return job}
async function jobUpdate(id,values){const job=await jobRead(id);if(job.status==='cancelled'&&values.status!=='cancelled')return job;Object.assign(job,values);await chrome.storage.local.set({[NATIVE_JOB_PREFIX+id]:job});return job}
async function jobSnapshot(id){const job=await jobRead(id);if(['queued','downloading','verifying'].includes(job.status)&&!engineCreation&&!await chrome.offscreen.hasDocument())return jobUpdate(id,{status:'error',stage:'下载已中断',error:'Chrome 曾关闭，请重新读取视频后下载'});return job}
async function ensureEngine(){if(await chrome.offscreen.hasDocument())return;engineCreation ||= chrome.offscreen.createDocument({url:'shiying-engine.html',reasons:['BLOBS'],justification:'在浏览器内合并视频和声音、生成 MP3 并创建本地下载文件'}).finally(()=>{engineCreation=null});await engineCreation}
async function engineSend(message){await ensureEngine();for(let attempt=0;attempt<25;attempt++){try{const response=await chrome.runtime.sendMessage(message);if(response?.ok)return response}catch{}await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('下载处理还没准备好，请重试')}
async function engineSave(event){
 const job=await jobRead(event.id);
 if(job.status==='cancelled')throw new Error('已取消下载');
 if(job.status!=='verifying'||!event.url.startsWith(`blob:${chrome.runtime.getURL('')}`))throw new Error('文件来源不符合当前任务');
 const settings=await chrome.storage.sync.get({saveAs:false});
 const chooseLocation=typeof job.saveAs==='boolean'?job.saveAs:settings.saveAs;
 const downloadId=await chrome.downloads.download({url:event.url,filename:chooseLocation?event.filename:'Ruxget/'+event.filename,saveAs:chooseLocation,conflictAction:'uniquify'});
 const saved=await jobUpdate(event.id,{status:'saving',stage:'Chrome 正在保存文件',progress:99,downloadId,verification:event.verification});
 const [download]=await chrome.downloads.search({id:downloadId});
 // 小文件可能在状态登记前就保存完成，读取实际状态补齐这一事件。
 if(download.state==='complete'){const complete=await jobUpdate(event.id,{status:'complete',stage:'下载完成，文件和声音已检查',progress:100,file:download.filename});chrome.runtime.sendMessage({Message:'shiyingEngineRelease',id:event.id}).catch(()=>{});return complete}
 return saved;
}
async function platformStart(event){
 const catalog=(await chrome.storage.session.get(NATIVE_CATALOG_PREFIX+event.id))[NATIVE_CATALOG_PREFIX+event.id];
 if(!catalog||Date.now()-catalog.createdAt>20*60*1000)throw new Error('视频信息已过期，请重新读取');
 const format=event.format??'mp4',height=format==='mp3'?null:Number(event.height);
 if(!['mp4','mp3'].includes(format))throw new Error('请选择视频或 MP3');
 if(format==='mp4'&&!catalog.choices.some(choice=>choice.height===height))throw new Error('请选择实际可用的清晰度');
 const ids=(await chrome.storage.local.get('shiyingJobIds')).shiyingJobIds||[];
 const existing=await chrome.storage.local.get(ids.map(id=>NATIVE_JOB_PREFIX+id));
 if(!engineCreation&&!await chrome.offscreen.hasDocument())for(const job of Object.values(existing))if(['queued','downloading','verifying'].includes(job.status))Object.assign(job,await jobUpdate(job.id,{status:'error',stage:'下载已中断',error:'Chrome 曾关闭，请重新读取视频后下载'}));
 if(Object.values(existing).filter(job=>['queued','downloading','verifying','saving'].includes(job.status)).length>=3)throw new Error('已有下载正在处理，请稍后再添加');
 const job={ok:true,id:crypto.randomUUID(),url:catalog.url,title:catalog.title,format,height,status:'queued',stage:'正在准备下载',progress:0,createdAt:new Date().toISOString(),native:true,...(event.collectionId?{collectionId:event.collectionId}:{}),...(typeof event.saveAs==='boolean'?{saveAs:event.saveAs}:{})};
 await chrome.storage.local.set({[NATIVE_JOB_PREFIX+job.id]:job,shiyingJobIds:[...ids.slice(-49),job.id]});
 const mediaHosts=ShiyingPlatform.mediaDomains[catalog.site]||[];
 const rule=1610000001+Math.max(0,Object.keys(ShiyingPlatform.mediaDomains).indexOf(catalog.site));
 await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[rule],addRules:[{id:rule,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'Referer',operation:'set',value:catalog.url},{header:'Origin',operation:'set',value:new URL(catalog.url).origin}]},condition:{initiatorDomains:[chrome.runtime.id],requestDomains:mediaHosts,resourceTypes:['xmlhttprequest']}}]});
 // ponytail: 单个隐藏页顺序处理任务；无需另一个程序，也不增加并行设置。
 try{await engineSend({Message:'shiyingEngineRun',catalog,job});if(event.openDetails===true)await chrome.tabs.create({url:chrome.runtime.getURL(`shiying-task.html?id=${job.id}`)});return jobRead(job.id)}catch(error){await jobUpdate(job.id,{status:'error',stage:'下载失败',error:error.message});throw error}
}
async function cancelPlatformJob(id){const job=await jobRead(id);if(['complete','error','cancelled'].includes(job.status))return job;await engineSend({Message:'shiyingEngineCancel',id});if(Number.isInteger(job.downloadId))await chrome.downloads.cancel(job.downloadId).catch(()=>{});return jobUpdate(id,{status:'cancelled',stage:'已取消',error:null})}
// Delete from "最近下载": stop a running download, optionally delete the saved file, and forget the record.
async function deletePlatformJob(id,removeFile){let job=await jobRead(id);if(!['complete','error','cancelled'].includes(job.status))job=await cancelPlatformJob(id);let removed=false;if(Number.isInteger(job.downloadId)){if(removeFile&&job.status==='complete'){try{await chrome.downloads.removeFile(job.downloadId);removed=true;}catch{/* Already moved or deleted outside Chrome. */}}await chrome.downloads.erase({id:job.downloadId}).catch(()=>{});}const ids=(await chrome.storage.local.get('shiyingJobIds')).shiyingJobIds||[];await chrome.storage.local.set({shiyingJobIds:ids.filter(item=>item!==id)});await chrome.storage.local.remove(NATIVE_JOB_PREFIX+id);return {removed};}
async function floatingRequest(event,sender){
 if(sender.frameId!==0||!Number.isInteger(sender.tab?.id))throw new Error('请在当前视频页使用 Ruxget');
 const source=ShiyingPlatform.source(sender.url);
 if(source.url!==ShiyingPlatform.source(sender.tab.url).url)throw new Error('视频页已切换，请重新打开');
 const action=event.Message.slice('shiyingFloating'.length);
 if(action==='Location'){await chrome.tabs.create({url:'chrome://settings/downloads'});return {};}
 if(action==='Hide'){
  if(chrome.sidePanel?.close)try{await chrome.sidePanel.close({tabId:sender.tab.id}).catch(()=>chrome.sidePanel.close({windowId:sender.tab.windowId}));}catch{/* The float's saved hidden state remains valid if an older Chrome has no open panel. */}
  return {};
 }
 if(action==='Read')return platformRead({url:source.url,tabId:sender.tab.id});
 if(action==='Start'){
  const key=NATIVE_CATALOG_PREFIX+event.id,catalog=(await chrome.storage.session.get(key))[key];
  if(catalog?.url!==source.url)throw new Error('视频页已切换，请重新读取清晰度');
  return platformStart({id:event.id,format:event.format,height:event.height,saveAs:event.saveAs});
 }
 const job=await jobRead(event.id);
 if(job.url!==source.url)throw new Error('这个任务不属于当前视频');
 if(action==='Job')return jobSnapshot(job.id);
 if(action==='Cancel')return cancelPlatformJob(job.id);
 if(action==='Open'){if(job.status!=='complete'||!Number.isInteger(job.downloadId))throw new Error('文件还没保存完成');chrome.downloads.show(job.downloadId);return {};}
 if(action==='Details'){await chrome.tabs.create({url:chrome.runtime.getURL('shiying-task.html?id='+encodeURIComponent(job.id))});return {};}
 throw new Error('无法识别这个操作');
}
const localeCatalogCache=Object.create(null);
async function loadLocaleCatalog(lang){
 const key=(lang==='en'||lang==='zh_CN')?lang:'zh_CN';
 if(localeCatalogCache[key])return {lang:key,catalog:localeCatalogCache[key]};
 const url=chrome.runtime.getURL('_locales/'+key+'/messages.json');
 const res=await fetch(url);
 if(!res.ok)throw new Error('HTTP '+res.status+' loading locale '+key);
 const data=await res.json();
 localeCatalogCache[key]=data;
 return {lang:key,catalog:data};
}
chrome.runtime.onMessage.addListener((event,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 let task;
 if(event.Message==='shiyingEnsureFloating')task=(async()=>{
  if(sender.url?.split('?')[0]!==chrome.runtime.getURL('shiying.html'))throw new Error('请从 Ruxget 工具栏恢复下载浮钮');
  return ensureFloatingControl(event.tabId);
 })();
 else if(event.Message?.startsWith('shiyingFloating'))task=floatingRequest(event,sender);
 else if(event.Message==='shiyingOpenPanel'){
  try{
   if(sender.frameId!==0||!Number.isInteger(sender.tab?.id)||ShiyingPlatform.source(sender.url).url!==ShiyingPlatform.source(sender.tab.url).url)throw new Error('请在当前视频页打开 Ruxget');
   // Use the same compact popup as the toolbar; older Chrome retains its side-panel entry.
   task=(chrome.action?.openPopup?chrome.action.openPopup({windowId:sender.tab.windowId}):chrome.sidePanel.open({tabId:sender.tab.id})).catch(()=>chrome.tabs.create({url:chrome.runtime.getURL('shiying.html?tabId='+sender.tab.id)}));
  }catch(error){respond({ok:false,error:error.message});return;}
 }
 else if(event.Message==='shiyingPlatformHealth')task=Promise.resolve({version:chrome.runtime.getManifest().version,native:true});
 else if(event.Message==='shiyingPlatformRead')task=platformRead(event);
 else if(event.Message==='shiyingPlatformDesktop')task=(async()=>{
  if(sender.url?.split('?')[0]!==chrome.runtime.getURL('shiying.html'))throw new Error('请在 Ruxget 面板中发送桌面下载');
  const catalog=(await chrome.storage.session.get(NATIVE_CATALOG_PREFIX+event.id))[NATIVE_CATALOG_PREFIX+event.id];
  if(!catalog||Date.now()-catalog.createdAt>20*60*1000)throw new Error('视频信息已过期，请重新读取');
  if(catalog.muxed){const track=event.format==='mp3'?catalog.audio[0]:catalog.video.find(item=>item.height===Number(event.height));if(!track)throw new Error('请选择实际可用的清晰度');return {payload:{action:'add',kind:'tracks',url:catalog.url,title:catalog.title,height:track.height||1080,videoUrl:track.url,audioUrl:'',extractAudio:event.format==='mp3',referer:catalog.url,userAgent:navigator.userAgent}};}
  if(event.format==='mp3')return {payload:{action:'add',kind:'audio',url:catalog.url,title:catalog.title}};
  const height=Number(event.height),video=catalog.video.find(track=>track.height===height),audio=catalog.audio[0];
  if(!video||!audio)throw new Error('请选择实际可用的清晰度');
  return {payload:{action:'add',kind:'tracks',url:catalog.url,title:catalog.title,height,videoUrl:video.url,audioUrl:audio.url,referer:catalog.url,userAgent:navigator.userAgent}};
 })();
 else if(event.Message==='shiyingPlatformStart')task=platformStart(event);
 else if(event.Message==='shiyingPlatformSubtitle')task=(async()=>{
  const catalog=(await chrome.storage.session.get(NATIVE_CATALOG_PREFIX+event.id))[NATIVE_CATALOG_PREFIX+event.id];
  if(!catalog||Date.now()-catalog.createdAt>20*60*1000)throw new Error('视频信息已过期，请重新读取');
  const subtitle=(catalog.subtitles||[])[Number(event.index)];if(!subtitle)throw new Error('没有找到这个字幕');
  const tab=await sourceTab({url:catalog.url},event.tabId);
  const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:ShiyingPlatform.readSubtitle,args:[subtitle.url]});
  if(!result?.result||result.result.error)throw new Error(result?.result?.error||'字幕读取失败，请刷新视频网页后重试');
  const srt=ShiyingPlatform.subtitleSRT(result.result.data);
  const name=String(catalog.title||'字幕').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[.\s]+$/g,'').slice(0,90)||'字幕';
  const downloadId=await chrome.downloads.download({url:'data:application/x-subrip;charset=utf-8,'+encodeURIComponent('\ufeff'+srt),filename:'Ruxget/'+name+'.'+(subtitle.lang||'sub').replace(/[^\w-]/g,'_')+'.srt',saveAs:event.saveAs===true,conflictAction:'uniquify'});
  return {downloadId};
 })();
 else if(event.Message==='shiyingPlatformJob')task=jobSnapshot(event.id);
 else if(event.Message==='shiyingPlatformCancel')task=cancelPlatformJob(event.id);
 else if(event.Message==='shiyingPlatformDelete')task=deletePlatformJob(event.id,event.removeFile===true);
 else if(event.Message==='shiyingPlatformOpen')task=jobRead(event.id).then(job=>{if(job.status!=='complete'||!Number.isInteger(job.downloadId))throw new Error('文件还没保存完成');chrome.downloads.show(job.downloadId);return {}});
 else if(event.Message==='shiyingEngineUpdate'&&sender.url===chrome.runtime.getURL('shiying-engine.html'))task=jobUpdate(event.id,event.values);
 else if(event.Message==='shiyingEngineSave'&&sender.url===chrome.runtime.getURL('shiying-engine.html'))task=engineSave(event);
 else if(event.Message==='ruxgetLocaleCatalog')task=loadLocaleCatalog(event.lang);
 else return;
 Promise.resolve(task).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message||String(error)}));return true;
});
chrome.downloads.onChanged.addListener(async change=>{
 if(!change.state&&!change.error)return;
 const ids=(await chrome.storage.local.get('shiyingJobIds')).shiyingJobIds||[];const data=await chrome.storage.local.get(ids.map(id=>NATIVE_JOB_PREFIX+id));const job=Object.values(data).find(job=>job.downloadId===change.id);
 if(!job)return;
 if(change.error)await jobUpdate(job.id,{status:'error',stage:'保存中断',error:'文件保存中断，请重新下载'});
 else if(change.state?.current==='complete'){const [download]=await chrome.downloads.search({id:change.id});await ShiyingNative.learnChromeFolder(download?.filename);await jobUpdate(job.id,{status:'complete',stage:'下载完成，文件和声音已检查',progress:100,file:download.filename});}
 if(change.error||change.state?.current==='complete')chrome.runtime.sendMessage({Message:'shiyingEngineRelease',id:job.id}).catch(()=>{});
});
let playlistRule = 1500000000;
async function readPlaylist(data) {
    if (!Shiying.validURL(data.url)) throw new Error('这个视频地址无法直接读取');
    const id = ++playlistRule;
    const headers = Object.entries(data.requestHeaders || {}).filter(([key,value]) => typeof value === 'string' && !/^(:|host$|content-length$|connection$)/i.test(key)).map(([header,value]) => ({header, value, operation:'set'}));
    if (data.cookie) headers.push({header:'Cookie', value:data.cookie, operation:'set'});
    if (headers.length) await chrome.declarativeNetRequest.updateSessionRules({addRules:[{id, priority:1, action:{type:'modifyHeaders', requestHeaders:headers}, condition:{initiatorDomains:[chrome.runtime.id], urlFilter:`|${data.url}|`, resourceTypes:['xmlhttprequest']}}]});
    try {
        const response = await fetch(data.url, {credentials:'include', signal:AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error(`网站返回 ${response.status}，请重新播放视频后再试`);
        // ponytail: 清单上限 2 MB；超大清单交给高级解析器，避免在后台装入整个媒体文件。
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '', bytes = 0;
        try {
            for (;;) {
                const {done, value} = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > 2 * 1024 * 1024) throw new Error('视频清单过大，请使用下载页解析');
                text += decoder.decode(value, {stream:true});
            }
        } finally { await reader.cancel(); }
        return Shiying.playlist(text + decoder.decode(), response.url);
    } finally { if (headers.length) await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[id]}); }
}
async function startDownload(data, tabId) {
    if (!data || !Shiying.validURL(data.url)) throw new Error('请在网页中重新播放视频，获取有效链接');
    const kind = Shiying.kind(data);
    if (['hls','dash'].includes(kind)) {
        const requestHeaders = {...data.requestHeaders};
        if (data.cookie) requestHeaders.Cookie = data.cookie;
        const parameters = new URLSearchParams({url:data.url, title:data.title || '网页视频', filename:Shiying.filename(data), tabid:String(tabId), initiator:data.initiator || data.webUrl || '', requestHeaders:JSON.stringify(requestHeaders), autoClose:'0'});
        // 分轨交给原有解析器选择音画轨；普通 HLS 直接启动本地合并。
        if (kind === 'hls') parameters.set('autoDown', '1');
        await chrome.tabs.create({url:chrome.runtime.getURL(`${kind === 'hls' ? 'm3u8' : 'mpd'}.html?${parameters}`), active:true});
        return {};
    }
    if (!['video','audio'].includes(kind)) throw new Error('这是视频切片，请在高级工具中处理');
    const {saveAs} = await chrome.storage.sync.get({saveAs:false});
    // 有特殊请求头的文件直接交给内置下载器，避免浏览器下载丢失来源头导致 403。
    if ((data.requestHeaders && Object.keys(data.requestHeaders).length) || data.cookie) {
        const safeData = {...data, requestId:String(++playlistRule), downFileName:Shiying.filename(data), _size:data.size};
        const parameters = new URLSearchParams({JSON:JSON.stringify(safeData), autoClose:'false'});
        await chrome.tabs.create({url:chrome.runtime.getURL(`downloader.html?${parameters}`), active:true});
        return {page:true};
    }
    return {id:await chrome.downloads.download({url:data.url, filename:Shiying.filename(data), saveAs})};
}
chrome.runtime.onMessage.addListener((event, sender, respond) => {
    if (!['shiyingPlaylist','shiyingDownload'].includes(event.Message) || sender.id !== chrome.runtime.id) return;
    const task = event.Message === 'shiyingPlaylist' ? readPlaylist(event.data) : startDownload(event.data, event.tabId);
    task.then(result => respond({ok:true, ...result}), error => respond({ok:false, error:error.message || String(error)}));
    return true;
});

importScripts('/js/shiying-collection-background.js');
