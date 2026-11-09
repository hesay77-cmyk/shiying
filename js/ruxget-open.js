// Open a finished Chrome download (play a video, run an installer) from the panel.
// chrome.downloads.open needs the optional "downloads.open" permission and a user gesture, so this must run straight
// from a click or double-click in an extension page, never from the service worker.
// Windows still checks the file: Chrome marks every download as coming from the internet.
// 0.4.81: every entry (the site-download card, "已下载", the media rows, the progress page) asks here whether the saved
// file is still there, so they all agree. Chrome doesn't watch its files: a search starts a check on disk (at most once
// every 10 seconds) and a missing file is reported a moment later as downloads.onChanged {exists}. look() waits briefly
// for that answer.
// 0.4.81 (second round): one check isn't enough. Within those 10 seconds a search only returns what Chrome knew before
// (it said "still there" for a file deleted a moment ago), and after a restart Chrome thinks every file is there until
// it looks again. So:
//   - a file found missing is remembered (ruxgetGoneFiles, by download id and start time), and every view reads that
//     first: the panel opened again, or Chrome restarted, says "moved or deleted" straight away;
//   - while a page shows finished downloads (watch()), it asks Chrome again every 11.5 s (Chrome counts the 10 seconds
//     in whole seconds and needs more than 10) and whenever it comes back into view, so a file deleted while the panel
//     stays open is noticed within about 12 seconds;
//   - after opening a file, Chrome itself looks on disk (no 10-second limit), and a missing file is then explained.
(function () {
    const pick = (zh, en) => (window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh);
    const PERMISSION = {permissions: ['downloads.open']};
    const GONE = () => pick('文件已被移动或删除', 'The file was moved or deleted');
    const GONE_SAY = () => pick('文件已不在原来的位置，可能被移动或删除了', 'The file is no longer where it was saved');
    const KEY = 'ruxgetGoneFiles', AGAIN = 11500;
    let known = {};
    const ready = chrome.storage.local.get(KEY).then(data => { known = Object.assign({}, data[KEY] || {}, known); }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[KEY]) known = Object.assign({}, changes[KEY].newValue || {}); });
    const has = id => Object.prototype.hasOwnProperty.call(known, id);
    // Remembered as missing: the same download (same id and start time; a cleared history can hand out an id again).
    const knownGone = item => !!item && has(item.id) && (!known[item.id] || !item.startTime || known[item.id] === item.startTime);
    // Synchronous, for a first render: true only when this download id was found missing before.
    const remembered = id => has(id);
    async function remember(item) {
        if (!item || knownGone(item)) return;
        known[item.id] = item.startTime || '';
        const {[KEY]: saved = {}} = await chrome.storage.local.get(KEY).catch(() => ({}));
        const next = Object.assign({}, saved, {[item.id]: item.startTime || ''}), ids = Object.keys(next);
        for (const old of ids.slice(0, Math.max(0, ids.length - 300))) delete next[old];
        await chrome.storage.local.set({[KEY]: next}).catch(() => {});
    }
    // The download record after Chrome has looked on disk (up to `wait` ms; a missing file is reported well within it).
    async function look(id, wait = 250) {
        await ready;
        let heard = null;
        const listener = change => { if (change.id === id && change.exists) heard = change.exists.current; };
        try { chrome.downloads.onChanged.addListener(listener); } catch { /* no events: the first answer has to do */ }
        try {
            const [first] = await chrome.downloads.search({id}).catch(() => []);
            if (first && first.state === 'complete' && knownGone(first)) return Object.assign({}, first, {exists: false});
            if (first?.state === 'complete' && first.exists === false) remember(first);
            if (!first || first.state !== 'complete' || first.exists === false) return first || null;
            const end = performance.now() + wait;
            while (heard === null && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 25));
            if (heard === null) return first;
            const [again] = await chrome.downloads.search({id}).catch(() => []);
            const result = Object.assign({}, again || first, {exists: heard});
            if (heard === false) remember(result);
            return result;
        } finally { try { chrome.downloads.onChanged.removeListener(listener); } catch { /* already gone */ } }
    }
    // true when Chrome knows the download finished but its file is no longer on disk.
    async function gone(id) {
        if (!Number.isInteger(id)) return false;
        const item = await look(id).catch(() => null);
        return !!item && item.state === 'complete' && item.exists === false;
    }
    // Several downloads at once (the "已下载" list): {id: item, exists corrected by what is remembered}. No waiting:
    // the searches make Chrome look on disk, and what it finds comes back through onGone.
    async function states(ids) {
        await ready;
        const result = {};
        await Promise.all(ids.filter(Number.isInteger).map(async id => {
            const [item] = await chrome.downloads.search({id}).catch(() => []);
            if (!item) return;
            if (item.state === 'complete' && item.exists === false) remember(item);
            result[id] = item.state === 'complete' && knownGone(item) ? Object.assign({}, item, {exists: false}) : item;
        }));
        return result;
    }
    async function file(id, say = () => {}) {
        if (!Number.isInteger(id)) return false;
        const item = await look(id).catch(() => null);
        if (!item) { say(pick('在 Chrome 的下载记录里找不到这个文件了，可以在下载文件夹里找', 'Chrome no longer lists this download; look for it in your downloads folder')); return false; }
        if (item.state !== 'complete') { say(pick('文件还没下载完成', 'The file hasn’t finished downloading')); return false; }
        // Told straight away, before any permission is asked for.
        if (item.exists === false) { say(GONE_SAY()); notifyGone(id); return false; }
        let granted = await chrome.permissions.contains(PERMISSION).catch(() => false);
        if (!granted) {
            granted = await chrome.permissions.request(PERMISSION).catch(() => false);
            if (!granted) {
                // Chrome looks on disk at most every 10 seconds, so the file may have turned out gone in the meantime.
                const after = await look(id, 0).catch(() => null);
                if (after?.exists === false) { say(GONE_SAY()); notifyGone(id); return false; }
                say(pick('没有允许打开文件，可以到下载文件夹里打开它', 'Opening files wasn’t allowed. You can open it from your downloads folder instead')); return false;
            }
        }
        try { await chrome.downloads.open(id); }
        catch (error) {
            const message = String(error?.message || error);
            if (/deleted|removed/i.test(message)) { remember(item); say(GONE_SAY()); notifyGone(id); return false; }
            // The permission dialog can use up the click; the next try works.
            say(/gesture/i.test(message) ? pick('已允许，请再打开一次', 'Allowed. Open it once more') : pick('打不开这个文件：', 'Couldn’t open the file: ') + message);
            return false;
        }
        // Opening makes Chrome look on disk right away (no 10-second limit): a file deleted a moment ago opens nothing,
        // so say why instead of leaving the click without an answer.
        const after = await look(id, 1200).catch(() => null);
        if (after?.exists === false) { say(GONE_SAY()); notifyGone(id); return false; }
        return true;
    }
    // Whoever shows this download hears that its file turned out to be gone.
    const watchers = new Set();
    function notifyGone(id) { for (const watcher of watchers) { try { watcher(id); } catch { /* one view failing doesn't stop the others */ } } }
    const onGone = watcher => { watchers.add(watcher); };
    try {
        chrome.downloads.onChanged.addListener(change => {
            if (change.exists?.current !== false) return;
            chrome.downloads.search({id: change.id}).then(([item]) => remember(item || {id: change.id})).catch(() => {});
            notifyGone(change.id);
        });
    } catch { /* a page without the downloads API */ }
    // Pages register a function returning the download ids they show as finished and present; while the page is in
    // view Chrome is asked about them again (see the note at the top).
    const shown = new Set();
    let timer = 0;
    function poke() {
        clearTimeout(timer); timer = 0;
        if (document.hidden) return;
        const ids = new Set();
        for (const list of shown) { try { for (const id of list() || []) if (Number.isInteger(id) && !has(id)) ids.add(id); } catch { /* skip */ } }
        if (!ids.size) return;
        states([...ids]).then(items => { for (const item of Object.values(items)) if (item.state === 'complete' && item.exists === false) notifyGone(item.id); }).catch(() => {});
        timer = setTimeout(poke, AGAIN);
    }
    // Ask now (the first answer may be up to 10 s old), again 11.5 s later, and so on while in view.
    const soon = () => { clearTimeout(timer); timer = setTimeout(poke, 0); };
    function watch(list) { shown.add(list); soon(); return soon; }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
    window.addEventListener('focus', soon);
    window.RuxgetOpen = {file, gone, look, states, onGone, watch, remembered, goneText: GONE, goneSay: GONE_SAY};
})();
