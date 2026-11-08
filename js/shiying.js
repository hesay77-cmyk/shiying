// Ruxget，2026-10-12：无框架的中文主界面。
const $ = selector => document.querySelector(selector);
const packageVersion=chrome.runtime.getManifest?.().version;
if($('#extensionVersion')&&packageVersion)$('#extensionVersion').textContent='Ruxget · '+packageVersion;
document.documentElement.classList.toggle('popup',chrome.extension?.getViews({type:'popup'}).includes(window)||false);
let tabId, filter = 'all', media = [], toastTimer, currentSite, accessCandidates = [], accessPatterns = [];
const downloads = new Map();
const cards = new Map();
function notify(text) {
    // Notices are written in Chinese; the English UI shows them through the shared table (shiying-text.js).
    if (window.RuxgetText) text = RuxgetText.tr(text);
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').hidden = true, 3300);
}
function message(Message, extra = {}) { return chrome.runtime.sendMessage({Message, tabId, ...extra}); }
// An error shows at once, on 本页视频 where it is written (the tabs otherwise wait for the page to be read).
function failure(error) { if(error.cancelled)return;const source=error.message || String(error),text=RuxgetI18n.live($('#error'),()=>RuxgetText.tr(source)); $('#error').hidden = false; document.body.dataset.decided = '1'; if(window.RuxgetTabs?.current()==='downloads'&&typeof notify==='function')notify(text); }
function onClick(element, action) { element.addEventListener('click', () => Promise.resolve().then(action).catch(failure)); }
async function copy(url) { await navigator.clipboard.writeText(url); notify('链接已复制'); }
async function quality(data, card) {
    const result = await message('shiyingPlaylist', {data});
    if (!result.ok) throw new Error(result.error);
    const field = card.querySelector('.quality');
    const select = field.querySelector('select');
    field.hidden = false;
    select.replaceChildren(new Option(RuxgetI18n.pick('自动（不超过 1080p，可在下载页改选）', 'Auto (up to 1080p; change it on the download page)'), data.url));
    for (const variant of result.variants) select.add(new Option(variant.label, variant.url));
    select.disabled = result.separateAudio || !result.variants.length;
    field.querySelector('.quality-note').textContent = result.separateAudio ? RuxgetI18n.pick('这个视频的声音是独立音轨，请在下载页一起选择。', 'The audio is a separate track; choose it on the download page.') : (result.variants.length ? RuxgetI18n.pick('选好清晰度后点击下载。', 'Pick a quality, then download.') : RuxgetI18n.pick('这是单一清晰度的视频流。', 'This stream has a single quality.'));
}
// The page's own players, read when the list loads: they tell the main video apart from ads and previews.
let pageElements = [], showMinor = false, showAll = false, probeTimer = 0;
async function probePage() {
    if (typeof RuxgetFocus === 'undefined' || !tabId) return;
    const probed = tabId;
    const found = await RuxgetFocus.read(probed);
    if (probed !== tabId) return;
    pageElements = found; render();
}
function probeSoon() { clearTimeout(probeTimer); probeTimer = setTimeout(() => probePage().catch(() => {}), 700); }
// 0.4.77: the 「显示全部请求」 rows: what each request is, its size, its address to copy, and a download where one works.
function renderAllRequests(items, pick, kindOfItem = Shiying.kind) {
    let box = $('#allRequests');
    if (!box) { box = document.createElement('div'); box.id = 'allRequests'; box.className = 'all-requests'; $('#fragmentNote').after(box); }
    box.hidden = !items.length;
    // Players often load many pieces with the same file name from different folders: show the folder too then.
    const counts = new Map();for (const data of items) counts.set(Shiying.name(data), (counts.get(Shiying.name(data)) || 0) + 1);
    const shown = data => { const name = Shiying.name(data); if (counts.get(name) < 2) return name; try { const parts = new URL(data.url).pathname.split('/').filter(Boolean); return parts.slice(-2).map(part => { try { return decodeURIComponent(part); } catch { return part; } }).join('/'); } catch { return name; } };
    box.replaceChildren(...items.map(data => {
        const kind = kindOfItem(data), row = document.createElement('div'), info = document.createElement('div'), title = document.createElement('div'), meta = document.createElement('div');
        row.className = 'request-row'; info.className = 'request-info'; title.className = 'request-name'; meta.className = 'request-meta';
        title.textContent = shown(data); title.title = data.url;
        const label = kind === 'fragment' ? pick('切片，随播放列表下载', 'Segment, downloads with its playlist') : pick('其他', 'Other');
        meta.textContent = [label, (data.ext || '').toUpperCase(), data.size ? Shiying.size(Number(data.size)) : ''].filter(Boolean).join(' · ');
        info.append(title, meta);
        const copyButton = document.createElement('button'), down = document.createElement('button');
        copyButton.type = down.type = 'button'; copyButton.className = down.className = 'text-button';
        copyButton.textContent = pick('复制地址', 'Copy address');
        copyButton.addEventListener('click', () => copy(data.url).catch(failure));
        down.textContent = pick('下载', 'Download');
        down.hidden = kind === 'fragment';
        down.disabled = !Shiying.validURL(data.url);
        down.addEventListener('click', async () => {
            down.disabled = true;
            try { const result = await message('shiyingDownload', {data}); if (!result.ok) throw new Error(result.error); notify(result.page ? '已在新标签页中打开下载页' : '已交给 Chrome 下载'); }
            catch (error) { failure(error); } finally { down.disabled = false; }
        });
        row.append(info, copyButton, down);
        return row;
    }));
}
// 0.4.79: players that load a DASH or HLS playlist fetch its pieces as .m4v / .m4a / .mp4 / .ts files from folders under
// the playlist's own folder. Those are segments of that playlist, not videos of their own, so they fold with the rest.
function kindOf(item, playlists) {
    const kind = Shiying.kind(item);
    if (kind === 'hls' && playlists.length) { try { const url = new URL(item.url), folder = url.origin + url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1); if (playlists.some(dir => folder !== dir.full && folder.startsWith(dir.full))) return 'fragment'; } catch {} }
    if (!['video', 'audio'].includes(kind) || !playlists.length) return kind;
    const ext = String(item.ext || '').toLowerCase();
    if (!['m4v', 'm4a', 'm4s', 'mp4', 'ts', 'aac', 'cmfv', 'cmfa'].includes(ext)) return kind;
    try {
        const url = new URL(item.url), folder = url.origin + url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
        // In a sub-folder of the playlist's folder: a piece. In the same folder: only when its name looks numbered.
        const below = playlists.some(dir => folder !== dir.full && folder.startsWith(dir.full));
        const numbered = playlists.some(dir => folder === dir.full) && /(^|[_.-])(\d+|init|seg(ment)?\d*|chunk\d*)\.(m4v|m4a|m4s|mp4|ts|aac|cmfv|cmfa)$/i.test(url.pathname);
        return below || numbered ? 'fragment' : kind;
    } catch { return kind; }
}
function playlistFolders() {
    return media.filter(item => ['hls', 'dash'].includes(Shiying.kind(item))).map(item => { try { const url = new URL(item.url); return {full: url.origin + url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)}; } catch { return null; } }).filter(Boolean);
}
function render() {
    const folders = playlistFolders(), kindOfItem = item => kindOf(item, folders);
    const search = $('#search').value.trim().toLowerCase();
    const playable = media.filter(item => !['other', 'fragment'].includes(kindOfItem(item)));
    const matching = playable.filter(item => (filter === 'all' || (filter === 'audio' ? Shiying.kind(item) === 'audio' : Shiying.kind(item) !== 'audio')) && `${Shiying.name(item)} ${item.ext || ''}`.toLowerCase().includes(search));
    // Main video first, then the rest; ads, previews and tiny clips fold under one line unless searching.
    const focus = typeof RuxgetFocus === 'undefined' ? new Map() : RuxgetFocus.classify(playable, pageElements, Shiying.kind);
    // 0.4.71: a known size under 100 KB is a page sound (voice-search beeps, button clicks), not a video.
    const tiny = item => { const size = Number(item.size); return size > 0 && size < 102400 && !/^(m3u8|mpd|json)$/i.test(item.ext || ''); };
    for (const item of playable) if (tiny(item)) focus.set(item.url, 'minor');
    const real = playable.filter(item => !tiny(item)).length;
    const rank = item => ({main: 0, normal: 1, minor: 2})[focus.get(item.url) || 'normal'];
    const ordered = matching.map((item, index) => ({item, index})).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(entry => entry.item);
    const minor = ordered.filter(item => focus.get(item.url) === 'minor');
    const folding = !search && minor.length > 0 && !showMinor;
    const visible = folding ? ordered.filter(item => focus.get(item.url) !== 'minor') : ordered;
    // 0.4.72: the count (and the 本页视频 badge, which follows it) is what the list shows; folded ads and previews
    // count once 展开 shows them, page sounds under 100 KB never.
    $('#count').textContent = visible.filter(item => !tiny(item)).length;
    $('#copyAll').disabled = !matching.length;
    $('#empty').hidden = !!visible.length;
    document.body.classList.toggle('no-media',!real);
    // 0.4.71: the filters only when the list is long; the footer (copy all links) stays out of the way.
    $('.list-heading').hidden = !real; $('.filters').hidden = real <= 8 && !$('#search').value; $('footer').hidden = true;
    if ($('.filters').hidden && filter !== 'all') { filter = 'all'; for (const item of document.querySelectorAll('[data-filter]')) { const on = item.dataset.filter === 'all'; item.classList.toggle('active', on); item.setAttribute('aria-pressed', String(on)); } return render(); }
    const restricted=!ShiyingAccess.origin(currentSite?.url);
    const pick = RuxgetI18n.pick;
    $('#empty h3').textContent = real ? pick('没有符合条件的媒体','No matching media') : restricted ? pick('此页面无法读取视频','Videos can’t be read on this page') : pick('暂未发现视频','No videos found yet');
    // 0.4.71: nothing found on a web page: its link can be copied (the desktop app's 新建下载 fills it in).
    { const link = $('#copyPageLink'); if (link) { link.hidden = !!real || !/^https?:/i.test(currentSite?.url || ''); link.textContent = pick('复制这个网页的链接', 'Copy this page’s link'); } }
    $('#empty p').textContent = real ? pick('换一个类型，或清空搜索词再试试。','Try another type, or clear the search.') : restricted ? pick('请切换到视频页，或在上方粘贴视频链接。','Switch to a video page, or paste a video link above.') : pick('播放网页里的视频，或在上方粘贴视频链接。','Play the video on the page, or paste a video link above.');
    const fragments = media.filter(item => kindOfItem(item) === 'fragment').length;
    // 0.4.77: everything the page loaded that the list above leaves out (segments, playlists the list folds, other
    // files) opens under 「显示全部请求」, in place of the old advanced popup's request list.
    const others = media.filter(item => ['other', 'fragment'].includes(kindOfItem(item)) && `${Shiying.name(item)} ${item.url}`.toLowerCase().includes(search));
    const note = $('#fragmentNote');
    note.hidden = !others.length;
    const noteText = document.createElement('span');
    noteText.textContent = fragments ? pick(`另有 ${fragments} 个音视频分段（播放器自动加载的片段），已折叠，一般无需单独下载。`, `${fragments} more media segments (pieces the player loads by itself) are folded; there is usually no need to download them.`) : '';
    const allToggle = document.createElement('button');
    allToggle.type = 'button'; allToggle.className = 'hint-link'; allToggle.id = 'allRequestsToggle';
    allToggle.textContent = showAll ? pick('收起全部请求', 'Hide all requests') : pick(`显示全部请求（${others.length}）`, `Show all requests (${others.length})`);
    allToggle.setAttribute('aria-expanded', String(showAll));
    allToggle.addEventListener('click', () => { showAll = !showAll; render(); });
    allToggle.hidden = !others.length;
    note.replaceChildren(...(noteText.textContent ? [noteText, ' '] : []), allToggle);
    // 2026-11-08 (spec 06): 页面播放器探测 follows 「显示全部请求」 on this line, on any allowed web page.
    if (typeof RuxgetProbePanel !== 'undefined' && RuxgetProbePanel.attach(note, currentSite, tabId)) note.hidden = false;
    renderAllRequests(showAll ? others : [], pick, kindOfItem);
    const list = $('#mediaList');
    list.replaceChildren();
    const urls = new Set(media.map(item => item.url));
    for (const url of cards.keys()) if (!urls.has(url)) cards.delete(url);
    const focusNote = $('#focusNote');
    focusNote.hidden = !minor.length || !!search;
    if (!focusNote.hidden) {
        const text = document.createElement('span'), toggle = document.createElement('button');
        // Only tiny page sounds: say what they most likely are.
        if (minor.length === ordered.length && minor.every(tiny)) text.textContent = showMinor ? pick(`这 ${minor.length} 个文件很小，可能是网页的提示音或按钮音效。`, `These ${minor.length} files are tiny, most likely page sounds or button clicks.`) : pick(`另有 ${minor.length} 个很小的文件，可能是网页的提示音。`, `${minor.length} tiny files, most likely page sounds.`);
        else text.textContent = showMinor ? pick(`其中 ${minor.length} 个可能是广告、预览或很小的片段，已放在最后。`, `${minor.length} of these look like ads, previews or tiny clips; they’re listed last.`) : pick(`另有 ${minor.length} 个可能是广告、预览或很小的片段，已收起。`, `${minor.length} more look like ads, previews or tiny clips, so they’re folded.`);
        toggle.type = 'button'; toggle.className = 'hint-link';
        toggle.textContent = showMinor ? pick('收起', 'Fold') : pick('展开', 'Show');
        toggle.addEventListener('click', () => { showMinor = !showMinor; render(); });
        focusNote.replaceChildren(text, toggle);
    }
    const markFocus = (card, data) => {
        const role = focus.get(data.url) || 'normal';
        card.classList.toggle('is-main', role === 'main' && playable.length > 1);
        card.classList.toggle('is-minor', role === 'minor');
        const tag = card.querySelector('.main-tag');
        tag.hidden = !(role === 'main' && playable.length > 1);
        tag.textContent = pick('页面主视频', 'Main video');
    };
    for (const data of visible) {
        if (cards.has(data.url)) { markFocus(cards.get(data.url), data); list.append(cards.get(data.url)); continue; }
        const card = $('#mediaTemplate').content.firstElementChild.cloneNode(true);
        cards.set(data.url, card);
        markFocus(card, data);
        const kind = Shiying.kind(data);
        card.querySelector('h3').textContent = Shiying.name(data);
        card.querySelector('h3').title = Shiying.name(data);
        card.querySelector('.format').textContent = kind === 'hls' ? pick('分段视频', 'Streaming video') : (kind === 'dash' ? pick('音画分轨', 'Separate audio/video') : (data.ext || kind).toUpperCase());
        card.querySelector('.size').textContent = ['hls','dash'].includes(kind) ? pick('下载时合并', 'Merged on download') : Shiying.size(data.size);
        card.querySelector('.copy-button').textContent = pick('复制链接', 'Copy link');
        card.querySelector('.desktop-button').textContent = pick('桌面下载', 'Desktop');
        card.querySelector('.detail-button').textContent = pick('查看详情', 'Details');
        const icon = card.querySelector('.file-icon');
        if (kind === 'audio') { icon.textContent = '♫'; icon.classList.add('audio'); }
        const status = card.querySelector('.item-status');
        const button = card.querySelector('.download-button');
        // 0.4.80: DASH opens the download page where quality and sound are picked; the button just says 下载.
        button.textContent = pick('下载', 'Download');
        { const label = card.querySelector('.quality label span'); if (label) label.textContent = pick('清晰度', 'Quality'); }
        button.disabled = !Shiying.validURL(data.url);
        if (button.disabled) status.textContent = pick('这个地址不能直接下载', 'This address can’t be downloaded directly');
        onClick(button, async () => {
            button.disabled = true;
            try {
                const selectedURL = card.querySelector('select').value || data.url;
                const result = await message('shiyingDownload', {data: {...data, url: selectedURL}});
                if (!result.ok) throw new Error(result.error);
                if (result.id !== undefined) {
                    status.textContent = pick('已开始下载', 'Started');
                    downloads.set(result.id, status);
                    if (card.dataset.download) downloads.delete(Number(card.dataset.download));
                    delete card.dataset.opens; card.title = ''; card.dataset.download = result.id;
                } else { status.textContent = pick('已打开下载页', 'Download page opened'); }
                notify(result.id === undefined ? pick('已打开下载页，请保持它打开以完成下载', 'The download page is open; keep it open until it finishes') : result.takeover ? pick('下载已开始；大文件会交给 Ruxget 桌面版', 'Download started; large files go to Ruxget Desktop') : pick('下载已开始，进度可在 Chrome 下载列表查看', 'Download started; see progress in Chrome’s downloads'));
            } finally { button.disabled = false; }
        });
        onClick(card.querySelector('.copy-button'), () => copy(data.url));
        // A finished Chrome download opens on double-click (plays the video, runs the installer).
        card.addEventListener('dblclick', event => {
            if (card.dataset.opens !== card.dataset.download || event.target.closest('button,select,input,a,summary')) return;
            RuxgetOpen.file(Number(card.dataset.opens), notify);
        });
        card.querySelector('.desktop-button').addEventListener('click', async () => {
            // 0.4.64: never the same file twice. If "下载" already handed it to the desktop, nothing more is sent; if Chrome
            // is downloading this very link, the desktop takes that download over and Chrome's copy stops.
            const url = card.querySelector('select').value || data.url;
            if (/^https?:\/\//i.test(url) && !['hls', 'dash'].includes(kind)) {
                // Asked first, while Chrome still counts this as the click (it shows its prompt only then).
                const granted = await chrome.permissions.request({permissions: ['nativeMessaging']}).catch(() => false);
                if (!granted) { failure(new Error('没有允许连接桌面版，可以继续用插件下载')); return; }
                const same = value => RuxgetTakeover.sameLink(value, url);
                const {ruxgetTakeoverLog: log = []} = await chrome.storage.local.get('ruxgetTakeoverLog').catch(() => ({}));
                // A second click within a few seconds sends it again on purpose (say the desktop task failed or was deleted).
                if (log.some(entry => entry.result === 'desktop' && (same(entry.url) || same(entry.source)) && Date.now() - entry.at < 600000) && !(card.resendUntil > Date.now())) {
                    card.resendUntil = Date.now() + 8000;
                    status.textContent = pick('已交给桌面版', 'In Ruxget Desktop');
                    notify(pick('这个文件已经交给 Ruxget 桌面版在下载。要再发一次，几秒内再点一下「桌面下载」', 'This file is already downloading in Ruxget Desktop. To send it again, click “Desktop” once more within a few seconds'));
                    return;
                }
                card.resendUntil = 0;
                const [running] = (await chrome.downloads.search({state: 'in_progress'}).catch(() => [])).filter(item => same(item.url) || same(item.finalUrl));
                if (running) {
                    const moved = await chrome.runtime.sendMessage({Message: 'ruxgetHandOver', id: running.id, own: true}).catch(() => null);
                    if (moved?.ok) {
                        downloads.delete(running.id); status.textContent = pick('已交给桌面版', 'In Ruxget Desktop');
                        notify(pick('已交给 Ruxget 桌面版，Chrome 里正在下的这一份已停止', 'Moved to Ruxget Desktop; the copy Chrome was downloading has stopped'));
                        return;
                    }
                    // Chrome keeps its copy in every case below, so nothing is added to the desktop.
                    const issue = moved && ShiyingDesktop.connectionIssue({message: moved.error});
                    if (issue) { await ShiyingDesktop.offerDesktopDownload(issue); return; }
                    if (moved && moved.error !== 'gone' && moved.error !== 'finished') { failure(new Error(pick('桌面版接不了这个链接，仍由 Chrome 下载：', 'Ruxget Desktop can’t take this link, so Chrome keeps it: ') + ({pause: pick('Chrome 不让暂停这个下载', 'Chrome would not pause this download'), 'not connected': pick('没有允许连接桌面版', 'The desktop app connection isn’t allowed'), desktop: pick('桌面版没有接', 'The desktop app didn’t take it')}[moved.error] || RuxgetText.tr(moved.error || '')))); return; }
                    const [still] = await chrome.downloads.search({id: running.id}).catch(() => []);
                    if (!moved || still?.state === 'in_progress') { failure(new Error(pick('Chrome 还在准备这个下载，请过几秒再点「桌面下载」', 'Chrome is still setting up this download; try “Desktop” again in a few seconds'))); return; }
                }
            }
            ShiyingDesktop.send(() => {
                const headers=Object.fromEntries(Object.entries(data.requestHeaders||{}).map(([key,value])=>[key.toLowerCase(),value]));
                if(data.cookie||headers.cookie||headers.authorization) throw new Error('这个媒体需要登录凭据，请使用网站自带的下载方式');
                return {action:'add',kind:['hls','dash'].includes(kind)?'video':'file',url:card.querySelector('select').value||data.url,title:Shiying.filename(data).split('/').pop(),referer:headers.referer||data.webUrl||currentSite.url,userAgent:headers['user-agent']||navigator.userAgent};
            }).then(reply=>notify(reply?.stage==='started'?pick('已交给桌面版，在「已下载」里看进度', 'Sent to Ruxget Desktop; follow it in Downloads'):pick('已交给 Ruxget 桌面版，请在桌面窗口确认下载', 'Sent to Ruxget Desktop; confirm it in the desktop window'))).catch(failure);
        });
        card.querySelector('.resource-url').textContent = data.url;
        let qualityLoaded = false;
        const detailButton = card.querySelector('.detail-button');
        onClick(detailButton, async () => {
            const detail = card.querySelector('.item-details');
            detail.hidden = !detail.hidden;
            detailButton.setAttribute('aria-expanded', !detail.hidden);
            detailButton.textContent = detail.hidden ? pick('查看详情', 'Details') : pick('收起详情', 'Hide details');
            if (!detail.hidden && kind === 'hls' && !qualityLoaded) {
                status.textContent = pick('正在读取清晰度', 'Reading qualities');
                try { await quality(data, card); qualityLoaded = true; status.textContent = ''; }
                catch (error) { status.textContent = pick('可直接在下载页解析', 'The download page can read it'); notify(pick('清晰度读取失败：', 'Couldn’t read qualities: ') + RuxgetText.tr(error.message)); }
            }
        });
        list.append(card);
    }
}
async function refresh() {
    $('#error').hidden = true;
    const forTab = tabId, result = await message('getData');
    if (forTab !== tabId) return;
    if (result === 'error') throw new Error('识别服务正在启动，请稍后点击刷新');
    media = Array.isArray(result) ? result : [];
    // Read the page's players first (briefly), so the list opens already sorted instead of jumping.
    await Promise.race([probePage().catch(() => {}), new Promise(resolve => setTimeout(resolve, 400))]);
    render();
}
async function initialize() {
    const requested = Number(new URLSearchParams(location.search).get('tabId'));
    const [tab] = requested ? [await chrome.tabs.get(requested)] : await chrome.tabs.query({active:true, currentWindow:true});
    if (!tab) throw new Error('没有找到当前网页');
    tabId = tab.id;
    currentSite = tab;
    pageElements = []; showMinor = false; showAll = false;
    $('#pageTitle').textContent = tab.title || (window.RuxgetI18n ? RuxgetI18n.pick('当前网页', 'This page') : '当前网页');
    // Side panel: the netdisk card follows the page too.
    document.dispatchEvent(new CustomEvent('ruxget-page-changed', {detail: tab}));
    const thisPage = window.RuxgetI18n ? RuxgetI18n.pick('当前网页', 'This page') : '当前网页';
    try { $('#pageHost').textContent = new URL(tab.url).hostname || thisPage; } catch { $('#pageHost').textContent = thisPage; }
    // Labels below are drawn in the chosen language, so wait for it first.
    await (window.RuxgetI18n?RuxgetI18n.ready().catch(()=>{}):Promise.resolve());
    const settings = await chrome.storage.sync.get({saveAs:false, enable:true});
    $('#saveAs').checked = settings.saveAs;
    showSaveTarget();
    setPaused(settings.enable);
    ShiyingPlatformUI.bind(tab).catch(failure);
    // Bringing the page's download button back is automatic, so a failure stays quiet; clicking 显示浮钮 explains it.
    ensureFloatingControl().catch(()=>{});
    await refresh();
    await updateSiteAccess();
    // 0.4.69: open on "本页视频" when there is something to download here, otherwise on "已下载".
    window.RuxgetTabs?.decide();
}
async function updateSiteAccess() {
    await ShiyingAccess.sync();
    const site = ShiyingAccess.origin(currentSite?.url);
    if (!site || ShiyingAccess.requiredSite(currentSite.url)) {$('#siteAccess').hidden = true;return;}
    accessCandidates = await ShiyingAccess.discover(currentSite);
    accessPatterns = [...new Set([site,...accessCandidates.map(item => ShiyingAccess.origin(item.url))])];
    const missing = accessPatterns.filter(pattern => !ShiyingAccess.allows(pattern.slice(0,-1)));
    $('#siteAccess').hidden = !missing.length;
    const sourcesOnly=ShiyingAccess.allows(currentSite.url);RuxgetI18n.live($('#allowSite'),()=>sourcesOnly ? RuxgetI18n.pick('允许媒体来源','Allow media sources') : RuxgetI18n.pick('允许此网站','Allow this site'));
    RuxgetI18n.live($('#siteAccessNote'),()=>sourcesOnly?RuxgetI18n.pick('这个网页的视频来自另一个网站，再允许一次，Ruxget 才能检测到。','This page’s videos come from another site; allow it too so Ruxget can find them.'):RuxgetI18n.pick('允许此网站后，Ruxget 才能检测页面里的视频。','Allow this site so Ruxget can find videos on the page.'));
    if (!missing.length) {await recordSiteMedia(currentSite, accessCandidates);await refresh();}
}
async function recordSiteMedia(tab, candidates) {
    if (!ShiyingAccess.allows(tab.url)) return;
    for (const item of candidates) if (ShiyingAccess.allows(item.url)) await chrome.runtime.sendMessage({Message:'addMedia',href:tab.url,url:item.url,mime:item.type,extraExt:item.ext});
}
$('#allowSite').addEventListener('click', () => {
    const requestedSite = currentSite;
    // Invoke the browser permission prompt before any await or message hop.
    ShiyingAccess.request(accessPatterns).then(async granted => {
        if (!granted) {RuxgetI18n.live($('#siteAccessNote'),()=>RuxgetI18n.pick('未获得此网站的访问权限，Ruxget 无法检测本页视频。需要时可再次点击「允许此网站」。', 'This site wasn’t allowed, so Ruxget can’t find videos on this page. Click “Allow this site” whenever you need it.'));return;}
        const result = await message('shiyingSyncAccess');
        if (!result?.ok) throw new Error(result?.error || '网站授权未能更新');
        const tab = await chrome.tabs.get(requestedSite.id);
        if (ShiyingAccess.origin(tab.url) !== ShiyingAccess.origin(requestedSite.url)) {notify('网页已跳转，请重新打开 Ruxget');await initialize();return;}
        const candidates = await ShiyingAccess.discover(tab);
        await ShiyingAccess.sync();await recordSiteMedia(tab, candidates);
        await refresh();await updateSiteAccess();
        notify($('#siteAccess').hidden ? '已允许此网站；需要时刷新网页再播放视频' : '网站已允许，请再允许本页媒体来源');
    }).catch(failure);
});
let recognitionEnabled = true;
function setPaused(enabled) {
    recognitionEnabled = !!enabled;
    const pauseLabel = (window.RuxgetI18n ? RuxgetI18n.t('uiPauseDetection') : '暂停识别');
    const resumeLabel = (window.RuxgetI18n ? RuxgetI18n.t('uiResumeDetection') : '恢复识别');
    $('#pause').textContent = recognitionEnabled ? pauseLabel : resumeLabel;
    $('.source').classList.toggle('paused', !recognitionEnabled);
}
chrome.runtime.onMessage.addListener(event => {
    if (event.Message === 'shiyingAccessRevoked') {cards.clear();refresh().then(updateSiteAccess).catch(failure);return;}
    if (event.Message === 'popupAddData' && event.data?.tabId === tabId && !media.some(item => item.url === event.data.url)) { media.push(event.data); render(); probeSoon(); }
});
function markGone(id) {
    const status = downloads.get(id), card = status?.closest('[data-download]');
    if (card?.dataset.opens === String(id)) { status.textContent = RuxgetOpen.goneText(); delete card.dataset.opens; card.title = ''; }
}
window.RuxgetOpen?.onGone(markGone);
chrome.downloads.onChanged.addListener(async event => {
    const status = downloads.get(event.id);
    if (!status) return;
    // 0.4.81: the finished file was deleted or moved outside Chrome: say so, and a double-click no longer offers to open it.
    if (event.exists?.current === false) { markGone(event.id); return; }
    // Taken over by the desktop (takeover on): Chrome's copy was cancelled on purpose.
    if (event.error?.current === 'USER_CANCELED') {
        const {ruxgetTakeoverLog: log = []} = await chrome.storage.local.get('ruxgetTakeoverLog').catch(() => ({}));
        if (log.some(entry => entry.id === event.id && entry.result === 'desktop')) { downloads.delete(event.id); status.textContent = RuxgetI18n.pick('已交给桌面版', 'In Ruxget Desktop'); return; }
    }
    if (event.error) status.textContent = RuxgetI18n.pick('下载中断，请在下载列表重试', 'Interrupted; retry from Chrome’s downloads');
    else if (event.state?.current === 'complete') {
        status.textContent = RuxgetI18n.pick('下载完成 · 双击打开', 'Done · double-click to open');
        const card = status.closest('[data-download]');
        if (card && card.dataset.download === String(event.id)) { card.dataset.opens = String(event.id); card.title = RuxgetI18n.pick('双击打开文件', 'Double-click to open the file'); }
    }
});
chrome.tabs.onActivated.addListener(async event => {
    if (new URLSearchParams(location.search).has('tabId')) return;
    const here = await chrome.windows.getCurrent().catch(() => null);
    if (here && event.windowId !== here.id) return;
    cards.clear(); downloads.clear(); initialize().catch(failure);
});
chrome.tabs.onUpdated?.addListener((changedId, info) => {
    if(changedId!==tabId || !info.url || info.url===currentSite?.url)return;
    try {if(ShiyingPlatform.source(info.url).url===ShiyingPlatform.source(currentSite.url).url){currentSite.url=info.url;return;}} catch {}
    cards.clear();downloads.clear();initialize().catch(failure);
});
onClick($('#refresh'), async () => {await refresh(); await ShiyingPlatformUI.refresh(); await updateSiteAccess();});
onClick($('#pause'), async () => { const enabled = await message('enable'); setPaused(enabled); notify(enabled ? '已恢复识别' : '已暂停识别，已有列表仍可下载'); });
onClick($('#clear'), async () => { await message('clearData', {type:true}); await message('ClearIcon', {type:true}); media = []; render(); notify('已清空当前页面的列表'); });
onClick($('#downloads'), () => chrome.downloads.showDefaultFolder());
onClick($('#downloadLocation'), () => chrome.tabs.create({url:'chrome://settings/downloads'}));
// Say where files actually go instead of a generic "default location" link.
async function showSaveTarget(){
    const button=$('#downloadLocation'),folder=await ShiyingNative.chromeFolder();
    if($('#saveAs').checked){button.textContent=RuxgetI18n.pick('每次手动选择 ›','Choose each time ›');return;}
    if(!folder){button.textContent=RuxgetI18n.pick('下载目录 / Ruxget ›','Downloads / Ruxget ›');return;}
    const full=folder.replace(/[\\/]+$/,'')+'\\Ruxget',parts=full.split(/[\\/]/);
    button.textContent=(parts.length>3?'…\\'+parts.slice(-2).join('\\'):full)+' ›';
    button.title=RuxgetI18n.pick('插件和桌面版都保存到：','The extension and desktop app save to: ')+full+RuxgetI18n.pick('（点击可在 Chrome 设置中更改）',' (click to change it in Chrome settings)');
}
document.addEventListener('ruxget-i18n-applied',showSaveTarget);
onClick($('#help'), () => chrome.tabs.create({url:chrome.runtime.getURL('shiying-help.html')}));
// 0.4.71: the gear opens Ruxget's settings (everything the panel no longer shows).
onClick($('#openSettings'), () => chrome.runtime.openOptionsPage());
onClick($('#copyPageLink'), async () => { await navigator.clipboard.writeText(currentSite.url); notify(RuxgetI18n.pick('已复制网页链接', 'Page link copied')); });
// 网站权限 lives on the help page (#site-access); 高级工具 moved to the toolbar icon's right-click menu (0.4.60).
onClick($('#copyAll'), () => copy([...$('#mediaList').querySelectorAll('.resource-url')].map(element => element.textContent).join('\n')));
$('#saveAs').addEventListener('change', async () => {const checked=$('#saveAs').checked;showSaveTarget();try{await chrome.storage.sync.set({saveAs:checked});}catch(error){$('#saveAs').checked=!checked;notify('保存位置设置未保存，请重试：'+error.message);}});
const floatingToggle=$('#floatingToggle');
let changingFloating=false;
async function ensureFloatingControl(){
    try{ShiyingPlatform.source(currentSite?.url);}catch{return;}
    const result=await message('shiyingEnsureFloating');
    if(!result?.ok)throw new Error(result?.error||'请刷新视频页后重试');
}
function showFloatingSetting(settings){
    const visible=settings?.hidden===false;
    floatingToggle.textContent=visible?(window.RuxgetI18n?RuxgetI18n.t('uiHideFloating'):'隐藏浮钮'):(window.RuxgetI18n?RuxgetI18n.t('uiShowFloating'):'显示浮钮');
    floatingToggle.setAttribute('aria-label',floatingToggle.textContent);
    floatingToggle.title=visible?(window.RuxgetI18n?RuxgetI18n.pick('隐藏网页下载浮钮并收起 Ruxget 右侧栏','Hide the page download button and collapse the side panel'):'隐藏网页下载浮钮并收起 Ruxget 右侧栏'):(window.RuxgetI18n?RuxgetI18n.pick('重新显示网页上的 Ruxget 下载浮钮','Show the Ruxget download button on the page again'):'重新显示网页上的 Ruxget 下载浮钮');
    floatingToggle.dataset.visible=String(visible);floatingToggle.disabled=changingFloating;
}
(window.RuxgetI18n?RuxgetI18n.ready().catch(()=>{}):Promise.resolve()).then(()=>chrome.storage.local.get('shiyingFloating')).then(settings=>showFloatingSetting(settings.shiyingFloating)).catch(()=>notify('浮钮设置暂时无法读取，请重新打开插件'));
floatingToggle.addEventListener('click', async () => {
    if(changingFloating)return;
    changingFloating=true;floatingToggle.disabled=true;
    try{
        const settings=(await chrome.storage.local.get('shiyingFloating')).shiyingFloating;
        const hidden=settings?.hidden===false;
        await chrome.storage.local.set({shiyingFloating:{...settings,hidden}});
        if(!hidden)await ensureFloatingControl();
        showFloatingSetting({hidden});
        notify(hidden?'已隐藏下载浮钮，可从工具栏 Ruxget 重新显示':'已显示网页下载浮钮');
        if(hidden && chrome.sidePanel?.close){
            try{
                const {id:windowId}=await chrome.windows.getCurrent();
                await chrome.sidePanel.close({tabId}).catch(()=>chrome.sidePanel.close({windowId}));
            }catch{notify('下载浮钮已隐藏；右侧栏未能收起，请点侧栏右上角关闭');return;}
        }
        if(hidden && chrome.extension?.getViews({type:'popup'}).includes(window))window.close();
    }catch(error){notify('浮钮设置未保存，请重试：'+error.message);}
    finally{changingFloating=false;floatingToggle.disabled=false;}
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.ruxgetChromeFolder)showSaveTarget();if(area==='local'&&changes.shiyingFloating)showFloatingSetting(changes.shiyingFloating.newValue);if(area==='sync'&&changes.saveAs){$('#saveAs').checked=changes.saveAs.newValue===true;showSaveTarget();}});
$('#search').addEventListener('input', render);
for (const button of document.querySelectorAll('[data-filter]')) onClick(button, () => {
    filter = button.dataset.filter;
    for (const item of document.querySelectorAll('[data-filter]')) { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button); }
    render();
});
initialize().catch(failure);

