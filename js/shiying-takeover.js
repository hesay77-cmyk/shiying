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
    // Downloads Ruxget starts itself (MP4/MP3 saves, "use Chrome", the fallback) are never taken over.
    // byExtensionId is not always filled in, so every extension context marks its links just before starting them.
    OWN:'ruxgetOwnDownloads',
    async markOwn(url){
        if(!/^https?:\/\//i.test(String(url||'')))return;
        const {[RuxgetTakeover.OWN]:list=[]}=await chrome.storage.session.get(RuxgetTakeover.OWN),now=Date.now();
        await chrome.storage.session.set({[RuxgetTakeover.OWN]:[{url,at:now},...list.filter(entry=>now-entry.at<120000)].slice(0,30)});
    },
    async takeOwn(urls){
        const {[RuxgetTakeover.OWN]:list=[]}=await chrome.storage.session.get(RuxgetTakeover.OWN),now=Date.now();
        const index=list.findIndex(entry=>now-entry.at<120000&&urls.includes(entry.url));
        if(index<0)return false;
        list.splice(index,1);await chrome.storage.session.set({[RuxgetTakeover.OWN]:list});return true;
    },
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
    async remember(entry){
        try{
            const {[RuxgetTakeover.LOG]:log=[]}=await chrome.storage.session.get(RuxgetTakeover.LOG);
            await chrome.storage.session.set({[RuxgetTakeover.LOG]:[Object.assign({at:Date.now()},entry),...log].slice(0,5)});
        }catch{/* The log is only a convenience on the settings page. */}
    },
    async handle(item){
        const config=await RuxgetTakeover.settings();
        if(RuxgetTakeover.skipReason(item,config,chrome.runtime.id))return;
        if(await RuxgetTakeover.takeOwn([item.url,item.finalUrl].filter(Boolean)))return;
        if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))return;
        // A brand-new download can refuse a pause while Chrome is still naming it, so retry briefly.
        // A file that finishes in the meantime is simply left to Chrome.
        for(let attempt=0;;attempt++){
            try{await chrome.downloads.pause(item.id);break;}
            catch{
                const [current]=await chrome.downloads.search({id:item.id});
                if(attempt>=10||!current||current.state!=='in_progress')return;
                await new Promise(resolve=>setTimeout(resolve,100));
            }
        }
        const url=item.finalUrl||item.url;
        let reply;
        try{reply=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'takeover',kind:'file',url,referer:/^https?:/i.test(item.referrer||'')?item.referrer:'',userAgent:navigator.userAgent,name:RuxgetTakeover.name(item),size:item.totalBytes>0?item.totalBytes:-1});}
        catch(error){reply={ok:false,error:error?.message||String(error)};}
        if(reply?.ok){
            try{await chrome.downloads.cancel(item.id);}catch{}
            try{await chrome.downloads.erase({id:item.id});}catch{}
            await RuxgetTakeover.remember({url,name:reply.name||RuxgetTakeover.name(item),result:'desktop'});
            return;
        }
        // Back to Chrome: resume the paused copy, or start it again if Chrome can't resume this server.
        try{await chrome.downloads.resume(item.id);}
        catch{try{await chrome.downloads.cancel(item.id);}catch{}try{await chrome.downloads.download({url});}catch{}}
        await RuxgetTakeover.remember({url,name:RuxgetTakeover.name(item),result:'chrome',error:String(reply?.error||'')});
    }
};
if(typeof chrome!=='undefined'&&chrome.downloads){
    RuxgetTakeover.wrapDownload();
    // Only the service worker decides; extension pages load this file just to mark their own downloads.
    if(typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope)chrome.downloads.onCreated.addListener(item=>{RuxgetTakeover.handle(item).catch(()=>{});});
}
if(typeof module!=='undefined')module.exports=RuxgetTakeover;
