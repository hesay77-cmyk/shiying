// Ruxget 平台入口。只处理实际可访问的视频格式。
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
    // 0.4.73: the cover the desktop app shows in its task list. Only the video sites' own image servers, over HTTPS,
    // on the default port, without user names, at most 1024 characters; anything else is dropped (the app shows ▷).
    thumbnailHosts: /(^|\.)(hdslb\.com|douyinpic\.com|yximgs\.com|kwimgs\.com|kwaicdn\.com|ndcimgs\.com|xhscdn\.com)$/,
    thumbnailURL(value) {
        try {const url=new URL(String(value||'').replace(/^\/\//,'https://').replace(/^http:/,'https:'));return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.href.length<=1024&&this.thumbnailHosts.test(url.hostname)?url.href:'';} catch {return '';}
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
    // 0.4.72: a quality is named by the short side, as the sites do: a 480×852 vertical video is "480p", not "852p".
    // The height stays the choice's id (it picks the track); only the label and the order follow the short side.
    shortSide(item) {const height=Number(item?.height)||0,width=Number(item?.width)||0;return width>0&&height>0?Math.min(width,height):height;},
    choices(video) {
        const sides=new Map();
        for(const item of video){const side=this.shortSide(item);if(!sides.has(item.height)||side<sides.get(item.height))sides.set(item.height,side);}
        return [...sides].sort((a,b)=>b[1]-a[1]||b[0]-a[0]).map(([height,side])=>({height,label:side+'p'}));
    },
    bilibiliCatalog(source,data) {
        if(!data||!Array.isArray(data.video)||!Array.isArray(data.audio)||data.video.length>100||data.audio.length>30)throw new Error('没有读到完整视频，请重新读取');
        // 0.4.69: B站 now often puts a PCDN address first (*.edge.mountaintoys.cn:4483, *.mcdn.bilivideo.cn:8082) and its
        // own upos-*.bilivideo.com mirrors among the backups. Unusable addresses are skipped one by one instead of
        // failing the whole video; a track is dropped only when none of its addresses is usable.
        const usable=item=>[...new Set([item.baseUrl||item.base_url,...(Array.isArray(item.backupUrl||item.backup_url)?(item.backupUrl||item.backup_url):[])].slice(0,8).map(value=>{try{return this.mediaURL(String(value),'bilibili');}catch{return null;}}).filter(Boolean))];
        const track=item=>{const urls=usable(item);return {id:item.id,height:Number(item.height),width:Number(item.width),bitrate:Number(item.bandwidth)||0,codec:item.codecs||'',url:urls[0],backups:urls.slice(1,5)};};
        const video=data.video.map(track).filter(item=>item.url&&item.height>0&&item.codec.startsWith('avc')).sort((a,b)=>b.bitrate-a.bitrate);
        const audio=data.audio.map(track).filter(item=>item.url&&item.codec.startsWith('mp4a')).sort((a,b)=>b.bitrate-a.bitrate);
        if(!video.length||!audio.length)throw new Error('没有取得可合并的画面与声音');
        // B站 gives visitors who aren't signed in at most 480p. Said only when the read is clear about it: B站 reports
        // the person as signed out, lists a higher quality for this video (accept_quality, qn above 32 = 480P),
        // and no track above 480p came back. Anything less certain says nothing.
        const top=Math.max(...video.map(item=>this.shortSide(item)));
        const loginLimited=data.loggedIn===false&&top<=480&&Array.isArray(data.accept)&&data.accept.some(qn=>Number(qn)>32);
        return {...source,loginLimited,parts:Math.max(1,Math.min(1000,Number(data.parts)||1)),title:String(data.title).slice(0,300),artist:String(data.artist||'').slice(0,100),cover:this.coverURL(data.cover),subtitles:(Array.isArray(data.subtitles)?data.subtitles:[]).slice(0,20).map(item=>({lang:String(item.lang||'').slice(0,20),name:String(item.name||item.lang||'').slice(0,40),url:this.subtitleURL(item.url)})).filter(item=>item.url),duration:Number(data.duration),video,audio,choices:this.choices(video)};
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
            // 0.4.73: our own sentence for B站's error codes (its own message, such as 「啥都木有」, also showed in the English UI).
            if (json.code !== 0) {
                const code = Number(json.code);
                if ([-404, -400, 62002, 62012].includes(code)) throw new Error('没有找到这个视频，请检查链接');
                if (code === 62004) throw new Error('这个视频正在审核，暂时不能下载');
                if (code === -403 || code === 87008) throw new Error('没有权限观看这个视频，请在本浏览器登录 B站后重试');
                if (code === -412 || code === -352) throw new Error('B站暂时拦截了请求，请稍后刷新视频网页再试');
                throw new Error('B站视频信息读取失败，请刷新视频网页后重试');
            }
            return json.data;
        };
        const identity = /^av/i.test(id) ? {aid:id.slice(2)} : {bvid:id};
        const view = await get('/x/web-interface/view', identity);
        const part = Math.max(1, Math.floor(Number(url.searchParams.get('p')) || 1));
        const page = view.pages?.[part - 1];
        if (!page) throw new Error('没有找到这个分 P，请检查视频网址');
        const play = await get('/x/player/playurl', {...identity, cid:String(page.cid), qn:'127', fnval:'4048', fnver:'0', fourk:'1'});
        if (!play.dash?.video?.length || !play.dash?.audio?.length) throw new Error('没有取得完整音视频轨，请在 B站播放后重试');
        // Signed in or not, from B站's own answer (data.isLogin); unknown stays null and the panel says nothing.
        let loggedIn = null;
        try {const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', {credentials:'include'})).json();if (typeof nav?.data?.isLogin === 'boolean') loggedIn = nav.data.isLogin;} catch {}
        let subtitles = [];
        try {const player = await get('/x/player/v2', {...identity, cid:String(page.cid)});subtitles = (player.subtitle?.subtitles || []).map(item => ({lang:item.lan, name:item.lan_doc, url:item.subtitle_url}));} catch {}
        return {loggedIn, accept:Array.isArray(play.accept_quality) ? play.accept_quality.slice(0, 30) : [], subtitles, parts:view.pages.length, title:view.pages.length > 1 ? `${view.title} - P${part} ${page.part}` : view.title, duration:page.duration || play.dash.duration, userAgent:navigator.userAgent, video:play.dash.video, audio:play.dash.audio, artist:view.owner?.name || '', cover:view.pic || '', pageTitle:view.title};
        } catch (error) {return {error:error.message || String(error)};}
    }
};
if (typeof module !== 'undefined') module.exports = ShiyingPlatform;