// Manual choices only: no download hooks, timers, persistent default takeover or automatic desktop startup.
// 0.4.81: a pasted link saved by Chrome goes into the same Ruxget folder as every other download. Chrome still picks
// the name (from the server's Content-Disposition or the address); only the folder is added, for this one download.
// The filename listener lives only until Chrome has asked about it, and lets every other download through untouched.
function chromeIntoRuxget(url,saveAs){
    if(saveAs)return chrome.downloads.download({url,saveAs:true});
    let claimed=false;
    const listener=(item,suggest)=>{
        if(claimed||item.byExtensionId!==chrome.runtime.id||item.url!==url){suggest();return;}
        claimed=true;setTimeout(stop,0);// removed only after answering: Chrome drops an answer whose listener is gone
        const base=String(item.filename||'').split(/[\\/]/).filter(Boolean).pop();
        if(base)suggest({filename:'Ruxget/'+base,conflictAction:'uniquify'});else suggest();
    };
    const stop=()=>{clearTimeout(timer);try{chrome.downloads.onDeterminingFilename.removeListener(listener);}catch{}};
    const timer=setTimeout(stop,60000);
    try{chrome.downloads.onDeterminingFilename.addListener(listener);}catch{}
    return chrome.downloads.download({url,conflictAction:'uniquify'}).catch(error=>{stop();throw error;});
}
let linkDownloadBusy=false;
function linkDownloadState(busy){linkDownloadBusy=busy;for(const id of ['linkUseChrome','linkUseDesktop','linkDownloadCancel','linkDownloadURL','linkDownloadReferer'])$('#'+id).disabled=busy;}
function linkDownloadFailure(error){if(error.cancelled)return;$('#linkDownloadError').textContent=RuxgetText.tr(error.message||String(error));$('#linkDownloadError').hidden=false;}
$('#ordinaryDownload').addEventListener('click',()=>{$('.menu').open=false;$('#linkDownloadError').hidden=true;$('#linkDownload').showModal();$('#linkDownloadURL').focus();});
$('#linkDownloadCancel').addEventListener('click',()=>{if(!linkDownloadBusy)$('#linkDownload').close();});
$('#linkDownload').addEventListener('cancel',event=>{if(linkDownloadBusy)event.preventDefault();});
$('#linkDownloadForm').addEventListener('submit',async event=>{
    event.preventDefault();if(linkDownloadBusy)return;
    // 0.4.77: an optional source page (Referer) for sites that refuse a bare request; it takes the link through
    // Ruxget's own download pages, which send it along (replaces the old advanced tools' manual downloader).
    const referer=$('#linkDownloadReferer').value.trim();
    if(typeof ShiyingPlatformUI!=="undefined"&&ShiyingPlatformUI.stream?.($('#linkDownloadURL').value.trim(),referer)){$('#linkDownload').close();return;}
    if(referer){try{const payload=ShiyingNative.file($('#linkDownloadURL').value,referer);if(!payload.referer)throw new Error('来源网页需要是完整的 HTTP 或 HTTPS 地址');const link=new URL(payload.url);
        if(!await chrome.permissions.request({origins:[link.protocol+'//'+link.hostname+'/*']}).catch(()=>false))throw new Error('需要允许访问这个网站，才能带着来源网页下载。');
        let name=link.pathname.split('/').pop()||'';try{name=decodeURIComponent(name);}catch{}const ext=(/\.([a-z0-9]{1,8})$/i.exec(name)||[])[1]||'';
        const result=await chrome.runtime.sendMessage({Message:'shiyingDownload',tabId,data:{url:payload.url,ext,title:name.replace(/\.[a-z0-9]{1,8}$/i,'')||'下载文件',type:'',requestHeaders:{referer:payload.referer}}});
        if(!result?.ok)throw new Error(result?.error||'没有打开下载页，请重试');$('#linkDownload').close();notify('已在新标签页中打开下载页');}catch(error){linkDownloadFailure(error);}return;}
    try{const payload=ShiyingNative.file($('#linkDownloadURL').value);linkDownloadState(true);$('#linkDownloadError').hidden=true;await chromeIntoRuxget(payload.url,$('#saveAs').checked);$('#linkDownload').close();notify('已交给 Chrome 下载');}catch(error){linkDownloadFailure(error);}finally{linkDownloadState(false);}
});
$('#linkUseDesktop').addEventListener('click',()=>{
    if(linkDownloadBusy||!$('#linkDownloadForm').reportValidity())return;
    let payload;try{payload=ShiyingNative.file($('#linkDownloadURL').value,$('#linkDownloadReferer').value.trim()||currentSite?.url);}catch(error){linkDownloadFailure(error);return;}
    linkDownloadState(true);$('#linkDownloadError').hidden=true;
    ShiyingDesktop.send(()=>payload).then(reply=>{$('#linkDownload').close();notify(reply?.stage==='started'?pick('已交给桌面版，在「已下载」里看进度', 'Sent to Ruxget Desktop; follow it in Downloads'):'已发送链接，请在 Ruxget 桌面版确认下载');}).catch(linkDownloadFailure).finally(()=>linkDownloadState(false));
});
(chrome.storage.session??chrome.storage.local).get('shiyingLinkDownloadError').then(async data=>{const error=data.shiyingLinkDownloadError;if(!error)return;await (chrome.storage.session??chrome.storage.local).remove('shiyingLinkDownloadError');if(Date.now()-error.createdAt<120000)notify(error.text);}).catch(()=>{});


