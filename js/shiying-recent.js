// "已下载" tab (0.4.69; before, a folded "最近下载" box at the bottom): recent downloads, newest first. Three sources in
// one list: Chrome's own downloads (also the ones started outside Ruxget), site videos saved by Ruxget, and the files
// Ruxget Desktop took over or is downloading now. A finished one opens on double-click (or Enter), like a file in
// Explorer; its single click does nothing, so a slow double-click can never bring up the desktop window or a new tab
// first. A finished row's small folder button shows the file in its folder (desktop downloads too, without the desktop
// window); unfinished rows keep their click (desktop window, progress page). The bin deletes after a confirm.
(() => {
    const box = document.querySelector('#recentDownloads'), list = document.querySelector('#recentList'), empty = document.querySelector('#recentEmpty'), folder = document.querySelector('#openDownloadFolder'), history = document.querySelector('#openDownloadHistory');
    if (!box || !list) return;
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh, tr = text => window.RuxgetText ? RuxgetText.tr(text) : text;
    const SHOWN = 20, HIDDEN_KEY = 'ruxgetRecentHidden';
    let confirming = '', working = '', pressed = {id: '', at: -1e9}, keyOpened = -1e9, focusedConfirm = '';
    const done = job => ['complete', 'error', 'cancelled'].includes(job.status);
    const say = text => { if (typeof notify === 'function' && text) notify(text); };
    // Never throws synchronously, even when the nativeMessaging permission was taken back.
    const native = message => Promise.resolve().then(() => chrome.runtime.sendNativeMessage('org.shiying.desktop', message));
    // The double-click is handled on the list and remembers the row pressed, because the list re-renders while
    // something downloads.
    const openers = new Map();
    list.addEventListener('mousedown', event => { pressed = {id: event.target.closest('li[data-id]')?.dataset.id || '', at: performance.now()}; });
    list.addEventListener('dblclick', event => {
        if (event.target.closest('.recent-delete,.recent-show,.recent-confirm')) return;
        const id = event.target.closest('li[data-id]')?.dataset.id || (performance.now() - pressed.at < 1500 ? pressed.id : '');
        const open = openers.get(id); if (open) open();
    });
    // A desktop download opens straight from its saved task list: the desktop window isn't brought up, and the app
    // isn't started when it isn't running.
    async function openDesktop(job) {
        const reply = await native({action: 'open', id: job.id}).catch(() => null);
        if (reply?.ok) return;
        if (!reply) say(pick('桌面版没有响应', 'Ruxget Desktop didn’t respond'));
        else if (reply.error === '不支持的浏览器操作') say(pick('请把 Ruxget 桌面版更新到最新版，就能在这里双击打开', 'Update Ruxget Desktop to open files from here'));
        else say(tr(reply.error || ''));
    }
    // The folder button of a finished desktop download: Explorer opens with the file selected, no desktop window.
    async function revealDesktop(job) {
        const reply = await native({action: 'reveal', id: job.id}).catch(() => null);
        if (reply?.ok) return;
        if (!reply) say(pick('桌面版没有响应', 'Ruxget Desktop didn’t respond'));
        else if (reply.error === '不支持的浏览器操作') say(pick('请把 Ruxget 桌面版更新到最新版，就能在这里打开文件夹', 'Update Ruxget Desktop to open the folder from here'));
        else say(tr(reply.error || ''));
    }
    function action(label, className, handler) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = className; button.textContent = label; button.disabled = !!working;
        button.addEventListener('click', handler); return button;
    }
    // "只移除记录" for a Chrome download only hides it here; Chrome's own download list keeps it.
    async function hide(downloadId) {
        const {[HIDDEN_KEY]: hidden = []} = await chrome.storage.local.get(HIDDEN_KEY);
        await chrome.storage.local.set({[HIDDEN_KEY]: [...hidden.filter(id => id !== downloadId), downloadId].slice(-300)});
    }
    async function removeChrome(job, removeFile) {
        const id = job.downloadId;
        if (job.status === 'running' || job.status === 'paused') { await chrome.downloads.cancel(id).catch(() => {}); await chrome.downloads.erase({id}).catch(() => {}); return pick('已停止并删除', 'Stopped and deleted'); }
        if (!removeFile) { await hide(id); return job.status === 'complete' && !job.gone ? pick('已从列表移除，文件保留', 'Removed from the list; file kept') : pick('已从列表移除', 'Removed from the list'); }
        let removed = true;
        try { await chrome.downloads.removeFile(id); } catch { removed = false; }
        await chrome.downloads.erase({id}).catch(() => {});
        return removed ? pick('已删除文件', 'File deleted') : pick('文件已不在原位置，已从列表移除', 'The file was already gone; removed from the list');
    }
    async function remove(job, removeFile) {
        working = job.id; render().catch(() => {});
        try {
            if (job.chrome) { say(await removeChrome(job, removeFile)); return; }
            const reply = await chrome.runtime.sendMessage(job.desktop ? {Message: 'ruxgetDesktopDelete', id: job.id, deleteFiles: removeFile} : {Message: 'shiyingPlatformDelete', id: job.id, removeFile});
            if (job.desktop) {
                if (!reply?.ok) throw new Error(reply?.error || pick('删除没有完成，请重试', 'Couldn’t delete. Try again.'));
                say(job.status === 'complete' ? (removeFile ? pick('已删除文件', 'File deleted') : pick('已从列表移除，文件保留', 'Removed from the list; file kept')) : pick('已停止并删除', 'Stopped and deleted'));
                return;
            }
            if (!reply?.ok) throw new Error(reply?.error || pick('删除没有完成，请重试', 'Couldn’t delete. Try again.'));
            say(removeFile ? (reply.removed ? pick('已删除文件', 'File deleted') : pick('已从列表移除，但没能删除文件：Chrome 已不记得它，文件可能还在下载文件夹里', 'Removed from the list, but the file wasn’t deleted: Chrome no longer knows it, so it may still be in your downloads folder')) : job.gone ? pick('已从列表移除', 'Removed from the list') : job.status === 'complete' ? pick('已从列表移除，文件保留', 'Removed from the list; file kept') : pick('已停止并删除', 'Stopped and deleted'));
        } catch (error) {
            say(tr(error.message || String(error)));
        } finally { working = ''; confirming = ''; render().catch(() => {}); }
    }
    // The confirm row replaces the item's text; what it offers depends on where the download is.
    function confirmRow(job) {
        const row = document.createElement('div'), question = document.createElement('span'), buttons = document.createElement('span');
        row.className = 'recent-confirm'; buttons.className = 'recent-confirm-actions';
        const cancel = action(pick('取消', 'Cancel'), 'recent-plain', () => { confirming = ''; render().catch(() => {}); });
        const name = String(job.title || '').length > 36 ? String(job.title).slice(0, 35) + '…' : String(job.title || pick('这个下载', 'this download'));
        if (job.gone) {
            // The file is already gone: only the record is left to remove.
            question.textContent = pick('文件已不在，从列表移除？', 'The file is gone. Remove it from the list?');
            buttons.append(action(pick('移除', 'Remove'), 'recent-danger', () => remove(job, false)), cancel);
        } else if (job.status === 'complete') {
            question.textContent = pick(`删除「${name}」？`, `Delete “${name}”?`);
            buttons.append(action(pick('删除文件', 'Delete file'), 'recent-danger', () => remove(job, true)), action(pick('只移除记录', 'Remove from list'), 'recent-plain', () => remove(job, false)), cancel);
        } else if (job.desktop && job.state === 'paused') {
            question.textContent = pick(`删除没下完的「${name}」？已下载的部分也会删除`, `Delete the unfinished “${name}”? What was downloaded so far is deleted too`);
            buttons.append(action(pick('删除', 'Delete'), 'recent-danger', () => remove(job, true)), cancel);
        } else if (done(job)) {
            question.textContent = pick('从列表移除？', 'Remove from the list?');
            buttons.append(action(pick('移除', 'Remove'), 'recent-danger', () => remove(job, !!job.desktop)), cancel);
        } else {
            question.textContent = pick(`停止并删除「${name}」？`, `Stop and delete “${name}”?`);
            buttons.append(action(pick('停止并删除', 'Stop and delete'), 'recent-danger', () => remove(job, !!job.desktop)), cancel);
        }
        row.append(question, buttons); return row;
    }
    // Desktop tasks in the same shape as browser jobs. Running ones come first, the rest by when Chrome handed them over.
    const DESKTOP_STATUS = {active: 'running', done: 'complete', failed: 'error', paused: 'cancelled'};
    async function desktopJobs() {
        const {ruxgetDesktopStatus: status} = await chrome.storage.session.get('ruxgetDesktopStatus');
        return (status?.jobs || []).map(job => ({desktop: true, id: job.id, title: job.state === 'done' && job.file ? job.file : job.title, status: DESKTOP_STATUS[job.state] || 'cancelled', state: job.state, progress: job.progress, speed: job.speed, error: job.error, time: job.state === 'active' ? Date.now() + 1 : Number(job.at) || 0}));
    }
    function desktopMeta(job) {
        const label = pick('桌面版', 'Desktop'), percent = Math.round(Number(job.progress) || 0);
        if (job.state === 'active') return [label, percent + '%', job.speed].filter(Boolean).join(' · ');
        if (job.state === 'done') return label + ' · ' + pick('下载完成', 'Downloaded');
        if (job.state === 'failed') return label + ' · ' + (job.error ? tr(job.error) : pick('失败', 'Failed'));
        return label + ' · ' + pick('已暂停', 'Paused') + ' · ' + percent + '%';
    }
    // Chrome's own downloads, minus the ones shown another way: site videos Ruxget saved (their own row) and downloads
    // Ruxget Desktop took over (Chrome's copy was cancelled, the desktop row stands for it). 0.4.81: a file deleted or
    // moved outside Chrome stays listed and says so (before, it silently dropped out of the list).
    const fileName = item => (item.filename || item.finalUrl || item.url || '').split(/[\\/]/).filter(Boolean).pop() || pick('下载的文件', 'Downloaded file');
    async function chromeJobs(siteDownloads) {
        const [items, {[HIDDEN_KEY]: hidden = []}] = await Promise.all([chrome.downloads.search({orderBy: ['-startTime'], limit: 60}).catch(() => []), chrome.storage.local.get(HIDDEN_KEY)]);
        // Also left out: incognito downloads, files Chrome holds for a safety decision (Chrome asks about those
        // itself), and the copy paused while Ruxget Desktop takes it over.
        const {ruxgetPausedForHandOver: handing = []} = await chrome.storage.session.get('ruxgetPausedForHandOver').catch(() => ({}));
        const waiting = item => item.state === 'in_progress' && item.danger && !['safe', 'accepted', 'allowlistedByPolicy', 'deepScannedSafe', 'deepScannedOpenedDangerous'].includes(item.danger);
        return items.filter(item => !item.incognito && !siteDownloads.has(item.id) && !hidden.includes(item.id) && !handing.includes(item.id) && !waiting(item) && !(item.state === 'interrupted' && item.error === 'USER_CANCELED'))
            .map(item => ({chrome: true, id: 'chrome-' + item.id, downloadId: item.id, title: fileName(item), item, time: Date.parse(item.startTime) || 0, own: item.byExtensionId === chrome.runtime.id,
                gone: item.state === 'complete' && (item.exists === false || !!window.RuxgetOpen?.remembered(item.id)),
                status: item.state === 'complete' ? 'complete' : item.state === 'in_progress' ? (item.paused ? 'paused' : 'running') : 'error'}));
    }
    const goneText = () => window.RuxgetOpen ? RuxgetOpen.goneText() : pick('文件已被移动或删除', 'The file was moved or deleted');
    // Site videos Ruxget saved through Chrome: does Chrome still find the file? (Searching makes Chrome look on disk;
    // a file found missing comes back through RuxgetOpen.onGone, which renders the list again.) 0.4.81: the row shows
    // the file's actual name, so two downloads of the same video ("… .mp4" and "… (1).mp4") can be told apart.
    async function markSiteGone(jobs) {
        const finished = jobs.filter(job => job.status === 'complete' && Number.isInteger(job.downloadId));
        const items = window.RuxgetOpen ? await RuxgetOpen.states(finished.map(job => job.downloadId)).catch(() => ({})) : {};
        for (const job of finished) {
            const item = items[job.downloadId];
            job.gone = !!item && item.state === 'complete' && item.exists === false;
            const name = String(item?.filename || job.file || '').split(/[\\/]/).filter(Boolean).pop();
            if (name) job.fileName = name;
        }
    }
    // The same sizes as the download pages (1 MB = 1024 × 1024 bytes; KB whole, MB one decimal, GB two).
    const MB = 1024 * 1024, size = bytes => bytes >= 1024 * MB ? (bytes / 1024 / MB).toFixed(2) + ' GB' : bytes >= MB ? (bytes / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
    function chromeMeta(job) {
        const item = job.item, percent = item.totalBytes > 0 ? Math.round(item.bytesReceived / item.totalBytes * 100) : 0;
        // 0.4.81: "Ruxget" for everything Ruxget started (HLS/DASH pages, file pages, pasted links, subtitles), "Chrome"
        // only for downloads started on a web page and handled by Chrome itself.
        const who = job.own ? 'Ruxget' : 'Chrome';
        if (job.gone) return who + ' · ' + goneText();
        if (job.status === 'complete') return [who, item.fileSize > 0 ? size(item.fileSize) : '', pick('下载完成', 'Downloaded')].filter(Boolean).join(' · ');
        if (job.status === 'error') return who + ' · ' + pick('下载中断', 'Interrupted');
        // Bytes as well as the percentage: a large file stays at 0% for a while and would look stuck.
        const amount = item.totalBytes > 0 ? percent + '% · ' + size(item.bytesReceived || 0) + ' / ' + size(item.totalBytes) : size(item.bytesReceived || 0);
        return job.status === 'paused' ? who + ' · ' + pick('已暂停', 'Paused') + ' · ' + amount : who + ' · ' + amount;
    }
    const icon = path => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
    let renderedRunningChrome = false, shownFiles = [];
    // While "已下载" is in view, Chrome is asked again about the files listed as present (RuxgetOpen.watch), and a file
    // found missing renders the list again.
    const askAgain = window.RuxgetOpen ? RuxgetOpen.watch(() => window.RuxgetTabs?.current?.() === 'downloads' ? shownFiles : []) : () => {};
    window.RuxgetOpen?.onGone(() => later());
    async function render() {
        const {shiyingJobIds: ids = []} = await chrome.storage.local.get('shiyingJobIds');
        const keys = ids.slice(-SHOWN).reverse().map(id => 'shiyingJob:' + id), records = await chrome.storage.local.get(keys);
        const browser = keys.map(key => records[key]).filter(Boolean).map(job => Object.assign({}, job, {time: Date.parse(job.createdAt) || 0}));
        const siteDownloads = new Set(browser.map(job => job.downloadId).filter(Number.isInteger));
        // 0.4.72: only this browser session (since Chrome started), like Chrome's own download bubble; anything still
        // running or paused stays. The full history is one click away in Chrome's download page.
        const {ruxgetSessionStart: since = 0} = await chrome.storage.session.get('ruxgetSessionStart').catch(() => ({}));
        // A desktop task counts from when it finished (first seen done), not from when it was handed over.
        const {ruxgetDesktopDoneAt: doneAt = {}} = await chrome.storage.session.get('ruxgetDesktopDoneAt').catch(() => ({}));
        const desktop = await desktopJobs(), seen = Object.assign({}, doneAt);
        for (const job of desktop) if (job.state === 'done' && !seen[job.id]) seen[job.id] = Date.now();
        if (Object.keys(seen).length !== Object.keys(doneAt).length) chrome.storage.session.set({ruxgetDesktopDoneAt: seen}).catch(() => {});
        for (const job of desktop) if (job.state === 'done') job.time = Math.max(job.time, seen[job.id] || 0);
        // 0.4.81: what Ruxget itself downloaded (site videos, its download pages, pasted links) stays listed after a
        // restart, like the download card does, and says so when its file was deleted meanwhile; only Chrome's own
        // downloads and desktop tasks are limited to this session.
        const current = job => !since || job.time >= since || (job.desktop ? job.state !== 'done' : !job.chrome || job.own || !done(job));
        const jobs = [...browser, ...desktop, ...await chromeJobs(siteDownloads)].filter(current).sort((a, b) => b.time - a.time).slice(0, SHOWN);
        await markSiteGone(jobs.filter(job => !job.desktop && !job.chrome));
        // 0.4.81: the empty note no longer promises “only since Chrome started”: what is listed depends on when Chrome
        // last started and on downloads still running, so it says “recent” and points to the full history.
        if (empty) { empty.hidden = jobs.length > 0; empty.textContent = pick('还没有最近的下载。下载的文件会显示在这里，双击即可打开；更早的下载在「全部下载记录」中。', 'No recent downloads. Files you download appear here; double-click one to open it. Older downloads are in “All downloads”.'); }
        box.setAttribute('aria-label', pick('已下载', 'Downloads'));
        if (folder) folder.textContent = pick('打开下载文件夹', 'Open downloads folder');
        if (history) history.textContent = pick('全部下载记录', 'All downloads');
        const running = jobs.filter(job => job.desktop ? job.state === 'active' : job.chrome ? job.status === 'running' : !done(job)).length;
        window.RuxgetTabs?.count('downloads', running);
        renderedRunningChrome = jobs.some(job => job.chrome && job.status === 'running');
        shownFiles = jobs.filter(job => !job.desktop && job.status === 'complete' && !job.gone && Number.isInteger(job.downloadId)).map(job => job.downloadId);
        // Keyboard focus survives the refresh (it would jump to the top of the page otherwise).
        const focused = list.contains(document.activeElement) ? {id: document.activeElement.closest('li[data-id]')?.dataset.id, index: [...(document.activeElement.closest('li') || list).querySelectorAll('button')].indexOf(document.activeElement)} : null;
        openers.clear();
        list.replaceChildren(...jobs.map(job => {
            const item = document.createElement('li');item.dataset.id = job.id;
            if (confirming === job.id) { item.append(confirmRow(job)); return item; }
            const button = document.createElement('button'), title = document.createElement('b'), meta = document.createElement('small');
            button.type = 'button'; button.className = 'recent-open'; button.dataset.status = job.status;
            const label = job.fileName || job.title;
            title.textContent = label || pick('网页视频', 'Video'); title.title = job.fileName && job.title && job.title !== job.fileName ? job.title + '\n' + job.fileName : label || '';
            const percent = Number.isFinite(Number(job.progress)) ? Math.round(Number(job.progress)) : 0;
            // 0.4.74: in English "Downloaded · double-click to open" wrapped mid-word in the 360 px panel; a finished row that
            // opens says only "Double-click to open" (being openable already means it finished).
            const withHint = text => !open ? text : pick(text + ' · 双击打开', text.replace(/ · Downloaded$/, '') + ' · Double-click to open');
            // Every finished row has the same folder button: show the file selected in its folder.
            const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', inFolder = pick('在文件夹中显示', 'Show in folder');
            const chromeFolder = id => () => { try { chrome.downloads.show(id); } catch { say(pick('文件已不在原来的位置，可能被移动或删除了', 'The file is no longer where it was saved')); } };
            let show = null, showLabel = '', showIcon = FOLDER, open = null, bar = -1;
            if (job.desktop) {
                show = () => native({action: 'show'}).catch(() => say(pick('桌面版没有响应', 'Ruxget Desktop didn’t respond')));
                showLabel = pick('在桌面版中查看', 'Show in Ruxget Desktop');
                if (job.state === 'done') { open = () => openDesktop(job); show = () => revealDesktop(job); showLabel = inFolder; }
                meta.textContent = withHint(desktopMeta(job)); button.dataset.desktop = job.state;
                if (job.state === 'active') bar = percent;
            } else if (job.chrome) {
                // Chrome saved it, so Chrome opens it: no desktop app involved.
                if (job.status === 'complete' && !job.gone) {
                    open = () => RuxgetOpen.file(job.downloadId, say);
                    show = chromeFolder(job.downloadId); showLabel = inFolder;
                }
                meta.textContent = withHint(chromeMeta(job));
                if (job.status === 'running' && job.item.totalBytes > 0) bar = Math.round(job.item.bytesReceived / job.item.totalBytes * 100);
            } else {
                show = () => chrome.tabs.create({url: chrome.runtime.getURL('shiying-task.html?id=' + encodeURIComponent(job.id))});
                showLabel = pick('下载详情', 'Download details');
                if (job.status === 'complete' && Number.isInteger(job.downloadId) && !job.gone) { open = () => RuxgetOpen.file(job.downloadId, say); show = chromeFolder(job.downloadId); showLabel = inFolder; }
                const state = job.gone ? goneText() : job.status === 'complete' ? pick('下载完成', 'Downloaded') : job.status === 'error' ? tr(job.error || job.stage) : job.status === 'cancelled' ? pick('已取消', 'Cancelled') : tr(job.stage) + ' · ' + percent + '%';
                meta.textContent = withHint('Ruxget · ' + (job.format === 'mp3' ? 'MP3' : (job.label || (job.height ? job.height + 'p' : 'MP4'))) + ' · ' + state);
            }
            button.append(title, meta);
            if (bar >= 0) { const line = document.createElement('i'); line.className = 'recent-bar'; line.style.setProperty('--progress', bar + '%'); button.append(line); }
            const extra = [];
            // A finished site video keeps its 下载详情 (the picture and sound checks) beside the folder button.
            if (open && !job.desktop && !job.chrome) {
                const details = document.createElement('button');
                details.type = 'button'; details.className = 'recent-show'; details.disabled = !!working;
                details.title = details.ariaLabel = pick('下载详情', 'Download details'); details.innerHTML = icon('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01');
                details.addEventListener('click', event => { if (event.detail <= 1) chrome.tabs.create({url: chrome.runtime.getURL('shiying-task.html?id=' + encodeURIComponent(job.id))}); }); extra.push(details);
            }
            if (open) {
                openers.set(job.id, open);
                button.title = pick('双击打开文件', 'Double-click to open the file');
                // Mouse clicks wait for the double-click; Enter / Space (detail 0) open right away, once per second
                // so a held-down key doesn't start the same program again and again.
                button.addEventListener('click', event => { if (event.detail !== 0 || performance.now() - keyOpened < 1000) return; keyOpened = performance.now(); open(); });
                const more = document.createElement('button');
                more.type = 'button'; more.className = 'recent-show'; more.disabled = !!working;
                more.title = more.ariaLabel = showLabel; more.innerHTML = icon(showIcon);
                more.addEventListener('click', event => { if (event.detail <= 1) show(); }); extra.push(more);
            } else if (job.gone) {
                // Nothing to open: a double-click (or Enter) says why, the same words as the card and the media rows.
                const why = () => say(pick('文件已不在原来的位置，可能被移动或删除了', 'The file is no longer where it was saved'));
                openers.set(job.id, why); button.title = goneText(); button.dataset.gone = '1';
                button.addEventListener('click', event => { if (event.detail === 0) why(); });
            } else if (show) {
                button.title = showLabel;
                button.addEventListener('click', show);
            } else button.classList.add('is-static');
            const bin = document.createElement('button');
            bin.type = 'button'; bin.className = 'recent-delete'; bin.disabled = !!working;
            bin.title = bin.ariaLabel = pick('删除', 'Delete');
            bin.innerHTML = icon('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3');
            bin.addEventListener('click', () => { confirming = job.id; render().catch(() => {}); });
            item.append(button, ...extra, bin); return item;
        }));
        const focus = list.querySelector('.recent-confirm .recent-plain:last-child');
        if (confirming && focus && focusedConfirm !== confirming) { focusedConfirm = confirming; focus.focus(); }
        if (!confirming) focusedConfirm = '';
        else if (focused?.id && focused.index >= 0) list.querySelectorAll(`li[data-id="${CSS.escape(focused.id)}"] button`)[focused.index]?.focus();
    }
    let timer = 0;
    // A refresh waits while someone is clicking, so a double-click lands on the row it started on.
    const later = () => { clearTimeout(timer); timer = setTimeout(() => { if (performance.now() - pressed.at < 700) later(); else render().catch(() => {}); }, 150); };
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.keys(changes).some(key => key === 'shiyingJobIds' || key.startsWith('shiyingJob:') || key === HIDDEN_KEY)) later();
        if (area === 'session' && (changes.ruxgetDesktopStatus || changes.ruxgetPausedForHandOver)) later();
    });
    chrome.downloads.onCreated.addListener(later); chrome.downloads.onChanged.addListener(later); chrome.downloads.onErased.addListener(later);
    // Chrome reports no event for bytes received: while the tab is open and Chrome is downloading, refresh each second.
    setInterval(() => { if (renderedRunningChrome && !document.hidden && window.RuxgetTabs?.current() === 'downloads') later(); }, 1000);
    // Ask the service worker for a fresh desktop status; it keeps polling while something downloads.
    chrome.permissions.contains({permissions: ['nativeMessaging']}).then(granted => { if (granted) chrome.runtime.sendMessage({Message: 'ruxgetDesktopRefresh'}).catch(() => {}); }).catch(() => {});

    folder?.addEventListener('click', () => { try { chrome.downloads.showDefaultFolder(); } catch { /* nothing to show */ } });
    // Chrome keeps the full history; Ruxget doesn't keep a second copy.
    history?.addEventListener('click', () => { chrome.tabs.create({url: 'chrome://downloads/'}).catch(() => {}); });
    document.addEventListener('ruxget-i18n-applied', later);
    document.addEventListener('ruxget-view', event => { if (event.detail === 'downloads') { later(); setTimeout(askAgain, 400); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && confirming && !working) { confirming = ''; render().catch(() => {}); } });
    (window.RuxgetI18n ? RuxgetI18n.ready() : Promise.resolve()).catch(() => {}).then(() => render()).catch(() => {});
})();
