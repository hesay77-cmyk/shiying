// 拾影，2026-10-12：新的中文界面辅助函数。GPL-3.0，与 CatCatch 同许可。
const Shiying = (() => {
    function kind(data) {
        const ext = String(data.ext || '').toLowerCase();
        const type = String(data.type || '').toLowerCase();
        if (['m4s', 'ts'].includes(ext)) return 'fragment';
        if (['m3u8', 'm3u'].includes(ext) || /mpegurl/.test(type)) return 'hls';
        if (ext === 'mpd' || type === 'application/dash+xml') return 'dash';
        if (type.startsWith('audio/') || ['mp3','m4a','wav','ogg','aac','flac','opus','weba'].includes(ext)) return 'audio';
        if (type.startsWith('video/') || ['mp4','webm','mov','mkv','flv','avi','wmv','ogv','mpeg'].includes(ext)) return 'video';
        return 'other';
    }
    function validURL(value) {
        try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
    }
    function size(bytes) {
        if (!bytes) return '大小待确认';
        const units = ['B','KB','MB','GB'];
        const power = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
        return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
    }
    function name(data) {
        let result = data.name || data.title || '网页视频';
        try { result = decodeURIComponent(result); } catch { /* 保留原文件名 */ }
        return result;
    }
    function filename(data) {
        let title = String(data.title || data.name || '网页视频').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 110);
        if (!title || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title)) title = `视频_${title}`;
        const ext = /^[a-z0-9]{1,8}$/i.test(data.ext || '') ? data.ext.toLowerCase() : (kind(data) === 'audio' ? 'mp3' : 'mp4');
        return title.toLowerCase().endsWith(`.${ext}`) ? title : `${title}.${ext}`;
    }
    function playlist(text, base) {
        if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('服务器返回的内容不是视频清单');
        const lines = text.split(/\r?\n/).map(line => line.trim());
        const variants = [];
        let attributes = null;
        for (const line of lines) {
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                attributes = Object.fromEntries([...line.slice(18).matchAll(/([\w-]+)=("[^"]*"|[^,]*)/g)].map(m => [m[1], m[2].replace(/^"|"$/g, '')]));
            } else if (attributes && line && !line.startsWith('#')) {
                const url = new URL(line, base).href;
                if (validURL(url)) {
                    const height = attributes.RESOLUTION?.split('x')[1];
                    const rate = Number(attributes['AVERAGE-BANDWIDTH'] || attributes.BANDWIDTH || 0);
                    variants.push({url, label: height ? `${height}p` : (attributes.NAME || `${Math.round(rate / 1000)} kbps`), rate});
                }
                attributes = null;
            }
        }
        return {variants: variants.sort((a,b) => b.rate - a.rate), separateAudio: lines.some(line => /^#EXT-X-MEDIA:.*TYPE=AUDIO/.test(line) && /URI=/.test(line))};
    }
    return {kind, validURL, size, name, filename, playlist};
})();
if (typeof module !== 'undefined') module.exports = Shiying;