// Ruxget language switcher (popup)

async function refreshLiveI18n() {
  try {
    if (typeof currentSite !== 'undefined' && currentSite) {
      $('#pageTitle').textContent = currentSite.title || (window.RuxgetI18n ? RuxgetI18n.t('uiReadingPage') : '当前网页');
      try { $('#pageHost').textContent = new URL(currentSite.url).hostname || ''; } catch (e) {}
    }
    if (typeof setPaused === 'function' && typeof recognitionEnabled !== 'undefined') setPaused(recognitionEnabled);
    try { const {shiyingFloating} = await chrome.storage.local.get('shiyingFloating'); showFloatingSetting(shiyingFloating); } catch (e) {}
    try { if (window.ShiyingPlatformUI && ShiyingPlatformUI.refreshLiveLabels) await ShiyingPlatformUI.refreshLiveLabels(); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('ruxget-netdisk-refresh')); } catch (e) {}
    try { cards.clear(); render(); } catch (e) {}
  } catch (e) { console.warn(e); }
}

// Language switcher (popup) — click cycles A / 中 / EN
(async function () {
  try {
    if (!window.RuxgetI18n) return;
    await RuxgetI18n.ready();
    RuxgetI18n.applyDom(document);
    const btn = document.getElementById('languageSelect');
    if (!btn || btn.tagName !== 'BUTTON') return;
    const order = ['auto', 'zh_CN', 'en'];
    const labels = { auto: 'A', zh_CN: '\u4e2d', en: 'EN' };
    const tip = 'A = Auto \u00b7 \u4e2d = \u4e2d\u6587 \u00b7 EN = English';
    function sync(pref) {
      if (pref !== 'auto' && pref !== 'zh_CN' && pref !== 'en') pref = 'auto';
      btn.dataset.lang = pref;
      btn.textContent = labels[pref];
      btn.title = tip;
      btn.setAttribute('aria-label', 'Language: ' + labels[pref]);
    }
    const stored = await chrome.storage.local.get(RuxgetI18n.STORAGE_KEY);
    sync(stored[RuxgetI18n.STORAGE_KEY] || 'auto');
    document.addEventListener('ruxget-i18n-applied', () => { refreshLiveI18n().catch(() => {}); });
    btn.addEventListener('click', async function () {
      const cur = btn.dataset.lang || 'auto';
      const i = order.indexOf(cur);
      const next = order[((i < 0 ? 0 : i) + 1) % order.length];
      await RuxgetI18n.setLanguage(next);
      sync(next);
      RuxgetI18n.applyDom(document);
      await refreshLiveI18n();
      try{const s=(await chrome.storage.local.get('shiyingFloating')).shiyingFloating;showFloatingSetting(s);}catch(e){}
    });
  } catch (e) { console.warn(e); }
})();

