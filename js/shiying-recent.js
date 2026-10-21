// "最近下载": the last few browser downloads, newest first. Click opens the progress page.
(() => {
    const box = document.querySelector('#recentDownloads'), list = document.querySelector('#recentList');
    if (!box || !list) return;
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh, tr = text => window.RuxgetText ? RuxgetText.tr(text) : text;
    const SHOWN = 5;
    async function render() {
        const {shiyingJobIds: ids = []} = await chrome.storage.local.get('shiyingJobIds');
        const keys = ids.slice(-SHOWN).reverse().map(id => 'shiyingJob:' + id), records = await chrome.storage.local.get(keys);
        const jobs = keys.map(key => records[key]).filter(Boolean);
        box.hidden = !jobs.length;
        box.querySelector('summary span').textContent = pick('最近下载', 'Recent downloads');
        list.replaceChildren(...jobs.map(job => {
            const item = document.createElement('li'), button = document.createElement('button'), title = document.createElement('b'), meta = document.createElement('small');
            button.type = 'button'; button.dataset.status = job.status;
            title.textContent = job.title || pick('网页视频', 'Video'); title.title = job.title || '';
            const percent = Number.isFinite(Number(job.progress)) ? Math.round(Number(job.progress)) : 0;
            const state = job.status === 'complete' ? pick('已完成', 'Done') : job.status === 'error' ? tr(job.error || job.stage) : job.status === 'cancelled' ? pick('已取消', 'Cancelled') : tr(job.stage) + ' · ' + percent + '%';
            meta.textContent = (job.format === 'mp3' ? 'MP3' : (job.height ? job.height + 'p' : 'MP4')) + ' · ' + state;
            button.append(title, meta);
            button.addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('shiying-task.html?id=' + encodeURIComponent(job.id))}));
            item.append(button); return item;
        }));
    }
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => render().catch(() => {}), 150); };
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && Object.keys(changes).some(key => key === 'shiyingJobIds' || key.startsWith('shiyingJob:'))) later(); });
    document.addEventListener('ruxget-i18n-applied', later);
    (window.RuxgetI18n ? RuxgetI18n.ready() : Promise.resolve()).catch(() => {}).then(() => render()).catch(() => {});
})();
