// Ruxget：常用下载页保持简洁，原有高级能力仍可展开。
// Text follows the Ruxget interface language through i18n (js/polyfill.js); the English fallback is only for harnesses
// that load this file without the page's other scripts (scripts/layout-review.cjs).
const toolText = (key, fallback) => (typeof i18n !== 'undefined' && i18n[key]) || fallback;
document.body.classList.add('shiying-tool');
const heading = document.createElement('header');
heading.className = 'shiying-tool-heading';
const logo = document.createElement('img');
logo.src = 'img/shiying.svg'; logo.alt = ''; logo.width = 42; logo.height = 42;
const title = document.createElement('div');
const name = document.createElement('h1');
name.textContent = location.pathname.endsWith('/downloader.html') ? toolText('titleDownload', 'Ruxget · File Download') : toolText('titleM3U8', 'Ruxget · Video Download');
const source = document.createElement('p');
source.textContent = new URLSearchParams(location.search).get('title') || toolText('toolKeepPageOpen', 'Keep this page open. Download progress appears here.');
title.append(name, source);
const advanced = document.createElement('button');
advanced.textContent = toolText('toolShowAdvanced', 'Show advanced options');
advanced.setAttribute('aria-pressed','false');
advanced.addEventListener('click', () => {
    const open = document.body.classList.toggle('advanced');
    advanced.textContent = open ? toolText('toolHideAdvanced', 'Hide advanced options') : toolText('toolShowAdvanced', 'Show advanced options');
    advanced.setAttribute('aria-pressed',String(open));
});
heading.append(logo,title,advanced);
document.body.prepend(heading);
// 0.4.74: the heading follows a language switch made while the page is open.
if (typeof RuxgetPageLocale !== 'undefined' && RuxgetPageLocale.onChange) RuxgetPageLocale.onChange(() => {
    name.textContent = location.pathname.endsWith('/downloader.html') ? toolText('titleDownload', 'Ruxget · File Download') : toolText('titleM3U8', 'Ruxget · Video Download');
    if (!new URLSearchParams(location.search).get('title')) source.textContent = toolText('toolKeepPageOpen', 'Keep this page open. Download progress appears here.');
    const open = document.body.classList.contains('advanced');
    advanced.textContent = open ? toolText('toolHideAdvanced', 'Hide advanced options') : toolText('toolShowAdvanced', 'Show advanced options');
});
