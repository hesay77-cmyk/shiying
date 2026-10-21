// Ruxget，2026-10-12：无框架的中文主界面。GPL-3.0。
const $ = selector => document.querySelector(selector);
const packageVersion=chrome.runtime.getManifest?.().version;
if($('#extensionVersion')&&packageVersion)$('#extensionVersion').textContent='Ruxget · '+packageVersion;
document.documentElement.classList.toggle('popup',chrome.extension?.getViews({type:'popup'}).includes(window)||false);
let tabId, filter = 'all', media = [], toastTimer, currentSite, accessCandidates = [], accessPatterns = [];
const downloads = new Map();
const cards = new Map();
function notify(text) {
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').hidden = true, 3300);
}
function message(Message, extra = {}) { return chrome.runtime.sendMessage({Message, tabId, ...extra}); }
function failure(error) { if(error.cancelled)return;$('#error').textContent = RuxgetText.tr(error.message || String(error)); $('#error').hidden = false; }
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
    document.body.classList.toggle('no-media',!playable.length);
    $('.list-heading').hidden = $('.filters').hidden = $('footer').hidden = !playable.length;
    const restricted=!ShiyingAccess.origin(currentSite?.url);
    const pick = RuxgetI18n.pick;
    $('#empty h3').textContent = playable.length ? pick('没有符合条件的媒体','No matching media') : restricted ? pick('此页面无法读取视频','Videos can’t be read on this page') : pick('暂未发现视频','No videos found yet');
    $('#empty p').textContent = playable.length ? pick('换一个类型，或清空搜索词再试试。','Try another type, or clear the search.') : restricted ? pick('请切换到视频页，或在上方粘贴视频链接。','Switch to a video page, or paste a video link above.') : pick('播放网页里的视频，或在上方粘贴视频链接。','Play the video on the page, or paste a video link above.');
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
        card.querySelector('.desktop-button').addEventListener('click', () => {
            ShiyingDesktop.send(() => {
                const headers=Object.fromEntries(Object.entries(data.requestHeaders||{}).map(([key,value])=>[key.toLowerCase(),value]));
                if(data.cookie||headers.cookie||headers.authorization) throw new Error('这个媒体需要认证信息，请使用原有下载入口');
                return {action:'add',kind:['hls','dash'].includes(kind)?'video':'file',url:card.querySelector('select').value||data.url,title:Shiying.filename(data).split('/').pop(),referer:headers.referer||data.webUrl||currentSite.url,userAgent:headers['user-agent']||navigator.userAgent};
            }).then(()=>notify('已交给 Ruxget 桌面版，请在桌面窗口确认下载')).catch(failure);
        });
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
    currentSite = tab;
    $('#pageTitle').textContent = tab.title || '当前网页';
    try { $('#pageHost').textContent = new URL(tab.url).hostname || '当前网页'; } catch { $('#pageHost').textContent = '当前网页'; }
    // Labels below are drawn in the chosen language, so wait for it first.
    await (window.RuxgetI18n?RuxgetI18n.ready().catch(()=>{}):Promise.resolve());
    const settings = await chrome.storage.sync.get({saveAs:false, enable:true});
    $('#saveAs').checked = settings.saveAs;
    showSaveTarget();
    setPaused(settings.enable);
    ShiyingPlatformUI.bind(tab).catch(failure);
    ensureFloatingControl().catch(error=>notify('浮钮暂未恢复：'+error.message));
    await refresh();
    await updateSiteAccess();
}
async function updateSiteAccess() {
    await ShiyingAccess.sync();
    const site = ShiyingAccess.origin(currentSite?.url);
    if (!site || ShiyingAccess.requiredSite(currentSite.url)) {$('#siteAccess').hidden = true;return;}
    accessCandidates = await ShiyingAccess.discover(currentSite);
    accessPatterns = [...new Set([site,...accessCandidates.map(item => ShiyingAccess.origin(item.url))])];
    const missing = accessPatterns.filter(pattern => !ShiyingAccess.allows(pattern.slice(0,-1)));
    $('#siteAccess').hidden = !missing.length;
    $('#allowSite').textContent = ShiyingAccess.allows(currentSite.url) ? RuxgetI18n.pick('允许媒体来源','Allow media sources') : RuxgetI18n.pick('允许此网站','Allow this site');
    $('#siteAccessNote').textContent = RuxgetI18n.pick('允许此网站后，Ruxget 才能检测页面里的视频。','Allow this site so Ruxget can find videos on the page.');
    if (!missing.length) {await recordSiteMedia(currentSite, accessCandidates);await refresh();}
}
async function recordSiteMedia(tab, candidates) {
    if (!ShiyingAccess.allows(tab.url)) return;
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['js/content-script.js']});
    for (const item of candidates) if (ShiyingAccess.allows(item.url)) await chrome.runtime.sendMessage({Message:'addMedia',href:tab.url,url:item.url,mime:item.type,extraExt:item.ext});
}
$('#allowSite').addEventListener('click', () => {
    const requestedSite = currentSite;
    // Invoke the browser permission prompt before any await or message hop.
    ShiyingAccess.request(accessPatterns).then(async granted => {
        if (!granted) {notify('未授权，已有下载和已允许的网站仍可使用');return;}
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
onClick($('#advanced'), () => chrome.tabs.create({url:chrome.runtime.getURL(`popup.html?tabId=${tabId}`)}));
onClick($('#siteSettings'), () => chrome.tabs.create({url:chrome.runtime.getURL('shiying-help.html#site-access')}));
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
let linkDownloadBusy=false;
function linkDownloadState(busy){linkDownloadBusy=busy;for(const id of ['linkUseChrome','linkUseDesktop','linkDownloadCancel','linkDownloadURL'])$('#'+id).disabled=busy;}
function linkDownloadFailure(error){if(error.cancelled)return;$('#linkDownloadError').textContent=RuxgetText.tr(error.message||String(error));$('#linkDownloadError').hidden=false;}
$('#ordinaryDownload').addEventListener('click',()=>{$('.menu').open=false;$('#linkDownloadError').hidden=true;$('#linkDownload').showModal();$('#linkDownloadURL').focus();});
$('#linkDownloadCancel').addEventListener('click',()=>{if(!linkDownloadBusy)$('#linkDownload').close();});
$('#linkDownload').addEventListener('cancel',event=>{if(linkDownloadBusy)event.preventDefault();});
$('#linkDownloadForm').addEventListener('submit',async event=>{
    event.preventDefault();if(linkDownloadBusy)return;
    try{const payload=ShiyingNative.file($('#linkDownloadURL').value);linkDownloadState(true);$('#linkDownloadError').hidden=true;await chrome.downloads.download({url:payload.url,saveAs:$('#saveAs').checked});$('#linkDownload').close();notify('已交给 Chrome 下载');}catch(error){linkDownloadFailure(error);}finally{linkDownloadState(false);}
});
$('#linkUseDesktop').addEventListener('click',()=>{
    if(linkDownloadBusy||!$('#linkDownloadForm').reportValidity())return;
    let payload;try{payload=ShiyingNative.file($('#linkDownloadURL').value,currentSite?.url);}catch(error){linkDownloadFailure(error);return;}
    linkDownloadState(true);$('#linkDownloadError').hidden=true;
    ShiyingDesktop.send(()=>payload).then(()=>{$('#linkDownload').close();notify('已发送链接，请在 Ruxget 桌面版确认下载');}).catch(linkDownloadFailure).finally(()=>linkDownloadState(false));
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

