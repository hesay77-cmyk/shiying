// Optional takeover of ordinary Chrome downloads by Ruxget Desktop. Off by default; the user turns it on
// on the desktop page, which is also where Chrome asks for the native connection.
// Chrome's own copy is paused first and only removed once the desktop has really started the file;
// anything the desktop can't take (not running, link needs the page's login, small file…) resumes in Chrome.
const RuxgetTakeover={
    KEY:'ruxgetTakeover',
    LOG:'ruxgetTakeoverLog',
    DEFAULTS:{enabled:false,minMB:1,skipHosts:[]},
    async settings(){
        const {[RuxgetTakeover.KEY]:value}=await chrome.storage.local.get(RuxgetTakeover.KEY);
        return Object.assign({},RuxgetTakeover.DEFAULTS,value||{});
    },
    // "example.com" also matches its subdomains.
    hostListed(url,hosts){
        let host='';try{host=new URL(url).hostname.toLowerCase();}catch{return false;}
        return hosts.some(entry=>{entry=String(entry||'').trim().toLowerCase().replace(/^\*\./,'');return entry&&(host===entry||host.endsWith('.'+entry));});
    },
    // Why a download stays in Chrome, or '' when the desktop should take it.
    skipReason(item,config,ownId){
        if(!config.enabled)return 'off';
        if(item.byExtensionId)return item.byExtensionId===ownId?'ruxget':'extension';
        if(item.incognito)return 'incognito';
        if(item.state&&item.state!=='in_progress')return 'state';
        const url=item.finalUrl||item.url||'';
        if(!/^https?:\/\//i.test(url))return 'scheme';
        try{const parsed=new URL(url);if(parsed.username||parsed.password)return 'scheme';}catch{return 'scheme';}
        if(url.length>16384)return 'scheme';
        const min=Math.max(0,Number(config.minMB)||0)*1024*1024;
        if(item.totalBytes>0&&item.totalBytes<min)return 'small';
        if(item.fileSize>0&&item.fileSize<min)return 'small';
        const hosts=Array.isArray(config.skipHosts)?config.skipHosts:[];
        if(RuxgetTakeover.hostListed(url,hosts)||item.referrer&&RuxgetTakeover.hostListed(item.referrer,hosts))return 'site';
        return '';
    },
    name(item){return String(item.filename||'').split(/[\\/]/).pop()||'';},
    // Chrome normalises links (spaces, non-ASCII), so links are compared in that form.
    normal(url){try{return new URL(String(url||'')).href;}catch{return String(url||'');}},
    sameLink(a,b){return !!a&&!!b&&RuxgetTakeover.normal(a)===RuxgetTakeover.normal(b);},
    // Downloads Ruxget starts itself (MP4/MP3 saves, "use Chrome", the fallback) are never taken over.
    // byExtensionId is not always filled in, so every extension context marks its links just before starting them.
    OWN:'ruxgetOwnDownloads',
    // The marker lists live in session storage; each change runs after the previous one, so two quick clicks
    // can't overwrite each other's marker.
    queue:Promise.resolve(),
    serial(task){const run=RuxgetTakeover.queue.then(task);RuxgetTakeover.queue=run.catch(()=>{});return run;},
    async mark(key,entry,keepMs){
        if(!/^https?:\/\//i.test(String(entry?.url||'')))return;
        return RuxgetTakeover.serial(async()=>{
            const {[key]:list=[]}=await chrome.storage.session.get(key),now=Date.now();
            await chrome.storage.session.set({[key]:[Object.assign({},entry,{at:now}),...list.filter(old=>now-old.at<keepMs)].slice(0,30)});
        });
    },
    // The first unexpired entry for one of these links, removed from the list; null when there is none.
    async take(key,urls,keepMs){
        return RuxgetTakeover.serial(async()=>{
            const {[key]:list=[]}=await chrome.storage.session.get(key),now=Date.now();
            const index=list.findIndex(entry=>now-entry.at<keepMs&&urls.some(url=>RuxgetTakeover.sameLink(url,entry.url)));
            if(index<0)return null;
            const [entry]=list.splice(index,1);await chrome.storage.session.set({[key]:list});return entry;
        });
    },
    markOwn(url){return RuxgetTakeover.mark(RuxgetTakeover.OWN,{url},120000);},
    async takeOwn(urls){return !!await RuxgetTakeover.take(RuxgetTakeover.OWN,urls,120000);},
    // 0.4.64: "下载" on a media row in the panel saves a plain web file. With takeover on, the person expects it to go
    // where all their other downloads go, so it is marked just before it starts and handled like a download from the
    // page itself, keeping the panel's file name and page. The marker is short-lived and only set while takeover is on.
    TAKEABLE:'ruxgetTakeableDownloads',
    markTakeable(url,name='',referer=''){return RuxgetTakeover.mark(RuxgetTakeover.TAKEABLE,{url,name,referer},15000);},
    takeable(urls){return RuxgetTakeover.take(RuxgetTakeover.TAKEABLE,urls,15000);},
    wrapDownload(){
        const downloads=chrome.downloads;if(!downloads?.download||downloads.download.ruxgetMarked)return;
        const original=downloads.download.bind(downloads);
        const wrapped=function(options,callback){
            const run=RuxgetTakeover.markOwn(options&&options.url).catch(()=>{}).then(()=>original(options));
            if(typeof callback==='function'){run.then(id=>callback(id),()=>callback(undefined));return;}
            return run;
        };
        wrapped.ruxgetMarked=true;downloads.download=wrapped;
    },
    // Recent hand-overs and why a download stayed in Chrome, with timings, so a miss can be explained (0.4.65).
    // Kept in local storage: session storage is cleared whenever the worker restarts, which is exactly when misses happen.
    remember(entry){
        return RuxgetTakeover.serial(async()=>{try{
            const {[RuxgetTakeover.LOG]:log=[]}=await chrome.storage.local.get(RuxgetTakeover.LOG);
            await chrome.storage.local.set({[RuxgetTakeover.LOG]:[Object.assign({at:Date.now()},entry),...log].slice(0,8)});
        }catch{/* The log is only a convenience on the settings page and in the panel. */}});
    },
    // How far Chrome got before Ruxget could act: seconds since the download started, and the share already downloaded.
    async progress(item){
        const [current]=await chrome.downloads.search({id:item.id}).catch(()=>[]);const now=current||item;
        const total=Math.max(Number(now.totalBytes)||0,Number(now.fileSize)||0),done=Number(now.bytesReceived)||0;
        const started=Date.parse(item.startTime||now.startTime||'');
        return {state:now.state,paused:!!now.paused,lagMs:Number.isFinite(started)?Math.max(0,Date.now()-started):-1,percent:total>0?Math.round(100*done/total):-1,done,total};
    },
    async handle(item){
        const config=await RuxgetTakeover.settings(),urls=[item.url,item.finalUrl].filter(Boolean);
        // The fallback that restarts a refused file in Chrome is never marked, so nothing can bounce back and forth.
        // Chrome often leaves byExtensionId empty when the download starts, even for Ruxget's own.
        const offered=config.enabled&&(!item.byExtensionId||item.byExtensionId===chrome.runtime.id)?await RuxgetTakeover.takeable(urls):null;
        if(RuxgetTakeover.skipReason(offered?Object.assign({},item,{byExtensionId:''}):item,config,chrome.runtime.id))return;
        if(await RuxgetTakeover.takeOwn(urls)&&!offered)return;
        // Reached so late that Chrome has (nearly) finished: moving it now would only download it a second time.
        const seen=await RuxgetTakeover.progress(item);
        if(seen.state!=='in_progress'||seen.percent>=RuxgetTakeover.LATE){
            await RuxgetTakeover.remember({url:item.finalUrl||item.url,id:item.id,name:RuxgetTakeover.name(item),result:'chrome',error:'late',lagMs:seen.lagMs,percent:seen.percent});
            return;
        }
        await RuxgetTakeover.handOver(item,Object.assign({},offered||{},{seen}));
    },
    LATE:80,
    // Moves one running Chrome download to the desktop: automatic takeover, or "改用桌面版" in the panel.
    // Returns {result:'desktop'} or {result:'chrome',error}; a file the desktop can't take keeps downloading in Chrome.
    // One hand-over per download at a time: a second request for the same download (say "桌面下载" clicked while the
    // automatic takeover is still waiting for the desktop) shares the first one's result instead of adding a second task.
    running:new Map(),
    handOver(item,hint={}){
        if(RuxgetTakeover.running.has(item.id))return RuxgetTakeover.running.get(item.id);
        const run=RuxgetTakeover.moveNow(item,hint).finally(()=>RuxgetTakeover.running.delete(item.id));
        RuxgetTakeover.running.set(item.id,run);return run;
    },
    async moveNow(item,hint){
        if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))return {result:'chrome',error:'not connected'};
        // A brand-new download can refuse a pause while Chrome is still naming it, so keep trying for a few seconds.
        // A file that finishes in the meantime is simply left to Chrome. Every outcome is noted with its timing.
        const seen=hint.seen||await RuxgetTakeover.progress(item),started=Date.now();
        const note=(result,error,extra={})=>RuxgetTakeover.remember(Object.assign({url:item.finalUrl||item.url,source:item.url,id:item.id,name:RuxgetTakeover.name(item)||String(hint.name||'').split(/[\\/]/).pop(),result,error,lagMs:seen.lagMs,percent:seen.percent,ms:Date.now()-started},extra));
        for(let attempt=0;;attempt++){
            try{await chrome.downloads.pause(item.id);break;}
            catch(error){
                const [current]=await chrome.downloads.search({id:item.id});
                if(!current||current.state!=='in_progress')return {result:'chrome',error:'finished'};
                if(attempt>=50){await note('chrome','pause',{detail:error?.message||String(error)});return {result:'chrome',error:'pause'};}
                await new Promise(resolve=>setTimeout(resolve,100));
            }
        }
        const url=item.finalUrl||item.url,referer=[item.referrer,hint.referer].find(value=>/^https?:/i.test(value||''))||'';
        // The panel's own name for the file; Chrome usually hasn't named a brand-new download yet.
        const name=RuxgetTakeover.name(item)||String(hint.name||'').split(/[\\/]/).pop();
        let reply;
        try{reply=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'takeover',kind:'file',chromeFolder:typeof ShiyingNative!=='undefined'?await ShiyingNative.chromeFolder():'',url,referer,userAgent:navigator.userAgent,name,size:item.totalBytes>0?item.totalBytes:-1});}
        catch(error){reply={ok:false,error:error?.message||String(error)};}
        if(reply?.ok){
            // Noted before cancelling, so the panel can tell "moved to the desktop" from "interrupted" when Chrome reports the cancel.
            await note('desktop','',{name:reply.name||name});
            // Erase only once Chrome has finished cancelling, or a "cancelled" entry stays in its list.
            try{await chrome.downloads.cancel(item.id);}catch{}
            for(let attempt=0;attempt<20;attempt++){
                const [current]=await chrome.downloads.search({id:item.id});
                if(!current)break;
                if(current.state!=='in_progress'){try{await chrome.downloads.erase({id:item.id});}catch{}}
                await new Promise(resolve=>setTimeout(resolve,100));
            }
            if(typeof RuxgetDesktopTasks!=='undefined')await RuxgetDesktopTasks.remember(reply.id,reply.name||name).catch(()=>{});
            return {result:'desktop',name:reply.name||name};
        }
        // Back to Chrome: resume the paused copy, or start it again if Chrome can't resume this server.
        try{await chrome.downloads.resume(item.id);}
        catch{try{await chrome.downloads.cancel(item.id);}catch{}try{await chrome.downloads.download({url});}catch{}}
        await note('chrome',String(reply?.error||'')||'desktop');
        return {result:'chrome',error:String(reply?.error||'')};
    }
};
if(typeof chrome!=='undefined'&&chrome.downloads){
    RuxgetTakeover.wrapDownload();
    // Only the service worker decides; extension pages load this file just to mark their own downloads.
    if(typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope)chrome.downloads.onCreated.addListener(item=>{RuxgetTakeover.handle(item).catch(()=>{});});
}
if(typeof module!=='undefined')module.exports=RuxgetTakeover;
