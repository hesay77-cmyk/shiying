(function () {
    // 0.4.74: the labels written here are written again when the interface language changes while the page is open
    // (RuxgetPageLocale.onChange in js/polyfill.js). <i18n>key</i18n> and data-i18n-outer elements become plain text
    // nodes, as before, but the key is kept with the node. Elements marked data-i18n-live are rendered by the page's
    // own code after the first load.
    const replaced = [];
    const message = key => i18n(key) ?? key;
    function asText(element, key) {
        const node = document.createTextNode(message(key));
        element.replaceWith(node);
        replaced.push({ node, key });
    }
    document.querySelectorAll('[data-i18n]').forEach(function (element) {
        element.innerHTML = message(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-outer]').forEach(function (element) {
        asText(element, element.dataset.i18nOuter);
    });
    document.querySelectorAll('i18n').forEach(function (element) {
        asText(element, element.innerHTML.trim());
    });
    // data-i18n-label: a label followed by its value, with the colon of the interface language (「选择视频：」, "Video: ").
    const colon = lang => lang === 'en' ? ': ' : '：';
    document.querySelectorAll('[data-i18n-label]').forEach(function (element) {
        element.textContent = i18nLabel(message(element.dataset.i18nLabel));
    });
    function attributes() {
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
            element.setAttribute('placeholder', message(element.dataset.i18nPlaceholder));
        });
        // 0.4.73: tooltips follow the interface language too (they were English in the Chinese interface).
        document.querySelectorAll('[data-i18n-title]').forEach(function (element) {
            const text = i18n(element.dataset.i18nTitle);
            if (text) element.setAttribute('title', text);
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(function (element) {
            const text = i18n(element.dataset.i18nAria);
            if (text) element.setAttribute('aria-label', text);
        });
    }
    attributes();
    const titleKey = document.title;
    let shownTitle = document.title = i18n(titleKey) || titleKey;
    // The Ruxget interface language, not Chrome's (see RuxgetPageLocale in js/polyfill.js).
    if (typeof RuxgetPageLocale !== 'undefined' && RuxgetPageLocale.lang) document.documentElement.lang = RuxgetPageLocale.lang === 'en' ? 'en' : 'zh-CN';
    if (typeof RuxgetPageLocale === 'undefined' || !RuxgetPageLocale.onChange) return;

    // A language switch rewrites only what is still the page's static label, in the old language. Text the page has
    // written there since (「关闭」 on the play button, 「恢复参数」, 「验证中」, 「启用」) belongs to the page: when it is a
    // message of the old language it becomes the same message in the new one, otherwise it is left alone.
    const template = document.createElement('template');
    const asHtml = text => { template.innerHTML = text; return template.innerHTML; };
    function reverse(lang) {
        const map = new Map(), entries = RuxgetPageLocale.catalogFor && RuxgetPageLocale.catalogFor(lang);
        if (!entries) return map;
        for (const key of Object.keys(entries)) {
            const text = entries[key] && entries[key].message;
            if (typeof text !== 'string' || !text || text.includes('$')) continue;
            const html = asHtml(text);
            if (map.has(html)) map.get(html).push(key); else map.set(html, [key]);
        }
        return map;
    }
    RuxgetPageLocale.onChange(function (lang, previous) {
        const old = key => RuxgetPageLocale.message ? RuxgetPageLocale.message(previous, key) : '';
        let oldMessages = null;
        const follow = (current, key, html) => {
            const was = old(key);
            if (current === key || was && current === (html ? asHtml(was) : was)) return i18n(key) || null;
            oldMessages = oldMessages || reverse(previous);
            const keys = oldMessages.get(html ? current : asHtml(current));
            // Several keys with this text (「关闭」 is close and flowClose): only when they agree in the new language.
            const texts = new Set((keys || []).map(other => i18n(other) || ''));
            return texts.size === 1 ? [...texts][0] || null : null;
        };
        document.querySelectorAll('[data-i18n]:not([data-i18n-live])').forEach(function (element) {
            const text = follow(element.innerHTML, element.dataset.i18n, true);
            if (text) element.innerHTML = text;
        });
        for (const item of replaced) if (item.node.isConnected) item.node.data = message(item.key);
        document.querySelectorAll('[data-i18n-label]').forEach(function (element) {
            const key = element.dataset.i18nLabel, was = old(key);
            if (element.textContent === (was || key) + colon(previous)) element.textContent = i18nLabel(message(key));
        });
        for (const [selector, attribute, name] of [['[data-i18n-placeholder]', 'placeholder', 'i18nPlaceholder'], ['[data-i18n-title]', 'title', 'i18nTitle'], ['[data-i18n-aria]', 'aria-label', 'i18nAria']]) {
            document.querySelectorAll(selector).forEach(function (element) {
                const current = element.getAttribute(attribute);
                const text = current == null ? i18n(element.dataset[name]) : follow(current, element.dataset[name], false);
                if (text) element.setAttribute(attribute, text);
            });
        }
        // Only the page's own title: the downloader shows its progress there instead.
        const title = i18n(titleKey);
        if (title && document.title === shownTitle) shownTitle = document.title = title;
    });
})();
