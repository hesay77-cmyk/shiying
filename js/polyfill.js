// Ruxget's page language helper (RuxgetPageLocale). 0.4.79: the browser shims that came with the inherited code
// (other browsers without chrome.downloads / chrome.sidePanel) are gone; Ruxget is built for Chrome.

// Ruxget interface language (0.4.73). The setting is chrome.storage.local.ruxgetUiLanguage ("zh_CN" | "en" | "auto"),
// which can only be read asynchronously, but these pages translate while they load (js/i18n.js, templates, outerHTML).
// So extension pages mirror the setting into localStorage (shared by every page of the extension), and pages that load
// js/ruxget-locale-data.js before this file pick the matching catalog synchronously. If the mirror was missing or stale,
// the page reloads once in the right language. Without that file (service worker, pages that only use js/shiying-locale.js)
// messages come from chrome.i18n until shiying-locale.js hands over its catalog through RuxgetPageLocale.use().
globalThis.RuxgetPageLocale = (function () {
    const KEY = 'ruxgetUiLanguage', RELOADED = 'ruxgetUiLanguageReloaded';
    const page = typeof document !== 'undefined' && typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
    let store = null;
    try { store = page ? globalThis.localStorage : null; } catch (e) { store = null; }
    const browserLang = () => { try { return /^zh/i.test(chrome.i18n.getUILanguage() || '') ? 'zh_CN' : 'en'; } catch (e) { return 'zh_CN'; } };
    const resolve = pref => pref === 'en' || pref === 'zh_CN' ? pref : browserLang();
    const readMirror = () => { try { return store ? store.getItem(KEY) : null; } catch (e) { return null; } };
    const writeMirror = pref => {
        try { if (store && pref) { if (store.getItem(KEY) !== pref) store.setItem(KEY, pref); return store.getItem(KEY) === pref; } } catch (e) { }
        return false;
    };
    const data = globalThis.RuxgetLocaleData;
    let lang = resolve(readMirror());
    let catalog = data && data[lang] || null;
    const synchronous = !!catalog;
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    // Same substitution rules as chrome.i18n.getMessage: $name$ → placeholder content, $1-$9 → substitutions, $$ → $.
    function format(entry, substitutions) {
        let message = String(entry.message);
        const list = substitutions == null ? [] : (Array.isArray(substitutions) ? substitutions : [substitutions]);
        if (entry.placeholders) {
            const named = {};
            for (const name of Object.keys(entry.placeholders)) named[name.toLowerCase()] = String(entry.placeholders[name].content);
            message = message.replace(/\$([a-z0-9_@]+)\$/gi, (all, name) => own(named, name.toLowerCase()) ? named[name.toLowerCase()] : all);
        }
        return message.replace(/\$(\$|[1-9])/g, (all, n) => n === '$' ? '$' : (list[n - 1] == null ? '' : String(list[n - 1])));
    }
    function get(key, substitutions) {
        key = String(key);
        if (catalog && own(catalog, key)) return format(catalog[key], substitutions);
        try { return chrome.i18n.getMessage(key, substitutions); } catch (e) { return ''; }
    }
    function use(nextLang, nextCatalog) {
        if (!nextCatalog || typeof nextCatalog !== 'object') return;
        lang = nextLang; catalog = nextCatalog;
    }
    // 0.4.74: a language switch while a tool page is open. Text written from now on (progress lines, lists rendered
    // again) is already in the new language; js/i18n.js writes the page's own labels again (onChange), except where the
    // page has written something else there. The inherited tool pages also render text once that nothing renders again,
    // so an untouched one reloads once, quietly, but only while nobody is looking at it (document hidden): a visible page
    // switches in place and reloads when it is next hidden, if it is still untouched then. Never reloaded: the page the
    // change came from (options.html), a page opened for a job, a page with a download, recording or merge that runs or
    // has run, and a page the user touched at all (clicked, typed, ticked, chose a file), with media playing or started,
    // or with a dialog open. Those keep their in-place switch; the rest of their text follows at the next opening.
    const changeHandlers = [], busyChecks = [];
    const file = page ? location.pathname.split('/').pop() : '';
    const reloadsWhenIdle = ['m3u8.html', 'mpd.html', 'json.html', 'downloader.html', 'preview.html', 'popup.html', 'options.html'].includes(file);
    let touched = false, ownChange = false, reloadPending = false, applied = lang;
    if (page) {
        try {
            const touch = event => { if (event.isTrusted) touched = true; };
            for (const type of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'input', 'change', 'paste', 'drop', 'wheel']) document.addEventListener(type, touch, { capture: true, passive: true });
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') reloadIfIdle(); });
        } catch (e) { }
    }
    // The job a page was opened for (downloader.html?requestId=…, m3u8.html?autoDown=1, …): reloading would start it again.
    function openedWithJob() {
        if (!page) return false;
        const params = new URLSearchParams(location.search), has = name => params.has(name) && params.get(name) !== '';
        if (file === 'downloader.html') return has('requestId') || has('JSON');
        if (file === 'm3u8.html') return has('autoDown') || has('ffmpeg') || has('getMpdId') || has('taskId');
        return false;
    }
    // State a reload would throw away even without a click: media that plays or was started, an open dialog, a chosen file.
    function holdsState() {
        try {
            for (const media of document.querySelectorAll('video, audio')) if (!media.paused || media.currentTime > 0) return true;
            if (document.querySelector('dialog[open]')) return true;
            for (const input of document.querySelectorAll('input[type=file]')) if (input.files && input.files.length) return true;
        } catch (e) { return true; }
        return false;
    }
    function busy() {
        if (touched || ownChange || openedWithJob() || holdsState()) return true;
        return busyChecks.some(check => { try { return !!check(); } catch (e) { return true; } });
    }
    function reloadIfIdle() {
        if (!reloadPending || busy()) return;
        // Only while hidden: the page never changes under someone looking at it.
        try { if (document.visibilityState !== 'hidden') return; } catch (e) { return; }
        // The mirror must name the language the page shows now, or the reloaded page would come back in the other one.
        const mirror = readMirror();
        reloadPending = false;
        if (mirror == null || resolve(mirror) !== lang) return;
        location.reload();
    }
    // Runs the page's handlers once per language actually shown (js/shiying-locale.js may have switched the catalog
    // already through use(); the labels js/i18n.js wrote still need the handlers).
    function switchTo(nextLang) {
        const next = data && data[nextLang];
        if (!next || applied === nextLang) return false;
        const previous = applied;
        use(nextLang, next);
        applied = nextLang;
        try { document.documentElement.lang = nextLang === 'en' ? 'en' : 'zh-CN'; } catch (e) { }
        for (const handler of changeHandlers.slice()) { try { handler(nextLang, previous); } catch (e) { } }
        return true;
    }
    if (page && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(KEY).then(stored => {
            const pref = stored && stored[KEY] || 'auto', saved = writeMirror(pref);
            if (!synchronous || resolve(pref) === lang) { try { sessionStorage.removeItem(RELOADED); } catch (e) { } return; }
            // A page opened for a job (or already busy) is not reloaded: it switches in place instead.
            if (busy()) { switchTo(resolve(pref)); return; }
            // Painted from a missing or stale mirror: reload once. Never twice for the same address, and never when the
            // mirror cannot be saved (the reload would come back in the same language).
            let again = true;
            try { again = sessionStorage.getItem(RELOADED) === location.href; } catch (e) { again = true; }
            if (!saved || again) { switchTo(resolve(pref)); return; }
            try { sessionStorage.setItem(RELOADED, location.href); } catch (e) { switchTo(resolve(pref)); return; }
            location.reload();
        }).catch(() => { });
        try {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes[KEY]) return;
                const pref = changes[KEY].newValue || 'auto';
                const saved = writeMirror(pref);
                if (!synchronous) return;
                if (!switchTo(resolve(pref))) return;
                if (!reloadsWhenIdle || !saved || ownChange) return;
                reloadPending = true;
                reloadIfIdle();
            });
        } catch (e) { }
    }
    return {
        KEY, get, use, resolve, writeMirror, synchronous,
        // Called after a language switch while the page stays open (js/i18n.js writes the labels again).
        onChange(handler) { if (typeof handler === 'function') changeHandlers.push(handler); },
        // A page's own "work in progress" test: while it returns true a language switch never reloads the page.
        busyWhen(check) { if (typeof check === 'function') busyChecks.push(check); },
        busy,
        // The page the user changed the language on (js/shiying-locale.js setLanguage): it switches now, in place, and
        // is never reloaded for this change.
        changedHere(nextLang) { ownChange = true; reloadPending = false; if (synchronous) switchTo(nextLang); },
        // A message of the bundled catalog of a given language (js/ruxget-locale-data.js), for comparing old labels.
        message(inLang, key) { const entries = data && data[inLang]; return entries && own(entries, key) ? format(entries[key]) : ''; },
        catalogFor(inLang) { return data && data[inLang] || null; },
        // The language messages currently come from; null while they still come from chrome.i18n.
        get lang() { return catalog ? lang : null; },
        pick(zh, en) { return (catalog ? lang : browserLang()) === 'en' ? en : zh; }
    };
})();

