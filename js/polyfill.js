// 低版本chrome manifest v3协议 会有 getMessage 函数不存在的bug
if (chrome.i18n.getMessage === undefined) {
    chrome.i18n.getMessage = (key) => key;
    fetch(chrome.runtime.getURL("_locales/zh_CN/messages.json")).then(res => res.json()).then(data => {
        chrome.i18n.getMessage = (key) => data[key].message;
    }).catch((e) => { console.error(e); });
}
/**
 * 部分修改版chrome 不存在 chrome.downloads API
 * 例如 夸克浏览器
 * 使用传统下载方式下载 但无法监听 无法另存为 无法判断下载是否失败 唉~
 */
if (!chrome.downloads) {
    chrome.downloads = {
        download: function (options, callback) {
            let a = document.createElement('a');
            a.href = options.url;
            a.download = options.filename;
            a.click();
            a = null;
            callback && callback();
        },
        onChanged: { addListener: function () { } },
        showDefaultFolder: function () { },
        show: function () { },
    }
}
// 兼容 114版本以下没有chrome.sidePanel
if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel = {
        setOptions: function (options) { },
        setPanelBehavior: function (options) { },
    }
}

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
    if (page && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(KEY).then(stored => {
            const pref = stored && stored[KEY] || 'auto', saved = writeMirror(pref);
            if (!synchronous || resolve(pref) === lang) { try { sessionStorage.removeItem(RELOADED); } catch (e) { } return; }
            // Painted from a missing or stale mirror: reload once. Never twice for the same address, and never when the
            // mirror cannot be saved (the reload would come back in the same language).
            let again = true;
            try { again = sessionStorage.getItem(RELOADED) === location.href; } catch (e) { again = true; }
            if (!saved || again) return;
            try { sessionStorage.setItem(RELOADED, location.href); } catch (e) { return; }
            location.reload();
        }).catch(() => { });
        try {
            chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[KEY]) writeMirror(changes[KEY].newValue || 'auto'); });
        } catch (e) { }
    }
    return {
        KEY, get, use, resolve, writeMirror, synchronous,
        // The language messages currently come from; null while they still come from chrome.i18n.
        get lang() { return catalog ? lang : null; },
        pick(zh, en) { return (catalog ? lang : browserLang()) === 'en' ? en : zh; }
    };
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