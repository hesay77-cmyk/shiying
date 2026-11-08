// Ruxget，2026-11-08，按功能说明书 06-页面播放器探测 从零编写。
// Isolated-world half of 页面播放器探测. It asks the extension whether this tab has the probe on, tells the page-world
// script (js/ruxget-probe-page.js), and passes what that script finds on to the extension: playlist addresses go to
// the recognition engine (addMedia, spec 05 §7), playlist texts and recording sizes to js/ruxget-probe.js.
// The two scripts talk through two DOM events whose detail is a JSON string.
(() => {
    'use strict';
    if (globalThis.__ruxgetProbeRelay) return;
    globalThis.__ruxgetProbeRelay = true;
    const UP = 'ruxget-probe-up', DOWN = 'ruxget-probe-down';
    let on = null, href = '';
    const down = data => document.dispatchEvent(new CustomEvent(DOWN, {detail: JSON.stringify(data)}));
    const send = message => chrome.runtime.sendMessage(message).catch(() => null);

    const hello = send({Message: 'ruxgetProbeHello'}).then(reply => {
        on = !!(reply && reply.on);
        href = (reply && reply.href) || location.href;
        down({type: 'state', on});
    });
    // The tab's address is what the engine files the item under; a page that changed its address asks again.
    async function pageAddress() {
        if (window === window.top && location.href !== href) {
            const reply = await send({Message: 'ruxgetProbeHello'});
            if (reply && reply.href) href = reply.href;
        }
        return href;
    }
    const MIME = {hls: 'application/vnd.apple.mpegurl', dash: 'application/dash+xml'};
    const EXT = {hls: 'm3u8', dash: 'mpd'};

    async function handle(data) {
        await hello;
        if (!on) return;
        const kind = data.kind === 'dash' ? 'dash' : 'hls';
        if (data.type === 'playlist' && /^https?:\/\//i.test(data.url || '')) {
            await send({Message: 'addMedia', href: await pageAddress(), url: data.url, mime: MIME[kind], extraExt: EXT[kind], requestHeaders: {referer: location.href}});
        } else if (data.type === 'text' && typeof data.text === 'string') {
            const kept = await send({Message: 'ruxgetProbeText', text: data.text, kind});
            if (kept && kept.ok) await send({Message: 'addMedia', href: await pageAddress(), url: kept.url, mime: MIME[kind], extraExt: EXT[kind], requestHeaders: {referer: location.href}});
        } else if (data.type === 'cache' && Array.isArray(data.tracks)) {
            await send({Message: 'ruxgetProbeCache', tracks: data.tracks});
        }
    }
    document.addEventListener(UP, event => {
        let data;
        try { data = JSON.parse(event.detail); } catch { return; }
        if (!data || typeof data !== 'object') return;
        if (data.type === 'ready') { hello.then(() => down({type: 'state', on})); return; }
        handle(data).catch(() => {});
    });
    // 保存 and 清空记录 from the panel (through js/ruxget-probe.js).
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (sender.id !== chrome.runtime.id || !message) return;
        if (message.Message === 'ruxgetProbeSave') { down({type: 'save', title: String(message.title || ''), labels: message.labels || {}}); respond({ok: true}); }
        else if (message.Message === 'ruxgetProbeClear') { down({type: 'clear'}); respond({ok: true}); }
    });
})();
