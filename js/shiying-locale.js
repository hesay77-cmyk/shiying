/**
 * Ruxget UI language preference.
 * Storage key: ruxgetUiLanguage = "zh_CN" | "en" | "auto"
 * Overrides the global i18n Proxy when a catalog is loaded.
 */
(function (global) {
  const STORAGE_KEY = "ruxgetUiLanguage";
  const SUPPORTED = ["zh_CN", "en"];
  let catalog = null;
  let currentLang = "zh_CN";
  let readyPromise = null;
  let localeLoadWarned = false;

  function browserLang() {
    try {
      const ui = (chrome.i18n.getUILanguage() || "").toLowerCase();
      return ui.startsWith("zh") ? "zh_CN" : "en";
    } catch (e) {
      return "zh_CN";
    }
  }

  function resolveLang(pref) {
    if (pref === "en" || pref === "zh_CN") return pref;
    return browserLang();
  }

  function formatMessage(template, substitutions) {
    if (template == null) return "";
    let msg = String(template);
    if (substitutions == null) return msg;
    const list = Array.isArray(substitutions) ? substitutions : [substitutions];
    for (let i = 0; i < list.length; i++) {
      msg = msg.replace(new RegExp("\\$" + (i + 1), "g"), String(list[i]));
      msg = msg.replace("$" + (i + 1) + "$", String(list[i]));
    }
    // named placeholders like $num$
    msg = msg.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)\$/g, function (all, name) {
      const idx = list.length === 1 && typeof substitutions === "object" && !Array.isArray(substitutions)
        ? null
        : null;
      return all;
    });
    return msg;
  }

  function getMessage(key, substitutions) {
    if (catalog && catalog[key] && catalog[key].message != null) {
      let msg = catalog[key].message;
      if (substitutions != null) {
        const list = Array.isArray(substitutions) ? substitutions : [substitutions];
        const ph = catalog[key].placeholders;
        if (ph) {
          Object.keys(ph).forEach(function (name) {
            const content = ph[name] && ph[name].content;
            const m = content && content.match(/^\$(\d+)$/);
            if (m) {
              const n = Number(m[1]) - 1;
              msg = msg.replace(new RegExp("\\$" + name + "\\$", "g"), list[n] != null ? String(list[n]) : "");
            }
          });
        }
        for (let i = 0; i < list.length; i++) {
          msg = msg.replace(new RegExp("\\$" + (i + 1) + "(?!\\d)", "g"), String(list[i]));
        }
      }
      return msg;
    }
    try {
      return chrome.i18n.getMessage(key, substitutions) || key;
    } catch (e) {
      return key;
    }
  }

  function installI18nProxy() {
    try {
      global.i18n = new Proxy(getMessage, {
        get: function (target, key) {
          if (key === "apply" || key === "then") return undefined;
          return getMessage(String(key));
        },
        apply: function (target, thisArg, args) {
          return getMessage(args[0], args[1]);
        }
      });
    } catch (e) {}
  }

  // 0.4.74: the first time an element is translated it gets its label. After that (a language switch, a second
  // applyDom) only what is still the static label, in the language it was written in, is rewritten. Text the page has
  // written there since belongs to the page: a live() text is left to live(), a message of the previous catalog becomes
  // the same message in the new one (a button that reads 「读取中…」 or "Close"), anything else is left alone.
  const translated = new WeakSet();
  let templateEl = null;
  function asHtml(text) {
    try {
      templateEl = templateEl || document.createElement("template");
      templateEl.innerHTML = text;
      return templateEl.innerHTML;
    } catch (e) { return text; }
  }
  function plainMessage(entries, key) {
    const entry = entries && Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
    return entry && typeof entry.message === "string" ? entry.message : "";
  }
  const reverseMaps = new WeakMap();
  function reverseOf(entries) {
    if (!entries) return new Map();
    if (reverseMaps.has(entries)) return reverseMaps.get(entries);
    const map = new Map();
    reverseMaps.set(entries, map);
    Object.keys(entries).forEach(function (key) {
      const text = plainMessage(entries, key);
      if (!text || text.indexOf("$") >= 0) return;
      const html = asHtml(text);
      if (map.has(html)) map.get(html).push(key); else map.set(html, [key]);
    });
    return map;
  }
  function ownedByLive(el, attr, current) {
    const entry = liveTexts.get(el);
    return !!(entry && entry[attr] && entry[attr].value === current);
  }
  // previous: the catalog the page was showing before (defaults to the current one).
  function follow(el, store, key, current, html, previous) {
    if (current == null || !translated.has(store)) return getMessage(key);
    const old = plainMessage(previous, key);
    if (current === key || (old && current === (html ? asHtml(old) : old))) return getMessage(key);
    if (ownedByLive(el, html ? "textContent" : store.attr, html ? el.textContent : current)) return "";
    if (previous === catalog) return "";
    // Several keys with this text (「关闭」 is close and flowClose): only when they agree in the new language.
    const keys = reverseOf(previous).get(html ? current : asHtml(current)) || [];
    const texts = keys.map(function (other) { return getMessage(other); }).filter(function (text, i, all) { return all.indexOf(text) === i; });
    return texts.length === 1 && keys.indexOf(texts[0]) < 0 ? texts[0] : "";
  }
  const attrMarks = new WeakMap();
  function mark(el, attr) {
    let marks = attrMarks.get(el);
    if (!marks) attrMarks.set(el, marks = {});
    return marks[attr] || (marks[attr] = { attr: attr });
  }

  // <i18n>key</i18n> and data-i18n-outer elements become plain text nodes that remember their key (as in js/i18n.js,
  // whichever of the two runs first), so a later switch can write them again. A message with markup is inserted as
  // HTML, as before, and stays as it is.
  const outerTexts = [];
  function replaceOuter(el, key) {
    const text = getMessage(key);
    if (!text || text === key) return;
    if (/[<&]/.test(text)) { el.outerHTML = text; return; }
    const node = document.createTextNode(text);
    el.replaceWith(node);
    outerTexts.push({ node: node, key: key });
  }

  function applyDom(root, previousCatalog) {
    const doc = root || document;
    const previous = previousCatalog || catalog;
    doc.querySelectorAll("[data-i18n]").forEach(function (el) {
      if (el.hasAttribute("data-i18n-live")) return;
      const key = el.dataset.i18n;
      const text = follow(el, el, key, el.innerHTML, true, previous);
      if (text && text !== key) el.innerHTML = text;
      translated.add(el);
    });
    doc.querySelectorAll("[data-i18n-outer]").forEach(function (el) {
      replaceOuter(el, el.dataset.i18nOuter);
    });
    doc.querySelectorAll("i18n").forEach(function (el) {
      replaceOuter(el, el.innerHTML.trim());
    });
    // Text that replaced an <i18n> or data-i18n-outer element earlier, while it still reads the previous label.
    outerTexts.forEach(function (item) {
      if (!item.node.isConnected) return;
      const old = plainMessage(previous, item.key);
      const text = getMessage(item.key);
      if (text && text !== item.key && !/[<&]/.test(text) && (item.node.data === item.key || (old && item.node.data === old))) item.node.data = text;
    });
    doc.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      const key = el.dataset.i18nPlaceholder, store = mark(el, "placeholder");
      const text = follow(el, store, key, el.getAttribute("placeholder"), false, previous);
      if (text && text !== key) el.setAttribute("placeholder", text);
      translated.add(store);
    });
    doc.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const key = el.dataset.i18nTitle, store = mark(el, "title");
      const text = follow(el, store, key, el.getAttribute("title"), false, previous);
      if (text && text !== key) el.setAttribute("title", text);
      translated.add(store);
    });
    doc.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      const key = el.dataset.i18nAria, store = mark(el, "aria-label");
      const text = follow(el, store, key, el.getAttribute("aria-label"), false, previous);
      if (text && text !== key) el.setAttribute("aria-label", text);
      translated.add(store);
    });
    const titleKey = doc.documentElement && doc.documentElement.dataset && doc.documentElement.dataset.i18nTitle;
    if (titleKey) {
      const t = getMessage(titleKey);
      if (t && t !== titleKey) doc.title = t;
    } else if (doc.title && catalog && catalog[doc.title]) {
      doc.title = getMessage(doc.title);
    }
  }

  async function requestCatalogFromBackground(lang) {
    const response = await chrome.runtime.sendMessage({ Message: "ruxgetLocaleCatalog", lang: lang });
    if (response && response.ok && response.catalog) {
      return { lang: response.lang || lang, catalog: response.catalog };
    }
    const err = (response && response.error) || "locale catalog unavailable";
    throw new Error(err);
  }

  async function fetchCatalogLocally(lang) {
    // Extension pages (popup/options/html) can fetch their own package URLs.
    // Content scripts must not rely on this path — Chrome may block it and leave Errors badges.
    const url = chrome.runtime.getURL("_locales/" + lang + "/messages.json");
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status + " loading " + url);
    return { lang: lang, catalog: await res.json() };
  }

  function isExtensionPage() {
    try {
      return typeof location !== "undefined" && location.protocol === "chrome-extension:";
    } catch (e) {
      return false;
    }
  }

  // Extension pages share localStorage, so the preference is mirrored there for pages that translate synchronously
  // while loading (js/polyfill.js reads it). Only on extension pages: in a content script localStorage is the website's.
  function writeMirror(pref) {
    if (!isExtensionPage()) return;
    try {
      if (typeof RuxgetPageLocale !== "undefined" && RuxgetPageLocale.writeMirror) { RuxgetPageLocale.writeMirror(pref); return; }
      if (global.localStorage && global.localStorage.getItem(STORAGE_KEY) !== pref) global.localStorage.setItem(STORAGE_KEY, pref);
    } catch (e) {}
  }

  // Lets the bare i18n.key / i18n("key") of js/polyfill.js follow this catalog too (its const i18n shadows window.i18n).
  function shareCatalog() {
    try {
      if (typeof RuxgetPageLocale !== "undefined" && RuxgetPageLocale.use) RuxgetPageLocale.use(currentLang, catalog);
    } catch (e) {}
  }

  async function loadCatalog(lang) {
    let loaded = null;
    // Pages that load js/ruxget-locale-data.js already have every catalog.
    const bundled = global.RuxgetLocaleData && global.RuxgetLocaleData[lang];
    if (bundled) {
      catalog = bundled;
      currentLang = lang;
      installI18nProxy();
      shareCatalog();
      return catalog;
    }
    // Prefer the service worker: it can always read extension package URLs.
    try {
      loaded = await requestCatalogFromBackground(lang);
    } catch (e) {
      if (isExtensionPage()) {
        loaded = await fetchCatalogLocally(lang);
      } else {
        throw e;
      }
    }
    catalog = loaded.catalog;
    currentLang = loaded.lang;
    installI18nProxy();
    shareCatalog();
    return catalog;
  }

  let initPrevious = null;
  async function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      let pref = "auto";
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        if (stored && stored[STORAGE_KEY]) pref = stored[STORAGE_KEY];
      } catch (e) {}
      writeMirror(pref);
      const lang = resolveLang(pref);
      try {
        initPrevious = catalog;
        await loadCatalog(lang);
      } catch (e) {
        if (!localeLoadWarned) {
          localeLoadWarned = true;
          console.warn("Ruxget locale load failed (content script will use chrome.i18n fallback)", e);
        }
        catalog = null;
        currentLang = browserLang();
      }
      return { lang: currentLang, pref: pref };
    })();
    return readyPromise;
  }

  // 0.4.74: text that code writes (pick(...), t(...)) and that has to follow a language switch while the page stays open.
  // live(el, render) writes render() now and again after every switch, unless other code has written something else
  // there since (then that code owns the element). attr is "textContent" (default) or an attribute name.
  const liveTexts = new Map();
  const readLive = (el, attr) => attr === "textContent" ? el.textContent : el.getAttribute(attr);
  const writeLive = (el, attr, value) => { if (attr === "textContent") el.textContent = value; else el.setAttribute(attr, value); };
  function live(el, render, attr) {
    if (!el) return "";
    attr = attr || "textContent";
    let value = "";
    try { value = String(render() ?? ""); } catch (e) {}
    writeLive(el, attr, value);
    let entry = liveTexts.get(el);
    if (!entry) {
      // 0.4.74: a panel left open reads many lists; forget elements that are gone so the map doesn't keep growing.
      if (liveTexts.size > 300) for (const old of liveTexts.keys()) if (!old.isConnected) liveTexts.delete(old);
      liveTexts.set(el, entry = {});
    }
    entry[attr] = { render: render, value: value };
    return value;
  }
  function rerenderLive() {
    for (const [el, entry] of liveTexts) {
      for (const attr of Object.keys(entry)) {
        const item = entry[attr];
        if (!el.isConnected || readLive(el, attr) !== item.value) { delete entry[attr]; continue; }
        try { item.value = String(item.render() ?? ""); writeLive(el, attr, item.value); } catch (e) { delete entry[attr]; }
      }
      if (!Object.keys(entry).length) liveTexts.delete(el);
    }
  }
  // Static markup first, then the page's own renderers (the event), then the live texts (they may read labels the event
  // has just rewritten, such as a button name quoted in a note).
  function announce(detail) {
    try { document.dispatchEvent(new CustomEvent("ruxget-i18n-applied", { detail: detail })); } catch (e) {}
    rerenderLive();
  }

  async function setLanguage(pref) {
    if (pref !== "auto" && pref !== "en" && pref !== "zh_CN") pref = "auto";
    await chrome.storage.local.set({ [STORAGE_KEY]: pref });
    writeMirror(pref);
    const lang = resolveLang(pref);
    const previous = catalog;
    await loadCatalog(lang);
    // This page asked for the change: it switches in place now and is never reloaded for it (js/polyfill.js).
    try { if (typeof RuxgetPageLocale !== "undefined" && RuxgetPageLocale.changedHere) RuxgetPageLocale.changedHere(currentLang); } catch (e) {}
    applyDom(document, previous);
    announce({ lang: lang, pref: pref });
    try {
      chrome.runtime.sendMessage({ Message: "ruxgetLocaleChanged", lang: lang, pref: pref });
    } catch (e) {}
    return { lang: currentLang, pref: pref };
  }

  try {
    if (typeof document !== "undefined" && typeof location !== "undefined" && location.protocol === "chrome-extension:" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes[STORAGE_KEY]) return;
        const pref = changes[STORAGE_KEY].newValue || "auto", lang = resolveLang(pref);
        writeMirror(pref);
        if (lang === currentLang) return;
        const previous = catalog;
        loadCatalog(lang).then(function () {
          applyDom(document, previous);
          announce({ lang: lang, pref: pref });
        }).catch(function () {});
      });
    }
  } catch (e) {}

  function t(key, substitutions) {
    return getMessage(key, substitutions);
  }

  /** Dual-string helper for code that still embeds Chinese literals. */
  function pick(zh, en) {
    return currentLang === "en" ? en : zh;
  }

  // 0.4.73: extension pages that load js/ruxget-locale-data.js start in the language mirrored in localStorage (see
  // RuxgetPageLocale in js/polyfill.js) instead of painting Chinese until the catalog arrives from the service worker.
  // init() still reads the real setting and corrects the page if the mirror was stale.
  let startLang = null;
  function reveal() {
    try { if (document.documentElement.style.visibility === "hidden") document.documentElement.style.removeProperty("visibility"); } catch (e) {}
  }
  try {
    if (typeof document !== "undefined" && isExtensionPage() && global.RuxgetLocaleData) {
      let mirror = null;
      try { mirror = global.localStorage.getItem(STORAGE_KEY); } catch (e) {}
      const lang = resolveLang(mirror);
      if (global.RuxgetLocaleData[lang]) {
        catalog = global.RuxgetLocaleData[lang];
        currentLang = startLang = lang;
        installI18nProxy();
        shareCatalog();
        // The markup is Chinese: an English page stays unpainted until its text is applied (at most 400 ms), so a
        // frame painted while the deferred scripts load can't show Chinese first.
        if (lang === "en" && document.documentElement) {
          document.documentElement.style.visibility = "hidden";
          setTimeout(reveal, 400);
        }
      }
    }
  } catch (e) {}

  global.RuxgetI18n = {
    STORAGE_KEY,
    init,
    setLanguage,
    applyDom,
    t,
    pick,
    live,
    getLang: function () { return currentLang; },
    getMessage,
    ready: function () { return readyPromise || init(); }
  };

  const whenParsed = function (run) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  };
  if (startLang) whenParsed(function () { try { applyDom(document); } finally { reveal(); } });
  // Kick off early; pages that need translations should await RuxgetI18n.ready()
  init().then(function () {
    whenParsed(function () {
      applyDom(document, initPrevious || catalog);
      // The mirror was stale: code that rendered text in the start language renders it again.
      if (startLang && startLang !== currentLang) announce({ lang: currentLang });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
