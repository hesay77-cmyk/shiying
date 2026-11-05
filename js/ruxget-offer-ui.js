// The panel side of the desktop offer (0.4.56):
// - the card at the top, when a large Chrome download opened the panel (see ruxget-offer.js for the pacing);
// - the "大文件交给桌面版" row at the bottom: always there, one click turns takeover on or off;
// - large files Chrome is downloading right now, each with "改用桌面版".
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
    const releaseUrl = () => typeof ShiyingNative !== 'undefined' ? ShiyingNative.DESKTOP_RELEASE_URL : 'https://hidaydream.cloud/?from=ext#editions';
    let desk = 'unknown', busy = false;
    function button(label, className, handler) {
        const element = document.createElement('button');
        element.type = 'button'; element.className = className; element.textContent = label;
        element.addEventListener('click', handler); return element;
    }
    // After a click: Chrome asks once to let Ruxget talk to the desktop app, then a ping says whether it is there.
    async function connect() {
        let granted = false;
        try { granted = await chrome.permissions.request({permissions: ['nativeMessaging']}); } catch { granted = false; }
        if (!granted) { toast(pick('没有允许连接桌面版，Chrome 下载照常进行', 'Not connected to Ruxget Desktop; Chrome keeps downloading as usual')); return 'denied'; }
        desk = await RuxgetOffer.desktop();
        if (desk === 'missing') chrome.tabs.create({url: releaseUrl()});
        if (desk === 'unknown') chrome.tabs.create({url: chrome.runtime.getURL('shiying-desktop.html#connection')});
        return desk;
    }
    async function handOver(id) {
        const reply = await chrome.runtime.sendMessage({Message: 'ruxgetHandOver', id}).catch(() => null);
        return reply || {ok: false, result: 'chrome', error: 'no reply'};
    }
    // "改用桌面版" / "以后交给桌面版" on the card, or the switch: takeover on, and the card's running file moves now.
    async function turnOn(offer) {
        const state = await connect();
        if (state !== 'ready') { if (offer && state === 'missing') await RuxgetOffer.answer('yes'); return false; }
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
        if (!offer || config.enabled) { card.hidden = true; card.replaceChildren(); return; }
        const [item] = await chrome.downloads.search({id: offer.id}).catch(() => []);
        const running = item?.state === 'in_progress', name = fileName(item, offer.name), bytes = RuxgetOffer.size(item) || offer.size;
        const text = document.createElement('p'), actions = document.createElement('div'), small = document.createElement('p');
        actions.className = 'offer-actions'; small.className = 'offer-small';
        if (desk === 'missing') {
            text.textContent = pick('大文件可以用 Ruxget 桌面版下载：多线程更快，断了能续传。免费，没有广告。', 'Large files can download with Ruxget Desktop: faster with several connections, and it resumes after a break. Free, no ads.');
            small.textContent = running ? pick('这次的文件照常由 Chrome 下完', 'This file keeps downloading in Chrome') : '';
        } else {
            const strong = document.createElement('span'); strong.className = 'offer-name'; strong.textContent = pick(`${name}（${size(bytes)}）`, `${name} (${size(bytes)})`);
            if (running) text.append(pick('正在用 Chrome 下载 ', 'Chrome is downloading '), strong, pick('。交给桌面版：多线程更快，断了能续传。', '. Ruxget Desktop is faster with several connections, and resumes after a break.'));
            else text.append(pick('刚才用 Chrome 下载了 ', 'Chrome just downloaded '), strong, pick('。以后大文件可以交给桌面版：多线程更快，断了能续传。', '. Next time, Ruxget Desktop can take large files: faster, and it resumes after a break.'));
            small.textContent = running ? pick(`以后 ${RuxgetOffer.MB} MB 以上的也交给它`, `Files over ${RuxgetOffer.MB} MB will go there from now on`) : '';
        }
        const primary = desk === 'missing' ? pick('下载桌面版（3 MB）', 'Get Ruxget Desktop (3 MB)') : running ? pick('改用桌面版', 'Use Ruxget Desktop') : pick('以后交给桌面版', 'Use it from now on');
        actions.append(button(primary, 'offer-primary', async () => {
            if (busy) return; busy = true;
            try {
                if (desk === 'missing') { await RuxgetOffer.answer('yes'); chrome.tabs.create({url: releaseUrl()}); }
                else await turnOn(running ? offer : Object.assign({}, offer, {id: null}));
            } finally { busy = false; render().catch(() => {}); }
        }));
        actions.append(button(pick('不用了', 'No thanks'), 'offer-quiet', async () => { await RuxgetOffer.answer('no'); render().catch(() => {}); }));
        if (state.asked >= 1) actions.append(button(pick('不再提示', 'Don’t ask again'), 'offer-quiet', async () => { await RuxgetOffer.answer('never'); render().catch(() => {}); }));
        card.replaceChildren(text, actions, ...(small.textContent ? [small] : []));
        card.hidden = false;
    }
    async function renderRow() {
        const config = await RuxgetTakeover.settings();
        toggle.checked = !!config.enabled; toggle.disabled = busy;
        note.replaceChildren();
        if (config.enabled) {
            note.append(pick(`Chrome 里 ${config.minMB} MB 以上的文件会交给桌面版 · `, `Chrome files over ${config.minMB} MB go to Ruxget Desktop · `),
                button(pick('设置', 'Settings'), '', () => chrome.tabs.create({url: chrome.runtime.getURL('shiying-desktop.html#takeover')})));
        } else if (desk === 'missing') {
            note.append(pick('需要先安装桌面版（免费，3 MB） · ', 'Needs Ruxget Desktop (free, 3 MB) · '), button(pick('安装', 'Install'), '', () => chrome.tabs.create({url: releaseUrl()})));
        }
        note.hidden = !note.childNodes.length;
        // Large files Chrome is downloading now (takeover off): each can move to the desktop with one click.
        // The file the card already talks about isn't listed twice.
        const offer = await RuxgetOffer.card();
        const running = config.enabled || desk === 'missing' ? [] : (await chrome.downloads.search({state: 'in_progress'}).catch(() => [])).filter(item => RuxgetOffer.fits(item) && item.id !== offer?.id).slice(0, 2);
        big.replaceChildren(...running.map(item => {
            const line = document.createElement('li'), label = document.createElement('span');
            label.textContent = pick(`Chrome 正在下载 ${fileName(item)}（${size(RuxgetOffer.size(item))}）`, `Chrome: ${fileName(item)} (${size(RuxgetOffer.size(item))})`);
            line.append(label, button(pick('改用桌面版', 'Use Ruxget Desktop'), '', async () => {
                if (busy) return; busy = true;
                try {
                    if (await connect() !== 'ready') return;
                    const moved = await handOver(item.id);
                    toast(moved.ok ? pick('已交给桌面版', 'Handed to Ruxget Desktop') : pick('这个文件桌面版接不了，仍由 Chrome 下载', 'Ruxget Desktop can’t take this file, so Chrome keeps it'));
                } finally { busy = false; render().catch(() => {}); }
            }));
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
        } finally { busy = false; render().catch(() => {}); }
    });
    let timer = 0;
    function render() { return Promise.all([renderCard(), renderRow()]); }
    const later = () => { clearTimeout(timer); timer = setTimeout(() => render().catch(() => {}), 200); };
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.ruxgetTakeover || changes[RuxgetOffer.CARD] || changes[RuxgetOffer.KEY])) later(); });
    // Chrome names a file a moment after it starts; the card and the list follow.
    chrome.downloads.onChanged?.addListener(change => { if (change.state || change.totalBytes || change.filename) later(); });
    chrome.downloads.onCreated?.addListener(later);
    document.addEventListener('ruxget-i18n-applied', later);
    // Ask the desktop first (a quick local ping) so the card doesn't switch wording after it appears.
    const asked = Promise.race([RuxgetOffer.desktop().then(value => { desk = value; }), new Promise(resolve => setTimeout(resolve, 800))]).catch(() => {});
    Promise.all([asked, window.RuxgetI18n ? RuxgetI18n.ready() : null]).catch(() => {})
        .then(() => render()).then(() => asked).then(() => render()).catch(() => {});
})();
