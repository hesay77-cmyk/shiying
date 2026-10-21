// Ruxget平台入口，GPL-3.0。只处理实际可访问的视频格式。
const ShiyingPlatform = {
    mediaURL(value,site) {
        const url=new URL(value);
        const bilibili=site==='bilibili'&&/(^|\.)bilivideo\.(com|cn)$/.test(url.hostname);
        let allowed=bilibili;
        /* shiying-store-omit */
        if(site!=='bilibili'&&/(^|\.)googlevideo\.com$/.test(url.hostname))allowed=true;
        /* shiying-store-omit-end */
        if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed)throw new Error('原站返回的媒体地址不可用，请重新读取');
        return url.href;
    },
    bilibiliCatalog(source,data) {
        if(!data||!Array.isArray(data.video)||!Array.isArray(data.audio)||data.video.length>100||data.audio.length>30)throw new Error('没有读到完整视频，请重新读取');
        const track=item=>({id:item.id,height:Number(item.height),width:Number(item.width),bitrate:Number(item.bandwidth)||0,codec:item.codecs||'',url:this.mediaURL(item.baseUrl||item.base_url,'bilibili'),backups:(item.backupUrl||item.backup_url||[]).slice(0,4).map(value=>this.mediaURL(value,'bilibili'))});
        const video=data.video.map(track).filter(item=>item.height>0&&item.codec.startsWith('avc')).sort((a,b)=>b.bitrate-a.bitrate);
        const audio=data.audio.map(track).filter(item=>item.codec.startsWith('mp4a')).sort((a,b)=>b.bitrate-a.bitrate);
        if(!video.length||!audio.length)throw new Error('没有取得可合并的画面与声音');
        return {...source,title:String(data.title).slice(0,300),duration:Number(data.duration),video,audio,choices:[...new Set(video.map(item=>item.height))].sort((a,b)=>b-a).map(height=>({height,label:height+'p'}))};
    },
    /* shiying-store-omit */
    youtubeCatalog(source,data) {
        if(data.playabilityStatus?.status!=='OK')throw new Error('原站暂时不提供这个视频，请确认网页能播放后重新读取');
        if(data.videoDetails?.isLiveContent)throw new Error('目前支持已发布的视频，直播请使用高级工具');
        const formats=(data.streamingData?.adaptiveFormats||[]).filter(item=>item.url&&!item.drmFamilies&&!item.isDrc&&!new URLSearchParams(new URL(item.url).searchParams.get('xtags')||'').getAll('sr').includes('1'));
        const convert=item=>({id:item.itag,height:Number(item.height)||0,width:Number(item.width)||0,bitrate:Number(item.bitrate)||0,codec:item.mimeType,url:this.mediaURL(item.url,'youtube'),backups:[],bytes:Number(item.contentLength)||0});
        const video=formats.filter(item=>/video\/mp4; codecs="avc1/.test(item.mimeType)).map(convert).sort((a,b)=>b.bitrate-a.bitrate);
        const audio=formats.filter(item=>/audio\/mp4; codecs="mp4a/.test(item.mimeType)&&item.audioTrack?.audioIsDefault!==false).map(convert).sort((a,b)=>b.bitrate-a.bitrate);
        if(!video.length||!audio.length)throw new Error('暂时没读到完整音视频轨，请播放视频后重新读取');
        return {...source,title:String(data.videoDetails.title).slice(0,300),duration:Number(data.videoDetails.lengthSeconds),video,audio,choices:[...new Set(video.map(item=>item.height))].sort((a,b)=>b-a).map(height=>({height,label:height+'p'}))};
    },
    /* shiying-store-omit-end */
    pageURLError() {
        /* shiying-store-omit */
        return '请输入完整的 B站或 YouTube 视频网址';
        /* shiying-store-omit-end */
        return '请输入完整的 B站视频网址';
    },
    unsupportedPageError() {
        /* shiying-store-omit */
        return '这个入口目前支持 B站和 YouTube 视频';
        /* shiying-store-omit-end */
        return '这个入口目前支持 B站视频';
    },
    source(value) {
        let url;
        try {url = new URL(value);} catch {throw new Error(this.pageURLError());}
        if (url.protocol !== 'https:') throw new Error('请使用 HTTPS 视频网址');
        /* shiying-store-omit */
        if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
            const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/)?.[1];
            if (!/^[\w-]{11}$/.test(id || '')) throw new Error('请粘贴单个 YouTube 视频的网址');
            return {site:'youtube', url:`https://www.youtube.com/watch?v=${id}`};
        }
        /* shiying-store-omit-end */
        if (['www.bilibili.com', 'bilibili.com'].includes(url.hostname)) {
            const id = url.pathname.match(/^\/video\/(BV[\w]+|av\d+)/i)?.[1];
            if (!id) throw new Error('请粘贴 B站视频的 BV 或 av 网址');
            const part = Math.max(1, Math.min(10000, Number(url.searchParams.get('p')) || 1));
            return {site:'bilibili', url:`https://www.bilibili.com/video/${id}/${part > 1 ? `?p=${Math.floor(part)}` : ''}`};
        }
        throw new Error(this.unsupportedPageError());
    },
    // 注入当前 B站页面：使用页面已有的登录状态，Cookie 不离开浏览器。
    readBilibiliPage: async function(inputURL) {
        try {
        const url = new URL(inputURL);
        const id = url.pathname.match(/^\/video\/(BV[\w]+|av\d+)/i)?.[1];
        if (!id) throw new Error('没有找到 B站视频编号');
        const get = async (route, parameters) => {
            const response = await fetch(`https://api.bilibili.com${route}?${new URLSearchParams(parameters)}`, {credentials:'include'});
            if (!response.ok) throw new Error(`B站返回 ${response.status}，请刷新视频网页后重试`);
            const json = await response.json();
            if (json.code !== 0) throw new Error(json.message || 'B站视频信息读取失败');
            return json.data;
        };
        const identity = /^av/i.test(id) ? {aid:id.slice(2)} : {bvid:id};
        const view = await get('/x/web-interface/view', identity);
        const part = Math.max(1, Math.floor(Number(url.searchParams.get('p')) || 1));
        const page = view.pages?.[part - 1];
        if (!page) throw new Error('没有找到这个分 P，请检查视频网址');
        const play = await get('/x/player/playurl', {...identity, cid:String(page.cid), qn:'127', fnval:'4048', fnver:'0', fourk:'1'});
        if (!play.dash?.video?.length || !play.dash?.audio?.length) throw new Error('没有取得完整音视频轨，请在 B站播放后重试');
        return {title:view.pages.length > 1 ? `${view.title} - P${part} ${page.part}` : view.title, duration:page.duration || play.dash.duration, userAgent:navigator.userAgent, video:play.dash.video, audio:play.dash.audio};
        } catch (error) {return {error:error.message || String(error)};}
    }
};
if (typeof module !== 'undefined') module.exports = ShiyingPlatform;
