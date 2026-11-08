(function () {
    document.querySelectorAll('[data-i18n]').forEach(function (element) {
        element.innerHTML = i18n(element.dataset.i18n) ?? element.dataset.i18n;
    });
    document.querySelectorAll('[data-i18n-outer]').forEach(function (element) {
        element.outerHTML = i18n(element.dataset.i18nOuter) ?? element.dataset.i18nOuter;
    });
    document.querySelectorAll('i18n').forEach(function (element) {
        element.outerHTML = i18n(element.innerHTML) ?? element.innerHTML;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
        element.setAttribute('placeholder', i18n(element.dataset.i18nPlaceholder) ?? element.dataset.i18nPlaceholder);
    });
    // 0.4.73: tooltips follow the interface language too (they were English in the Chinese interface).
    document.querySelectorAll('[data-i18n-title]').forEach(function (element) {
        const text = i18n(element.dataset.i18nTitle);
        if (text) element.setAttribute('title', text);
    });
    document.title = i18n(document.title) || document.title;
    // The Ruxget interface language, not Chrome's (see RuxgetPageLocale in js/polyfill.js).
    if (typeof RuxgetPageLocale !== 'undefined' && RuxgetPageLocale.lang) document.documentElement.lang = RuxgetPageLocale.lang === 'en' ? 'en' : 'zh-CN';
})();