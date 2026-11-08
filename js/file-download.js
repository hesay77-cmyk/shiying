// Ruxget，2026-11-08，按功能说明书 01-文件下载页 从零编写。
'use strict';

(() => {
    const BIG_LIMIT = 2 * 1024 * 1024 * 1024;
    const NET_RETRY_DELAYS = [500, 1000, 1500];
    const PAINT_INTERVAL = 100;
    const CLOSE_DELAY = 1000;
    const MAX_NAME = 180;

    // ---- Texts -------------------------------------------------------------------------------------------------
    const TEXT = {
        zh: {
            pageName: 'Ruxget · 文件下载',
            keepOpen: '请保持这个页面打开，下载进度会显示在这里。',
            badTask: '下载信息不完整，请回到原网页重新点击下载。',
            urlLabel: '文件地址',
            refererLabel: '来源网页（可选）',
            refererPlaceholder: '部分网站需要填写播放这个文件的网页地址',
            urlHint: '请输入以 http 或 https 开头的地址',
            download: '下载',
            stop: '停止下载',
            restart: '重新下载',
            force: '仍在浏览器中下载',
            openFolder: '打开下载目录',
            defaultName: '下载文件',
            received: a => `已下载 ${a}`,
            receivedOf: (a, b) => `已下载 ${a} / ${b}`,
            starting: '正在连接原站',
            retrying: (n, m) => `连接中断，正在重试（第 ${n} 次，共 ${m} 次）`,
            saving: '正在保存',
            done: '下载完成',
            failedTitle: '下载失败',
            stopped: '已停止',
            canceled: '已取消保存',
            http403: '原站拒绝了下载（403）。请回到原网页刷新并重新播放后再试。',
            http404: '原站找不到这个文件（404），链接可能已过期。',
            httpOther: code => `原站返回错误（${code}），请稍后重试。`,
            network: '网络连接中断，请检查网络后点击重新下载。',
            empty: '原站没有返回文件内容。',
            big: '这个文件较大，在浏览器中下载可能失败。安装了 Ruxget 桌面版时，建议在面板中选择用桌面版下载。',
            memory: '文件太大，浏览器无法保存。建议用 Ruxget 桌面版下载。',
            saveFailed: reason => `保存失败：${reason}`
        },
        en: {
            pageName: 'Ruxget · File Download',
            keepOpen: 'Keep this page open. Download progress appears here.',
            badTask: 'The download details are incomplete. Return to the original page and click download again.',
            urlLabel: 'File address',
            refererLabel: 'Source page (optional)',
            refererPlaceholder: 'Some sites require the address of the page that plays this file',
            urlHint: 'Enter an address that starts with http or https',
            download: 'Download',
            stop: 'Stop download',
            restart: 'Download again',
            force: 'Download in the browser anyway',
            openFolder: 'Open download folder',
            defaultName: 'download',
            received: a => `Downloaded ${a}`,
            receivedOf: (a, b) => `Downloaded ${a} of ${b}`,
            starting: 'Connecting to the site',
            retrying: (n, m) => `Connection interrupted. Retrying (${n} of ${m})`,
            saving: 'Saving',
            done: 'Download complete',
            failedTitle: 'Download failed',
            stopped: 'Stopped',
            canceled: 'Saving was canceled',
            http403: 'The site refused the download (403). Refresh and replay the original page, then try again.',
            http404: 'The site cannot find this file (404). The link may have expired.',
            httpOther: code => `The site returned an error (${code}). Please try again later.`,
            network: 'The network connection was interrupted. Check the network, then click Download again.',
            empty: 'The site returned no file content.',
            big: 'This file is large and may fail to download in the browser. If Ruxget Desktop is installed, choose to download it with the desktop app from the panel.',
            memory: 'The file is too large for the browser to save. Use Ruxget Desktop to download it.',
            saveFailed: reason => `Saving failed: ${reason}`
        }
    };

    let lang = 'zh';
    const t = (key, ...args) => {
        const entry = TEXT[lang][key];
        return typeof entry === 'function' ? entry(...args) : entry;
    };

    const browserLang = () => {
        let ui = '';
        try { ui = chrome.i18n.getUILanguage(); } catch (_) { ui = navigator.language || ''; }
        return /^zh/i.test(ui) ? 'zh' : 'en';
    };
    const resolveLang = value => value === 'zh_CN' ? 'zh' : value === 'en' ? 'en' : browserLang();

    // ---- Elements ----------------------------------------------------------------------------------------------
    const $ = id => document.getElementById(id);
    const el = {
        pageName: $('pageName'), sourceTitle: $('sourceTitle'), taskError: $('taskError'),
        form: $('manualForm'), urlLabel: $('urlLabel'), urlInput: $('urlInput'), urlHint: $('urlHint'),
        refererLabel: $('refererLabel'), refererInput: $('refererInput'), formSubmit: $('formSubmit'),
        card: $('taskCard'), fileName: $('fileName'), track: $('progressTrack'), fill: $('progressFill'),
        percent: $('progressPercent'), progressText: $('progressText'), status: $('statusText'),
        mainButton: $('mainButton'), forceButton: $('forceButton'), extraRow: $('extraRow'), folderButton: $('folderButton')
    };

    // ---- State -------------------------------------------------------------------------------------------------
    const state = {
        mode: 'form',          // 'form' | 'task'
        badTask: false,
        showUrlHint: false,
        task: null,
        name: '',
        phase: 'idle',         // idle | downloading | saving | done | stopped | failed | canceled | big
        received: 0,
        total: 0,
        message: null,         // {key, args, error}
        downloadId: null
    };

    let runSeq = 0;
    let controller = null;
    let ruleId = null;
    let tabInfo = null;
    let objectUrl = null;
    let paintTimer = null;
    let lastPaint = 0;
    let closing = false;

    // ---- Helpers -----------------------------------------------------------------------------------------------
    const formatSize = bytes => {
        const n = Math.max(0, Number(bytes) || 0);
        if (n < 1024) return `${Math.round(n)} B`;
        const units = ['KB', 'MB', 'GB'];
        let value = n / 1024, i = 0;
        while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
        return `${value.toFixed(1)} ${units[i]}`;
    };

    const isHttpUrl = text => {
        try {
            const u = new URL(String(text || '').trim());
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (_) { return false; }
    };

    const nameFromUrl = url => {
        try {
            const segments = new URL(url).pathname.split('/');
            const last = segments[segments.length - 1] || '';
            try { return decodeURIComponent(last); } catch (_) { return last; }
        } catch (_) { return ''; }
    };

    // Windows-safe file name: forbidden characters become "_", trailing dots and spaces go, long names keep their extension.
    const safeFileName = raw => {
        let name = String(raw || '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim();
        name = name.replace(/[. ]+$/, '');
        if (name.length > MAX_NAME) {
            const dot = name.lastIndexOf('.');
            const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
            name = name.slice(0, MAX_NAME - ext.length).replace(/[. ]+$/, '') + ext;
        }
        if (/^\.+/.test(name)) name = name.replace(/^\.+/, '_');
        return name;
    };

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    const currentTab = async () => {
        if (tabInfo) return tabInfo;
        try { tabInfo = await chrome.tabs.getCurrent(); } catch (_) { tabInfo = null; }
        return tabInfo;
    };

    // ---- Temporary request-header rule (declarativeNetRequest session rule) ------------------------------------
    const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

    const buildHeaderList = extra => {
        const list = [];
        const seen = new Set();
        const add = (name, value) => {
            const key = String(name || '').trim().toLowerCase();
            if (!key || !HEADER_NAME.test(key) || seen.has(key)) return;
            const text = String(value == null ? '' : value);
            if (!text) return;
            seen.add(key);
            list.push({header: key, operation: 'set', value: text});
        };
        Object.entries(extra || {}).forEach(([k, v]) => add(k, v));
        const task = state.task || {};
        if (task.cookie) add('cookie', task.cookie);
        Object.entries(task.headers || {}).forEach(([k, v]) => { if (k.toLowerCase() !== 'cookie' || !task.cookie) add(k, v); });
        return list;
    };

    const urlCondition = url => {
        const clean = url.split('#')[0];
        // urlFilter treats "*", "^" and "|" specially; fall back to the host for such addresses.
        if (/[*^|]/.test(clean)) {
            try { return {requestDomains: [new URL(clean).hostname]}; } catch (_) { return {}; }
        }
        return {urlFilter: '|' + clean + '|'};
    };

    const clearRule = async () => {
        if (ruleId == null) return;
        const id = ruleId;
        ruleId = null;
        try { await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [id]}); } catch (_) { /* already gone */ }
    };

    const applyRule = async extra => {
        const headers = buildHeaderList(extra);
        if (!headers.length) { await clearRule(); return; }
        const tab = await currentTab();
        const condition = {...urlCondition(state.task.url), resourceTypes: ['xmlhttprequest', 'other']};
        if (tab && typeof tab.id === 'number' && tab.id >= 0) condition.tabIds = [tab.id];
        let existing = [];
        try { existing = (await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id); } catch (_) { existing = []; }
        const taken = new Set(existing);
        for (let attempt = 0; attempt < 5; attempt++) {
            let id;
            do { id = 100000 + Math.floor(Math.random() * 2000000000); } while (taken.has(id));
            const removeRuleIds = ruleId != null ? [ruleId] : [];
            try {
                await chrome.declarativeNetRequest.updateSessionRules({
                    removeRuleIds,
                    addRules: [{id, priority: 1, action: {type: 'modifyHeaders', requestHeaders: headers}, condition}]
                });
                ruleId = id;
                return;
            } catch (_) {
                taken.add(id);
            }
        }
    };

    // ---- Rendering ---------------------------------------------------------------------------------------------
    const percentOf = () => state.total > 0 ? Math.min(100, Math.floor(state.received / state.total * 100)) : 0;

    const renderTitle = () => {
        let title = t('pageName');
        if (state.mode === 'task') {
            if (state.phase === 'downloading') {
                title = state.total > 0 ? `${percentOf()}% · ${state.name}` : `${formatSize(state.received)} · ${state.name}`;
            } else if (state.phase === 'saving') title = t('saving');
            else if (state.phase === 'done') title = t('done');
            else if (state.phase === 'failed') title = t('failedTitle');
        }
        if (document.title !== title) document.title = title;
    };

    const paintProgress = () => {
        lastPaint = Date.now();
        const known = state.total > 0;
        const active = state.phase === 'downloading';
        el.track.classList.toggle('indeterminate', !known && active);
        if (known) {
            const pct = percentOf();
            el.fill.style.width = pct + '%';
            el.percent.textContent = pct + '%';
            el.track.setAttribute('aria-valuenow', String(pct));
        } else {
            el.fill.style.width = state.phase === 'done' || state.phase === 'saving' ? '100%' : '';
            el.percent.textContent = state.phase === 'done' || state.phase === 'saving' ? '100%' : '';
            el.track.removeAttribute('aria-valuenow');
        }
        el.progressText.textContent = known
            ? t('receivedOf', formatSize(state.received), formatSize(state.total))
            : t('received', formatSize(state.received));
        renderTitle();
    };

    const scheduleProgress = () => {
        if (paintTimer) return;
        const wait = Math.max(0, PAINT_INTERVAL - (Date.now() - lastPaint));
        if (wait === 0) { paintProgress(); return; }
        paintTimer = setTimeout(() => { paintTimer = null; paintProgress(); }, wait);
    };

    const render = () => {
        if (paintTimer) { clearTimeout(paintTimer); paintTimer = null; }
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        el.pageName.textContent = t('pageName');
        const title = state.task && state.task.title ? String(state.task.title) : '';
        el.sourceTitle.textContent = title || t('keepOpen');

        const formMode = state.mode === 'form';
        el.form.hidden = !formMode;
        el.card.hidden = formMode;
        el.extraRow.hidden = formMode;
        el.taskError.hidden = !(formMode && state.badTask);
        el.taskError.textContent = t('badTask');

        el.urlLabel.textContent = t('urlLabel');
        el.refererLabel.textContent = t('refererLabel');
        el.refererInput.placeholder = t('refererPlaceholder');
        el.urlHint.textContent = t('urlHint');
        el.urlHint.hidden = !state.showUrlHint;
        el.urlInput.setAttribute('aria-invalid', state.showUrlHint ? 'true' : 'false');
        el.formSubmit.textContent = t('download');

        el.fileName.textContent = state.name;
        const m = state.message;
        el.status.textContent = m ? t(m.key, ...(m.args || [])) : '';
        el.status.classList.toggle('error', !!(m && m.error));

        const phase = state.phase;
        if (phase === 'downloading') {
            el.mainButton.hidden = false;
            el.mainButton.textContent = t('stop');
        } else if (phase === 'stopped' || phase === 'failed' || phase === 'canceled') {
            el.mainButton.hidden = false;
            el.mainButton.textContent = t('restart');
        } else {
            el.mainButton.hidden = true;
        }
        el.forceButton.hidden = phase !== 'big';
        el.forceButton.textContent = t('force');
        el.folderButton.textContent = t('openFolder');
        paintProgress();
    };

    const setPhase = (phase, message) => {
        state.phase = phase;
        state.message = message || null;
        render();
    };

    // ---- Download ----------------------------------------------------------------------------------------------
    const httpMessage = status => status === 403 ? {key: 'http403', error: true}
        : status === 404 ? {key: 'http404', error: true}
        : {key: 'httpOther', args: [status], error: true};

    const totalFrom = response => {
        const range = response.headers.get('content-range');
        const rangeMatch = range && /\/(\d+)\s*$/.exec(range);
        if (rangeMatch) return Number(rangeMatch[1]);
        const encoding = (response.headers.get('content-encoding') || '').toLowerCase();
        const length = Number(response.headers.get('content-length'));
        if (length > 0 && (!encoding || encoding === 'identity')) return length;
        return 0;
    };

    const stopActive = () => {
        runSeq++;
        if (controller) { try { controller.abort(); } catch (_) { /* ignore */ } }
        controller = null;
    };

    const fail = async (run, message, phase = 'failed') => {
        if (run !== runSeq) return;
        controller = null;
        await clearRule();
        if (run !== runSeq) return;
        setPhase(phase, message);
    };

    const startDownload = async allowBig => {
        stopActive();
        const run = runSeq;
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
        state.downloadId = null;
        state.received = 0;
        state.total = Number(state.task.size) > 0 ? Number(state.task.size) : 0;
        if (!allowBig && state.total > BIG_LIMIT) { setPhase('big', {key: 'big'}); return; }
        setPhase('downloading', {key: 'starting'});

        let stage = 0;          // 0: plain, 1: range from start + no cache, 2: also sec-fetch headers
        let netRetries = 0;
        let chunks = null;
        let type = '';

        for (;;) {
            if (run !== runSeq) return;
            const extra = stage >= 2 ? {'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'same-site'} : null;
            await applyRule(extra);
            if (run !== runSeq) return;
            const ctrl = new AbortController();
            controller = ctrl;
            const init = {signal: ctrl.signal, cache: stage >= 1 ? 'no-store' : 'default', redirect: 'follow'};
            if (stage >= 1) init.headers = {Range: 'bytes=0-'};

            let response;
            try {
                response = await fetch(state.task.url, init);
            } catch (_) {
                if (run !== runSeq || ctrl.signal.aborted) return;
                if (netRetries < NET_RETRY_DELAYS.length) {
                    netRetries++;
                    state.message = {key: 'retrying', args: [netRetries, NET_RETRY_DELAYS.length]};
                    render();
                    await delay(NET_RETRY_DELAYS[netRetries - 1]);
                    continue;
                }
                return fail(run, {key: 'network', error: true});
            }
            if (run !== runSeq) return;

            if (!response.ok) {
                try { ctrl.abort(); } catch (_) { /* ignore */ }
                if (stage < 2) { stage++; continue; }
                return fail(run, httpMessage(response.status));
            }

            const reported = totalFrom(response);
            const total = reported > 0 ? reported : (Number(state.task.size) > 0 ? Number(state.task.size) : 0);
            if (!allowBig && total > BIG_LIMIT) {
                try { ctrl.abort(); } catch (_) { /* ignore */ }
                controller = null;
                await clearRule();
                if (run !== runSeq) return;
                state.total = total;
                setPhase('big', {key: 'big'});
                return;
            }
            type = response.headers.get('content-type') || '';
            state.total = total;
            state.received = 0;
            state.message = null;
            render();

            chunks = [];
            try {
                if (response.body) {
                    const reader = response.body.getReader();
                    for (;;) {
                        const {done, value} = await reader.read();
                        if (run !== runSeq) { try { reader.cancel(); } catch (_) { /* ignore */ } return; }
                        if (done) break;
                        if (value && value.byteLength) {
                            chunks.push(value);
                            state.received += value.byteLength;
                            scheduleProgress();
                        }
                    }
                } else {
                    const buffer = new Uint8Array(await response.arrayBuffer());
                    if (buffer.byteLength) chunks.push(buffer);
                    state.received = buffer.byteLength;
                }
            } catch (error) {
                if (run !== runSeq || ctrl.signal.aborted) return;
                chunks = null;
                if (error && error.name === 'RangeError') return fail(run, {key: 'memory', error: true});
                if (netRetries < NET_RETRY_DELAYS.length) {
                    netRetries++;
                    state.received = 0;
                    state.message = {key: 'retrying', args: [netRetries, NET_RETRY_DELAYS.length]};
                    render();
                    await delay(NET_RETRY_DELAYS[netRetries - 1]);
                    continue;
                }
                return fail(run, {key: 'network', error: true});
            }
            // A body shorter than the size the server promised means the connection ended early.
            if (reported > 0 && state.received < reported && !response.headers.get('content-range')) {
                chunks = null;
                if (netRetries < NET_RETRY_DELAYS.length) {
                    netRetries++;
                    state.received = 0;
                    state.message = {key: 'retrying', args: [netRetries, NET_RETRY_DELAYS.length]};
                    render();
                    await delay(NET_RETRY_DELAYS[netRetries - 1]);
                    continue;
                }
                return fail(run, {key: 'network', error: true});
            }
            break;
        }

        controller = null;
        await clearRule();
        if (run !== runSeq) return;
        if (!state.received) return fail(run, {key: 'empty', error: true});
        if (!state.total) state.total = state.received;
        await save(run, chunks, type);
    };

    // ---- Saving through Chrome's downloads ---------------------------------------------------------------------
    const readSaveAs = async () => {
        try {
            const {saveAs} = await chrome.storage.sync.get('saveAs');
            return saveAs === true;
        } catch (_) { return false; }
    };

    const pendingChanges = new Map();

    const handleDownloadState = (run, item) => {
        if (run !== runSeq || state.phase !== 'saving') return;
        if (item.state === 'complete') {
            finishSaved(run);
        } else if (item.state === 'interrupted') {
            const reason = item.error || '';
            if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
            if (reason === 'USER_CANCELED') setPhase('canceled', {key: 'canceled'});
            else setPhase('failed', {key: 'saveFailed', args: [reason || 'UNKNOWN'], error: true});
        }
    };

    chrome.downloads.onChanged.addListener(delta => {
        if (!delta || !delta.state) return;
        const value = {state: delta.state.current, error: delta.error ? delta.error.current : ''};
        if (state.downloadId === delta.id) handleDownloadState(runSeq, value);
        else pendingChanges.set(delta.id, value);
    });

    const save = async (run, chunks, type) => {
        setPhase('saving', {key: 'saving'});
        let blob;
        try {
            blob = new Blob(chunks, {type: type || 'application/octet-stream'});
        } catch (_) {
            return fail(run, {key: 'memory', error: true});
        }
        chunks = null;
        const saveAs = await readSaveAs();
        if (run !== runSeq) return;
        try {
            objectUrl = URL.createObjectURL(blob);
        } catch (_) {
            return fail(run, {key: 'memory', error: true});
        }
        let id;
        try {
            id = await chrome.downloads.download({url: objectUrl, filename: state.name, saveAs, conflictAction: 'uniquify'});
        } catch (error) {
            if (run !== runSeq) return;
            const reason = String((error && error.message) || error || '');
            if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
            if (/cancel/i.test(reason)) return setPhase('canceled', {key: 'canceled'});
            return setPhase('failed', {key: 'saveFailed', args: [reason], error: true});
        }
        if (run !== runSeq) return;
        if (typeof id !== 'number') return setPhase('canceled', {key: 'canceled'});
        state.downloadId = id;
        const early = pendingChanges.get(id);
        pendingChanges.clear();
        if (early) { handleDownloadState(run, early); return; }
        try {
            const [item] = await chrome.downloads.search({id});
            if (item) handleDownloadState(run, item);
        } catch (_) { /* onChanged will report */ }
    };

    const finishSaved = run => {
        if (run !== runSeq) return;
        if (objectUrl) { const u = objectUrl; objectUrl = null; setTimeout(() => URL.revokeObjectURL(u), 5000); }
        state.received = state.total || state.received;
        setPhase('done', {key: 'done'});
        setTimeout(() => { if (run === runSeq && state.phase === 'done') closeSelf(); }, CLOSE_DELAY);
    };

    const closeSelf = async () => {
        if (closing) return;
        closing = true;
        try {
            const tab = await currentTab();
            if (tab && typeof tab.id === 'number') {
                const siblings = await chrome.tabs.query({windowId: tab.windowId});
                if (siblings.length <= 1) await chrome.tabs.create({windowId: tab.windowId, active: true});
                await chrome.tabs.remove(tab.id);
                return;
            }
        } catch (_) { /* fall through */ }
        window.close();
    };

    // ---- Actions -----------------------------------------------------------------------------------------------
    const stopDownload = async () => {
        stopActive();
        state.received = 0;
        await clearRule();
        setPhase('stopped', {key: 'stopped'});
    };

    el.mainButton.addEventListener('click', () => {
        if (state.phase === 'downloading') stopDownload();
        else if (state.phase === 'stopped' || state.phase === 'failed' || state.phase === 'canceled') startDownload(false);
    });

    el.forceButton.addEventListener('click', () => { if (state.phase === 'big') startDownload(true); });

    el.folderButton.addEventListener('click', () => {
        try {
            if (state.phase === 'done' && typeof state.downloadId === 'number') chrome.downloads.show(state.downloadId);
            else chrome.downloads.showDefaultFolder();
        } catch (_) { /* nothing to show */ }
    });

    el.urlInput.addEventListener('input', () => {
        if (state.showUrlHint && isHttpUrl(el.urlInput.value)) { state.showUrlHint = false; render(); }
    });

    el.form.addEventListener('submit', event => {
        event.preventDefault();
        const url = el.urlInput.value.trim();
        if (!isHttpUrl(url)) {
            state.showUrlHint = true;
            render();
            el.urlInput.focus();
            return;
        }
        const referer = el.refererInput.value.trim();
        state.showUrlHint = false;
        state.badTask = false;
        openTask({url, headers: referer ? {referer} : {}});
    });

    window.addEventListener('pagehide', () => {
        stopActive();
        if (ruleId != null) {
            const id = ruleId;
            ruleId = null;
            try { chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [id]}); } catch (_) { /* ignore */ }
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    });

    // ---- Start -------------------------------------------------------------------------------------------------
    const parseTask = () => {
        const params = new URLSearchParams(location.search);
        if (!params.has('task')) return {task: null, bad: false};
        let data;
        try { data = JSON.parse(params.get('task')); } catch (_) { return {task: null, bad: true}; }
        if (!data || typeof data !== 'object' || !isHttpUrl(data.url)) return {task: null, bad: true};
        const headers = data.headers && typeof data.headers === 'object' && !Array.isArray(data.headers) ? data.headers : {};
        return {
            task: {
                url: String(data.url).trim(),
                filename: typeof data.filename === 'string' ? data.filename : '',
                title: typeof data.title === 'string' ? data.title : '',
                headers,
                cookie: typeof data.cookie === 'string' ? data.cookie : '',
                size: Number(data.size) > 0 ? Number(data.size) : 0
            },
            bad: false
        };
    };

    const openTask = task => {
        state.task = task;
        state.mode = 'task';
        state.name = safeFileName(task.filename || nameFromUrl(task.url)) || safeFileName(t('defaultName'));
        startDownload(false);
    };

    const init = async () => {
        let stored;
        try { stored = (await chrome.storage.local.get('ruxgetUiLanguage')).ruxgetUiLanguage; } catch (_) { stored = undefined; }
        lang = resolveLang(stored);
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.ruxgetUiLanguage) return;
            lang = resolveLang(changes.ruxgetUiLanguage.newValue);
            render();
        });
        currentTab();
        const {task, bad} = parseTask();
        if (task) {
            openTask(task);
        } else {
            state.mode = 'form';
            state.badTask = bad;
            render();
        }
    };

    init();
})();
