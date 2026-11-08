// Ruxget，2026-11-08，按功能说明书 06-页面播放器探测 从零编写。
// Page-world half of 页面播放器探测 (runs in the page's MAIN world at document_start, before the page's own scripts).
// 1. Looks at the text the page receives through fetch and XMLHttpRequest (and text blobs it turns into blob:
//    addresses): HLS playlists, DASH manifests, and playlist addresses inside JSON are reported.
// 2. Keeps a copy of every piece of media the page's player appends to a MediaSource SourceBuffer, one track per
//    SourceBuffer, and saves the tracks as files on request (Blob + a download link, inside the page).
// The player itself is never changed: every wrapped call returns and throws exactly what the original does.
// Until js/ruxget-probe-relay.js says this tab has the probe on, findings wait; if it is off, they are dropped.
(() => {
    'use strict';
    const FLAG = Symbol.for('ruxget.pageProbe');
    if (window[FLAG]) return;
    try { Object.defineProperty(window, FLAG, {value: true}); } catch { return; }

    // ---------- the page's own functions, taken before the page can replace them ----------
    const UP = 'ruxget-probe-up', DOWN = 'ruxget-probe-down';
    const doc = document;
    const dispatch = EventTarget.prototype.dispatchEvent, listen = EventTarget.prototype.addEventListener;
    const Custom = CustomEvent, stringify = JSON.stringify, parse = JSON.parse;
    const later = setTimeout.bind(window), clock = Date.now;
    const NativeBlob = Blob, NativeURL = URL, Decoder = TextDecoder;
    const makeURL = URL.createObjectURL, dropURL = URL.revokeObjectURL;
    const TEXT_LIMIT = 2 * 1024 * 1024;              // only the first 2 MB of a text answer are read
    const TRACK_LIMIT = 2 * 1024 * 1024 * 1024;      // at most 2 GB recorded per track
    const PACK = 16 * 1024 * 1024;                   // pieces are packed into a Blob every 16 MB

    let on = null;                                   // null: not known yet
    const waiting = [];
    function post(data) {
        if (on === false) return;
        if (on === null) { if (waiting.length < 300) waiting.push(data); return; }
        try { dispatch.call(doc, new Custom(UP, {detail: stringify(data)})); } catch { /* nothing to tell */ }
    }
    const active = () => on !== false;

    // ---------- 1. hidden playlists ----------
    const reportedUrls = new Set(), reportedTexts = new Set();
    function hash(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(36) + ':' + text.length;
    }
    const isHttp = url => /^https?:\/\//i.test(url || '');
    function absolute(url) { try { return new NativeURL(String(url), location.href).href; } catch { return ''; } }
    const textish = type => !type || /text|json|mpegurl|dash|xml/i.test(type);
    function kindOfText(text) {
        const head = text.replace(/^﻿/, '').trimStart();
        if (head.startsWith('#EXTM3U')) return 'hls';
        if (text.includes('<MPD')) return 'dash';
        return '';
    }
    function report(kind, url, text) {
        if (isHttp(url)) {
            const clean = url.split('#')[0];
            if (reportedUrls.has(clean)) return;
            reportedUrls.add(clean);
            post({type: 'playlist', kind, url: clean});
            return;
        }
        if (!text) return;
        const key = hash(text);
        if (reportedTexts.has(key)) return;
        reportedTexts.add(key);
        post({type: 'text', kind, text});
    }
    function playlistAddress(value) {
        if (typeof value !== 'string' || value.length > 4096 || !isHttp(value)) return;
        try {
            const path = new NativeURL(value).pathname.toLowerCase();
            if (path.endsWith('.m3u8')) report('hls', value);
            else if (path.endsWith('.mpd')) report('dash', value);
        } catch { /* not an address */ }
    }
    function scanJson(root) {
        const stack = [root];
        let budget = 50000;
        while (stack.length && budget-- > 0) {
            const value = stack.pop();
            if (typeof value === 'string') playlistAddress(value);
            else if (value && typeof value === 'object') {
                try { for (const key of Object.keys(value)) stack.push(value[key]); } catch { /* odd object */ }
            }
        }
    }
    function inspect(text, url, type) {
        if (!active() || typeof text !== 'string' || !text) return;
        if (text.length > TEXT_LIMIT) text = text.slice(0, TEXT_LIMIT);
        const kind = kindOfText(text);
        if (kind) { report(kind, url, text); return; }
        const head = text.trimStart();
        if (/json/i.test(type || '') || head[0] === '{' || head[0] === '[') {
            try { scanJson(parse(text)); } catch { /* not JSON, or cut at 2 MB */ }
        }
    }
    async function readStart(stream) {
        const reader = stream.getReader(), parts = [];
        let size = 0;
        try {
            while (size < TEXT_LIMIT) {
                const {done, value} = await reader.read();
                if (done) break;
                parts.push(value); size += value.byteLength;
            }
        } finally { reader.cancel().catch(() => {}); }
        const bytes = new Uint8Array(Math.min(size, TEXT_LIMIT));
        let at = 0;
        for (const part of parts) { const n = Math.min(part.byteLength, bytes.length - at); bytes.set(part.subarray(0, n), at); at += n; if (at >= bytes.length) break; }
        return new Decoder('utf-8').decode(bytes);
    }

    // fetch
    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
        const wrapped = function fetch(input, init) {
            const promise = nativeFetch.apply(this, arguments);
            if (active()) {
                promise.then(response => {
                    try {
                        if (!active() || !response || response.type === 'opaque' || !response.body) return;
                        const type = response.headers.get('content-type') || '';
                        if (!textish(type)) return;
                        const url = response.url || absolute(typeof input === 'string' ? input : input && input.url);
                        readStart(response.clone().body).then(text => inspect(text, url, type), () => {});
                    } catch { /* the page's response is untouched */ }
                }, () => {});
            }
            return promise;
        };
        try { window.fetch = wrapped; } catch { /* read-only: leave it */ }
    }

    // XMLHttpRequest
    const XHR = window.XMLHttpRequest && XMLHttpRequest.prototype;
    if (XHR) {
        const nativeOpen = XHR.open, nativeSend = XHR.send, addresses = new WeakMap();
        XHR.open = function open(method, url) { try { addresses.set(this, absolute(url)); } catch { /* ignore */ } return nativeOpen.apply(this, arguments); };
        function loaded() {
            try {
                if (!active()) return;
                const type = this.getResponseHeader('content-type') || '';
                if (!textish(type)) return;
                const url = this.responseURL || addresses.get(this) || '';
                const response = this.response;
                switch (this.responseType) {
                    case '': case 'text': inspect(this.responseText, url, type); break;
                    case 'json': if (response && typeof response === 'object') scanJson(response); break;
                    case 'arraybuffer': if (response) inspect(new Decoder('utf-8').decode(new Uint8Array(response, 0, Math.min(response.byteLength, TEXT_LIMIT))), url, type); break;
                    case 'blob': if (response) response.slice(0, TEXT_LIMIT).text().then(text => inspect(text, url, type), () => {}); break;
                }
            } catch { /* the page's request is untouched */ }
        }
        XHR.send = function send() { if (active()) { try { listen.call(this, 'load', loaded); } catch { /* ignore */ } } return nativeSend.apply(this, arguments); };
    }

    // Text the page turns into a blob: address itself (a playlist with no address of its own).
    if (typeof makeURL === 'function') {
        URL.createObjectURL = function createObjectURL(object) {
            const made = makeURL.apply(this, arguments);
            try {
                if (active() && object instanceof NativeBlob && object.size > 0 && object.size <= TEXT_LIMIT && textish(object.type)) {
                    object.text().then(text => inspect(text, made, object.type), () => {});
                }
            } catch { /* ignore */ }
            return made;
        };
    }

    // ---------- 2. what the player appends ----------
    const tracks = [], trackOf = new WeakMap();
    let reportTimer = 0, reportedAt = 0;
    function newTrack(type) {
        const track = {type: String(type || ''), pieces: [], packed: [], loose: 0, size: 0, full: false};
        tracks.push(track);
        return track;
    }
    function sendSizes() {
        reportTimer = 0; reportedAt = clock();
        if (tracks.length) post({type: 'cache', tracks: tracks.map(t => ({type: t.type, size: t.size, full: t.full}))});
    }
    // At most once a second.
    function sizesChanged() {
        if (reportTimer || on === false) return;
        const wait = Math.max(0, 1000 - (clock() - reportedAt));
        reportTimer = later(sendSizes, wait);
    }
    function record(buffer, bytes) {
        let track = trackOf.get(buffer);
        if (!track) { track = newTrack(safeType(buffer)); trackOf.set(buffer, track); }
        if (track.full) return;
        if (track.size + bytes.byteLength > TRACK_LIMIT) { track.full = true; sizesChanged(); return; }
        track.pieces.push(bytes); track.loose += bytes.byteLength; track.size += bytes.byteLength;
        if (track.loose >= PACK) { track.packed.push(new NativeBlob(track.pieces)); track.pieces = []; track.loose = 0; }
        sizesChanged();
    }
    function safeType(buffer) { try { return buffer.__ruxgetType || ''; } catch { return ''; } }
    function copyOf(data) {
        try {
            if (data instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer)) return new Uint8Array(data).slice();
            if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
        } catch { /* detached or odd: not recorded */ }
        return null;
    }
    const Source = window.MediaSource && MediaSource.prototype;
    if (Source && typeof Source.addSourceBuffer === 'function') {
        const add = Source.addSourceBuffer;
        Source.addSourceBuffer = function addSourceBuffer(type) {
            const buffer = add.apply(this, arguments);
            try { if (active() && buffer) trackOf.set(buffer, newTrack(type)); } catch { /* ignore */ }
            return buffer;
        };
    }
    const Buffer = window.SourceBuffer && SourceBuffer.prototype;
    if (Buffer) {
        const wrapAppend = name => {
            const original = Buffer[name];
            if (typeof original !== 'function') return;
            Buffer[name] = function (data) {
                const copy = active() ? copyOf(data) : null;
                const result = original.apply(this, arguments);   // throws as before; then nothing is recorded
                if (copy && copy.byteLength) { try { record(this, copy); } catch { /* ignore */ } }
                return result;
            };
        };
        wrapAppend('appendBuffer');
        wrapAppend('appendBufferAsync');
        // A new type on the same SourceBuffer starts a new track (it would not play as one file).
        const change = Buffer.changeType;
        if (typeof change === 'function') {
            Buffer.changeType = function changeType(type) {
                const result = change.apply(this, arguments);
                try { if (active()) trackOf.set(this, newTrack(type)); } catch { /* ignore */ }
                return result;
            };
        }
    }

    // ---------- saving ----------
    function cleanName(name, ext) {
        let base = String(name || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
        if (!base) base = 'Ruxget';
        if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = '_' + base;
        if (base.length > 150) base = base.slice(0, 150).replace(/[. ]+$/g, '');
        return base + '.' + ext;
    }
    const AUDIO_CODECS = /^(mp4a|opus|vorbis|flac|ac-3|ec-3|mp3|alac|dtsc|dtse|dtsh|dtsl|ac-4|mhm1|mha1|ulaw|alaw|pcm)/i;
    function isAudio(type) {
        const lower = String(type).toLowerCase();
        if (lower.startsWith('audio/')) return true;
        const codecs = /codecs\s*=\s*"?([^";]+)"?/i.exec(lower);
        if (!codecs) return false;
        const list = codecs[1].split(',').map(s => s.trim()).filter(Boolean);
        return list.length > 0 && list.every(c => AUDIO_CODECS.test(c));
    }
    function extension(type, audio) {
        const base = String(type).split(';')[0].trim().toLowerCase();
        if (/webm/.test(base)) return 'webm';
        if (/mp4|iso|m4/.test(base)) return audio ? 'm4a' : 'mp4';
        if (/mp2t/.test(base)) return 'ts';
        if (base === 'audio/mpeg') return 'mp3';
        if (base === 'audio/aac') return 'aac';
        return audio ? 'm4a' : 'mp4';
    }
    function saveAll(title, labels) {
        const used = new Map();
        let delay = 0;
        for (const track of tracks) {
            if (!track.size) continue;
            const audio = isAudio(track.type);
            const label = (audio ? labels.audio : labels.video) || (audio ? '声音' : '画面');
            const count = (used.get(label) || 0) + 1;
            used.set(label, count);
            const name = cleanName(`${title || doc.title || location.hostname}-${label}${count > 1 ? '-' + count : ''}`, extension(track.type, audio));
            const blob = new NativeBlob([...track.packed, ...track.pieces], {type: String(track.type).split(';')[0].trim() || 'application/octet-stream'});
            // One after another, so Chrome sees separate downloads.
            later(() => {
                const link = doc.createElement('a'), address = makeURL.call(NativeURL, blob);
                link.href = address; link.download = name; link.rel = 'noopener'; link.style.display = 'none';
                (doc.body || doc.documentElement).appendChild(link);
                link.click();
                link.remove();
                later(() => dropURL.call(NativeURL, address), 120000);
            }, delay);
            delay += 400;
        }
    }
    function clearAll() {
        for (const track of tracks) { track.pieces = []; track.packed = []; track.loose = 0; track.size = 0; track.full = false; }
        sizesChanged();
    }
    function release() {
        tracks.length = 0; waiting.length = 0;
        reportedUrls.clear(); reportedTexts.clear();
    }

    listen.call(doc, DOWN, event => {
        let data;
        try { data = parse(event.detail); } catch { return; }
        if (!data || typeof data !== 'object') return;
        if (data.type === 'state') {
            const was = on;
            on = data.on === true;
            if (!on) { release(); return; }
            if (was !== true) { const queued = waiting.splice(0); for (const item of queued) post(item); if (tracks.length) sizesChanged(); }
        } else if (data.type === 'save' && on) saveAll(String(data.title || ''), data.labels || {});
        else if (data.type === 'clear' && on) clearAll();
    });
    try { dispatch.call(doc, new Custom(UP, {detail: stringify({type: 'ready'})})); } catch { /* the relay asks on its own */ }
})();
