// 0.4.69: the panel has two tabs. "本页视频" finds and downloads what is on this page; "已下载" lists every recent
// download (Chrome's, site videos, Ruxget Desktop's) and opens a finished one on double-click.
// Which tab opens: "本页视频" when the page has something to download, otherwise "已下载". Once the person picks a
// tab (or does anything in "已下载"), Ruxget never switches it for them. A video found in the first moments after the
// panel opened on "已下载" brings "本页视频" back; later ones only update its count. Nothing shows until the choice is
// made, so the panel doesn't flash from one tab to the other.
(() => {
    const $ = selector => document.querySelector(selector);
    const tabs = {page: $('#tabPage'), downloads: $('#tabDownloads')}, panels = {page: $('#pageView'), downloads: $('#downloadsView')};
    if (!tabs.page || !tabs.downloads || !panels.page || !panels.downloads) return;
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh;
    let current = 'page', chosen = false, decidedAt = -1;
    function label() {
        tabs.page.querySelector('span').textContent = pick('本页视频', 'This page');
        tabs.downloads.querySelector('span').textContent = pick('已下载', 'Downloads');
        $('#viewTabs').setAttribute('aria-label', pick('Ruxget 视图', 'Ruxget views'));
    }
    function show(view, byPerson = false) {
        if (!tabs[view]) return;
        if (byPerson) chosen = true;
        current = view; document.body.dataset.view = view;
        for (const [name, tab] of Object.entries(tabs)) {
            const on = name === view;
            tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; panels[name].hidden = !on;
        }
        document.dispatchEvent(new CustomEvent('ruxget-view', {detail: view}));
    }
    // Something to download here: detected media, a supported site's video card, a netdisk share, or the
    // "允许此网站" step that has to come before Ruxget can look for videos on this site.
    const found = () => !document.body.classList.contains('no-media') || ['#platformCard', '#netdiskEntry', '#siteAccess'].some(id => $(id)?.hidden === false);
    // Called by shiying.js each time it has read the current page.
    function decide() { decidedAt = performance.now(); document.body.dataset.decided = '1'; if (!chosen) show(found() ? 'page' : 'downloads'); }
    // If reading the page fails or hangs, the panel still shows (on 本页视频, where the error is).
    setTimeout(() => { document.body.dataset.decided = '1'; }, 2500);
    const watch = new MutationObserver(() => { if (decidedAt >= 0 && performance.now() - decidedAt < 1500 && !chosen && current === 'downloads' && found()) show('page'); });
    watch.observe(document.body, {attributes: true, attributeFilter: ['class']});
    for (const id of ['#platformCard', '#netdiskEntry', '#siteAccess']) if ($(id)) watch.observe($(id), {attributes: true, attributeFilter: ['hidden']});
    // Working in either tab (a click, a key) is a choice too: the panel never turns away from what the person is doing.
    for (const panel of Object.values(panels)) for (const type of ['pointerdown', 'keydown']) panel.addEventListener(type, () => { chosen = true; });
    // A small number beside a tab: videos on this page, downloads running now.
    function count(view, n) {
        const badge = tabs[view]?.querySelector('.tab-count'); if (!badge) return;
        badge.hidden = !(n > 0); badge.textContent = n > 0 ? String(n) : '';
        badge.title = view === 'downloads' ? pick(`${n} 个正在下载`, `${n} downloading`) : pick(`${n} 个媒体`, `${n} media`);
    }
    const media = $('#count');
    if (media) new MutationObserver(() => count('page', Number(media.textContent) || 0)).observe(media, {childList: true, characterData: true, subtree: true});
    for (const [name, tab] of Object.entries(tabs)) tab.addEventListener('click', () => show(name, true));
    // Arrow keys move between tabs, as in any tab list.
    $('#viewTabs').addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = current === 'page' ? 'downloads' : 'page';
        const target = event.key === 'Home' ? 'page' : event.key === 'End' ? 'downloads' : next;
        show(target, true); tabs[target].focus();
    });
    label(); show('page');
    document.addEventListener('ruxget-i18n-applied', label);
    // The chosen language loads a moment after the page; label again once it is known.
    (window.RuxgetI18n ? RuxgetI18n.ready() : Promise.resolve()).catch(() => {}).then(label);
    window.RuxgetTabs = {show, decide, count, current: () => current};
})();
