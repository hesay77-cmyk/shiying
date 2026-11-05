// Pages full of ads and autoplay previews fill the list with videos nobody came for. This finds the one the page is
// about (the biggest video, preferring the one playing with sound) and folds the rest under one line: clips played by
// other, smaller or muted players, clips from ad networks, and tiny files. Nothing is removed; one click shows it all.
const RuxgetFocus={
    AD_HOSTS:['2mdn.net','doubleclick.net','googlesyndication.com','googleadservices.com','googletagservices.com','imasdk.googleapis.com',
        'amazon-adsystem.com','adnxs.com','adsrvr.org','taboola.com','outbrain.com','criteo.com','criteo.net','teads.tv','innovid.com',
        'flashtalking.com','serving-sys.com','springserve.com','spotxchange.com','spotx.tv','smartadserver.com','adform.net','pubmatic.com',
        'rubiconproject.com','moatads.com','adsafeprotected.com','tanx.com','alimama.com','gdt.qq.com','gdtimg.com','pglstatp-toutiao.com',
        'pangolin-sdk-toutiao.com','cpro.baidu.com','cpro.baidustatic.com','pos.baidu.com','exoclick.com','trafficjunky.net','juicyads.com'],
    SMALL_VIDEO:1024*1024,
    SMALL_AUDIO:256*1024,
    host(url){try{return new URL(url).hostname.toLowerCase();}catch{return '';}},
    adSource(url){
        const host=RuxgetFocus.host(url);
        if(host&&RuxgetFocus.AD_HOSTS.some(entry=>host===entry||host.endsWith('.'+entry)))return true;
        return /[\/?&._=-](vast|vpaid|preroll|pre-roll|midroll|adserver|adserve)([\/?&._=-]|$)/i.test(String(url||''));
    },
    clean(url){return String(url||'').split('#')[0];},
    // Runs in every frame of the page that Ruxget may read. Returns plain data only.
    // A plain function, not a method: Chrome injects it by its source text.
    probe:function(){
        const out=[],vw=window.innerWidth,vh=window.innerHeight;
        for(const el of document.querySelectorAll('video,audio')){
            const r=el.getBoundingClientRect(),style=getComputedStyle(el);
            const shown=style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>0.05;
            const visible=shown?Math.max(0,Math.min(r.right,vw)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,vh)-Math.max(r.top,0)):0;
            const sources=[el.currentSrc,el.src,...Array.from(el.querySelectorAll('source'),source=>source.src)].filter(Boolean);
            out.push({tag:el.tagName.toLowerCase(),sources:[...new Set(sources)].slice(0,6),width:Math.round(r.width),height:Math.round(r.height),
                visible:Math.round(visible),paused:el.paused,muted:el.muted||el.volume===0,loop:el.loop,autoplay:el.autoplay,
                time:el.currentTime||0,duration:Number.isFinite(el.duration)?el.duration:0});
        }
        return out;
    },
    async read(tabId){
        try{
            const frames=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:RuxgetFocus.probe});
            return frames.flatMap(frame=>Array.isArray(frame?.result)?frame.result:[]);
        }catch{return [];}
    },
    score(el){
        const area=Math.max(0,el.width)*Math.max(0,el.height),playing=!el.paused&&!el.muted;
        if(el.tag==='video'&&area<120*68)return -1;
        if(el.tag==='audio'&&el.paused&&el.time<=0)return -1;
        return Math.sqrt(area)+(el.visible>0?300:0)+(playing?1000:0)+(el.time>1?300:0)+(el.duration>=60?200:0)-(el.loop?200:0)-(el.muted&&el.autoplay?150:0);
    },
    // Another player on the page that looks like a preview or an ad: muted, looping, tiny or hidden.
    // A second ordinary video (say, two clips in one article) stays in the list.
    preview(el){return el.muted||el.loop||RuxgetFocus.score(el)<0||(el.tag==='video'&&el.width*el.height<240*135);},
    // Map of url -> 'main' | 'normal' | 'minor' for the playable items. kind(item) is Shiying.kind.
    classify(items,elements,kind){
        const ranked=elements.map(el=>({el,score:RuxgetFocus.score(el)})).filter(entry=>entry.score>=0).sort((a,b)=>b.score-a.score);
        const main=ranked[0]?.el||null,owner=new Map();
        for(const el of elements)for(const source of el.sources)if(!/^blob:|^data:/i.test(source)&&!owner.has(RuxgetFocus.clean(source)))owner.set(RuxgetFocus.clean(source),el);
        const result=new Map();
        for(const item of items){
            const el=owner.get(RuxgetFocus.clean(item.url)),type=kind(item),size=Number(item.size)||0;
            if(RuxgetFocus.adSource(item.url))result.set(item.url,'minor');
            else if(el)result.set(item.url,el===main?'main':RuxgetFocus.preview(el)?'minor':'normal');
            else if(size>0&&((type==='video'&&size<RuxgetFocus.SMALL_VIDEO)||(type==='audio'&&size<RuxgetFocus.SMALL_AUDIO)))result.set(item.url,'minor');
            else result.set(item.url,'normal');
        }
        // A streaming player (blob: source) can't be matched by address; if exactly one stream is left, it is that one.
        if(main&&![...result.values()].includes('main')&&main.sources.every(source=>/^blob:/i.test(source))){
            const streams=items.filter(item=>result.get(item.url)==='normal'&&['hls','dash'].includes(kind(item)));
            if(streams.length===1)result.set(streams[0].url,'main');
        }
        // Never fold everything away.
        if(![...result.values()].some(value=>value!=='minor'))for(const key of result.keys())result.set(key,'normal');
        return result;
    }
};
if(typeof module!=='undefined')module.exports=RuxgetFocus;
