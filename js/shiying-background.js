// 拾影纯浏览器流程：原站读取，插件内合并/转换，Chrome 保存。GPL-3.0。
importScripts('/js/shiying-core.js','/js/shiying-platform.js');
const NATIVE_JOB_PREFIX='shiyingJob:',NATIVE_CATALOG_PREFIX='shiyingCatalog:';
let engineCreation;
async function sourceTab(source,requestedId){
 const tabs=await chrome.tabs.query({});
 const matching=tabs.filter(tab=>{try{return ShiyingPlatform.source(tab.url).url===source.url}catch{return false}});
 let tab=matching.find(tab=>tab.id===requestedId)||matching[0];
 if(!tab)tab=await chrome.tabs.create({url:source.url,active:false});
 if(tab.status!=='complete')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(changed);reject(new Error('视频网页加载超时，请重新读取'))},45000);function changed(id,info){if(id===tab.id&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(changed);resolve()}}chrome.tabs.onUpdated.addListener(changed);chrome.tabs.get(tab.id).then(current=>{if(current.status==='complete')changed(tab.id,{status:'complete'})})});
 return tab;
}
async function platformRead(event){
 const source=ShiyingPlatform.source(event.url),tab=await sourceTab(source,event.tabId);
 let catalog;
 if(source.site==='bilibili'){
  const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:ShiyingPlatform.readBilibiliPage,args:[source.url]});
  if(result.result?.error)throw new Error(result.result.error);
  catalog=ShiyingPlatform.bilibiliCatalog(source,result.result);
 }else{
  const [context]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>({visitorData:window.ytcfg?.get('VISITOR_DATA')||window.ytcfg?.get('INNERTUBE_CONTEXT')?.client?.visitorData})});
  if(!context.result?.visitorData)throw new Error('视频网页还在准备，请稍后重新读取');
  const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1610000000],addRules:[{id:1610000000,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'User-Agent',operation:'set',value:ua},{header:'Origin',operation:'set',value:'https://www.youtube.com'}]},condition:{initiatorDomains:[chrome.runtime.id],urlFilter:'|https://www.youtube.com/youtubei/v1/player',resourceTypes:['xmlhttprequest']}}]});
  const client={clientName:'VISIONOS',clientVersion:'1.02',deviceMake:'Apple',deviceModel:'RealityDevice17,1',userAgent:ua,osName:'visionOS',osVersion:'26.5.23O471',hl:'en',gl:'US',utcOffsetMinutes:0,visitorData:context.result.visitorData};
  const response=await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',headers:{'Content-Type':'application/json','X-YouTube-Client-Name':'101','X-YouTube-Client-Version':'1.02','X-Goog-Visitor-Id':client.visitorData},body:JSON.stringify({context:{client},videoId:new URL(source.url).searchParams.get('v'),contentCheckOk:true,racyCheckOk:true,playbackContext:{contentPlaybackContext:{html5Preference:'HTML5_PREF_WANTS'}}}),credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('原站暂时没有返回视频，请稍后重新读取');
  catalog=ShiyingPlatform.youtubeCatalog(source,await response.json());
 }
 if(!Number.isFinite(catalog.duration)||catalog.duration<=0)throw new Error('没读到完整视频时长，请重新读取');
 catalog.id=crypto.randomUUID();catalog.createdAt=Date.now();
 const previous=(await chrome.storage.session.get('shiyingCatalogIds')).shiyingCatalogIds||[];
 if(previous.length>=20)await chrome.storage.session.remove(NATIVE_CATALOG_PREFIX+previous.shift());
 await chrome.storage.session.set({[NATIVE_CATALOG_PREFIX+catalog.id]:catalog,shiyingCatalogIds:[...previous,catalog.id]});
 return {id:catalog.id,site:catalog.site,url:catalog.url,title:catalog.title,duration:catalog.duration,choices:catalog.choices,audioAvailable:true,native:true};
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
 const downloadId=await chrome.downloads.download({url:event.url,filename:'拾影/'+event.filename,saveAs:settings.saveAs,conflictAction:'uniquify'});
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
 const job={ok:true,id:crypto.randomUUID(),url:catalog.url,title:catalog.title,format,height,status:'queued',stage:'正在准备下载',progress:0,createdAt:new Date().toISOString(),native:true};
 await chrome.storage.local.set({[NATIVE_JOB_PREFIX+job.id]:job,shiyingJobIds:[...ids.slice(-49),job.id]});
 const mediaHosts=catalog.site==='bilibili'?['bilivideo.com','bilivideo.cn']:['googlevideo.com'];
 const rule=catalog.site==='bilibili'?1610000001:1610000002;
 await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[rule],addRules:[{id:rule,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'Referer',operation:'set',value:catalog.url},{header:'Origin',operation:'set',value:new URL(catalog.url).origin}]},condition:{initiatorDomains:[chrome.runtime.id],requestDomains:mediaHosts,resourceTypes:['xmlhttprequest']}}]});
 // ponytail: 单个隐藏页顺序处理任务；无需另一个程序，也不增加并行设置。
 try{await engineSend({Message:'shiyingEngineRun',catalog,job});await chrome.tabs.create({url:chrome.runtime.getURL(`shiying-task.html?id=${job.id}`)});return job}catch(error){await jobUpdate(job.id,{status:'error',stage:'下载失败',error:error.message});throw error}
}
chrome.runtime.onMessage.addListener((event,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 let task;
 if(event.Message==='shiyingPlatformHealth')task=Promise.resolve({version:chrome.runtime.getManifest().version,native:true});
 else if(event.Message==='shiyingPlatformRead')task=platformRead(event);
 else if(event.Message==='shiyingPlatformStart')task=platformStart(event);
 else if(event.Message==='shiyingPlatformJob')task=jobSnapshot(event.id);
 else if(event.Message==='shiyingPlatformCancel')task=(async()=>{const job=await jobRead(event.id);if(['complete','error','cancelled'].includes(job.status))return job;await engineSend({Message:'shiyingEngineCancel',id:event.id});if(Number.isInteger(job.downloadId))await chrome.downloads.cancel(job.downloadId).catch(()=>{});return jobUpdate(event.id,{status:'cancelled',stage:'已取消',error:null})})();
 else if(event.Message==='shiyingPlatformOpen')task=jobRead(event.id).then(job=>{if(job.status!=='complete'||!Number.isInteger(job.downloadId))throw new Error('文件还没保存完成');chrome.downloads.show(job.downloadId);return {}});
 else if(event.Message==='shiyingEngineUpdate'&&sender.url===chrome.runtime.getURL('shiying-engine.html'))task=jobUpdate(event.id,event.values);
 else if(event.Message==='shiyingEngineSave'&&sender.url===chrome.runtime.getURL('shiying-engine.html'))task=engineSave(event);
 else return;
 Promise.resolve(task).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message||String(error)}));return true;
});
chrome.downloads.onChanged.addListener(async change=>{
 if(!change.state&&!change.error)return;
 const ids=(await chrome.storage.local.get('shiyingJobIds')).shiyingJobIds||[];const data=await chrome.storage.local.get(ids.map(id=>NATIVE_JOB_PREFIX+id));const job=Object.values(data).find(job=>job.downloadId===change.id);
 if(!job)return;
 if(change.error)await jobUpdate(job.id,{status:'error',stage:'保存中断',error:'文件保存中断，请重新下载'});
 else if(change.state?.current==='complete'){const [download]=await chrome.downloads.search({id:change.id});await jobUpdate(job.id,{status:'complete',stage:'下载完成，文件和声音已检查',progress:100,file:download.filename});}
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
