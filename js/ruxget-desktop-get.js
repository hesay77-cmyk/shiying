// One "下载 Ruxget 桌面版" link, the same on every Ruxget page (settings, desktop app page, help): put an element with
// data-desktop-get where it belongs. The link goes to the website's download section, marked as coming from the
// extension (?from=ext) for the site's own visit count.
(() => {
    const URL_ = 'https://hidaydream.cloud/desktop/?from=ext';
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh;
    function render() {
        document.querySelectorAll('[data-desktop-get]').forEach(slot => {
            let link = slot.querySelector('a.desktop-get');
            if (!link) { link = document.createElement('a'); link.className = 'desktop-get'; link.href = URL_; link.target = '_blank'; link.rel = 'noopener'; slot.append(link); }
            link.textContent = pick('下载 Ruxget 桌面版（免费，3 MB）', 'Get Ruxget Desktop (free, 3 MB)');
        });
    }
    render();
    if (window.RuxgetI18n) RuxgetI18n.ready().then(render).catch(() => {});
    document.addEventListener('ruxget-i18n-applied', render);
    window.RuxgetDesktopGet = {render, url: URL_};
})();
