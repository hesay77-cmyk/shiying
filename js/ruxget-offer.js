// Offering Ruxget Desktop for large Chrome downloads, paced by how the person downloads (0.4.58).
// - The first ordinary Chrome download of 50 MB or more, while it is still running, opens the Ruxget panel once
//   with one card.
// - Every time the card really opens by itself counts, answered or not (closing the panel is a "no" too); if Chrome
//   can't open it (older Chrome, window not in front), the card waits in the panel and counts once answered. The next time
//   needs 7 days and 3 more large downloads; the third 30 days and 3 more. Never more than 3 times in all, and
//   never again after "不再提示" or after the person turns takeover off themself.
// - Once takeover is on, nothing is offered. The switch at the bottom of the panel and the right-click entries
//   stay available all the time. Never a Windows notification, never a new tab.
const RuxgetOffer={
    KEY:'ruxgetOffer',      // local: {asked,lastAnswerAt,largeSince,never}; asked = times the card opened by itself,
                            // lastAnswerAt = when it last opened or was answered
    CARD:'ruxgetOfferCard', // local: {id,name,size,url,at,counted} the download the open card is about
    INTENT:'ruxgetOfferIntent', // session: {kind:'on'|'move',card,id,at} a click waiting for Chrome's permission
    MISSING:'ruxgetDeskMissing', // session: true once a click found the desktop app not installed
    SEEN:'ruxgetOfferSeen', // session: download ids already counted
    MB:50,
    DAY:86400000,
    WAIT_DAYS:[0,7,30],
    LARGE_AGAIN:3,
    CARD_HOURS:24,
    LATE:0.8,               // a download this far along isn't worth moving
    MAX:3,
    async state(){
        const {[RuxgetOffer.KEY]:value,ruxgetTakeoverHint:hint}=await chrome.storage.local.get([RuxgetOffer.KEY,'ruxgetTakeoverHint']);
        // Someone who said "不用了" to the 0.4.54 hint has already been asked once.
        const start=!value&&hint?.dismissed?{asked:1,lastAnswerAt:Date.now()}:{};
        return Object.assign({asked:0,lastAnswerAt:0,largeSince:0,never:false},start,value||{});
    },
    // Whether the card may open by itself now.
    due(state,now){
        if(state.never||state.asked>=RuxgetOffer.MAX)return false;
        if(!state.asked)return true;
        return now-state.lastAnswerAt>=RuxgetOffer.WAIT_DAYS[state.asked]*RuxgetOffer.DAY&&state.largeSince>=RuxgetOffer.LARGE_AGAIN;
    },
    size(item){return Math.max(Number(item?.totalBytes)||0,Number(item?.fileSize)||0);},
    // An ordinary web download the desktop could take: not Ruxget's own, not incognito, a real HTTP(S) link, 50 MB+.
    fits(item){
        if(!item||item.byExtensionId||item.incognito)return false;
        if(item.state&&item.state==='interrupted')return false;
        if(!/^https?:\/\//i.test(item.finalUrl||item.url||''))return false;
        return RuxgetOffer.size(item)>=RuxgetOffer.MB*1024*1024;
    },
    // Still early enough that moving it to the desktop makes sense.
    early(item){
        const total=RuxgetOffer.size(item);
        return item?.state==='in_progress'&&total>0&&(Number(item.bytesReceived)||0)<total*RuxgetOffer.LATE;
    },
    // Downloads are looked at one at a time, so two events for the same file (or files starting together)
    // can't both open the panel or lose a count.
    queue:Promise.resolve(),
    note(item){
        const run=RuxgetOffer.queue.then(()=>RuxgetOffer.noteNow(item));
        RuxgetOffer.queue=run.catch(()=>{});
        return run;
    },
    async noteNow(item){
        // Look at the download as it is now: another download manager may have cancelled it already.
        const [current]=await chrome.downloads.search({id:item.id}).catch(()=>[]);
        if(current)item=current;
        if(!RuxgetOffer.fits(item))return false;
        // Chrome names the file once the person has chosen where to save it; until then the Save As dialog may be open.
        // Not marked as seen, so the naming event looks again.
        if(!item.filename)return false;
        const {[RuxgetOffer.SEEN]:seen=[]}=await chrome.storage.session.get(RuxgetOffer.SEEN);
        if(seen.includes(item.id))return false;
        await chrome.storage.session.set({[RuxgetOffer.SEEN]:[item.id,...seen].slice(0,50)});
        if(typeof RuxgetTakeover!=='undefined'&&(await RuxgetTakeover.settings()).enabled)return false;
        const {ruxgetOwnDownloads:own=[]}=await chrome.storage.session.get('ruxgetOwnDownloads');
        if(own.some(entry=>entry.url===item.url||entry.url===item.finalUrl))return false;
        const state=await RuxgetOffer.state(),now=Date.now();
        if(state.asked)state.largeSince++;
        // Only while the file is still early on: a finished or nearly finished download only counts.
        const due=RuxgetOffer.due(state,now)&&RuxgetOffer.early(item);
        const card={id:item.id,name:String(item.filename||'').split(/[\\/]/).pop()||'',size:RuxgetOffer.size(item),url:item.finalUrl||item.url,at:now,counted:false};
        await chrome.storage.local.set(Object.assign({[RuxgetOffer.KEY]:state},due?{[RuxgetOffer.CARD]:card}:{}));
        if(!due)return false;
        // Opens the panel under the toolbar icon, like Chrome's own download bubble. Only an opening that worked counts;
        // if Chrome refuses (window not in front, or a Chrome older than 127), the card waits in the panel for a day.
        if(!await RuxgetOffer.open())return false;
        Object.assign(state,{asked:state.asked+1,lastAnswerAt:now,largeSince:0});
        await chrome.storage.local.set({[RuxgetOffer.KEY]:state,[RuxgetOffer.CARD]:Object.assign(card,{counted:true})});
        return true;
    },
    async open(){
        try{const window=await chrome.windows.getLastFocused();await chrome.action.openPopup(window?.id>=0?{windowId:window.id}:undefined);return true;}catch{return false;}
    },
    // The card currently waiting in the panel, or null.
    async card(){
        const {[RuxgetOffer.CARD]:card}=await chrome.storage.local.get(RuxgetOffer.CARD);
        return card&&Date.now()-card.at<RuxgetOffer.CARD_HOURS*3600000?card:null;
    },
    // 'yes' (turned on or going to install), 'no' or 'never'. Closes the card; the wait restarts from now.
    async answer(kind){
        const [state,card]=await Promise.all([RuxgetOffer.state(),RuxgetOffer.card()]);
        // A card the panel showed only when the person opened it themself counts once it is answered.
        if(card&&!card.counted)state.asked++;
        Object.assign(state,{lastAnswerAt:Date.now(),largeSince:0,never:state.never||kind==='never'});
        await chrome.storage.local.set({[RuxgetOffer.KEY]:state});
        await chrome.storage.local.remove(RuxgetOffer.CARD);
    },
    // The size takeover will use: one the person picked on the takeover page stays; the untouched default becomes 50 MB.
    minFor(current){
        const chosen=Number(current?.minMB);
        return Number.isFinite(chosen)&&chosen>=0&&!(chosen===1&&!current?.minChosen)?chosen:RuxgetOffer.MB;
    },
    async turnOn(){
        const {ruxgetTakeover:current={}}=await chrome.storage.local.get('ruxgetTakeover');
        const minMB=RuxgetOffer.minFor(current);
        await chrome.storage.local.set({ruxgetTakeover:Object.assign({skipHosts:[]},current,{enabled:true,minMB})});
        await chrome.storage.local.remove(RuxgetOffer.CARD);
        return minMB;
    },
    async turnOff(){
        const {ruxgetTakeover:current={}}=await chrome.storage.local.get('ruxgetTakeover');
        await chrome.storage.local.set({ruxgetTakeover:Object.assign({skipHosts:[],minMB:RuxgetOffer.MB},current,{enabled:false})});
    },
    // Turning takeover off is a clear answer: the card never opens by itself again.
    async never(){
        const state=await RuxgetOffer.state();
        if(state.never)return;
        await chrome.storage.local.set({[RuxgetOffer.KEY]:Object.assign(state,{never:true})});
        await chrome.storage.local.remove(RuxgetOffer.CARD);
    },
    // Chrome's permission prompt can close the panel before the click has done its work. The panel notes what the click
    // was for; if it isn't there any more to finish, the worker does it once the permission is granted, then reopens
    // the panel so the person sees the result (takeover on, or "下载桌面版" when the app isn't installed).
    async finishIntent(wait=1500){
        await new Promise(resolve=>setTimeout(resolve,wait));
        const {[RuxgetOffer.INTENT]:intent}=await chrome.storage.session.get(RuxgetOffer.INTENT);
        if(!intent||Date.now()-intent.at>120000)return false;
        await chrome.storage.session.remove(RuxgetOffer.INTENT);
        const desk=await RuxgetOffer.desktop();
        if(desk==='ready'){
            if(intent.kind==='on'){await RuxgetOffer.turnOn();if(intent.card)await RuxgetOffer.answer('yes');}
            if(intent.id!=null){const [item]=await chrome.downloads.search({id:Number(intent.id)});if(item&&item.state==='in_progress')await RuxgetTakeover.handOver(item);}
        }else if(desk==='missing')await chrome.storage.session.set({[RuxgetOffer.MISSING]:true});
        await RuxgetOffer.open();
        return desk;
    },
    // The toolbar icon's right-click entries follow Ruxget's own language choice (the worker has no page i18n).
    async menuTitles(){
        try{
            const {ruxgetUiLanguage:pref='auto'}=await chrome.storage.local.get('ruxgetUiLanguage');
            const lang=pref==='en'||pref==='zh_CN'?pref:/^zh/i.test(chrome.i18n.getUILanguage())?'zh_CN':'en';
            const messages=await (await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`))).json();
            const text=key=>messages[key]?.message;
            for(const [id,key] of [['ruxget-action-takeover','uiActionTakeover'],['ruxget-action-desktop','uiActionDesktop'],['shiying-link-desktop','uiContextDownloadLink']])
                if(text(key))await chrome.contextMenus.update(id,{title:text(key)}).catch(()=>{});
        }catch{}
    },
    // The checkbox in the toolbar icon's right-click menu follows the setting.
    async syncMenu(){
        try{const {enabled}=await RuxgetTakeover.settings();await chrome.contextMenus.update('ruxget-action-takeover',{checked:!!enabled});}catch{}
        await RuxgetOffer.menuTitles();
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
    // Whether Ruxget Desktop answers: 'ready', 'missing' (not installed), 'unpermitted' (Chrome hasn't been allowed
    // to talk to it yet, so whether it is installed is unknown) or 'unknown' (installed but not answering).
    async desktop(){
        if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))return 'unpermitted';
        try{const reply=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});return reply?.ok?'ready':'unknown';}
        catch(error){return typeof ShiyingNative!=='undefined'&&ShiyingNative.connectionIssue(error)==='missing'?'missing':'unknown';}
    }
};
if(typeof chrome!=='undefined'&&chrome.downloads&&typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope){
    // Size is known when the download starts (most servers), or later when Chrome learns it, or at the end.
    chrome.downloads.onCreated.addListener(item=>{RuxgetOffer.note(item).catch(()=>{});});
    chrome.downloads.onChanged.addListener(change=>{
        if(!change.totalBytes&&!change.filename&&change.state?.current!=='complete')return;
        chrome.downloads.search({id:change.id}).then(([item])=>RuxgetOffer.note(item)).catch(()=>{});
    });
    chrome.permissions.onAdded.addListener(added=>{if(added?.permissions?.includes('nativeMessaging'))RuxgetOffer.finishIntent().catch(()=>{});});
    chrome.storage.onChanged.addListener((changes,area)=>{
        if(area!=='local')return;
        if(changes.ruxgetTakeover){
            RuxgetOffer.syncMenu();
            if(changes.ruxgetTakeover.oldValue?.enabled&&!changes.ruxgetTakeover.newValue?.enabled)RuxgetOffer.never().catch(()=>{});
        }
        if(changes.ruxgetUiLanguage)RuxgetOffer.menuTitles();
    });
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
