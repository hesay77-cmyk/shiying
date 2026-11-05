// Offering Ruxget Desktop for large Chrome downloads, paced by how the person downloads (0.4.56).
// - The first ordinary Chrome download of 50 MB or more opens the Ruxget panel once, with one card.
// - "不用了" waits 7 days and 3 more large downloads before the card opens again; the next time 30 days.
//   After 3 answers (or "不再提示") it never opens by itself again.
// - A card nobody answered doesn't count; it can come back after 3 days at the earliest.
// - Once takeover is on, nothing is offered. The switch at the bottom of the panel and the right-click entries
//   stay available all the time. Never a Windows notification, never a new tab.
const RuxgetOffer={
    KEY:'ruxgetOffer',      // local: {asked,lastAnswerAt,lastShownAt,largeSince,never}
    CARD:'ruxgetOfferCard', // local: {id,name,size,url,at} the download the open card is about
    SEEN:'ruxgetOfferSeen', // session: download ids already counted
    MB:50,
    DAY:86400000,
    WAIT_DAYS:[0,7,30],
    LARGE_AGAIN:3,
    QUIET_DAYS:3,
    CARD_HOURS:24,
    MAX:3,
    async state(){
        const {[RuxgetOffer.KEY]:value}=await chrome.storage.local.get(RuxgetOffer.KEY);
        return Object.assign({asked:0,lastAnswerAt:0,lastShownAt:0,largeSince:0,never:false},value||{});
    },
    // Whether the card may open by itself now.
    due(state,now){
        if(state.never||state.asked>=RuxgetOffer.MAX)return false;
        if(state.lastShownAt&&now-state.lastShownAt<RuxgetOffer.QUIET_DAYS*RuxgetOffer.DAY)return false;
        if(!state.asked)return true;
        return now-state.lastAnswerAt>=RuxgetOffer.WAIT_DAYS[state.asked]*RuxgetOffer.DAY&&state.largeSince>=RuxgetOffer.LARGE_AGAIN;
    },
    size(item){return Math.max(Number(item?.totalBytes)||0,Number(item?.fileSize)||0);},
    // An ordinary web download the desktop could take: not Ruxget's own, not incognito, a real HTTP(S) link, 50 MB+.
    fits(item,ownId){
        if(!item||item.byExtensionId||item.incognito)return false;
        if(item.state&&item.state==='interrupted')return false;
        if(!/^https?:\/\//i.test(item.finalUrl||item.url||''))return false;
        return RuxgetOffer.size(item)>=RuxgetOffer.MB*1024*1024;
    },
    async note(item){
        if(!RuxgetOffer.fits(item,chrome.runtime.id))return false;
        const {[RuxgetOffer.SEEN]:seen=[]}=await chrome.storage.session.get(RuxgetOffer.SEEN);
        if(seen.includes(item.id))return false;
        await chrome.storage.session.set({[RuxgetOffer.SEEN]:[item.id,...seen].slice(0,50)});
        if(typeof RuxgetTakeover!=='undefined'&&(await RuxgetTakeover.settings()).enabled)return false;
        const {ruxgetOwnDownloads:own=[]}=await chrome.storage.session.get('ruxgetOwnDownloads');
        if(own.some(entry=>entry.url===item.url||entry.url===item.finalUrl))return false;
        const state=await RuxgetOffer.state(),now=Date.now();
        if(state.asked)state.largeSince++;
        const due=RuxgetOffer.due(state,now);
        if(due)state.lastShownAt=now;
        await chrome.storage.local.set(Object.assign({[RuxgetOffer.KEY]:state},due?{[RuxgetOffer.CARD]:{id:item.id,name:String(item.filename||'').split(/[\\/]/).pop()||'',size:RuxgetOffer.size(item),url:item.finalUrl||item.url,at:now}}:{}));
        if(!due)return false;
        // Opens the panel under the toolbar icon, like Chrome's own download bubble. If Chrome refuses
        // (no focused window), the card simply waits in the panel for a day.
        try{const window=await chrome.windows.getLastFocused();await chrome.action.openPopup(window?.id>=0?{windowId:window.id}:undefined);}catch{}
        return true;
    },
    // The card currently waiting in the panel, or null.
    async card(){
        const {[RuxgetOffer.CARD]:card}=await chrome.storage.local.get(RuxgetOffer.CARD);
        return card&&Date.now()-card.at<RuxgetOffer.CARD_HOURS*3600000?card:null;
    },
    // 'yes' (turned on or installing), 'no' or 'never'. Every answer closes the card and restarts the wait.
    async answer(kind){
        const state=await RuxgetOffer.state();
        Object.assign(state,{asked:state.asked+1,lastAnswerAt:Date.now(),largeSince:0,never:state.never||kind==='never'});
        await chrome.storage.local.set({[RuxgetOffer.KEY]:state});
        await chrome.storage.local.remove(RuxgetOffer.CARD);
    },
    // "以后大文件交给桌面版": a size the person picked on the takeover page stays; the untouched default becomes 50 MB.
    async turnOn(){
        const {ruxgetTakeover:current={}}=await chrome.storage.local.get('ruxgetTakeover');
        const chosen=Number(current.minMB),minMB=Number.isFinite(chosen)&&chosen!==1&&chosen>0?chosen:RuxgetOffer.MB;
        await chrome.storage.local.set({ruxgetTakeover:Object.assign({skipHosts:[]},current,{enabled:true,minMB})});
        await chrome.storage.local.remove(RuxgetOffer.CARD);
        return minMB;
    },
    async turnOff(){
        const {ruxgetTakeover:current={}}=await chrome.storage.local.get('ruxgetTakeover');
        await chrome.storage.local.set({ruxgetTakeover:Object.assign({skipHosts:[],minMB:RuxgetOffer.MB},current,{enabled:false})});
    },
    // The checkbox in the toolbar icon's right-click menu follows the setting.
    async syncMenu(){
        try{const {enabled}=await RuxgetTakeover.settings();await chrome.contextMenus.update('ruxget-action-takeover',{checked:!!enabled});}catch{}
    },
    // Right-click on the icon → "大文件交给桌面版". Turning on needs the desktop: not installed opens the download page,
    // not connected opens the connection page, and the checkbox goes back to off.
    async fromMenu(on){
        if(!on){await RuxgetOffer.turnOff();return;}
        let granted=false;
        try{granted=await chrome.permissions.request({permissions:['nativeMessaging']});}catch{granted=false;}
        const desk=granted?await RuxgetOffer.desktop():'denied';
        if(desk==='ready'){await RuxgetOffer.turnOn();return;}
        await RuxgetOffer.syncMenu();
        await chrome.tabs.create({url:desk==='missing'&&typeof ShiyingNative!=='undefined'?ShiyingNative.DESKTOP_RELEASE_URL:chrome.runtime.getURL(desk==='denied'?'shiying-desktop.html#takeover':'shiying-desktop.html#connection')});
    },
    // Whether Ruxget Desktop answers: 'ready', 'missing' (not installed) or 'unknown' (not allowed yet / can't connect).
    async desktop(){
        if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))return 'unknown';
        try{const reply=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});return reply?.ok?'ready':'unknown';}
        catch(error){return typeof ShiyingNative!=='undefined'&&ShiyingNative.connectionIssue(error)==='missing'?'missing':'unknown';}
    }
};
if(typeof chrome!=='undefined'&&chrome.downloads&&typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope){
    // Size is known when the download starts (most servers), or later when Chrome learns it, or at the end.
    chrome.downloads.onCreated.addListener(item=>{RuxgetOffer.note(item).catch(()=>{});});
    chrome.downloads.onChanged.addListener(change=>{
        if(!change.totalBytes&&change.state?.current!=='complete')return;
        chrome.downloads.search({id:change.id}).then(([item])=>RuxgetOffer.note(item)).catch(()=>{});
    });
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.ruxgetTakeover)RuxgetOffer.syncMenu();});
    // "改用桌面版" in the panel: the panel may close at any moment, so the worker does the hand-over.
    chrome.runtime.onMessage.addListener((event,sender,respond)=>{
        if(sender.id!==chrome.runtime.id||event?.Message!=='ruxgetHandOver')return;
        (async()=>{
            const [item]=await chrome.downloads.search({id:Number(event.id)});
            if(!item||item.state!=='in_progress'||item.byExtensionId||!/^https?:\/\//i.test(item.finalUrl||item.url||''))return {ok:false,result:'chrome',error:'gone'};
            const outcome=await RuxgetTakeover.handOver(item);
            return Object.assign({ok:outcome.result==='desktop'},outcome);
        })().then(respond,error=>respond({ok:false,result:'chrome',error:error?.message||String(error)}));
        return true;
    });
}
if(typeof module!=='undefined')module.exports=RuxgetOffer;
