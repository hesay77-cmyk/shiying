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

  function applyDom(root) {
    const doc = root || document;
    doc.querySelectorAll("[data-i18n]").forEach(function (el) {
      if (el.hasAttribute("data-i18n-live")) return;
      const key = el.dataset.i18n;
      const text = getMessage(key);
      if (text && text !== key) el.innerHTML = text;
    });
    doc.querySelectorAll("[data-i18n-outer]").forEach(function (el) {
      const key = el.dataset.i18nOuter;
      const text = getMessage(key);
      if (text && text !== key) el.outerHTML = text;
    });
    doc.querySelectorAll("i18n").forEach(function (el) {
      const key = el.innerHTML.trim();
      const text = getMessage(key);
      if (text && text !== key) el.outerHTML = text;
    });
    doc.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      const key = el.dataset.i18nPlaceholder;
      const text = getMessage(key);
      if (text && text !== key) el.setAttribute("placeholder", text);
    });
    doc.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const key = el.dataset.i18nTitle;
      const text = getMessage(key);
      if (text && text !== key) el.setAttribute("title", text);
    });
    doc.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      const key = el.dataset.i18nAria;
      const text = getMessage(key);
      if (text && text !== key) el.setAttribute("aria-label", text);
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

  async function loadCatalog(lang) {
    let loaded = null;
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
    return catalog;
  }

  async function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      let pref = "auto";
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        if (stored && stored[STORAGE_KEY]) pref = stored[STORAGE_KEY];
      } catch (e) {}
      const lang = resolveLang(pref);
      try {
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

  async function setLanguage(pref) {
    if (pref !== "auto" && pref !== "en" && pref !== "zh_CN") pref = "auto";
    await chrome.storage.local.set({ [STORAGE_KEY]: pref });
    const lang = resolveLang(pref);
    await loadCatalog(lang);
    applyDom(document);
    try {
      document.dispatchEvent(new CustomEvent("ruxget-i18n-applied", { detail: { lang: lang, pref: pref } }));
    } catch (e) {}
    try {
      chrome.runtime.sendMessage({ Message: "ruxgetLocaleChanged", lang: lang, pref: pref });
    } catch (e) {}
    return { lang: currentLang, pref: pref };
  }

  function t(key, substitutions) {
    return getMessage(key, substitutions);
  }

  /** Dual-string helper for code that still embeds Chinese literals. */
  function pick(zh, en) {
    return currentLang === "en" ? en : zh;
  }

  global.RuxgetI18n = {
    STORAGE_KEY,
    init,
    setLanguage,
    applyDom,
    t,
    pick,
    getLang: function () { return currentLang; },
    getMessage,
    ready: function () { return readyPromise || init(); }
  };

  // Kick off early; pages that need translations should await RuxgetI18n.ready()
  init().then(function () {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { applyDom(document); });
    } else {
      applyDom(document);
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
