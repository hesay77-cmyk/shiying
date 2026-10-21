// Ruxget full edition: YouTube support. Not part of the Chrome Web Store package (store policy);
// GitHub releases add this file, its host permissions and its content-script entry at build time.
globalThis.RuxgetFullEdition = true;
const youtubeId = url => {
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return null;
    return url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/)?.[1] || '';
};

// Page button on watch and Shorts pages.
globalThis.RuxgetFloatingSources = [...(globalThis.RuxgetFloatingSources || []), url => {
    if (!/^(www\.|m\.)?youtube\.com$/.test(url.hostname)) return null;
    const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/shorts\/([\w-]{11})\/?$/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube.com/watch?v=' + id : '';
}];

if (typeof ShiyingPlatform !== 'undefined') {
    ShiyingPlatform.mediaHosts.youtube = /(^|\.)googlevideo\.com$/;
    ShiyingPlatform.mediaDomains.youtube = ['googlevideo.com'];
    ShiyingPlatform.resolvers.push(url => {
        const id = youtubeId(url);
        if (id === null) return null;
        if (!/^[\w-]{11}$/.test(id)) throw new Error('请粘贴单个 YouTube 视频的网址');
        return {site:'youtube', url:`https://www.youtube.com/watch?v=${id}`};
    });
    ShiyingPlatform.youtubeCatalog = function(source,data) {
        if(data.playabilityStatus?.status!=='OK')throw new Error('原站暂时不提供这个视频，请确认网页能播放后重新读取');
        if(data.videoDetails?.isLiveContent)throw new Error('目前支持已发布的视频，直播请使用高级工具');
        const formats=(data.streamingData?.adaptiveFormats||[]).filter(item=>item.url&&!item.drmFamilies&&!item.isDrc&&!new URLSearchParams(new URL(item.url).searchParams.get('xtags')||'').getAll('sr').includes('1'));
        const convert=item=>({id:item.itag,height:Number(item.height)||0,width:Number(item.width)||0,bitrate:Number(item.bitrate)||0,codec:item.mimeType,url:this.mediaURL(item.url,'youtube'),backups:[],bytes:Number(item.contentLength)||0});
        const video=formats.filter(item=>/video\/mp4; codecs="avc1/.test(item.mimeType)).map(convert).sort((a,b)=>b.bitrate-a.bitrate);
        const audio=formats.filter(item=>/audio\/mp4; codecs="mp4a/.test(item.mimeType)&&item.audioTrack?.audioIsDefault!==false).map(convert).sort((a,b)=>b.bitrate-a.bitrate);
        if(!video.length||!audio.length)throw new Error('暂时没读到完整音视频轨，请播放视频后重新读取');
        return {...source,title:String(data.videoDetails.title).slice(0,300),duration:Number(data.videoDetails.lengthSeconds),video,audio,choices:[...new Set(video.map(item=>item.height))].sort((a,b)=>b-a).map(height=>({height,label:height+'p'}))};
    };
    // Background only: read formats through the page's visitor identity, then fetch the player response.
    ShiyingPlatform.readers.youtube = async (source, tab) => {
        const [context]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>({visitorData:window.ytcfg?.get('VISITOR_DATA')||window.ytcfg?.get('INNERTUBE_CONTEXT')?.client?.visitorData})});
        if(!context.result?.visitorData)throw new Error('视频网页还在准备，请稍后重新读取');
        const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
        await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1610000000],addRules:[{id:1610000000,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'User-Agent',operation:'set',value:ua},{header:'Origin',operation:'set',value:'https://www.youtube.com'}]},condition:{initiatorDomains:[chrome.runtime.id],urlFilter:'|https://www.youtube.com/youtubei/v1/player',resourceTypes:['xmlhttprequest']}}]});
        const client={clientName:'VISIONOS',clientVersion:'1.02',deviceMake:'Apple',deviceModel:'RealityDevice17,1',userAgent:ua,osName:'visionOS',osVersion:'26.5.23O471',hl:'en',gl:'US',utcOffsetMinutes:0,visitorData:context.result.visitorData};
        const response=await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',headers:{'Content-Type':'application/json','X-YouTube-Client-Name':'101','X-YouTube-Client-Version':'1.02','X-Goog-Visitor-Id':client.visitorData},body:JSON.stringify({context:{client},videoId:new URL(source.url).searchParams.get('v'),contentCheckOk:true,racyCheckOk:true,playbackContext:{contentPlaybackContext:{html5Preference:'HTML5_PREF_WANTS'}}}),credentials:'omit',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error('原站暂时没有返回视频，请稍后重新读取');
        const catalog=ShiyingPlatform.youtubeCatalog(source,await response.json());
        let list='';try{list=new URL(tab.url).searchParams.get('list')||'';}catch{}
        return {...catalog,siteName:'YouTube',chunked:true,listUrl:/^[\w-]{10,100}$/.test(list)?'https://www.youtube.com/playlist?list='+list:''};
    };
}

