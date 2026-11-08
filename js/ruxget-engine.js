// Ruxget，2026-11-08，按功能说明书 05-识别引擎 从零编写。
// Media recognition engine for the background service worker (classic script, loaded with importScripts).
// Watches requests on authorised sites, keeps a per-tab list of media in chrome.storage.session (MediaData),
// answers the panel's messages and shows the per-tab count on the toolbar badge.
const RuxgetEngine = (() => {
    'use strict';

    // ---------- defaults ----------
    const EXT_ON = ['flv', 'hlv', 'f4v', 'mp4', 'mp3', 'wma', 'wav', 'm4a', 'webm', 'ogg', 'ogv', 'acc', 'aac', 'mov',
        'mkv', 'm4s', 'm3u8', 'm3u', 'mpeg', 'avi', 'wmv', 'asf', 'movie', 'divx', 'mpeg4', 'vid', 'mpd', 'weba', 'opus'];
    const EXT_OFF = ['ts'];
    const TYPE_ON = ['audio/*', 'video/*', 'application/ogg', 'application/vnd.apple.mpegurl', 'application/x-mpegurl',
        'application/mpegurl', 'application/octet-stream-m3u8', 'application/dash+xml', 'application/m4s'];
    const rule = (key, value, state) => ({[key]: value, size: 0, operator: '>=', unit: 'KB', state});
    const defaultExt = () => [...EXT_ON.map(e => rule('ext', e, true)), ...EXT_OFF.map(e => rule('ext', e, false))];
    const defaultType = () => TYPE_ON.map(t => rule('type', t, true));

    const DEDUPE_LIMIT = 500;
    const TAB_LIMIT = 9999;
    const SAVE_DELAY = 1000;
    const KEEP_HEADERS = new Set(['referer', 'origin', 'authorization', 'auth', 'token', 'key', 'access-token', 'api-key',
        'app-token', 'authtoken', 'session-id']);
    const UNITS = {B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024};
    const REFUSED = {ok: false, error: '请先允许此网站和媒体来源'};

    // ---------- state ----------
    const settings = {enable: true, extRules: new Map(), typeRules: [], block: [], blockWhite: false};
    let media = {};                 // tabId -> [item]
    const seen = new Map();         // tabId -> Set(url), first DEDUPE_LIMIT distinct addresses
    const pendingHeaders = new Map(); // requestId -> requestHeaders array (from onSendHeaders)
    let ready = false;
    let resetRequested = false;
    let saveTimer = null;

    // ---------- settings ----------
    function applyExt(list) {
        const map = new Map();
        for (const r of Array.isArray(list) ? list : defaultExt()) {
            if (r && typeof r.ext === 'string') map.set(r.ext.trim().toLowerCase().replace(/^\./, ''), r);
        }
        settings.extRules = map;
    }
    function applyType(list) {
        settings.typeRules = (Array.isArray(list) ? list : defaultType())
            .filter(r => r && typeof r.type === 'string')
            .map(r => ({...r, pattern: globToRegExp(r.type.trim().toLowerCase())}));
    }
    function applyBlock(list) {
        settings.block = (Array.isArray(list) ? list : [])
            .filter(r => r && r.state !== false && typeof r.url === 'string' && r.url.trim())
            .map(r => globToRegExp(r.url.trim()));
    }
    function globToRegExp(text) {
        return new RegExp('^' + text.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
    }

    // ---------- helpers ----------
    function isInternal(url) {
        if (!url) return true;
        if (/^(chrome|chrome-extension|chrome-untrusted|edge|extension|about|devtools|view-source|moz-extension|brave|opera|vivaldi):/i.test(url)) return true;
        try {
            const u = new URL(url);
            if (!/^https?:$/.test(u.protocol)) return true;
            if (u.hostname === 'chromewebstore.google.com') return true;
            if (u.hostname === 'chrome.google.com' && /^\/webstore(\/|$)/.test(u.pathname)) return true;
        } catch { return true; }
        return false;
    }
    const allowed = url => {
        try { return !isInternal(url) && ShiyingAccess.allows(url) === true; } catch { return false; }
    };
    function blocked(tabUrl) {
        const hit = settings.block.some(re => re.test(tabUrl));
        return settings.blockWhite ? !hit : hit;
    }
    function lastSegment(url) {
        try {
            const segment = new URL(url).pathname.split('/').pop() || '';
            try { return decodeURIComponent(segment); } catch { return segment; }
        } catch { return ''; }
    }
    function extOf(name) {
        const m = /\.([^./\\]+)$/.exec(name || '');
        return m ? m[1].toLowerCase() : '';
    }
    function headerMap(headers) {
        const out = {};
        for (const h of headers || []) if (h && h.name) out[h.name.toLowerCase()] = h.value ?? '';
        return out;
    }
    function dispositionName(value) {
        if (!value) return '';
        let m = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(value);
        if (m) {
            const raw = m[2].trim().replace(/^"|"$/g, '');
            try { return decodeURIComponent(raw); } catch { return raw; }
        }
        m = /filename\s*=\s*("((?:[^"\\]|\\.)*)"|[^;]+)/i.exec(value);
        if (!m) return '';
        let name = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[1].trim();
        try { if (/%[0-9a-f]{2}/i.test(name)) name = decodeURIComponent(name); } catch { /* keep as sent */ }
        return name.split(/[\\/]/).pop().trim();
    }
    // Evaluates one rule: 'record', 'skip'. Size conditions apply only when the size is known.
    function judge(r, size) {
        if (!r.state) return 'skip';
        const limit = Number(r.size) || 0;
        if (!limit || !Number.isFinite(size)) return 'record';
        const bytes = limit * (UNITS[String(r.unit || 'B').toUpperCase()] || 1);
        switch (r.operator) {
            case '=': return size === bytes ? 'record' : 'skip';
            case '>': return size > bytes ? 'record' : 'skip';
            case '<': return size < bytes ? 'record' : 'skip';
            case '<=': return size <= bytes ? 'record' : 'skip';
            default: return size >= bytes ? 'record' : 'skip';
        }
    }
    function filterHeaders(source) {
        const kept = {};
        let cookie;
        let any = false;
        for (const [rawName, value] of Object.entries(source || {})) {
            const name = rawName.toLowerCase();
            if (name === 'cookie') { cookie = value; continue; }
            if (KEEP_HEADERS.has(name) || (name.startsWith('x-') && /auth|token|sign|key|ticket|session/.test(name))) {
                kept[name] = value;
                any = true;
            }
        }
        return {requestHeaders: any ? kept : false, cookie};
    }
    async function tabInfo(tabId) {
        try { return await chrome.tabs.get(tabId); } catch { return null; }
    }

    // ---------- list storage ----------
    function scheduleSave() {
        if (saveTimer) return;
        saveTimer = setTimeout(() => {
            saveTimer = null;
            chrome.storage.session.set({MediaData: media}).catch(console.error);
        }, SAVE_DELAY);
    }
    function rebuildSeen(tabId) {
        const set = new Set();
        for (const item of media[tabId] || []) {
            if (set.size >= DEDUPE_LIMIT) break;
            set.add(item.url);
        }
        seen.set(String(tabId), set);
    }
    function dropTab(tabId, remove) {
        if (remove) delete media[tabId]; else if (media[tabId]) media[tabId] = [];
        seen.delete(String(tabId));
        scheduleSave();
    }
    function addItem(item) {
        const key = String(item.tabId);
        let set = seen.get(key);
        if (!set) { set = new Set(); seen.set(key, set); }
        if (set.has(item.url)) return false;
        let list = media[key];
        if (!Array.isArray(list)) list = media[key] = [];
        if (list.length >= TAB_LIMIT) { list = media[key] = []; set.clear(); }
        if (set.size < DEDUPE_LIMIT) set.add(item.url);
        list.push(item);
        scheduleSave();
        updateBadge(item.tabId);
        chrome.runtime.sendMessage({Message: 'popupAddData', data: item}).catch(() => {});
        return true;
    }

    // ---------- badge and icon ----------
    function desktopText() {
        const tasks = globalThis.RuxgetDesktopTasks;
        const text = tasks && tasks.badgeText;
        return text ? String(text) : '';
    }
    function updateBadge(tabId) {
        if (typeof tabId !== 'number' || tabId < 0) return;
        const count = (media[tabId] || []).length;
        const text = desktopText() || (count ? String(count) : '');
        chrome.action.setBadgeText({tabId, text}).catch(() => {});
    }
    async function refreshBadges() {
        try { for (const tab of await chrome.tabs.query({})) updateBadge(tab.id); } catch { /* ignore */ }
    }
    function updateIcon() {
        const path = settings.enable ? {16: '/img/icon16.png', 32: '/img/icon32.png'} : {16: '/img/icon-disable.png', 32: '/img/icon-disable.png'};
        chrome.action.setIcon({path}).catch(() => {});
    }
    async function activeTabId() {
        try {
            const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
            if (tab) return tab.id;
            const [any] = await chrome.tabs.query({active: true});
            return any ? any.id : undefined;
        } catch { return undefined; }
    }

    // ---------- init ----------
    const init = (async () => {
        const [sync, session] = await Promise.all([
            chrome.storage.sync.get(['enable', 'Ext', 'Type', 'blockUrl', 'blockUrlWhite']).catch(() => ({})),
            chrome.storage.session.get('MediaData').catch(() => ({})),
        ]);
        settings.enable = sync.enable !== false;
        applyExt(sync.Ext);
        applyType(sync.Type);
        applyBlock(sync.blockUrl);
        settings.blockWhite = sync.blockUrlWhite === true;
        const stored = session.MediaData;
        if (!resetRequested && stored && typeof stored === 'object') {
            // Keep anything recorded while the stored list was being read.
            for (const [tabId, list] of Object.entries(stored)) {
                if (!Array.isArray(list)) continue;
                const fresh = media[tabId] || [];
                const urls = new Set(list.map(i => i.url));
                media[tabId] = list.concat(fresh.filter(i => !urls.has(i.url)));
            }
        }
        for (const tabId of Object.keys(media)) rebuildSeen(tabId);
        ready = true;
        updateIcon();
        refreshBadges();
    })().catch(error => { console.error(error); ready = true; });

    chrome.runtime.onInstalled.addListener(details => {
        if (details.reason !== 'install' && details.reason !== 'update') return;
        resetRequested = true;
        media = {};
        seen.clear();
        chrome.storage.session.remove('MediaData').catch(() => {});
        refreshBadges();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        if ('enable' in changes) { settings.enable = changes.enable.newValue !== false; updateIcon(); }
        if ('Ext' in changes) applyExt(changes.Ext.newValue);
        if ('Type' in changes) applyType(changes.Type.newValue);
        if ('blockUrl' in changes) applyBlock(changes.blockUrl.newValue);
        if ('blockUrlWhite' in changes) settings.blockWhite = changes.blockUrlWhite.newValue === true;
    });

    // ---------- network observation ----------
    const FILTER = {urls: ['<all_urls>']};
    chrome.webRequest.onSendHeaders.addListener(details => {
        if (details.tabId < 0 || details.method === 'OPTIONS') return;
        pendingHeaders.set(details.requestId, details.requestHeaders || []);
        if (pendingHeaders.size > 2000) pendingHeaders.delete(pendingHeaders.keys().next().value);
    }, FILTER, ['requestHeaders', 'extraHeaders']);
    const forget = details => pendingHeaders.delete(details.requestId);
    chrome.webRequest.onCompleted.addListener(forget, FILTER);
    chrome.webRequest.onErrorOccurred.addListener(forget, FILTER);

    chrome.webRequest.onHeadersReceived.addListener(details => {
        if (details.tabId < 0 || details.method === 'OPTIONS') return;
        if (details.statusCode >= 300 && details.statusCode < 400) return; // the redirected request is judged instead
        const sent = pendingHeaders.get(details.requestId) || [];
        handleResponse(details, sent).catch(console.error);
    }, FILTER, ['responseHeaders']);

    function classify(details, response) {
        const size = 'content-length' in response && /^\d+$/.test(String(response['content-length']).trim())
            ? Number(response['content-length']) : undefined;
        const contentType = String(response['content-type'] || '').split(';')[0].trim().toLowerCase();
        const name = lastSegment(details.url);
        // 1. extension of the address
        const ext = extOf(name);
        if (ext && settings.extRules.has(ext)) {
            return judge(settings.extRules.get(ext), size) === 'record' ? {name, ext, contentType, size} : null;
        }
        // 2. Content-Type
        if (contentType) {
            const r = settings.typeRules.find(t => t.pattern.test(contentType));
            if (r) return judge(r, size) === 'record' ? {name, ext, contentType, size} : null;
        }
        // 3. Content-Disposition file name
        const fileName = dispositionName(response['content-disposition']);
        if (fileName) {
            const fileExt = extOf(fileName);
            if (fileExt && settings.extRules.has(fileExt)) {
                return judge(settings.extRules.get(fileExt), size) === 'record'
                    ? {name: fileName, ext: fileExt, contentType, size} : null;
            }
        }
        // 4. Chrome's own media requests
        if (details.type === 'media') return {name: fileName || name, ext: fileName ? extOf(fileName) : ext, contentType, size};
        return null;
    }

    async function handleResponse(details, sentHeaders) {
        await init;
        if (!settings.enable) return;
        if (isInternal(details.url) || !allowed(details.url)) return;
        if (details.initiator && /^https?:/i.test(details.initiator) && !allowed(details.initiator)) return;
        const response = headerMap(details.responseHeaders);
        const found = classify(details, response);
        if (!found) return;
        const tab = await tabInfo(details.tabId);
        if (!tab) return;
        const tabUrl = tab.url || tab.pendingUrl || '';
        if (!allowed(tabUrl) || blocked(tabUrl) || !settings.enable) return;
        const request = headerMap(sentHeaders);
        const {requestHeaders, cookie} = filterHeaders(request);
        const contentType = found.contentType;
        const item = {
            url: details.url,
            name: found.name,
            ext: found.ext || (contentType.includes('/') ? contentType.split('/').pop() : ''),
            type: contentType,
            tabId: details.tabId,
            requestId: details.requestId,
            initiator: details.initiator || request.referer || tabUrl,
            requestHeaders,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            webUrl: tabUrl,
            getTime: Date.now(),
        };
        if (found.size !== undefined) item.size = found.size;
        if (cookie !== undefined) item.cookie = cookie;
        addItem(item);
    }

    // ---------- tab lifecycle ----------
    chrome.webNavigation.onCommitted.addListener(async details => {
        if (details.frameId !== 0 || details.tabId < 0 || details.transitionType === 'form_submit') return;
        await init;
        // Keep the document itself when the page is a media file opened directly.
        const kept = (media[details.tabId] || []).filter(i => i.url === details.url);
        dropTab(details.tabId, false);
        if (kept.length) { media[details.tabId] = kept; rebuildSeen(details.tabId); }
        else delete media[details.tabId];
        updateBadge(details.tabId);
    });
    chrome.tabs.onRemoved.addListener(async tabId => {
        await init;
        dropTab(tabId, true);
    });
    chrome.tabs.onActivated.addListener(info => { init.then(() => updateBadge(info.tabId)); });

    chrome.permissions.onRemoved.addListener(async () => {
        await init;
        try { await ShiyingAccess.sync(); } catch (error) { console.error(error); }
        let changed = false;
        for (const [tabId, list] of Object.entries(media)) {
            if (!Array.isArray(list)) continue;
            const keep = list.filter(i => allowed(i.webUrl) && allowed(i.url));
            if (keep.length !== list.length) {
                media[tabId] = keep;
                rebuildSeen(tabId);
                updateBadge(Number(tabId));
                changed = true;
            }
        }
        if (changed) scheduleSave();
        chrome.runtime.sendMessage({Message: 'shiyingAccessRevoked'}).catch(() => {});
    });

    // ---------- messages ----------
    const HANDLED = new Set(['getData', 'getAllData', 'addMedia', 'clearData', 'ClearIcon', 'enable']);

    async function addFromPage(message) {
        const href = message.href, url = message.url;
        if (!href || !url || !allowed(href) || !allowed(url)) return REFUSED;
        let tab = null;
        try { tab = (await chrome.tabs.query({})).find(t => t.url === href) || null; } catch { /* ignore */ }
        if (!tab) {
            const id = await activeTabId();
            if (id !== undefined) tab = await tabInfo(id);
        }
        if (!tab) return REFUSED;
        let source = message.requestHeaders;
        if (Array.isArray(source)) source = headerMap(source);
        const {requestHeaders, cookie} = filterHeaders(source && typeof source === 'object' ? source : {});
        const mime = typeof message.mime === 'string' ? message.mime : '';
        const name = lastSegment(url);
        const extra = typeof message.extraExt === 'string' ? message.extraExt.trim().replace(/^\./, '').toLowerCase() : '';
        const type = mime.split(';')[0].trim().toLowerCase();
        const item = {
            url,
            name,
            ext: extra || extOf(name) || (type.includes('/') ? type.split('/').pop() : ''),
            type: mime,
            tabId: tab.id,
            requestId: message.requestId ? String(message.requestId) : String(Date.now()),
            initiator: (requestHeaders && requestHeaders.referer) || tab.url || href,
            requestHeaders,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            webUrl: tab.url || href,
            getTime: Date.now(),
        };
        if (cookie !== undefined) item.cookie = cookie;
        addItem(item);
        return 'ok';
    }

    async function handle(message) {
        switch (message.Message) {
            case 'getData': {
                if (message.requestId !== undefined && message.requestId !== null) {
                    const ids = new Set((Array.isArray(message.requestId) ? message.requestId : [message.requestId]).map(String));
                    const found = [];
                    for (const list of Object.values(media)) {
                        if (Array.isArray(list)) for (const item of list) if (ids.has(String(item.requestId))) found.push(item);
                    }
                    return found.length ? found : 'error';
                }
                return media[message.tabId];
            }
            case 'getAllData':
                return media;
            case 'addMedia':
                return addFromPage(message);
            case 'clearData': {
                if (message.type) dropTab(message.tabId, false);
                else for (const tabId of Object.keys(media)) if (String(tabId) !== String(message.tabId)) dropTab(tabId, false);
                refreshBadges();
                return 'OK';
            }
            case 'ClearIcon': {
                const tabId = message.type ? message.tabId : await activeTabId();
                if (typeof tabId === 'number') chrome.action.setBadgeText({tabId, text: ''}).catch(() => {});
                return 'ok';
            }
            case 'enable': {
                settings.enable = !settings.enable;
                updateIcon();
                await chrome.storage.sync.set({enable: settings.enable}).catch(console.error);
                return settings.enable;
            }
        }
        return undefined;
    }

    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!message || typeof message.Message !== 'string') return;
        if (/^(shiying|ruxget)/i.test(message.Message) || !HANDLED.has(message.Message)) return;
        if (!ready) { respond('error'); return; }
        handle(message).then(respond, error => { console.error(error); respond('error'); });
        return true;
    });

    return {refreshBadges, updateBadge};
})();
