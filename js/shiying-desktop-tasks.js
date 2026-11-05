// Desktop downloads shown the way Chrome shows its own: a small "↓N" on the toolbar icon while Ruxget Desktop is
// downloading, a "✓" for a few seconds when it finishes, and the tasks Chrome handed over in "最近下载".
// Nothing here opens the desktop window or starts the app: "status" is answered from the app's saved list
// when it isn't running. Only the service worker polls; pages read the last status from session storage.
const RuxgetDesktopTasks={
    KNOWN:'ruxgetDesktopJobs',      // local: [{id,name,at}] tasks Chrome handed over, newest first
    STATUS:'ruxgetDesktopStatus',   // session: {at,running,active,jobs:[...]}
    HINT:'ruxgetTakeoverHint',      // local: {pending,shown,clicked,dismissed}
    LIMIT:20,
    HINT_MB:50,
    HINT_SHOWS:3,
    badgeText:'',
    validId(id){return /^[a-f0-9]{16}$/.test(String(id||''));},
    async known(){
        const {[RuxgetDesktopTasks.KNOWN]:list=[]}=await chrome.storage.local.get(RuxgetDesktopTasks.KNOWN);
        return Array.isArray(list)?list.filter(entry=>entry&&RuxgetDesktopTasks.validId(entry.id)):[];
    },
    async remember(id,name){
        if(!RuxgetDesktopTasks.validId(id))return;
        const list=await RuxgetDesktopTasks.known();
        await chrome.storage.local.set({[RuxgetDesktopTasks.KNOWN]:[{id,name:String(name||'').slice(0,300),at:Date.now()},...list.filter(entry=>entry.id!==id)].slice(0,RuxgetDesktopTasks.LIMIT)});
        RuxgetDesktopTasks.watch(60000);
    },
    async drop(id){
        const list=await RuxgetDesktopTasks.known();
        await chrome.storage.local.set({[RuxgetDesktopTasks.KNOWN]:list.filter(entry=>entry.id!==id)});
    },
    native(message){return chrome.runtime.sendNativeMessage('org.shiying.desktop',message);},
    // One status read. Tasks the desktop no longer has (deleted there) leave the list too.
    async refresh(){
        if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))return null;
        const list=await RuxgetDesktopTasks.known();
        let reply=null;
        try{reply=await RuxgetDesktopTasks.native({action:'status',ids:list.map(entry=>entry.id)});}catch{reply=null;}
        if(!reply?.ok)return null;
        const jobs=Array.isArray(reply.jobs)?reply.jobs.filter(job=>job&&RuxgetDesktopTasks.validId(job.id)):[];
        const ids=new Set(jobs.map(job=>job.id)),kept=list.filter(entry=>ids.has(entry.id));
        if(kept.length!==list.length)await chrome.storage.local.set({[RuxgetDesktopTasks.KNOWN]:kept});
        const when=new Map(kept.map(entry=>[entry.id,entry])),now=Date.now();
        const status={at:now,running:!!reply.running,active:Math.max(0,Number(reply.active)||0),jobs:jobs.map(job=>({
            id:job.id,title:String(job.title||when.get(job.id)?.name||''),state:['active','done','failed','paused'].includes(job.state)?job.state:'paused',
            progress:Math.max(0,Math.min(100,Number(job.progress)||0)),speed:String(job.speed||''),error:String(job.error||''),
            at:when.get(job.id)?.at||now,handed:when.has(job.id)}))};
        const {[RuxgetDesktopTasks.STATUS]:before}=await chrome.storage.session.get(RuxgetDesktopTasks.STATUS);
        await chrome.storage.session.set({[RuxgetDesktopTasks.STATUS]:status});
        // "✓" only when something that was downloading has now finished (not when it was deleted or paused).
        const wasActive=new Set((before?.jobs||[]).filter(job=>job.state==='active').map(job=>job.id));
        const finished=status.active===0&&status.jobs.some(job=>job.state==='done'&&wasActive.has(job.id));
        await RuxgetDesktopTasks.badge(status.active>0?'↓'+(status.active>9?'9+':status.active):finished?'✓':'');
        if(finished)setTimeout(()=>{if(RuxgetDesktopTasks.badgeText==='✓')RuxgetDesktopTasks.badge('').catch(()=>{});},6000);
        return status;
    },
    // Per-tab media counts (the sniffer's badge) would hide a global text, so while the desktop is downloading every tab
    // shows its count; afterwards each tab gets its own media count back.
    async badge(text){
        // The badge outlives a service-worker restart, so compare with what the icon shows, not only with memory.
        const shown=await chrome.action.getBadgeText({}).catch(()=>RuxgetDesktopTasks.badgeText);
        if(text===RuxgetDesktopTasks.badgeText&&text===shown)return;
        RuxgetDesktopTasks.badgeText=text;
        const tabs=await chrome.tabs.query({}).catch(()=>[]);
        await chrome.action.setBadgeText({text}).catch(()=>{});
        for(const tab of tabs){
            if(text)await chrome.action.setBadgeText({text,tabId:tab.id}).catch(()=>{});
            else{
                await chrome.action.setBadgeText({text:'',tabId:tab.id}).catch(()=>{});
                if(typeof SetIcon==='function'&&typeof cacheData!=='undefined')SetIcon({number:cacheData[tab.id]?.length||0,tabId:tab.id});
            }
        }
    },
    // Poll while anything runs (and for a while after a hand-off, since the desktop may still be confirming it).
    timer:0,
    busy:null,
    watchUntil:0,
    failures:0,
    watch(ms){RuxgetDesktopTasks.watchUntil=Math.max(RuxgetDesktopTasks.watchUntil,Date.now()+ms);return RuxgetDesktopTasks.poll();},
    poll(){
        if(RuxgetDesktopTasks.busy)return RuxgetDesktopTasks.busy;
        clearTimeout(RuxgetDesktopTasks.timer);
        RuxgetDesktopTasks.busy=RuxgetDesktopTasks.refresh().catch(()=>null).then(async status=>{
            RuxgetDesktopTasks.busy=null;
            // A busy or vanished desktop: keep the count a little while, then clear it rather than leave it stuck.
            const showing=/^↓/.test(RuxgetDesktopTasks.badgeText||await chrome.action.getBadgeText({}).catch(()=>''));
            RuxgetDesktopTasks.failures=status?0:RuxgetDesktopTasks.failures+1;
            const retry=!status&&showing&&RuxgetDesktopTasks.failures<6;
            if(!status&&showing&&!retry)await RuxgetDesktopTasks.badge('').catch(()=>{});
            const again=status?.active>0||retry||Date.now()<RuxgetDesktopTasks.watchUntil;
            if(again){RuxgetDesktopTasks.timer=setTimeout(()=>RuxgetDesktopTasks.poll(),retry?3000:1500);chrome.alarms.create('ruxgetDesktopPoll',{periodInMinutes:0.5});}
            else chrome.alarms.clear('ruxgetDesktopPoll').catch(()=>{});
            return status;
        });
        return RuxgetDesktopTasks.busy;
    },
    async remove(id,deleteFiles){
        if(!RuxgetDesktopTasks.validId(id))throw new Error('任务标识无效');
        const reply=await RuxgetDesktopTasks.native({action:'forget',id,deleteFiles:!!deleteFiles});
        if(!reply?.ok)throw new Error(reply?.error||'删除没有完成，请重试');
        await RuxgetDesktopTasks.drop(id);
        const {[RuxgetDesktopTasks.STATUS]:status}=await chrome.storage.session.get(RuxgetDesktopTasks.STATUS);
        if(status)await chrome.storage.session.set({[RuxgetDesktopTasks.STATUS]:Object.assign({},status,{jobs:(status.jobs||[]).filter(job=>job.id!==id)})});
        await RuxgetDesktopTasks.poll();
        return {ok:true};
    },
    // The quiet hint: a large ordinary Chrome download finished, the desktop app is connected, takeover is off.
    async noteChromeDownload(download){
        if(!download||download.state!=='complete'||download.byExtensionId||download.incognito)return;
        const size=Math.max(Number(download.totalBytes)||0,Number(download.fileSize)||0);
        if(size<RuxgetDesktopTasks.HINT_MB*1024*1024)return;
        const {[RuxgetDesktopTasks.HINT]:hint={}}=await chrome.storage.local.get(RuxgetDesktopTasks.HINT);
        if(hint.clicked||hint.dismissed||(hint.shown||0)>=RuxgetDesktopTasks.HINT_SHOWS)return;
        if(typeof RuxgetTakeover!=='undefined'&&(await RuxgetTakeover.settings()).enabled)return;
        const {ruxgetOwnDownloads:own=[]}=await chrome.storage.session.get('ruxgetOwnDownloads');
        if(own.some(entry=>entry.url===download.url||entry.url===download.finalUrl))return;
        if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))return;
        let ping=null;try{ping=await RuxgetDesktopTasks.native({action:'ping'});}catch{return;}
        if(!ping?.ok)return;
        await chrome.storage.local.set({[RuxgetDesktopTasks.HINT]:Object.assign({},hint,{pending:true})});
    }
};
if(typeof chrome!=='undefined'&&chrome.runtime&&typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope){
    chrome.runtime.onMessage.addListener((event,sender,respond)=>{
        if(sender.id!==chrome.runtime.id)return;
        if(event?.Message==='ruxgetDesktopRefresh'){RuxgetDesktopTasks.poll().then(status=>respond({ok:true,status}),()=>respond({ok:false}));return true;}
        if(event?.Message==='ruxgetDesktopWatch'){RuxgetDesktopTasks.watch(60000);respond({ok:true});return;}
        if(event?.Message==='ruxgetDesktopDelete'){RuxgetDesktopTasks.remove(event.id,event.deleteFiles).then(respond,error=>respond({ok:false,error:error?.message||String(error)}));return true;}
    });
    chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='ruxgetDesktopPoll')RuxgetDesktopTasks.poll();});
    chrome.downloads.onChanged.addListener(change=>{
        if(change.state?.current!=='complete')return;
        chrome.downloads.search({id:change.id}).then(([download])=>RuxgetDesktopTasks.noteChromeDownload(download)).catch(()=>{});
    });
    // A service-worker restart picks up a download that was running; a browser restart checks once.
    // Otherwise the desktop is only asked while something downloads, or when the popup opens.
    chrome.storage.session.get(RuxgetDesktopTasks.STATUS).then(({[RuxgetDesktopTasks.STATUS]:status})=>{if(status?.active>0)RuxgetDesktopTasks.poll();}).catch(()=>{});
    chrome.runtime.onStartup.addListener(()=>{RuxgetDesktopTasks.known().then(list=>{if(list.length)RuxgetDesktopTasks.poll();}).catch(()=>{});});
}
if(typeof module!=='undefined')module.exports=RuxgetDesktopTasks;
