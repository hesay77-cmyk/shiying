// Ruxget 0.4.79: the extension's service worker. It loads Ruxget's own background modules and the media recognition
// engine (js/ruxget-engine.js, written from spec 05), and owns the toolbar and link menus, the side panel path per tab,
// the first-run help page and the link-download error note. Nothing here comes from CatCatch.
importScripts(
    '/js/shiying-access.js',
    '/js/ruxget-engine.js',
    '/js/ruxget-probe.js',
    '/js/shiying-background.js',
    '/js/shiying-native.js',
    '/js/shiying-takeover.js',
    '/js/shiying-desktop-tasks.js',
    '/js/ruxget-offer.js',
    '/js/shiying-netdisk.js',
    '/js/shiying-netdisk-background.js'
);

// Menus: the toolbar icon's right-click (takeover on/off, install or connect the desktop app) and links on web pages.
// Titles follow Ruxget's own language setting (RuxgetOffer.menuTitles); rebuilding runs one after another.
const RuxgetMenus = (() => {
    let queue = Promise.resolve();
    const fallback = {uiActionTakeover:'大文件交给桌面版', uiActionDesktop:'安装或连接桌面版…', uiContextDownloadLink:'用 Ruxget 下载此链接'};
    const build = () => new Promise(resolve => chrome.contextMenus.removeAll(() => {
        void chrome.runtime.lastError;
        chrome.contextMenus.create({id:'ruxget-action-takeover', type:'checkbox', checked:false, title:fallback.uiActionTakeover, contexts:['action']}, () => void chrome.runtime.lastError);
        chrome.contextMenus.create({id:'ruxget-action-desktop', title:fallback.uiActionDesktop, contexts:['action']}, () => void chrome.runtime.lastError);
        chrome.contextMenus.create({id:'shiying-link-desktop', title:fallback.uiContextDownloadLink, contexts:['link'], targetUrlPatterns:['http://*/*','https://*/*'], documentUrlPatterns:['http://*/*','https://*/*']}, () => {
            void chrome.runtime.lastError;
            Promise.resolve(typeof RuxgetOffer !== 'undefined' ? RuxgetOffer.syncMenu() : null).catch(() => {}).finally(resolve);
        });
    }));
    return {rebuild: () => (queue = queue.then(build, build))};
})();
chrome.runtime.onInstalled.addListener(details => {
    RuxgetMenus.rebuild();
    if (details.reason === 'install') chrome.tabs.create({url:'shiying-help.html'});
});
chrome.runtime.onStartup.addListener(() => RuxgetMenus.rebuild());
chrome.runtime.onMessage.addListener(message => {
    if (message && message.Message === 'ruxgetLocaleChanged' && typeof RuxgetOffer !== 'undefined') RuxgetOffer.menuTitles().catch(() => {});
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'shiying-link-desktop') {
        let payload;
        try { payload = ShiyingNative.file(info.linkUrl, info.frameUrl || tab?.url); } catch (error) { showLinkDownloadError(error, tab); return; }
        ShiyingNative.send(() => payload).catch(error => { if (!error.cancelled) showLinkDownloadError(error, tab); });
        return;
    }
    if (info.menuItemId === 'ruxget-action-takeover') { RuxgetOffer.fromMenu(!!info.checked).catch(() => RuxgetOffer.syncMenu()); return; }
    if (info.menuItemId === 'ruxget-action-desktop') chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html#connection')});
});

// A link download that could not start leaves its message for the panel, and opens the panel once to show it.
async function showLinkDownloadError(error, tab) {
    try {
        await chrome.storage.session.set({shiyingLinkDownloadError:{text:error.message || String(error), createdAt:Date.now()}});
        if (!/请按新打开/.test(error.message) && chrome.action.openPopup) await chrome.action.openPopup(Number.isInteger(tab?.windowId) ? {windowId:tab.windowId} : {});
    } catch { /* The message stays for the next time the panel opens. */ }
}

// The side panel shows the panel for the tab it sits beside.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId <= 0 || !/^https?:/.test(tab?.url || '')) return;
    chrome.sidePanel?.setOptions?.({tabId, path:'shiying.html?tabId=' + tabId});
});
