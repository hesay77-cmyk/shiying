// Ruxget，2026-11-08，按功能说明书 06-页面播放器探测 从零编写。
// Background half of 页面播放器探测 (loaded by js/ruxget-background.js with importScripts). It keeps which tabs have
// the probe switched on (one tab, one site, this visit only), registers the two page scripts for those sites only,
// keeps playlist texts a page made by itself (for the HLS/DASH pages' textKey) and the recording sizes the page
// reports, and relays 保存 / 清空记录 from the panel to the page. Everything lives in chrome.storage.session, so a
// service-worker restart keeps it; nothing is sent anywhere.
const RuxgetProbe = (() => {
    'use strict';
    const STATE = 'ruxgetProbe';              // {tabs:{tabId:{host}}, cache:{tabId:{frameId:[track]}}, texts:{tabId:[key]}}
    const TEXT = 'ruxgetProbeText:';          // + key -> {tabId, text, kind}
    const PAGE_ID = 'ruxget-probe-page', RELAY_ID = 'ruxget-probe-relay';
    const PAGE_FILE = 'js/ruxget-probe-page.js', RELAY_FILE = 'js/ruxget-probe-relay.js';
    const TEXTS_PER_TAB = 30, TEXT_LIMIT = 2 * 1024 * 1024;
    let state = {tabs: {}, cache: {}, texts: {}};
    let saveTimer = 0, scripts = Promise.resolve();

    const hostOf = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname : ''; } catch { return ''; } };
    const allowed = url => { try { return !!hostOf(url) && ShiyingAccess.allows(url) === true; } catch { return false; } };
    const isOn = tabId => !!state.tabs[tabId];
    // Ruxget's own pages (the panel may sit in a popup, the side panel or a tab); page scripts report a web address.
    const ownPage = sender => sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL(''));
    const changed = tabId => chrome.runtime.sendMessage({Message: 'ruxgetProbeChanged', tabId: Number(tabId)}).catch(() => {});

    function save() {
        if (saveTimer) return;
        saveTimer = setTimeout(() => { saveTimer = 0; chrome.storage.session.set({[STATE]: state}).catch(() => {}); }, 200);
    }

    // The two page scripts are registered for the sites that have a probe on, and for nothing else.
    function syncScripts() {
        const run = async () => {
            const hosts = [...new Set(Object.values(state.tabs).map(t => t.host).filter(Boolean))];
            const matches = hosts.map(host => `*://${host}/*`);
            const have = (await chrome.scripting.getRegisteredContentScripts({ids: [PAGE_ID, RELAY_ID]})).map(s => s.id);
            if (!matches.length) { if (have.length) await chrome.scripting.unregisterContentScripts({ids: have}); return; }
            const entries = [
                {id: PAGE_ID, js: [PAGE_FILE], matches, runAt: 'document_start', allFrames: true, world: 'MAIN', persistAcrossSessions: false},
                {id: RELAY_ID, js: [RELAY_FILE], matches, runAt: 'document_start', allFrames: true, world: 'ISOLATED', persistAcrossSessions: false},
            ];
            if (have.length === 2) await chrome.scripting.updateContentScripts(entries.map(({id, matches}) => ({id, matches})));
            else { if (have.length) await chrome.scripting.unregisterContentScripts({ids: have}); await chrome.scripting.registerContentScripts(entries); }
        };
        scripts = scripts.catch(() => {}).then(run);
        return scripts.catch(error => console.error(error));
    }

    const ready = chrome.storage.session.get(STATE).then(data => {
        const stored = data[STATE];
        if (stored && typeof stored === 'object') state = {tabs: stored.tabs || {}, cache: stored.cache || {}, texts: stored.texts || {}};
    }).catch(() => {}).then(async () => {
        // Tabs closed while the worker was stopped.
        try {
            const open = new Set((await chrome.tabs.query({})).map(t => String(t.id)));
            for (const id of new Set([...Object.keys(state.tabs), ...Object.keys(state.cache), ...Object.keys(state.texts)])) if (!open.has(id)) forget(id, true);
        } catch { /* keep */ }
        await syncScripts();
    });

    // Drops what the page left behind: recorded sizes and playlist texts; with off also the probe itself.
    function forget(tabId, off) {
        const id = String(tabId);
        delete state.cache[id];
        const keys = state.texts[id] || [];
        delete state.texts[id];
        if (keys.length) chrome.storage.session.remove(keys.map(k => TEXT + k)).catch(() => {});
        if (off) delete state.tabs[id];
        save();
    }

    async function setProbe(tabId, on) {
        const tab = await chrome.tabs.get(tabId);
        if (on) {
            if (!allowed(tab.url)) throw new Error('请先允许此网站');
            state.tabs[tabId] = {host: hostOf(tab.url)};
        } else forget(tabId, true);
        save();
        await syncScripts();
        // Opening and closing both reload the page: the scripts must be there before the page's own run.
        await chrome.tabs.reload(tabId);
        changed(tabId);
        return {on: isOn(tabId)};
    }

    function tracksOf(tabId) {
        const frames = state.cache[tabId] || {};
        return Object.entries(frames).flatMap(([frameId, list]) => (Array.isArray(list) ? list : []).map((t, index) => ({...t, frameId: Number(frameId), index})));
    }

    async function keepText(sender, message) {
        const tabId = String(sender.tab.id);
        const text = String(message.text || '').slice(0, TEXT_LIMIT);
        if (!text) throw new Error('empty');
        const key = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const keys = state.texts[tabId] || (state.texts[tabId] = []);
        if (keys.length >= TEXTS_PER_TAB) chrome.storage.session.remove(TEXT + keys.shift()).catch(() => {});
        keys.push(key);
        save();
        await chrome.storage.session.set({[TEXT + key]: {tabId: Number(tabId), text, kind: message.kind === 'dash' ? 'dash' : 'hls'}});
        // An address the recognition engine accepts (the frame's own page, so relative entries resolve against it).
        let base = sender.url || sender.tab.url;
        try { const u = new URL(base); u.hash = ''; base = u.href; } catch { base = sender.tab.url; }
        return {key, url: base + '#ruxget-text:' + key};
    }


    async function handle(message, sender) {
        await ready;
        const tab = ownPage(sender) ? null : sender.tab;
        switch (message.Message) {
            // From the page scripts.
            case 'ruxgetProbeHello':
                if (!tab) return {on: false};
                return {on: isOn(tab.id) && allowed(sender.url || tab.url), href: tab.url, title: tab.title || ''};
            case 'ruxgetProbeText':
                if (!tab || !isOn(tab.id)) return {ok: false};
                return {ok: true, ...(await keepText(sender, message))};
            case 'ruxgetProbeCache': {
                if (!tab || !isOn(tab.id)) return {ok: false};
                const frames = state.cache[tab.id] || (state.cache[tab.id] = {});
                const list = (Array.isArray(message.tracks) ? message.tracks : []).slice(0, 32).map(t => ({type: String(t.type || '').slice(0, 200), size: Math.max(0, Number(t.size) || 0), full: t.full === true}));
                frames[sender.frameId || 0] = list;
                save();
                changed(tab.id);
                return {ok: true};
            }
            // From the panel.
            case 'ruxgetProbeState': {
                if (!ownPage(sender)) return undefined;
                return {on: isOn(message.tabId), tracks: isOn(message.tabId) ? tracksOf(message.tabId) : []};
            }
            case 'ruxgetProbeSet':
                if (!ownPage(sender)) return undefined;
                return setProbe(Number(message.tabId), message.on === true);
            case 'ruxgetProbeSave':
            case 'ruxgetProbeClear': {
                if (!ownPage(sender)) return undefined;
                const tabId = Number(message.tabId);
                if (!isOn(tabId)) throw new Error('页面播放器探测已关闭');
                if (message.Message === 'ruxgetProbeClear') {
                    for (const list of Object.values(state.cache[tabId] || {})) for (const t of list) { t.size = 0; t.full = false; }
                    save();
                    changed(tabId);
                }
                const info = await chrome.tabs.get(tabId);
                await chrome.tabs.sendMessage(tabId, {Message: message.Message, title: info.title || '', labels: message.labels || {}});
                return {ok: true};
            }
            // From the HLS and DASH pages (spec 06 §6).
            case 'ruxgetPageText': {
                if (!ownPage(sender)) return undefined;
                const key = String(message.key || '');
                const entry = /^[0-9a-f]{16}$/.test(key) ? (await chrome.storage.session.get(TEXT + key))[TEXT + key] : null;
                return entry ? {ok: true, text: entry.text, kind: entry.kind} : {ok: false};
            }
        }
        return undefined;
    }
    const NAMES = new Set(['ruxgetProbeHello', 'ruxgetProbeText', 'ruxgetProbeCache', 'ruxgetProbeState', 'ruxgetProbeSet', 'ruxgetProbeSave', 'ruxgetProbeClear', 'ruxgetPageText']);
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!message || !NAMES.has(message.Message) || sender.id !== chrome.runtime.id) return;
        handle(message, sender).then(respond, error => respond({ok: false, error: error?.message || String(error)}));
        return true;
    });

    // This visit only: another site in the main frame switches it off; any new document drops what the old one left.
    chrome.webNavigation.onCommitted.addListener(async details => {
        await ready;
        const id = String(details.tabId);
        if (!isOn(id)) return;
        if (details.frameId === 0) {
            const host = hostOf(details.url);
            if (host !== state.tabs[id].host) { forget(id, true); await syncScripts(); }
            else forget(id, false);
            changed(id);
            return;
        }
        // A player frame from another allowed site: the registered scripts don't cover it, so it is injected now.
        if (!allowed(details.url) || hostOf(details.url) === state.tabs[id].host) return;
        const target = {tabId: details.tabId, frameIds: [details.frameId]};
        chrome.scripting.executeScript({target, files: [PAGE_FILE], world: 'MAIN', injectImmediately: true}).catch(() => {});
        chrome.scripting.executeScript({target, files: [RELAY_FILE], injectImmediately: true}).catch(() => {});
    });
    chrome.tabs.onRemoved.addListener(async tabId => {
        await ready;
        const was = isOn(tabId);
        forget(tabId, true);
        if (was) await syncScripts();
    });
    // A frame that goes away takes its recording with it.
    chrome.webNavigation.onBeforeNavigate?.addListener?.(details => {
        if (details.frameId === 0) return;
        const frames = state.cache[details.tabId];
        if (frames && frames[details.frameId]) { delete frames[details.frameId]; save(); changed(details.tabId); }
    });

    return {isOn, ready};
})();
