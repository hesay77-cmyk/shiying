// One persistent, user-confirmed batch. The existing media engine performs downloads.
importScripts('/js/shiying-collection.js');
const COLLECTION_KEY='shiyingCollectionQueue', COLLECTION_ALARM='shiying-collection';
let collectionPump,collectionWake=false,collectionStarting=false;
const collectionGet=async()=> (await chrome.storage.local.get(COLLECTION_KEY))[COLLECTION_KEY];
const collectionSave=queue=>chrome.storage.local.set({[COLLECTION_KEY]:queue});
async function collectionStart(event) {
    if(collectionStarting)throw new Error("队列正在添加，请稍候");collectionStarting=true;try{
    const previous=await collectionGet();
    if(previous&&!previous.paused&&previous.items.some(item=>['waiting','reading','running'].includes(item.status)))throw new Error('已有播放列表队列，请先停止它再添加');
    const catalog=(await chrome.storage.session.get('shiyingCollection:'+event.id))['shiyingCollection:'+event.id];
    if(!catalog||catalog.id!==event.id||Date.now()-catalog.at>20*60*1000)throw new Error('列表已过期，请重新读取');
    const selected=event.indices;
    if(!Array.isArray(selected)||!selected.length||selected.length>ShiyingCollection.LIMIT||new Set(selected).size!==selected.length||selected.some(i=>!Number.isInteger(i)||!catalog.entries[i]?.available))throw new Error('请勾选可下载的条目');
    if(!['mp4','mp3'].includes(event.format)||![720,1080,2160,4320].includes(event.height))throw new Error('下载选项无效');
    const queue={id:crypto.randomUUID(),title:catalog.title,format:event.format,height:event.height,paused:false,items:selected.map(i=>({...catalog.entries[i],status:'waiting'}))};
    await collectionSave(queue);await chrome.alarms.create(COLLECTION_ALARM,{periodInMinutes:1});
    pumpCollection();return queue;
    }finally{collectionStarting=false;}
}
async function collectionStop() {
    const queue=await collectionGet();if(!queue)return {};
    queue.paused=true;
    for(const item of queue.items)if(['waiting','reading'].includes(item.status))item.status='cancelled';
    await collectionSave(queue);
    for(const item of queue.items)if(item.status==='running'&&item.jobId)await cancelPlatformJob(item.jobId).catch(()=>{});
    await chrome.alarms.clear(COLLECTION_ALARM);return queue;
}
function pumpCollection() {
    if(collectionPump){collectionWake=true;return collectionPump;}
    collectionPump=(async()=>{
        let queue=await collectionGet();if(!queue||queue.paused)return;
        const {shiyingJobIds:ids=[]}=await chrome.storage.local.get('shiyingJobIds');
        const records=await chrome.storage.local.get(ids.map(id=>NATIVE_JOB_PREFIX+id));
        let item=queue.items.find(i=>['reading','running'].includes(i.status));
        if(item) {
            const job=Object.values(records).find(job=>job.collectionId===queue.id&&job.url===item.url);
            if(job) {
                item.jobId=job.id;
                const snapshot=await jobSnapshot(job.id);
                if(!['complete','error','cancelled'].includes(snapshot.status)){item.status='running';await collectionSave(queue);return;}
                item.status=snapshot.status;item.error=snapshot.error||'';await collectionSave(queue);
            } else item.status='waiting';
        }
        if(Object.values(records).filter(j=>['queued','downloading','verifying','saving'].includes(j.status)).length>=3)return;
        item=queue.items.find(i=>i.status==='waiting');
        if(!item){await chrome.alarms.clear(COLLECTION_ALARM);return;}
        item.status='reading';await collectionSave(queue);
        try {
            const catalog=await platformRead({url:item.url,collection:true});
            const latest=await collectionGet();if(latest?.id!==queue.id||latest.paused)return;
            const choice=catalog.choices.find(c=>c.height<=queue.height)||catalog.choices.at(-1);
            const job=await platformStart({id:catalog.id,format:queue.format,height:choice?.height,saveAs:false,collectionId:queue.id});
            item.status='running';item.jobId=job.id;
            const after=await collectionGet();if(after?.paused){await cancelPlatformJob(job.id);return;}
        } catch(error) {item.status='error';item.error=error.message;collectionWake=true;}
        if(!(await collectionGet())?.paused)await collectionSave(queue);
    })().catch(()=>{}).finally(()=>{collectionPump=null;if(collectionWake){collectionWake=false;pumpCollection();}});
    return collectionPump;
}
chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&Object.entries(changes).some(([key,v])=>key.startsWith(NATIVE_JOB_PREFIX)&&['complete','error','cancelled'].includes(v.newValue?.status)))pumpCollection();
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===COLLECTION_ALARM)pumpCollection();});
chrome.runtime.onMessage.addListener((event,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||sender.url?.split('?')[0]!==chrome.runtime.getURL('shiying.html'))return;
    let task;
    if(event.Message==='shiyingCollectionRead')task=(async()=>{const data=await ShiyingCollection.read(event.url);const catalog={...data,id:crypto.randomUUID(),at:Date.now()};const {shiyingCollectionIds:ids=[]}=await chrome.storage.session.get('shiyingCollectionIds');if(ids.length>=5)await chrome.storage.session.remove('shiyingCollection:'+ids.shift());await chrome.storage.session.set({['shiyingCollection:'+catalog.id]:catalog,shiyingCollectionIds:[...ids,catalog.id]});return catalog;})();
    else if(event.Message==='shiyingCollectionStart')task=collectionStart(event);
    else if(event.Message==='shiyingCollectionStop')task=collectionStop();
    else if(event.Message==='shiyingCollectionState')task=collectionGet().then(queue=>({queue}));
    else return;
    Promise.resolve(task).then(value=>respond({ok:true,...value}),error=>respond({ok:false,error:error.message}));return true;
});
// Wake an existing batch after a worker restart, never create a batch implicitly.
collectionGet().then(async queue=>{if(queue&&!queue.paused&&queue.items.some(i=>['waiting','reading','running'].includes(i.status))){await chrome.alarms.create(COLLECTION_ALARM,{periodInMinutes:1});pumpCollection();}}).catch(()=>{});
