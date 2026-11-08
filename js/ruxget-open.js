// Open a finished Chrome download (play a video, run an installer) from the panel.
// chrome.downloads.open needs the optional "downloads.open" permission and a user gesture, so this must run straight
// from a click or double-click in an extension page, never from the service worker.
// Windows still checks the file: Chrome marks every download as coming from the internet.
// 0.4.81: every entry (the site-download card, "已下载", the media rows, the progress page) asks here whether the saved
// file is still there, so they all agree. Chrome doesn't watch its files: a search starts a check on disk (at most once
// every 10 seconds) and a missing file is reported a moment later as downloads.onChanged {exists}. look() waits briefly
// for that answer.
(function () {
    const pick = (zh, en) => (window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh);
    const PERMISSION = {permissions: ['downloads.open']};
    const GONE = () => pick('文件已被移动或删除', 'The file was moved or deleted');
    // The download record after Chrome has looked on disk (up to `wait` ms; a missing file is reported well within it).
    async function look(id, wait = 250) {
        let heard = null;
        const listener = change => { if (change.id === id && change.exists) heard = change.exists.current; };
        try { chrome.downloads.onChanged.addListener(listener); } catch { /* no events: the first answer has to do */ }
        try {
            const [first] = await chrome.downloads.search({id}).catch(() => []);
            if (!first || first.state !== 'complete' || first.exists === false) return first || null;
            const end = performance.now() + wait;
            while (heard === null && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 25));
            if (heard === null) return first;
            const [again] = await chrome.downloads.search({id}).catch(() => []);
            return again ? Object.assign({}, again, {exists: heard}) : Object.assign({}, first, {exists: heard});
        } finally { try { chrome.downloads.onChanged.removeListener(listener); } catch { /* already gone */ } }
    }
    // true when Chrome knows the download finished but its file is no longer on disk.
    async function gone(id) {
        if (!Number.isInteger(id)) return false;
        const item = await look(id).catch(() => null);
        return !!item && item.state === 'complete' && item.exists === false;
    }
    async function file(id, say = () => {}) {
        if (!Number.isInteger(id)) return false;
        const item = await look(id).catch(() => null);
        if (!item) { say(pick('在 Chrome 的下载记录里找不到这个文件了，可以在下载文件夹里找', 'Chrome no longer lists this download; look for it in your downloads folder')); return false; }
        if (item.state !== 'complete') { say(pick('文件还没下载完成', 'The file hasn’t finished downloading')); return false; }
        // Told straight away, before any permission is asked for.
        if (item.exists === false) { say(pick('文件已不在原来的位置，可能被移动或删除了', 'The file is no longer where it was saved')); notifyGone(id); return false; }
        let granted = await chrome.permissions.contains(PERMISSION).catch(() => false);
        if (!granted) {
            granted = await chrome.permissions.request(PERMISSION).catch(() => false);
            if (!granted) {
                // Chrome looks on disk at most every 10 seconds, so the file may have turned out gone in the meantime.
                const after = await look(id, 0).catch(() => null);
                if (after?.exists === false) { say(pick('文件已不在原来的位置，可能被移动或删除了', 'The file is no longer where it was saved')); notifyGone(id); return false; }
                say(pick('没有允许打开文件，可以到下载文件夹里打开它', 'Opening files wasn’t allowed. You can open it from your downloads folder instead')); return false;
            }
        }
        try { await chrome.downloads.open(id); return true; }
        catch (error) {
            // The permission dialog can use up the click; the next try works.
            say(/gesture/i.test(String(error?.message)) ? pick('已允许，请再打开一次', 'Allowed. Open it once more') : pick('打不开这个文件：', 'Couldn’t open the file: ') + (error?.message || error));
            return false;
        }
    }
    // Whoever shows this download hears that its file turned out to be gone (an open attempt found out first).
    const watchers = new Set();
    function notifyGone(id) { for (const watcher of watchers) { try { watcher(id); } catch { /* one view failing doesn't stop the others */ } } }
    const onGone = watcher => { watchers.add(watcher); };
    window.RuxgetOpen = {file, gone, look, onGone, goneText: GONE};
})();
