// Ruxget 平台入口，GPL-3.0。只处理实际可访问的视频格式。
const ShiyingPlatform = {
    // Extension points for optional site modules: extra link resolvers, page readers and media hosts per site.
    resolvers: [],
    readers: {},
    mediaHosts: {bilibili:/(^|\.)bilivideo\.(com|cn)$/},
    mediaDomains: {bilibili:['bilivideo.com','bilivideo.cn']},
    mediaURL(value,site) {
        const url=new URL(value);
        const allowed=this.mediaHosts[site];
        if(!allowed||url.protocol!=='https:'||url.username||url.password||url.port||!allowed.test(url.hostname))throw new Error('原站返回的媒体地址不可用，请重新读取');
        return url.href;
    },
    // Cover art for MP3 tags: only B站's own image host, always over HTTPS; anything else is dropped.
    coverURL(value) {
        try {const url=new URL(String(value||'').replace(/^http:/,'https:'));return url.protocol==='https:'&&/(^|\.)hdslb\.com$/.test(url.hostname)?url.href:'';} catch {return '';}
    },
    subtitleURL(value) {
        try {const url=new URL(String(value||'').replace(/^\/\//,'https://').replace(/^http:/,'https:'));return url.protocol==='https:'&&/(^|\.)hdslb\.com$/.test(url.hostname)?url.href:'';} catch {return '';}
    },
    // B站 subtitle JSON ({body:[{from,to,content}]}) to SRT.
    subtitleSRT(data) {
        const time=value=>{const ms=Math.max(0,Math.round(Number(value)*1000));const pad=(n,w=2)=>String(n).padStart(w,'0');return pad(Math.floor(ms/3600000))+':'+pad(Math.floor(ms/60000)%60)+':'+pad(Math.floor(ms/1000)%60)+','+pad(ms%1000,3);};
        const lines=(Array.isArray(data?.body)?data.body:[]).filter(item=>Number.isFinite(Number(item.from))&&Number.isFinite(Number(item.to))&&String(item.content||'').trim());
        if(!lines.length)throw new Error('这个字幕是空的');
        return lines.map((item,index)=>(index+1)+'\n'+time(item.from)+' --> '+time(item.to)+'\n'+String(item.content).replace(/\r/g,'').trim()+'\n').join('\n');
    },
    // Runs in the B站 tab (MAIN world) so the request looks like the site's own player.
    readSubtitle: async function(url) {
        try {const response = await fetch(url, {credentials:'omit'});if (!response.ok) throw new Error('字幕读取失败，请刷新视频网页后重试');return {data:await response.json()};}
        catch (error) {return {error:error.message || String(error)};}
    },
    bilibiliCatalog(source,data) {
        if(!data||!Array.isArray(data.video)||!Array.isArray(data.audio)||data.video.length>100||data.audio.length>30)throw new Error('没有读到完整视频，请重新读取');
        const track=item=>({id:item.id,height:Number(item.height),width:Number(item.width),bitrate:Number(item.bandwidth)||0,codec:item.codecs||'',url:this.mediaURL(item.baseUrl||item.base_url,'bilibili'),backups:(item.backupUrl||item.backup_url||[]).slice(0,4).map(value=>this.mediaURL(value,'bilibili'))});
        const video=data.video.map(track).filter(item=>item.height>0&&item.codec.startsWith('avc')).sort((a,b)=>b.bitrate-a.bitrate);
        const audio=data.audio.map(track).filter(item=>item.codec.startsWith('mp4a')).sort((a,b)=>b.bitrate-a.bitrate);
        if(!video.length||!audio.length)throw new Error('没有取得可合并的画面与声音');
        return {...source,title:String(data.title).slice(0,300),artist:String(data.artist||'').slice(0,100),cover:this.coverURL(data.cover),subtitles:(Array.isArray(data.subtitles)?data.subtitles:[]).slice(0,20).map(item=>({lang:String(item.lang||'').slice(0,20),name:String(item.name||item.lang||'').slice(0,40),url:this.subtitleURL(item.url)})).filter(item=>item.url),duration:Number(data.duration),video,audio,choices:[...new Set(video.map(item=>item.height))].sort((a,b)=>b-a).map(height=>({height,label:height+'p'}))};
    },
    source(value) {
        let url;
        try {url = new URL(value);} catch {throw new Error('请输入完整的 B站视频网址');}
        if (url.protocol !== 'https:') throw new Error('请使用 HTTPS 视频网址');
        if (['www.bilibili.com', 'bilibili.com'].includes(url.hostname)) {
            const id = url.pathname.match(/^\/video\/(BV[\w]+|av\d+)/i)?.[1];
            if (!id) throw new Error('请粘贴 B站视频的 BV 或 av 网址');
            const part = Math.max(1, Math.min(10000, Number(url.searchParams.get('p')) || 1));
            return {site:'bilibili', url:`https://www.bilibili.com/video/${id}/${part > 1 ? `?p=${Math.floor(part)}` : ''}`};
        }
        for (const resolve of this.resolvers) {const found = resolve(url);if (found) return found;}
        throw new Error('这个入口目前支持 B站视频');
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
        let subtitles = [];
        try {const player = await get('/x/player/v2', {...identity, cid:String(page.cid)});subtitles = (player.subtitle?.subtitles || []).map(item => ({lang:item.lan, name:item.lan_doc, url:item.subtitle_url}));} catch {}
        return {subtitles, title:view.pages.length > 1 ? `${view.title} - P${part} ${page.part}` : view.title, duration:page.duration || play.dash.duration, userAgent:navigator.userAgent, video:play.dash.video, audio:play.dash.audio, artist:view.owner?.name || '', cover:view.pic || '', pageTitle:view.title};
        } catch (error) {return {error:error.message || String(error)};}
    }
};
if (typeof module !== 'undefined') module.exports = ShiyingPlatform;
