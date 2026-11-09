// The panel side of the desktop offer (0.4.58):
// - the card at the top, when a large Chrome download opened the panel (see ruxget-offer.js for the pacing);
// - the "大文件交给桌面版" row at the bottom: always there, one click turns takeover on or off;
// - large files Chrome is downloading right now (and not nearly done), each with "改用桌面版".
// Whether the desktop app is installed is only known once Chrome may talk to it, so before that the card speaks
// to both cases; after the click, a missing app turns the card into "下载桌面版" right there.
// Nothing here opens a window by itself; tabs open only when the person clicks "下载桌面版" or "设置".
(() => {
    const card = document.getElementById('offerCard'), toggle = document.getElementById('desktopTakeover');
    const note = document.getElementById('desktopRowNote'), big = document.getElementById('chromeBig');
    if (!card || !toggle || typeof RuxgetOffer === 'undefined' || typeof RuxgetTakeover === 'undefined') return;
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh;
    const toast = text => { if (typeof notify === 'function') notify(text); };
    const MB = 1024 * 1024;
    const size = bytes => bytes >= 1024 * MB ? (bytes / 1024 / MB).toFixed(1) + ' GB' : Math.max(1, Math.round(bytes / MB)) + ' MB';
    // Chrome's file name once it has one; before that the link's last part.
    const fromUrl = url => { try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch { return ''; } };
    const fileName = (item, fallback) => String(item?.filename || '').split(/[\\/]/).pop() || fallback || fromUrl(item?.finalUrl || item?.url) || pick('这个文件', 'this file');
    const releaseUrl = () => typeof ShiyingNative !== 'undefined' ? ShiyingNative.DESKTOP_RELEASE_URL : 'https://hidaydream.cloud/ruxget/desktop/?from=ext';
    const install = () => chrome.tabs.create({url: releaseUrl()});
    let desk = 'unpermitted', busy = false, justMissing = false, shownCard = '', shownList = '';
    function button(label, className, handler, aria) {
        const element = document.createElement('button');
        element.type = 'button'; element.className = className; element.textContent = label;
        if (aria) element.setAttribute('aria-label', aria);
        element.addEventListener('click', handler); return element;
    }
    // After a click: Chrome asks once to let Ruxget talk to the desktop app, then a ping says whether it is there.
    // A missing app is answered in place (the card or the row offers the download); nothing opens by itself.
    // What the click was for is noted first: if Chrome's permission prompt closes the panel, the worker finishes it.
    async function connect(intent) {
        await chrome.storage.session.set({[RuxgetOffer.INTENT]: Object.assign({at: Date.now()}, intent)}).catch(() => {});
        let granted = false;
        try { granted = await chrome.permissions.request({permissions: ['nativeMessaging']}); } catch { granted = false; }
        await chrome.storage.session.remove(RuxgetOffer.INTENT).catch(() => {});
        if (!granted) { toast(pick('你没有允许 Ruxget 连接桌面版，Chrome 下载照常进行', 'You didn’t allow Ruxget to connect to the desktop app; Chrome keeps downloading as usual')); return 'denied'; }
        desk = await RuxgetOffer.desktop();
        if (desk === 'missing') { justMissing = true; toast(pick('还没装桌面版：先下载安装（免费，3 MB）', 'Ruxget Desktop isn’t installed yet: get it first (free, 3 MB)')); }
        if (desk === 'unknown') { toast(pick('桌面版没有响应，打开连接设置看看', 'Ruxget Desktop didn’t answer; opening its connection settings')); chrome.tabs.create({url: chrome.runtime.getURL('shiying-desktop.html#connection')}); }
        return desk;
    }
    async function handOver(id) {
        const reply = await chrome.runtime.sendMessage({Message: 'ruxgetHandOver', id}).catch(() => null);
        return reply || {ok: false, result: 'chrome', error: 'no reply'};
    }
    // "改用桌面版" / "以后交给桌面版" on the card, or the switch: takeover on, and the card's running file moves now.
    async function turnOn(offer) {
        if (await connect({kind: 'on', card: !!offer, id: offer?.id ?? null}) !== 'ready') return false;
        const minMB = await RuxgetOffer.turnOn();
        if (offer) await RuxgetOffer.answer('yes');
        const moved = offer && offer.id != null ? await handOver(offer.id) : null;
        if (moved?.ok) toast(pick(`已交给桌面版。以后 Chrome 里 ${minMB} MB 以上的文件也交给它`, `Handed to Ruxget Desktop. Chrome files over ${minMB} MB will go there too`));
        else if (moved && moved.error && moved.error !== 'gone' && moved.error !== 'finished') toast(pick(`这个文件桌面版接不了，仍由 Chrome 下载；以后 ${minMB} MB 以上的会交给桌面版`, `Ruxget Desktop can’t take this file, so Chrome keeps it; files over ${minMB} MB will go to the desktop from now on`));
        else toast(pick(`已开启：以后 Chrome 里 ${minMB} MB 以上的文件交给桌面版`, `On: Chrome files over ${minMB} MB now go to Ruxget Desktop`));
        return true;
    }
    async function renderCard() {
        const [offer, config, state] = await Promise.all([RuxgetOffer.card(), RuxgetTakeover.settings(), RuxgetOffer.state()]);
        if (!offer || config.enabled) { if (!card.hidden || shownCard) { card.hidden = true; card.replaceChildren(); shownCard = ''; } return; }
        const [item] = await chrome.downloads.search({id: offer.id}).catch(() => []);
        const movable = RuxgetOffer.early(item), done = item?.state === 'complete', name = fileName(item, offer.name), bytes = RuxgetOffer.size(item) || offer.size;
        const minMB = RuxgetOffer.minFor(config), ready = desk === 'ready', missing = desk === 'missing';
        const key = JSON.stringify([desk, movable, done, name, bytes, minMB, state.asked, justMissing, document.documentElement.lang]);
        if (key === shownCard) return;
        shownCard = key;
        const text = document.createElement('p'), actions = document.createElement('div'), small = document.createElement('p');
        actions.className = 'offer-actions'; small.className = 'offer-small';
        const file = () => { const strong = document.createElement('span'); strong.className = 'offer-name'; strong.textContent = pick(`${name}（${size(bytes)}）`, `${name} (${size(bytes)})`); return strong; };
        let primary, act;
        if (missing) {
            text.textContent = justMissing
                ? pick('还没装 Ruxget 桌面版。装好后，大文件多线程下载更快，断了能续传。免费，没有广告。', 'Ruxget Desktop isn’t installed yet. Once it is, large files download faster with several connections and resume after a break. Free, no ads.')
                : pick('大文件可以用 Ruxget 桌面版下载：多线程更快，断了能续传。免费，没有广告。', 'Large files can download with Ruxget Desktop: faster with several connections, and it resumes after a break. Free, no ads.');
            small.textContent = movable ? pick('这次的文件照常由 Chrome 下完', 'This file keeps downloading in Chrome') : '';
            primary = pick('下载桌面版（3 MB）', 'Get Ruxget Desktop (3 MB)');
            act = async () => { await RuxgetOffer.answer('yes'); install(); };
        } else {
            if (movable) text.append(pick('正在用 Chrome 下载 ', 'Chrome is downloading '), file(), pick('。', '. '));
            else if (done) text.append(pick('刚才用 Chrome 下载了 ', 'Chrome just downloaded '), file(), pick('。', '. '));
            text.append(movable
                ? pick('交给 Ruxget 桌面版：多线程更快，断了能续传。', 'Ruxget Desktop is faster with several connections, and resumes after a break.')
                : pick('以后大文件可以交给 Ruxget 桌面版：多线程更快，断了能续传。', 'Next time, Ruxget Desktop can take large files: faster, and it resumes after a break.'));
            if (!ready) text.append(pick('免费，没有广告。', ' Free, no ads.'));
            small.textContent = ready
                ? pick(`以后 Chrome 里 ${minMB} MB 以上的文件也交给它`, `Chrome files over ${minMB} MB will go there from now on`)
                : pick('已经装了就直接接过去；还没装的，下一步可以下载（免费，3 MB）', 'If it’s installed it takes over right away; if not, you can get it next (free, 3 MB)');
            primary = movable ? pick('改用桌面版', 'Use Ruxget Desktop') : pick('以后交给桌面版', 'Use Ruxget Desktop from now on');
            act = () => turnOn(movable ? offer : Object.assign({}, offer, {id: null}));
        }
        actions.append(button(primary, 'offer-primary', async () => {
            if (busy) return; busy = true;
            try { await act(); } finally { busy = false; shownCard = ''; render().catch(() => {}); }
        }));
        actions.append(button(pick('不用了', 'No thanks'), 'offer-quiet', async () => { await RuxgetOffer.answer('no'); render().catch(() => {}); }));
        if (state.asked >= 2) actions.append(button(pick('不再提示', 'Don’t ask again'), 'offer-quiet', async () => { await RuxgetOffer.answer('never'); render().catch(() => {}); }));
        card.replaceChildren(text, actions, ...(small.textContent ? [small] : []));
        card.hidden = false;
    }
    async function renderRow() {
        const config = await RuxgetTakeover.settings();
        toggle.checked = !!config.enabled; toggle.disabled = busy;
        const offer = await RuxgetOffer.card();
        // Large Chrome downloads that are still early (takeover off): each can move to the desktop with one click.
        // The file the card already talks about isn't listed twice.
        const running = config.enabled || desk === 'missing' ? [] : (await chrome.downloads.search({state: 'in_progress'}).catch(() => []))
            .filter(item => RuxgetOffer.fits(item) && RuxgetOffer.early(item) && item.id !== offer?.id).slice(0, 2);
        const key = JSON.stringify([config.enabled, config.minMB, desk, running.map(item => [item.id, fileName(item), RuxgetOffer.size(item)]), document.documentElement.lang]);
        if (key === shownList) return;
        shownList = key;
        note.replaceChildren();
        if (config.enabled) {
            note.append(pick(`Chrome 里 ${config.minMB} MB 以上的文件会交给桌面版 · `, `Chrome files over ${config.minMB} MB go to Ruxget Desktop · `),
                button(pick('设置', 'Settings'), '', () => chrome.tabs.create({url: chrome.runtime.getURL('shiying-desktop.html#takeover')})));
        } else if (desk === 'missing') {
            note.append(pick('需要先安装桌面版（免费，3 MB） · ', 'Needs Ruxget Desktop (free, 3 MB) · '), button(pick('下载', 'Get it'), '', install));
        } else if (desk !== 'ready') {
            note.append(pick('需要配套的 Ruxget 桌面版 · 还没装？', 'Needs Ruxget Desktop · Not installed? '), button(pick('下载（3 MB）', 'Get it (3 MB)'), '', install));
        }
        note.hidden = !note.childNodes.length;
        big.replaceChildren(...running.map(item => {
            const line = document.createElement('li'), label = document.createElement('span'), name = fileName(item);
            label.textContent = pick(`Chrome 正在下载 ${name}（${size(RuxgetOffer.size(item))}）`, `Chrome: ${name} (${size(RuxgetOffer.size(item))})`);
            line.append(label, button(pick('改用桌面版', 'Use Ruxget Desktop'), '', async () => {
                if (busy) return; busy = true;
                try {
                    if (await connect({kind: 'move', id: item.id}) !== 'ready') return;
                    const moved = await handOver(item.id);
                    toast(moved.ok ? pick('已交给桌面版', 'Handed to Ruxget Desktop') : pick('这个文件桌面版接不了，仍由 Chrome 下载', 'Ruxget Desktop can’t take this file, so Chrome keeps it'));
                } finally { busy = false; shownList = ''; render().catch(() => {}); }
            }, pick(`改用桌面版下载 ${name}`, `Download ${name} with Ruxget Desktop`)));
            return line;
        }));
        big.hidden = !running.length;
    }
    toggle.addEventListener('change', async () => {
        if (busy) return; busy = true;
        try {
            if (toggle.checked) {
                const offer = await RuxgetOffer.card();
                if (!await turnOn(offer && !card.hidden ? offer : null)) toggle.checked = false;
            } else {
                await RuxgetOffer.turnOff();
                toast(pick('已关闭：Chrome 下载不再交给桌面版', 'Off: Chrome keeps its downloads'));
            }
        } finally { busy = false; shownList = ''; shownCard = ''; render().catch(() => {}); }
    });
    let timer = 0;
    function render() { return Promise.all([renderCard(), renderRow()]); }
    const later = () => { clearTimeout(timer); timer = setTimeout(() => render().catch(() => {}), 200); };
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.ruxgetTakeover || changes[RuxgetOffer.CARD] || changes[RuxgetOffer.KEY])) later(); });
    // Chrome names a file a moment after it starts; the card and the list follow.
    chrome.downloads.onChanged?.addListener(change => { if (change.state || change.totalBytes || change.filename) later(); });
    chrome.downloads.onCreated?.addListener(later);
    document.addEventListener('ruxget-i18n-applied', () => { shownCard = ''; shownList = ''; later(); });
    // Ask the desktop first (a quick local ping) so the card doesn't switch wording after it appears.
    // A click the worker finished after the panel closed may have found the app missing: say so the same way.
    chrome.storage.session.get(RuxgetOffer.MISSING).then(value => { if (value[RuxgetOffer.MISSING]) justMissing = true; }).catch(() => {});
    const asked = Promise.race([RuxgetOffer.desktop().then(value => { desk = value; }), new Promise(resolve => setTimeout(resolve, 800))]).catch(() => {});
    Promise.all([asked, window.RuxgetI18n ? RuxgetI18n.ready() : null]).catch(() => {})
        .then(() => render()).then(() => asked).then(() => render()).catch(() => {});
})();

// The ⋯ menu: Chrome sizes the panel to its content, so with little on the page the open menu would be cut off and
// scroll. While it is open, the page is made tall enough for the whole menu.
(() => {
    const menu = document.querySelector('details.menu'), panel = menu?.querySelector('.menu-panel');
    if (!menu || !panel) return;
    const fit = () => {
        document.body.style.minHeight = '';
        if (!menu.open) return;
        const bottom = Math.ceil(panel.getBoundingClientRect().top + window.scrollY + panel.scrollHeight + 12);
        if (bottom > document.body.scrollHeight) document.body.style.minHeight = bottom + 'px';
    };
    menu.addEventListener('toggle', fit);
    document.addEventListener('ruxget-i18n-applied', fit);
})();
