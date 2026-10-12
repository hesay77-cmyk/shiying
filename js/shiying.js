// 拾影，2026-10-12：无框架的中文主界面。GPL-3.0。
const $ = selector => document.querySelector(selector);
let tabId, filter = 'all', media = [], toastTimer;
const downloads = new Map();
const cards = new Map();
function notify(text) {
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').hidden = true, 3300);
}
function message(Message, extra = {}) { return chrome.runtime.sendMessage({Message, tabId, ...extra}); }
function failure(error) { $('#error').textContent = error.message || String(error); $('#error').hidden = false; }
function onClick(element, action) { element.addEventListener('click', () => Promise.resolve().then(action).catch(failure)); }
async function copy(url) { await navigator.clipboard.writeText(url); notify('链接已复制'); }
async function quality(data, card) {
    const result = await message('shiyingPlaylist', {data});
    if (!result.ok) throw new Error(result.error);
    const field = card.querySelector('.quality');
    const select = field.querySelector('select');
    field.hidden = false;
    select.replaceChildren(new Option('自动选择 / 在下载页选择', data.url));
    for (const variant of result.variants) select.add(new Option(variant.label, variant.url));
    select.disabled = result.separateAudio || !result.variants.length;
    field.querySelector('.quality-note').textContent = result.separateAudio ? '这个视频的声音是独立音轨，请在下载页一起选择。' : (result.variants.length ? '选好清晰度后点击下载。' : '这是单一清晰度的视频流。');
}
function render() {
    const search = $('#search').value.trim().toLowerCase();
    const playable = media.filter(item => !['other', 'fragment'].includes(Shiying.kind(item)));
    const visible = playable.filter(item => (filter === 'all' || (filter === 'audio' ? Shiying.kind(item) === 'audio' : Shiying.kind(item) !== 'audio')) && `${Shiying.name(item)} ${item.ext || ''}`.toLowerCase().includes(search));
    $('#count').textContent = playable.length;
    $('#copyAll').disabled = !visible.length;
    $('#empty').hidden = !!visible.length;
    $('#empty h3').textContent = playable.length ? '没有符合条件的媒体' : '先播放一下网页里的视频';
    $('#empty p').textContent = playable.length ? '换一个类型，或清空搜索词再试试。' : '拾影会列出这个页面里找到的视频。若已在播放，刷新网页后再试一次。';
    const fragments = media.filter(item => Shiying.kind(item) === 'fragment').length;
    $('#fragmentNote').hidden = !fragments;
    $('#fragmentNote').textContent = `另有 ${fragments} 个音视频切片，已折叠。可在高级工具中查看和处理。`;
    const list = $('#mediaList');
    list.replaceChildren();
    const urls = new Set(media.map(item => item.url));
    for (const url of cards.keys()) if (!urls.has(url)) cards.delete(url);
    for (const data of visible) {
        if (cards.has(data.url)) { list.append(cards.get(data.url)); continue; }
        const card = $('#mediaTemplate').content.firstElementChild.cloneNode(true);
        cards.set(data.url, card);
        const kind = Shiying.kind(data);
        card.querySelector('h3').textContent = Shiying.name(data);
        card.querySelector('h3').title = Shiying.name(data);
        card.querySelector('.format').textContent = kind === 'hls' ? '分段视频' : (kind === 'dash' ? '音画分轨' : (data.ext || kind).toUpperCase());
        card.querySelector('.size').textContent = ['hls','dash'].includes(kind) ? '下载时合并' : Shiying.size(data.size);
        const icon = card.querySelector('.file-icon');
        if (kind === 'audio') { icon.textContent = '♫'; icon.classList.add('audio'); }
        const status = card.querySelector('.item-status');
        const button = card.querySelector('.download-button');
        button.textContent = kind === 'dash' ? '选择音轨' : '下载';
        button.disabled = !Shiying.validURL(data.url);
        if (button.disabled) status.textContent = '需要高级工具处理';
        onClick(button, async () => {
            button.disabled = true;
            try {
                const selectedURL = card.querySelector('select').value || data.url;
                const result = await message('shiyingDownload', {data: {...data, url: selectedURL}});
                if (!result.ok) throw new Error(result.error);
                if (result.id !== undefined) {
                    status.textContent = '已开始下载';
                    downloads.set(result.id, status);
                } else { status.textContent = '已打开下载页'; }
                notify(result.id === undefined ? '已打开下载页，请保持它打开以完成下载' : '下载已开始，进度可在 Chrome 下载列表查看');
            } finally { button.disabled = false; }
        });
        onClick(card.querySelector('.copy-button'), () => copy(data.url));
        card.querySelector('.resource-url').textContent = data.url;
        let qualityLoaded = false;
        const detailButton = card.querySelector('.detail-button');
        onClick(detailButton, async () => {
            const detail = card.querySelector('.item-details');
            detail.hidden = !detail.hidden;
            detailButton.setAttribute('aria-expanded', !detail.hidden);
            detailButton.textContent = detail.hidden ? '查看详情' : '收起详情';
            if (!detail.hidden && kind === 'hls' && !qualityLoaded) {
                status.textContent = '正在读取清晰度';
                try { await quality(data, card); qualityLoaded = true; status.textContent = ''; }
                catch (error) { status.textContent = '可直接在下载页解析'; notify(`清晰度读取失败：${error.message}`); }
            }
        });
        list.append(card);
    }
}
async function refresh() {
    $('#error').hidden = true;
    const result = await message('getData');
    if (result === 'error') throw new Error('识别服务正在启动，请稍后点击刷新');
    media = Array.isArray(result) ? result : [];
    render();
}
async function initialize() {
    const requested = Number(new URLSearchParams(location.search).get('tabId'));
    const [tab] = requested ? [await chrome.tabs.get(requested)] : await chrome.tabs.query({active:true, currentWindow:true});
    if (!tab) throw new Error('没有找到当前网页');
    tabId = tab.id;
    $('#pageTitle').textContent = tab.title || '当前网页';
    try { $('#pageHost').textContent = new URL(tab.url).hostname || '当前网页'; } catch { $('#pageHost').textContent = '当前网页'; }
    if (!Shiying.validURL(tab.url)) $('#empty p').textContent = '请切换到普通网页。Chrome 设置页和扩展商店无法读取视频。';
    const settings = await chrome.storage.sync.get({saveAs:false, enable:true});
    $('#saveAs').checked = settings.saveAs;
    setPaused(settings.enable);
    await refresh();
    ShiyingPlatformUI.bind(tab).catch(failure);
    if (!Shiying.validURL(tab.url)) { $('#empty h3').textContent = '请切换到视频所在的网页'; $('#empty p').textContent = 'Chrome 设置页和扩展商店无法读取视频。'; }
}
function setPaused(enabled) { $('#pause').textContent = enabled ? '暂停识别' : '恢复识别'; $('.source').classList.toggle('paused', !enabled); }
chrome.runtime.onMessage.addListener(event => {
    if (event.Message === 'popupAddData' && event.data?.tabId === tabId && !media.some(item => item.url === event.data.url)) { media.push(event.data); render(); }
});
chrome.downloads.onChanged.addListener(event => {
    const status = downloads.get(event.id);
    if (!status) return;
    if (event.error) status.textContent = '下载中断，请在下载列表重试';
    else if (event.state?.current === 'complete') status.textContent = '下载完成';
});
chrome.tabs.onActivated.addListener(event => {
    if (!new URLSearchParams(location.search).has('tabId')) { cards.clear(); downloads.clear(); initialize().catch(failure); }
});
onClick($('#refresh'), async () => {await refresh(); await ShiyingPlatformUI.refresh();});
onClick($('#pause'), async () => { const enabled = await message('enable'); setPaused(enabled); notify(enabled ? '已恢复识别' : '已暂停识别，已有列表仍可下载'); });
onClick($('#clear'), async () => { await message('clearData', {type:true}); await message('ClearIcon', {type:true}); media = []; render(); notify('已清空当前页面的列表'); });
onClick($('#downloads'), () => chrome.downloads.showDefaultFolder());
onClick($('#help'), () => chrome.tabs.create({url:chrome.runtime.getURL('shiying-help.html')}));
onClick($('#advanced'), () => chrome.tabs.create({url:chrome.runtime.getURL(`popup.html?tabId=${tabId}`)}));
onClick($('#copyAll'), () => copy([...$('#mediaList').querySelectorAll('.resource-url')].map(element => element.textContent).join('\n')));
$('#saveAs').addEventListener('change', () => chrome.storage.sync.set({saveAs:$('#saveAs').checked}).catch(failure));
$('#search').addEventListener('input', render);
for (const button of document.querySelectorAll('[data-filter]')) onClick(button, () => {
    filter = button.dataset.filter;
    for (const item of document.querySelectorAll('[data-filter]')) { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button); }
    render();
});
initialize().catch(failure);