if (typeof ShiyingCollection !== 'undefined') {
    ShiyingCollection.initialData = function(html) {
        const match = /(?:var\s+ytInitialData\s*=|window\["ytInitialData"\]\s*=|ytInitialData\s*=)\s*(\{)/.exec(html);
        if (!match) throw new Error('没有读到播放列表，请确认列表可公开访问');
        const start = match.index + match[0].lastIndexOf('{');
        let depth = 0, quoted = false, escaped = false;
        for (let i=start;i<html.length;i++) {
            const c=html[i];
            if (quoted) {if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
            else if(c==='"')quoted=true;
            else if(c==='{')depth++;
            else if(c==='}'&&!--depth)return JSON.parse(html.slice(start,i+1));
        }
        throw new Error('列表信息不完整，请重试');
    };
    ShiyingCollection.youtube = function(data, listId) {
        const entries=[], seen=new Set(); let hasMore=false;
        const text = value => value?.simpleText || value?.runs?.map(r=>r.text).join('') || '';
        function visit(node) {
            if(!node || typeof node!=='object')return;
            // YouTube's newer playlist pages use lockupViewModel instead of playlistVideoRenderer.
            const modern=node.lockupViewModel;
            if(modern?.contentType==='LOCKUP_CONTENT_TYPE_VIDEO') {
                const endpoint=modern.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint;
                const id=modern.contentId,title=modern.metadata?.lockupMetadataViewModel?.title?.content;
                if(!/^[\w-]{11}$/.test(id||'') || (listId&&endpoint?.playlistId!==listId))return;
                if(seen.has(id))return;seen.add(id);
                if(entries.length>=100){hasMore=true;return;}
                const overlays=modern.contentImage?.thumbnailViewModel?.overlays||[];
                const duration=overlays.flatMap(o=>o.thumbnailBottomOverlayViewModel?.badges||[]).map(b=>b.thumbnailBadgeViewModel?.text).find(t=>/^\d[\d:]*$/.test(t||''))||'';
                entries.push({url:'https://www.youtube.com/watch?v='+id,title:title||id,duration,available:!!endpoint&&!['[Private video]','[Deleted video]'].includes(title)});
                return;
            }
            const item=node.playlistVideoRenderer;
            if(item && /^[\w-]{11}$/.test(item.videoId||'')) {
                if(seen.has(item.videoId))return;
                seen.add(item.videoId);
                if(entries.length>=100){hasMore=true;return;}
                entries.push({url:'https://www.youtube.com/watch?v='+item.videoId,title:text(item.title)||item.videoId,
                    duration:text(item.lengthText),available:item.isPlayable!==false});
                return;
            }
            if(node.continuationItemRenderer)hasMore=true;
            for(const value of Object.values(node))if(value&&typeof value==='object')visit(value);
        }
        visit(data.contents); // Do not include recommended videos outside this list.
        if(!entries.length)throw new Error('列表为空、需要登录或无法访问；尚未添加下载');
        return {title:text(data.metadata?.playlistMetadataRenderer?.title)||data.metadata?.playlistMetadataRenderer?.title||'YouTube 播放列表',entries,hasMore};
    };
    ShiyingCollection.resolvers.push(u => {
        if (!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname)) return null;
        const id = u.searchParams.get('list');
        if (!/^[\w-]{10,100}$/.test(id || '')) throw new Error('请粘贴 YouTube 播放列表网址');
        return {site:'youtube', url:'https://www.youtube.com/playlist?list='+id};
    });
    ShiyingCollection.readers.youtube = async source => {
        const response=await fetch(source.url,{credentials:'include',signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw new Error('播放列表读取失败（HTTP '+response.status+'）');
        return ShiyingCollection.youtube(ShiyingCollection.initialData(await response.text()),new URL(source.url).searchParams.get('list'));
    };
}
