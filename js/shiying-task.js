const $ = selector => document.querySelector(selector);
const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh, tr = text => window.RuxgetText ? RuxgetText.tr(text) : text;
const id = new URLSearchParams(location.search).get('id');
// 0.4.74: every text written here follows a language switch while the page is open (RuxgetI18n.live in
// js/shiying-locale.js), also after the download has ended and the page no longer refreshes itself.
const say = (selector, render) => window.RuxgetI18n?.live ? RuxgetI18n.live($(selector), render) : ($(selector).textContent = render());
let timer;
async function request(Message) {
    const result = await chrome.runtime.sendMessage({Message,id});
    if (!result?.ok) throw new Error(result?.error || '还没读到下载进度，请稍后重试');
    return result;
}
let savedDownload = null;
async function refresh() {
    clearTimeout(timer);
    try {
        const job = await request('shiyingPlatformJob').catch(error => { if (/没有找到下载记录/.test(error.message)) return null; throw error; });
        if (!job) { showDeleted(() => pick('这个下载已经删除', 'This download was deleted')); return; }
        $('#reconnect').hidden = true;
        $('#taskError').hidden = !job.error;
        say('#taskError', () => tr(job.error || ''));
        $('#taskTitle').textContent = job.title;
        $('#taskTitle').title = job.title || '';
        document.body.dataset.status = job.status;
        say('#taskLabel', () => job.status === 'complete' ? pick('下载完成','Download complete') : pick('下载进度','Download progress'));
        say('#taskMeta', () => job.format === 'mp3' ? pick('MP3 · 仅声音','MP3 · audio only') : `${job.label||job.height+'p'} · MP4 · ${pick('含声音','with audio')}`);
        say('#taskStage', () => tr(job.stage));
        const progress = Number.isFinite(Number(job.progress)) ? Math.max(0,Math.min(100,Number(job.progress))) : 0;
        $('#taskProgress').value = progress;
        $('#taskPercent').textContent = `${Math.round(progress)}%`;
        const ended = ['complete','error','cancelled'].includes(job.status);
        $('#cancelTask').hidden = ended;
        $('#deleteTask').hidden = !ended;
        if (!$('#deleteTask').dataset.armed) say('#deleteTask', () => job.status === 'complete' ? pick('删除文件', 'Delete file') : pick('移除记录', 'Remove'));
        $('#deleteTask').dataset.file = job.status === 'complete' ? '1' : '';
        $('#taskResult').hidden = job.status !== 'complete';
        $('#openFile').hidden = job.status !== 'complete';
        // 0.4.69: open the saved file itself (plays the video), not only its folder.
        savedDownload = job.status === 'complete' && Number.isInteger(job.downloadId) ? job.downloadId : null;
        $('#openTaskFile').hidden = savedDownload === null;
        if (job.status === 'complete') {
            const checked = job.verification || {};
            $('#taskResult').hidden = false;
            say('#resultLabel', () => job.format === 'mp3' ? pick('格式','Format') : pick('画面','Video'));
            say('#resultVideo', () => job.format === 'mp3' ? pick('MP3 · 仅声音','MP3 · audio only') : checked.width > 0 && checked.height > 0 ? `${checked.width} × ${checked.height}` : pick('未提供画面检查记录','No video check recorded'));
            say('#resultAudio', () => checked.audioActive === true ? pick('已检测到声音','Audio detected') : checked.audioActive === false ? pick('原视频的声音为静音','The original video is silent') : pick('未提供声音检查记录','No audio check recorded'));
            const seconds = Math.max(0,Math.round(Number(checked.duration) || 0));
            say('#resultIntegrity', () => `${seconds ? pick(`${Math.floor(seconds/60)} 分 ${seconds%60} 秒，`,`${Math.floor(seconds/60)} min ${seconds%60} s · `) : ''}${checked.fullDecode === true ? pick('完整检查通过','Full check passed') : pick('未提供完整检查记录','No full check recorded')}`);
            $('#resultFile').textContent = job.file;
            $('#openFile').hidden = false;
            say('#taskNote', () => pick(`${checked.bytes > 0 ? `已保存 ${(checked.bytes/1024/1024).toFixed(1)} MB。` : '文件已保存。'}可以关闭这个页面。`, `${checked.bytes > 0 ? `Saved ${(checked.bytes/1024/1024).toFixed(1)} MB.` : 'File saved.'} You can close this page.`));
            // 0.4.81: the file was deleted or moved outside Chrome: no 打开, and 删除文件 only removes the record.
            if (savedDownload !== null && window.RuxgetOpen) RuxgetOpen.gone(savedDownload).then(missing => { if (missing) showGone(); }).catch(() => {});
        } else if (!ended) timer = setTimeout(refresh,1000);
        else say('#taskNote', () => job.status === 'cancelled' ? pick('可以回到 Ruxget 重新读取视频。','You can go back to Ruxget and read the video again.') : pick('回到 Ruxget 重新读取视频后，可再次下载。','Read the video again in Ruxget to download it again.'));
    } catch (error) {
        say('#taskError', () => tr(error.message));
        $('#taskError').hidden = false;
        $('#reconnect').hidden = false;
        say('#taskStage', () => pick('连接暂时中断','Connection interrupted'));
        // 助手可能正在重启；保持每 5 秒重连，实际任务状态由助手确认。
        timer = setTimeout(refresh,5000);
    }
}
$('#reconnect').addEventListener('click',refresh);
$('#cancelTask').addEventListener('click',async()=>{try{await request('shiyingPlatformCancel');await refresh()}catch(error){say('#taskError',()=>tr(error.message));$('#taskError').hidden=false}});
// Deleted here or elsewhere: no more polling, nothing left to act on.
function showDeleted(stage) {
    clearTimeout(timer); document.body.dataset.status = 'deleted';
    say('#taskLabel', () => pick('已删除', 'Deleted')); say('#taskStage', stage); $('#taskError').hidden = true;
    for (const node of ['#openTaskFile', '#openFile', '#deleteTask', '#cancelTask', '#taskResult', '#reconnect']) $(node).hidden = true;
    say('#taskNote', () => pick('可以关闭这个页面。', 'You can close this page.'));
}
function showGone() {
    if (document.body.dataset.status !== 'complete') return;
    savedDownload = null; document.body.dataset.gone = '1';
    say('#taskStage', () => RuxgetOpen.goneText());
    $('#openTaskFile').hidden = true; $('#openFile').hidden = true;
    $('#deleteTask').dataset.file = '';
    if (!$('#deleteTask').dataset.armed) say('#deleteTask', () => pick('移除记录', 'Remove'));
    say('#taskNote', () => pick('文件已不在原来的位置，可以移除这条记录。', 'The file is no longer where it was saved. You can remove this record.'));
}
window.RuxgetOpen?.onGone(gone => { if (gone === savedDownload) showGone(); });
chrome.downloads?.onChanged?.addListener(change => { if (change.exists?.current === false && change.id === savedDownload) showGone(); });
// Two clicks, like the popup: the first arms, the second deletes the saved file and its record.
let deleteTimer = 0;
function disarmDelete() { clearTimeout(deleteTimer); const button = $('#deleteTask'); delete button.dataset.armed; button.classList.remove('is-armed'); const file = !!button.dataset.file; say('#deleteTask', () => file ? pick('删除文件', 'Delete file') : pick('移除记录', 'Remove')); }
$('#deleteTask').addEventListener('click', async () => {
    const button = $('#deleteTask');
    if (!button.dataset.armed) { button.dataset.armed = '1'; button.classList.add('is-armed'); const file = !!button.dataset.file; say('#deleteTask', () => file ? pick('再点一次确认删除', 'Click again to delete') : pick('再点一次移除记录（文件不受影响）', 'Click again to remove the record (no file is deleted)')); clearTimeout(deleteTimer); deleteTimer = setTimeout(disarmDelete, 4000); return; }
    button.disabled = true;
    try {
        const hadFile = !!button.dataset.file, result = await chrome.runtime.sendMessage({Message: 'shiyingPlatformDelete', id, removeFile: hadFile});
        if (!result?.ok) throw new Error(result?.error || pick('删除没有完成，请重试', 'Couldn’t delete. Try again.'));
        const removed = !!result.removed; showDeleted(() => !hadFile ? pick('已移除记录', 'Removed') : removed ? pick('文件已删除', 'File deleted') : pick('文件已不在原位置，已移除记录', 'The file was already gone; record removed'));
    } catch (error) { say('#taskError', () => tr(error.message)); $('#taskError').hidden = false; }
    finally { button.disabled = false; disarmDelete(); }
});
$('#openTaskFile').addEventListener('click',()=>{if(savedDownload!==null)RuxgetOpen.file(savedDownload,text=>{$('#taskError').textContent=text;$('#taskError').hidden=false;});});
$('#openFile').addEventListener('click',async()=>{try{await request('shiyingPlatformOpen')}catch(error){say('#taskError',()=>tr(error.message));$('#taskError').hidden=false}});
// Wait for the language so the first paint is already in the right language; live progress then overwrites these.
(window.RuxgetI18n ? RuxgetI18n.ready() : Promise.resolve()).catch(() => {}).then(() => {
    // 0.4.81: the tab title follows the interface language too (it stayed “Ruxget · Downloads” in Chinese).
    const title = () => { document.title = pick('Ruxget · 下载管理', 'Ruxget · Downloads'); };
    title(); document.addEventListener('ruxget-i18n-applied', title);
    say('#taskLabel', () => pick('下载进度', 'Download progress'));
    say('#taskTitle', () => pick('正在读取下载进度…', 'Reading download progress…'));
    say('#taskStage', () => pick('正在准备', 'Preparing'));
    say('#taskNote', () => pick('Chrome 会自动完成合并与保存。可以关掉小窗口或此页，请保持 Chrome 运行。', 'Chrome finishes merging and saving on its own. You can close the popup or this page; keep Chrome running.'));
    refresh();
});
