// "最近下载": the last few browser downloads, newest first. Click opens the progress page; the bin deletes after a confirm.
(() => {
    const box = document.querySelector('#recentDownloads'), list = document.querySelector('#recentList');
    if (!box || !list) return;
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh, tr = text => window.RuxgetText ? RuxgetText.tr(text) : text;
    const SHOWN = 5;
    let confirming = '', working = '';
    const done = job => ['complete', 'error', 'cancelled'].includes(job.status);
    function action(label, className, handler) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = className; button.textContent = label; button.disabled = !!working;
        button.addEventListener('click', handler); return button;
    }
    async function remove(job, removeFile) {
        working = job.id; render().catch(() => {});
        try {
            const reply = await chrome.runtime.sendMessage({Message: 'shiyingPlatformDelete', id: job.id, removeFile});
            if (!reply?.ok) throw new Error(reply?.error || pick('删除没有完成，请重试', 'Couldn’t delete. Try again.'));
            if (typeof notify === 'function') notify(removeFile ? (reply.removed ? pick('已删除文件', 'File deleted') : pick('文件已不在原位置，已从列表移除', 'The file was already gone; removed from the list')) : job.status === 'complete' ? pick('已从列表移除，文件保留', 'Removed from the list; file kept') : pick('已停止并删除', 'Stopped and deleted'));
        } catch (error) {
            if (typeof notify === 'function') notify(tr(error.message || String(error)));
        } finally { working = ''; confirming = ''; render().catch(() => {}); }
    }
    // The confirm row replaces the item's text; what it offers depends on where the download is.
    function confirmRow(job) {
        const row = document.createElement('div'), question = document.createElement('span'), buttons = document.createElement('span');
        row.className = 'recent-confirm'; buttons.className = 'recent-confirm-actions';
        const cancel = action(pick('取消', 'Cancel'), 'recent-plain', () => { confirming = ''; render().catch(() => {}); });
        if (job.status === 'complete') {
            question.textContent = pick('删除这个下载？', 'Delete this download?');
            buttons.append(action(pick('删除文件', 'Delete file'), 'recent-danger', () => remove(job, true)), action(pick('只移除记录', 'Remove from list'), 'recent-plain', () => remove(job, false)), cancel);
        } else if (done(job)) {
            question.textContent = pick('从列表移除？', 'Remove from the list?');
            buttons.append(action(pick('移除', 'Remove'), 'recent-danger', () => remove(job, false)), cancel);
        } else {
            question.textContent = pick('停止并删除这个下载？', 'Stop and delete this download?');
            buttons.append(action(pick('停止并删除', 'Stop and delete'), 'recent-danger', () => remove(job, false)), cancel);
        }
        row.append(question, buttons); return row;
    }
    async function render() {
        const {shiyingJobIds: ids = []} = await chrome.storage.local.get('shiyingJobIds');
        const keys = ids.slice(-SHOWN).reverse().map(id => 'shiyingJob:' + id), records = await chrome.storage.local.get(keys);
        const jobs = keys.map(key => records[key]).filter(Boolean);
        box.hidden = !jobs.length;
        box.querySelector('summary span').textContent = pick('最近下载', 'Recent downloads');
        list.replaceChildren(...jobs.map(job => {
            const item = document.createElement('li');item.dataset.id = job.id;
            if (confirming === job.id) { item.append(confirmRow(job)); return item; }
            const button = document.createElement('button'), title = document.createElement('b'), meta = document.createElement('small');
            button.type = 'button'; button.className = 'recent-open'; button.dataset.status = job.status;
            title.textContent = job.title || pick('网页视频', 'Video'); title.title = job.title || '';
            const percent = Number.isFinite(Number(job.progress)) ? Math.round(Number(job.progress)) : 0;
            const state = job.status === 'complete' ? pick('已完成', 'Done') : job.status === 'error' ? tr(job.error || job.stage) : job.status === 'cancelled' ? pick('已取消', 'Cancelled') : tr(job.stage) + ' · ' + percent + '%';
            meta.textContent = (job.format === 'mp3' ? 'MP3' : (job.height ? job.height + 'p' : 'MP4')) + ' · ' + state;
            button.append(title, meta);
            button.addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('shiying-task.html?id=' + encodeURIComponent(job.id))}));
            const bin = document.createElement('button');
            bin.type = 'button'; bin.className = 'recent-delete'; bin.disabled = !!working;
            bin.title = bin.ariaLabel = pick('删除', 'Delete');
            bin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
            bin.addEventListener('click', () => { confirming = job.id; render().catch(() => {}); });
            item.append(button, bin); return item;
        }));
        const focus = list.querySelector('.recent-confirm .recent-plain:last-child');
        if (confirming && focus) focus.focus();
    }
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => render().catch(() => {}), 150); };
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && Object.keys(changes).some(key => key === 'shiyingJobIds' || key.startsWith('shiyingJob:'))) later(); });
    document.addEventListener('ruxget-i18n-applied', later);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && confirming && !working) { confirming = ''; render().catch(() => {}); } });
    (window.RuxgetI18n ? RuxgetI18n.ready() : Promise.resolve()).catch(() => {}).then(() => render()).catch(() => {});
})();
