// Ruxget's own settings page (0.4.71). Everything that used to crowd the panel: who downloads (Chrome or the desktop
// app), where files go, the page button, recognition, language. The older detailed options stay behind "高级选项".
(() => {
    const $ = selector => document.querySelector(selector);
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh;
    const MODE_KEY = 'ruxgetDesktopMode';
    // pending: the choice just clicked, shown while it is being applied (it goes back only if that fails).
    let mode = 'never', pending = null, busy = false, desk = 'unpermitted', deskVersion = '';
    function toast(text) {
        const box = $('#toast'); if (!box || !text) return;
        box.textContent = text; box.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { box.hidden = true; }, 3200);
    }
    function button(label, handler, primary) {
        const element = document.createElement('button'); element.type = 'button'; element.className = primary ? 'primary-button' : 'text-button';
        element.textContent = label; element.addEventListener('click', handler); return element;
    }
    const releaseUrl = () => typeof ShiyingNative !== 'undefined' ? ShiyingNative.DESKTOP_RELEASE_URL : 'https://hidaydream.cloud/?from=ext#editions';
    function label() {
        document.title = pick('Ruxget · 设置', 'Ruxget · Settings');
        document.documentElement.lang = window.RuxgetI18n?.getLang?.() === 'en' ? 'en' : 'zh-CN';
        const text = {
            '#settingsSubtitle': ['设置', 'Settings'],
            '#desktopTitle': ['交给桌面版', 'Hand downloads to the desktop app'],
            '#desktopIntro': ['插件负责识别视频并完成日常下载；大文件、长视频、网盘和 BT 交给桌面版，支持多线程下载与断点续传，关闭浏览器后任务仍会继续。', 'The extension finds videos and handles everyday downloads. Large files, long videos, cloud drives and BT go to the desktop app, which downloads with several connections, resumes after a break and keeps going after Chrome closes.'],
            '[data-label=never]': ['从不', 'Never'],
            '[data-note=never]': ['所有下载都由插件完成', 'The extension downloads everything'],
            '[data-label=large]': ['大文件和长视频（推荐）', 'Large files and long videos (recommended)'],
            '[data-note=large]': ['30 分钟以上的视频、Chrome 里 50 MB 以上的文件交给桌面版，其余由插件下载', 'Videos over 30 minutes and Chrome downloads over 50 MB go to the desktop app; the rest stays in Chrome'],
            '[data-label=all]': ['全部', 'Everything'],
            '[data-note=all]': ['视频和 Chrome 里的下载都交给桌面版', 'Videos and Chrome downloads all go to the desktop app'],
            '#saveTitle': ['保存位置', 'Where files go'],
            '#folderLabel': ['下载到', 'Saved to'],
            '#saveAsLabel': ['每次保存时选择文件夹', 'Ask where to save each time'],
            '#subtitlesLabel': ['下载视频时一起保存字幕（视频有字幕时）', 'Save subtitles with the video (when it has them)'],
            '#changeFolder': ['更改 Chrome 下载文件夹', 'Change Chrome’s download folder'],
            '#openFolder': ['打开下载文件夹', 'Open downloads folder'],
            '#pageTitle': ['网页上', 'On web pages'],
            '#floatingLabel': ['在视频网页上显示下载浮钮', 'Show the download button on video pages'],
            '#recognizeLabel': ['识别网页里的视频和音频', 'Find videos and audio on web pages'],
            '#sitesLink': ['管理网站权限', 'Manage site access'],
            '#languageTitle': ['语言', 'Language'],
            '#langAuto': ['跟随浏览器', 'Same as browser'],
            '#siteLink': ['Ruxget 官网', 'Ruxget website'],
            '#helpLink': ['帮助', 'Help'],
            '#privacyLink': ['隐私说明', 'Privacy'],
            '#advancedLink': ['高级选项', 'Advanced options'],
        };
        for (const [selector, [zh, en]] of Object.entries(text)) { const node = $(selector); if (node) node.textContent = pick(zh, en); }
        $('#advancedLink').title = pick('文件类型过滤、自定义规则等，一般用不到', 'File-type filters, custom rules and more; rarely needed');
        $('#versionText').textContent = pick('版本 ', 'Version ') + chrome.runtime.getManifest().version;
        renderDesktop(); showFolder().catch(() => {});
    }
    // --- Who downloads -------------------------------------------------------------------------------------------
    async function readMode() {
        const {[MODE_KEY]: saved, ruxgetTakeover: takeover = {}} = await chrome.storage.local.get([MODE_KEY, 'ruxgetTakeover']);
        // Before 0.4.71 there was only the takeover switch: on means "large".
        return ['never', 'large', 'all'].includes(saved) ? saved : takeover.enabled ? 'large' : 'never';
    }
    async function checkDesktop() {
        desk = typeof RuxgetOffer !== 'undefined' ? await RuxgetOffer.desktop().catch(() => 'unknown') : 'unknown';
        deskVersion = '';
        if (desk === 'ready') { try { deskVersion = (await chrome.runtime.sendNativeMessage('org.shiying.desktop', {action: 'ping'}))?.version || ''; } catch { /* still ready */ } }
        renderDesktop();
    }
    function renderDesktop() {
        document.querySelectorAll('input[name=desktopMode]').forEach(input => { input.checked = input.value === (pending || mode); input.disabled = busy; });
        const status = $('#desktopStatus'), actions = $('#desktopActions');
        status.dataset.state = desk;
        status.textContent = {
            ready: pick(`桌面版已连接${deskVersion ? '（' + deskVersion + '）' : ''}`, `Ruxget Desktop is connected${deskVersion ? ' (' + deskVersion + ')' : ''}`),
            missing: pick('还没装桌面版（免费，3 MB）', 'Ruxget Desktop isn’t installed yet (free, 3 MB)'),
            unpermitted: pick('还没允许插件连接桌面版', 'The extension isn’t allowed to talk to Ruxget Desktop yet'),
            unknown: pick('桌面版没有响应', 'Ruxget Desktop didn’t answer'),
        }[desk] || '';
        const list = [];
        // Through ShiyingNative.send, like the panel's old ⋯ → 打开桌面版: it also tells the desktop app where Chrome saves.
        if (desk === 'ready') list.push(button(pick('打开桌面版', 'Open Ruxget Desktop'), () => (typeof ShiyingNative !== 'undefined' ? ShiyingNative.send(() => ({action: 'show'})) : chrome.runtime.sendNativeMessage('org.shiying.desktop', {action: 'show'})).catch(error => { if (!error?.cancelled) toast(pick('桌面版没有响应', 'Ruxget Desktop didn’t answer')); })));
        // Not installed, or not known yet: getting the app is the one primary action on the page (free, 3 MB, no ads).
        const offer = desk === 'missing' || desk === 'unpermitted';
        if (offer) list.push(button(pick('下载桌面版', 'Get Ruxget Desktop'), () => chrome.tabs.create({url: releaseUrl()}), true));
        if (desk === 'unpermitted') list.push(button(pick('已安装？连接桌面版', 'Already installed? Connect it'), async () => { if (await allow()) await checkDesktop(); }));
        const facts = $('#desktopFacts'); if (facts) { facts.hidden = !offer; facts.querySelector('[data-fact=free]').textContent = pick('免费', 'Free'); facts.querySelector('[data-fact=ads]').textContent = pick('无广告', 'No ads'); }
        // The shared download link (js/ruxget-desktop-get.js) is only needed here when neither the button nor the app is there.
        document.querySelectorAll('.settings-card .desktop-get-row').forEach(row => { row.hidden = offer || desk === 'ready'; });
        list.push(button(pick('桌面版设置与帮助', 'Desktop app help'), () => chrome.tabs.create({url: chrome.runtime.getURL('shiying-desktop.html')})));
        actions.replaceChildren(...list);
    }
    async function allow() {
        let granted = false;
        try { granted = await chrome.permissions.request({permissions: ['nativeMessaging']}); } catch { granted = false; }
        if (!granted) toast(pick('你没有允许 Ruxget 连接桌面版，设置保持「从不」', 'You didn’t allow Ruxget to connect to the desktop app, so this stays at “Never”'));
        return granted;
    }
    async function setMode(next) {
        if (busy || next === mode) return;
        busy = true; renderDesktop();
        try {
            if (next !== 'never') {
                if (!await allow()) return;
                await checkDesktop();
                if (desk !== 'ready') { toast(desk === 'missing' ? pick('先安装桌面版，再选这一项', 'Install Ruxget Desktop first') : pick('桌面版没有响应，先打开它再试', 'Ruxget Desktop didn’t answer; open it and try again')); return; }
                // Chrome's own downloads: over 50 MB ("large") or over 1 MB ("all") go to the desktop app.
                const {ruxgetTakeover: current = {}} = await chrome.storage.local.get('ruxgetTakeover');
                await chrome.storage.local.set({ruxgetTakeover: Object.assign({skipHosts: []}, current, next === 'all' ? {enabled: true, minMB: 1, minChosen: true} : {enabled: true, minMB: 50, minChosen: false})});
                if (typeof RuxgetOffer !== 'undefined') await chrome.storage.local.remove(RuxgetOffer.CARD).catch(() => {});
            } else if (typeof RuxgetOffer !== 'undefined') {
                await RuxgetOffer.turnOff();
                // A clear "never": the desktop offer doesn't open the panel by itself again.
                await RuxgetOffer.never?.().catch?.(() => {});
            }
            await chrome.storage.local.set({[MODE_KEY]: next});
            mode = next;
            toast({never: pick('已设为：从不交给桌面版', 'Set: never hand over'), large: pick('已设为：大文件和长视频交给桌面版', 'Set: large files and long videos go to the desktop app'), all: pick('已设为：全部交给桌面版', 'Set: everything goes to the desktop app')}[next]);
        } finally { busy = false; renderDesktop(); }
    }
    document.querySelectorAll('input[name=desktopMode]').forEach(input => input.addEventListener('change', () => { const next = input.value; if (busy) { renderDesktop(); return; } pending = next; renderDesktop(); setMode(next).catch(error => toast(error.message)).finally(() => { pending = null; renderDesktop(); }); }));
    // --- Where files go ------------------------------------------------------------------------------------------
    async function showFolder() {
        const folder = typeof ShiyingNative !== 'undefined' ? await ShiyingNative.chromeFolder() : '';
        $('#folderPath').textContent = folder ? folder.replace(/[\\/]+$/, '') + '\\Ruxget' : pick('Chrome 的下载文件夹 \\ Ruxget', 'Chrome’s downloads folder \\ Ruxget');
    }
    $('#changeFolder').addEventListener('click', () => chrome.tabs.create({url: 'chrome://settings/downloads'}));
    $('#openFolder').addEventListener('click', () => { try { chrome.downloads.showDefaultFolder(); } catch { /* nothing to show */ } });
    $('#saveAs').addEventListener('change', event => chrome.storage.sync.set({saveAs: event.target.checked}).then(() => toast(event.target.checked ? pick('保存时会询问文件夹', 'Chrome will ask where to save') : pick('直接保存到下载文件夹', 'Files save straight to the downloads folder'))));
    $('#subtitles').addEventListener('change', event => chrome.storage.local.set({ruxgetSaveSubtitles: event.target.checked}).then(() => toast(event.target.checked ? pick('下载视频时会一起保存字幕', 'Subtitles are saved with the video') : pick('不再单独保存字幕', 'Subtitles are no longer saved'))));
    // --- On web pages --------------------------------------------------------------------------------------------
    $('#floating').addEventListener('change', async event => {
        const {shiyingFloating: current = {}} = await chrome.storage.local.get('shiyingFloating');
        await chrome.storage.local.set({shiyingFloating: Object.assign({}, current, {hidden: !event.target.checked})});
        toast(event.target.checked ? pick('已开启；刷新视频网页后出现', 'On; refresh a video page to see it') : pick('已关闭网页下载浮钮', 'The page download button is off'));
    });
    $('#recognize').addEventListener('change', async event => {
        const {enable = true} = await chrome.storage.sync.get('enable');
        if (enable !== event.target.checked) { const now = await chrome.runtime.sendMessage({Message: 'enable'}).catch(() => enable); event.target.checked = now !== false; }
        toast(event.target.checked ? pick('已恢复识别', 'Detection is on') : pick('已暂停识别，已找到的仍可下载', 'Detection paused; items already found can still be downloaded'));
    });
    // --- Language ------------------------------------------------------------------------------------------------
    document.querySelectorAll('input[name=language]').forEach(input => input.addEventListener('change', async () => {
        if (window.RuxgetI18n) { await RuxgetI18n.setLanguage(input.value); label(); }
    }));
    // --- Start ---------------------------------------------------------------------------------------------------
    (async () => {
        if (window.RuxgetI18n) await RuxgetI18n.ready().catch(() => {});
        const [{saveAs = false, enable = true}, {shiyingFloating: floating = {}}, language] = await Promise.all([
            chrome.storage.sync.get(['saveAs', 'enable']), chrome.storage.local.get(['shiyingFloating', 'ruxgetSaveSubtitles']),
            chrome.storage.local.get(window.RuxgetI18n?.STORAGE_KEY || 'ruxgetUiLanguage')]);
        $('#saveAs').checked = !!saveAs; $('#recognize').checked = enable !== false; // The page button shows unless it was hidden on purpose (shiying-floating.js reads it that way).
        $('#floating').checked = floating.hidden !== true;
        $('#subtitles').checked = (await chrome.storage.local.get('ruxgetSaveSubtitles')).ruxgetSaveSubtitles === true;
        const lang = language[window.RuxgetI18n?.STORAGE_KEY || 'ruxgetUiLanguage'] || 'auto';
        document.querySelectorAll('input[name=language]').forEach(input => { input.checked = input.value === lang; });
        mode = await readMode();
        label();
        await checkDesktop();
    })().catch(error => toast(error.message));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.ruxgetChromeFolder) showFolder().catch(() => {});
        if (area === 'local' && (changes[MODE_KEY] || changes.ruxgetTakeover) && !busy) readMode().then(next => { mode = next; renderDesktop(); }).catch(() => {});
        if (area === 'local' && changes.ruxgetSaveSubtitles) $('#subtitles').checked = changes.ruxgetSaveSubtitles.newValue === true;
        if (area === 'local' && changes.shiyingFloating) $('#floating').checked = changes.shiyingFloating.newValue?.hidden !== true;
        if (area === 'sync' && changes.saveAs) $('#saveAs').checked = changes.saveAs.newValue === true;
        if (area === 'sync' && changes.enable) $('#recognize').checked = changes.enable.newValue !== false;
    });
})();