// 0.4.74: "label: value" in the interface language's own style: 「分辨率：320×184」, "Resolution: 320×184".
function i18nLabel(label, value) {
    return String(label) + RuxgetPageLocale.pick('：', ': ') + (value == null ? '' : value);
}

// 0.4.74: text a tool page renders once from code (a list line, the 「共 N 个文件」 summary, a label before a field).
// Written through here, it is rendered again after a language switch while the page stays open, unless the page has
// written something else there since (then the page owns it). append: add it in a new <span> at the end of target
// instead of replacing target's content. Returns the element written.
const i18nRender = (function () {
    const rendered = new Map();
    function render(target, make, append) {
        let element = target && target.jquery ? target[0] : target;
        if (!element || typeof make !== 'function') return null;
        if (append) { const span = document.createElement('span'); element.append(span); element = span; }
        let html = '';
        try { html = String(make() ?? ''); } catch (e) { }
        element.innerHTML = html;
        if (rendered.size > 300) for (const old of rendered.keys()) if (!old.isConnected) rendered.delete(old);
        rendered.set(element, { make, html: element.innerHTML });
        return element;
    }
    if (typeof RuxgetPageLocale !== 'undefined' && RuxgetPageLocale.onChange) RuxgetPageLocale.onChange(function () {
        for (const [element, entry] of rendered) {
            if (!element.isConnected || element.innerHTML !== entry.html) { rendered.delete(element); continue; }
            try { element.innerHTML = String(entry.make() ?? ''); entry.html = element.innerHTML; } catch (e) { rendered.delete(element); }
        }
    });
    return render;
})();

// 简写翻译函数: i18n.key 或 i18n("key", [substitutions])
const i18n = new Proxy(() => { }, {
    get: function (target, key) {
        return typeof key === 'symbol' ? undefined : RuxgetPageLocale.get(key);
    },
    apply: function (target, thisArg, args) {
        return RuxgetPageLocale.get(args[0], args[1]);
    }
});

// 手机浏览器不支持右键菜单
if (!chrome.contextMenus) {
    chrome.contextMenus = {
        create: function () { },
        remove: function () { },
        removeAll: function () { },
        onClicked: { addListener: function () { } },
    }
}

// 手机浏览器没有windows API 只能使用tabs API
if (!chrome.windows) {
    chrome.windows = {
        onFocusChanged: { addListener: function () { } },
        create: function (obj, callback) {
            chrome.tabs.create({ url: obj.url }, function (tab) {
                callback && callback(tab);
            });
        },
    }
}
// 手机浏览器木有快捷键
if (!chrome.commands) {
    chrome.commands = {
        onCommand: { addListener: function () { } }
    }
}