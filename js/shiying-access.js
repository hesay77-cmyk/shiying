// GPL-3.0. Required platform access plus per-site optional access.
const ShiyingAccess = (() => {
    const required = chrome.runtime.getManifest().host_permissions || [];
    let granted = required.slice();
    let registration = Promise.resolve();
    function origin(value) {
        try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) ? `${url.protocol}//${url.hostname}/*` : null;
        } catch { return null; }
    }
    function matches(pattern, value) {
        try {
            const url = new URL(value), rule = pattern.match(/^(https?):\/\/([^/]+)\/\*$/);
            if (!rule || url.protocol !== `${rule[1]}:`) return false;
            const host = rule[2];
            return host.startsWith('*.') ? url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1)) : url.hostname === host;
        } catch { return false; }
    }
    const allows = value => granted.some(pattern => matches(pattern, value));
    const requiredSite = value => required.some(pattern => matches(pattern, value));
    async function sync() {
        granted = (await chrome.permissions.getAll()).origins || [];
        if (typeof document !== 'undefined') return;
        const optional = granted.filter(pattern => !required.includes(pattern) && /^https?:\/\/[^/*]+\/\*$/.test(pattern));
        registration = registration.catch(() => {}).then(async () => {
            const id = 'shiying-authorized-sites';
            const exists = (await chrome.scripting.getRegisteredContentScripts({ids:[id]})).length;
            if (!optional.length) {if (exists) await chrome.scripting.unregisterContentScripts({ids:[id]}); return;}
            const script = {id, matches:optional, js:['js/content-script.js'], runAt:'document_start', allFrames:true, persistAcrossSessions:true};
            if (exists) await chrome.scripting.updateContentScripts([script]);
            else await chrome.scripting.registerContentScripts([script]);
        });
        await registration;
    }
    async function discover(tab) {
        if (!origin(tab.url)) return [];
        try {
            const results = await chrome.scripting.executeScript({target:{tabId:tab.id},func:() => {
                const items = [], seen = new Set();
                const add = (value, type = '') => {
                    try {
                        const url = new URL(value, location.href);
                        if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href)) return;
                        const ext = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
                        if (!type && !/^(mp4|webm|m3u8|m3u|mpd|mp3|m4a|ogg|wav|aac|flac|opus|mov|mkv|flv|avi|mpeg|m4s|ts)$/.test(ext)) return;
                        seen.add(url.href);items.push({url:url.href, ext, type});
                    } catch {}
                };
                document.querySelectorAll('video,audio').forEach(media => {add(media.currentSrc || media.src, media.tagName === 'AUDIO' ? 'audio/*' : 'video/*');media.querySelectorAll('source').forEach(source => add(source.src, source.type));});
                performance.getEntriesByType('resource').forEach(entry => add(entry.name, ['video','audio'].includes(entry.initiatorType) ? `${entry.initiatorType}/*` : ''));
                return items.slice(0,100);
            }});
            return results.flatMap(result => result.result || []);
        } catch {return [];}
    }
    function request(patterns) {
        // Call directly from a click; only concrete origins, never a global grant.
        const origins = [...new Set(patterns.filter(Boolean))];
        if (!origins.length || origins.some(pattern => !/^https?:\/\/[^/*]+\/\*$/.test(pattern))) return Promise.reject(new Error('请使用具体的网站网址授权'));
        return chrome.permissions.request({origins});
    }
    if (typeof document === 'undefined') {
        chrome.permissions.onAdded.addListener(() => sync().catch(console.error));
        chrome.permissions.onRemoved.addListener(event => {granted = granted.filter(pattern => !(event.origins || []).includes(pattern));sync().catch(console.error);});
        chrome.runtime.onMessage.addListener((message, sender, respond) => {
            if (message.Message !== 'shiyingSyncAccess' || sender.id !== chrome.runtime.id) return;
            sync().then(() => respond({ok:true}), error => respond({ok:false,error:error.message}));return true;
        });
        sync().catch(console.error);
    }
    return {origin, matches, allows, requiredSite, sync, discover, request};
})();
if (typeof module !== 'undefined') module.exports = ShiyingAccess;
