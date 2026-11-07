// Open a finished Chrome download (play a video, run an installer) from the panel.
// chrome.downloads.open needs the optional "downloads.open" permission and a user gesture, so this must run straight
// from a click or double-click in an extension page, never from the service worker.
// Windows still checks the file: Chrome marks every download as coming from the internet.
(function () {
    const pick = (zh, en) => (window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh);
    const PERMISSION = {permissions: ['downloads.open']};
    async function file(id, say = () => {}) {
        if (!Number.isInteger(id)) return false;
        const [item] = await chrome.downloads.search({id}).catch(() => []);
        if (!item || item.state !== 'complete') { say(pick('文件还没下载完成', 'The file hasn’t finished downloading')); return false; }
        if (item.exists === false) { say(pick('文件已不在原来的位置，可能被移动或删除了', 'The file is no longer where it was saved')); return false; }
        let granted = await chrome.permissions.contains(PERMISSION).catch(() => false);
        if (!granted) {
            granted = await chrome.permissions.request(PERMISSION).catch(() => false);
            if (!granted) { say(pick('没有允许打开文件，文件仍在 Chrome 的下载文件夹里', 'Opening files wasn’t allowed; the file is still in Chrome’s download folder')); return false; }
        }
        try { await chrome.downloads.open(id); return true; }
        catch (error) {
            // The permission dialog can use up the click; the next try works.
            say(/gesture/i.test(String(error?.message)) ? pick('已允许，请再打开一次', 'Allowed. Open it once more') : pick('打不开这个文件：', 'Couldn’t open the file: ') + (error?.message || error));
            return false;
        }
    }
    window.RuxgetOpen = {file};
})();
