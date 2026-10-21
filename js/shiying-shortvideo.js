// 抖音、快手、小红书：读取当前网页播放器已有的数据，得到画面与声音已合在一起的 MP4。GPL-3.0。
// 只在用户点开 Ruxget 时读取当前页（activeTab）；不新增安装权限。抖音、小红书的视频服务器要求来源页，
// 首次下载时按需申请对应视频服务器的可选权限，以便为下载请求带上来源页。
(() => {
    if (typeof ShiyingPlatform === 'undefined') return;
    const sites = {
        douyin: {name: '抖音', hosts: /(^|\.)(douyinvod\.com|douyincdn\.com)$/, domains: ['douyinvod.com', 'douyincdn.com'], origins: ['https://*.douyinvod.com/*', 'https://*.douyincdn.com/*']},
        kuaishou: {name: '快手', hosts: /(^|\.)(kwaicdn\.com|ndcimgs\.com|yximgs\.com|kwimgs\.com)$/, domains: ['kwaicdn.com', 'ndcimgs.com', 'yximgs.com', 'kwimgs.com'], origins: []},
        xiaohongshu: {name: '小红书', hosts: /(^|\.)xhscdn\.com$/, domains: ['xhscdn.com'], origins: ['https://*.xhscdn.com/*']}
    };
    for (const [site, info] of Object.entries(sites)) {
        ShiyingPlatform.mediaHosts[site] = info.hosts;
        ShiyingPlatform.mediaDomains[site] = info.domains;
    }
    ShiyingPlatform.mediaOrigins = Object.fromEntries(Object.entries(sites).map(([site, info]) => [site, info.origins]));

    // Links. Feed pages that show one video in a layer (?modal_id=) resolve to that video.
    ShiyingPlatform.resolvers.push(url => {
        if (!['www.douyin.com', 'douyin.com'].includes(url.hostname)) return null;
        const id = url.pathname.match(/^\/video\/(\d{8,25})\/?$/)?.[1] || url.searchParams.get('modal_id');
        if (!/^\d{8,25}$/.test(id || '')) throw new Error('请打开单个抖音视频');
        return {site:'douyin', id, url:`https://www.douyin.com/video/${id}`};
    });
    ShiyingPlatform.resolvers.push(url => {
        if (!['www.kuaishou.com', 'kuaishou.com'].includes(url.hostname)) return null;
        const id = url.pathname.match(/^\/short-video\/([\w-]{6,40})\/?$/)?.[1];
        if (!id) throw new Error('请打开单个快手视频');
        return {site:'kuaishou', id, url:`https://www.kuaishou.com/short-video/${id}`};
    });
    ShiyingPlatform.resolvers.push(url => {
        if (!['www.xiaohongshu.com', 'xiaohongshu.com'].includes(url.hostname)) return null;
        const id = url.pathname.match(/^\/(?:explore|discovery\/item)\/([0-9a-f]{24})\/?$/)?.[1] || url.pathname.match(/^\/user\/profile\/[0-9a-f]{24}\/([0-9a-f]{24})\/?$/)?.[1];
        if (!id) throw new Error('请打开单条小红书视频笔记');
        return {site:'xiaohongshu', id, url:`https://www.xiaohongshu.com/explore/${id}`};
    });

    // Page readers run in the page (MAIN world). They only read what the page's own player already holds.
    const pageReaders = {
        douyin: function(id) {
            try {
                const candidates = [];
                for (const video of document.querySelectorAll('video')) {
                    for (let host = video, i = 0; host && i < 25; i++, host = host.parentElement) {
                        const key = Object.keys(host).find(name => name.startsWith('__reactFiber$'));
                        if (!key) continue;
                        for (let fiber = host[key], n = 0; fiber && n < 80; fiber = fiber.return, n++) {
                            const aweme = fiber.memoizedProps?.awemeInfo;
                            if (aweme?.video) candidates.push({aweme, playing: !video.paused && !!video.currentSrc});
                        }
                        break;
                    }
                }
                const pick = candidates.find(item => String(item.aweme.awemeId) === id) || candidates.find(item => item.playing) || candidates[0];
                if (!pick) return {error:'没有读到视频，请先播放一下再试'};
                const a = pick.aweme, v = a.video, srcs = list => (Array.isArray(list) ? list : list?.urlList || []).map(item => typeof item === 'string' ? item : item?.src).filter(Boolean);
                return JSON.parse(JSON.stringify({
                    title: a.desc || a.itemTitle || a.caption || document.title.replace(/\s*-\s*抖音$/, ''),
                    artist: a.authorInfo?.nickname || '', duration: Number(v.duration) / 1000,
                    cover: srcs(v.coverUrlList)[0] || srcs(v.originCoverUrlList)[0] || '',
                    formats: (v.bitRateList || []).map(item => ({width:item.width, height:item.height, h265:!!item.isH265 || /265|hevc|bytevc1/i.test(String(item.format || item.videoFormat || '')), bytes:Number(item.dataSize) || 0, urls:srcs(item.playAddr)})),
                    fallback: {width:v.width, height:v.height, bytes:Number(v.dataSize) || 0, urls:srcs(v.playAddr)}
                }));
            } catch (error) { return {error:error.message || String(error)}; }
        },
        kuaishou: function(id) {
            try {
                let info = null, author = '';
                for (const element of [...document.querySelectorAll('video'), ...document.querySelectorAll('[class*=player],[class*=video]')]) {
                    for (let host = element, i = 0; host && i < 30 && !info; i++, host = host.parentElement) {
                        const component = host.__vueParentComponent;
                        for (let c = component, n = 0; c && n < 20; c = c.parent, n++) {
                            const props = c.props || {};
                            if (!author) author = props.author?.name || props.authorInfo?.name || props.photo?.author?.name || '';
                            if (props.videoInfo?.photoUrl && (!id || props.videoInfo.id === id)) { info = props.videoInfo; break; }
                        }
                    }
                    if (info) break;
                }
                if (!info) return {error:'没有读到视频，请先播放一下再试'};
                const reps = info.manifest?.adaptationSet?.[0]?.representation || [];
                return JSON.parse(JSON.stringify({
                    title: info.caption || document.title.replace(/-快手$/, ''), artist: author, duration: Number(info.duration) / 1000, cover: info.coverUrl || '',
                    formats: reps.map(rep => ({width:rep.width, height:rep.height, h265:false, bytes:Number(rep.fileSize) || 0, urls:[rep.url, ...(rep.backupUrl || [])].filter(Boolean)})),
                    fallback: {width:0, height:0, bytes:0, urls:[info.photoUrl].filter(Boolean)}
                }));
            } catch (error) { return {error:error.message || String(error)}; }
        },
        xiaohongshu: function(id) {
            try {
                const raw = value => (value && typeof value === 'object' && '_value' in value && Object.keys(value).length < 8 ? value._value : value);
                const map = raw(raw(raw(window.__INITIAL_STATE__)?.note)?.noteDetailMap);
                const note = raw(raw(map?.[id])?.note);
                if (!note) return {error:'没有读到这条笔记，请刷新网页后重试'};
                const stream = raw(note.video)?.media?.stream || {};
                const h264 = stream.h264 || [];
                if (!h264.length && !(stream.h265 || []).length) return {error:'这条笔记没有视频'};
                return JSON.parse(JSON.stringify({
                    title: note.title || note.desc || '', artist: note.user?.nickname || note.user?.nickName || '',
                    duration: Number(h264[0]?.duration || note.video?.capa?.duration * 1000 || 0) / 1000,
                    cover: note.imageList?.[0]?.urlDefault || note.imageList?.[0]?.urlPre || '',
                    formats: h264.map(item => ({width:item.width, height:item.height, h265:false, bytes:Number(item.size) || 0, urls:[item.masterUrl, ...(item.backupUrls || [])].filter(Boolean)})),
                    fallback: {width:0, height:0, bytes:0, urls:[]}
                }));
            } catch (error) { return {error:error.message || String(error)}; }
        }
    };
    ShiyingPlatform.pageReaders = pageReaders;

    // Page data -> catalog. One file per quality; the label uses the short side (竖屏 1080×1920 → 1080p).
    ShiyingPlatform.muxedCatalog = function(source, data) {
        const site = source.site, clean = urls => [...new Set((urls || []).map(url => {try {return this.mediaURL(String(url).replace(/^http:/, 'https:'), site);} catch {return null;}}).filter(Boolean))];
        let formats = (data.formats || []).filter(item => !item.h265).map(item => ({...item, urls:clean(item.urls)})).filter(item => item.urls.length && item.height > 0);
        if (!formats.length && data.fallback) {const urls = clean(data.fallback.urls);if (urls.length) formats = [{width:data.fallback.width || 0, height:data.fallback.height || 0, bytes:data.fallback.bytes || 0, urls}];}
        if (!formats.length) throw new Error('没有取得可下载的视频地址，请播放后重新读取');
        const best = new Map();
        for (const item of formats) {const key = item.height || 0, old = best.get(key);if (!old || item.bytes > old.bytes) best.set(key, item);}
        const video = [...best.values()].sort((a, b) => (b.height - a.height) || (b.bytes - a.bytes)).map(item => ({height:item.height, width:item.width, url:item.urls[0], backups:item.urls.slice(1, 4), bytes:item.bytes, codec:'avc1'}));
        const label = item => (item.height ? Math.min(item.width || item.height, item.height) + 'p' : '原画');
        const duration = Number(data.duration);
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('没读到完整视频时长，请重新读取');
        return {...source, siteName:sites[site].name, muxed:true, title:String(data.title || sites[site].name + '视频').replace(/\s+/g, ' ').trim().slice(0, 300), artist:String(data.artist || '').slice(0, 100), cover:/^https:\/\//.test(String(data.cover || '').replace(/^http:/, 'https:')) ? String(data.cover).replace(/^http:/, 'https:') : '', duration, video, audio:[video[video.length - 1]], choices:video.map(item => ({height:item.height, label:label(item)})), subtitles:[]};
    };
    for (const site of Object.keys(sites)) {
        ShiyingPlatform.readers[site] = async (source, tab) => {
            const [result] = await chrome.scripting.executeScript({target:{tabId:tab.id}, world:'MAIN', func:pageReaders[site], args:[source.id || '']});
            if (!result?.result || result.result.error) throw new Error(result?.result?.error || '没有读到视频，请先播放一下再试');
            return ShiyingPlatform.muxedCatalog(source, result.result);
        };
    }
})();
