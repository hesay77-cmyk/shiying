const $ = selector => document.querySelector(selector);
const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh, tr = text => window.RuxgetText ? RuxgetText.tr(text) : text;
const id = new URLSearchParams(location.search).get('id');
let timer;
async function request(Message) {
    const result = await chrome.runtime.sendMessage({Message,id});
    if (!result?.ok) throw new Error(result?.error || '还没读到下载进度，请稍后重试');
    return result;
}
async function refresh() {
    clearTimeout(timer);
    try {
        const job = await request('shiyingPlatformJob').catch(error => { if (/没有找到下载记录/.test(error.message)) return null; throw error; });
        if (!job) { showDeleted(pick('这个下载已经删除', 'This download was deleted')); return; }
        $('#reconnect').hidden = true;
        $('#taskError').hidden = !job.error;
        $('#taskError').textContent = tr(job.error || '');
        $('#taskTitle').textContent = job.title;
        $('#taskTitle').title = job.title || '';
        document.body.dataset.status = job.status;
        $('#taskLabel').textContent = job.status === 'complete' ? pick('下载完成','Download complete') : pick('下载进度','Download progress');
        $('#taskMeta').textContent = job.format === 'mp3' ? pick('MP3 · 仅声音','MP3 · audio only') : `${job.height}p · MP4 · ${pick('含声音','with audio')}`;
        $('#taskStage').textContent = tr(job.stage);
        const progress = Number.isFinite(Number(job.progress)) ? Math.max(0,Math.min(100,Number(job.progress))) : 0;
        $('#taskProgress').value = progress;
        $('#taskPercent').textContent = `${Math.round(progress)}%`;
        const ended = ['complete','error','cancelled'].includes(job.status);
        $('#cancelTask').hidden = ended;
        $('#deleteTask').hidden = !ended;
        if (!$('#deleteTask').dataset.armed) $('#deleteTask').textContent = job.status === 'complete' ? pick('删除文件', 'Delete file') : pick('移除记录', 'Remove');
        $('#deleteTask').dataset.file = job.status === 'complete' ? '1' : '';
        $('#taskResult').hidden = job.status !== 'complete';
        $('#openFile').hidden = job.status !== 'complete';
        if (job.status === 'complete') {
            const checked = job.verification || {};
            $('#taskResult').hidden = false;
            $('#resultLabel').textContent = job.format === 'mp3' ? pick('格式','Format') : pick('画面','Video');
            $('#resultVideo').textContent = job.format === 'mp3' ? pick('MP3 · 仅声音','MP3 · audio only') : checked.width > 0 && checked.height > 0 ? `${checked.width} × ${checked.height}` : pick('未提供画面检查记录','No video check recorded');
            $('#resultAudio').textContent = checked.audioActive === true ? pick('已检测到声音','Audio detected') : checked.audioActive === false ? pick('原视频的声音为静音','The original video is silent') : pick('未提供声音检查记录','No audio check recorded');
            const seconds = Math.max(0,Math.round(Number(checked.duration) || 0));
            $('#resultIntegrity').textContent = `${seconds ? pick(`${Math.floor(seconds/60)} 分 ${seconds%60} 秒，`,`${Math.floor(seconds/60)} min ${seconds%60} s · `) : ''}${checked.fullDecode === true ? pick('完整检查通过','Full check passed') : pick('未提供完整检查记录','No full check recorded')}`;
            $('#resultFile').textContent = job.file;
            $('#openFile').hidden = false;
            $('#taskNote').textContent = pick(`${checked.bytes > 0 ? `已保存 ${(checked.bytes/1024/1024).toFixed(1)} MB。` : '文件已保存。'}可以关闭这个页面。`, `${checked.bytes > 0 ? `Saved ${(checked.bytes/1024/1024).toFixed(1)} MB.` : 'File saved.'} You can close this page.`);
        } else if (!ended) timer = setTimeout(refresh,1000);
        else $('#taskNote').textContent = job.status === 'cancelled' ? pick('可以回到 Ruxget 重新读取视频。','You can go back to Ruxget and read the video again.') : pick('回到 Ruxget 重新读取视频后，可再次下载。','Read the video again in Ruxget to download it again.');
    } catch (error) {
        $('#taskError').textContent = tr(error.message);
        $('#taskError').hidden = false;
        $('#reconnect').hidden = false;
        $('#taskStage').textContent = pick('连接暂时中断','Connection interrupted');
        // 助手可能正在重启；保持每 5 秒重连，实际任务状态由助手确认。
        timer = setTimeout(refresh,5000);
    }
}
$('#reconnect').addEventListener('click',refresh);
$('#cancelTask').addEventListener('click',async()=>{try{await request('shiyingPlatformCancel');await refresh()}catch(error){$('#taskError').textContent=tr(error.message);$('#taskError').hidden=false}});
// Deleted here or elsewhere: no more polling, nothing left to act on.
function showDeleted(stage) {
    clearTimeout(timer); document.body.dataset.status = 'deleted';
    $('#taskLabel').textContent = pick('已删除', 'Deleted'); $('#taskStage').textContent = stage; $('#taskError').hidden = true;
    for (const node of ['#openFile', '#deleteTask', '#cancelTask', '#taskResult', '#reconnect']) $(node).hidden = true;
    $('#taskNote').textContent = pick('可以关闭这个页面。', 'You can close this page.');
}
// Two clicks, like the popup: the first arms, the second deletes the saved file and its record.
let deleteTimer = 0;
function disarmDelete() { clearTimeout(deleteTimer); const button = $('#deleteTask'); delete button.dataset.armed; button.classList.remove('is-armed'); button.textContent = button.dataset.file ? pick('删除文件', 'Delete file') : pick('移除记录', 'Remove'); }
$('#deleteTask').addEventListener('click', async () => {
    const button = $('#deleteTask');
    if (!button.dataset.armed) { button.dataset.armed = '1'; button.classList.add('is-armed'); button.textContent = pick('再点一次确认删除', 'Click again to delete'); clearTimeout(deleteTimer); deleteTimer = setTimeout(disarmDelete, 4000); return; }
    button.disabled = true;
    try {
        const hadFile = !!button.dataset.file, result = await chrome.runtime.sendMessage({Message: 'shiyingPlatformDelete', id, removeFile: hadFile});
        if (!result?.ok) throw new Error(result?.error || pick('删除没有完成，请重试', 'Couldn’t delete. Try again.'));
        showDeleted(!hadFile ? pick('已移除记录', 'Removed') : result.removed ? pick('文件已删除', 'File deleted') : pick('文件已不在原位置，已移除记录', 'The file was already gone; record removed'));
    } catch (error) { $('#taskError').textContent = tr(error.message); $('#taskError').hidden = false; }
    finally { button.disabled = false; disarmDelete(); }
});
$('#openFile').addEventListener('click',async()=>{try{await request('shiyingPlatformOpen')}catch(error){$('#taskError').textContent=tr(error.message);$('#taskError').hidden=false}});
// Wait for the language so the first paint is already in the right language; live progress then overwrites these.
(window.RuxgetI18n ? RuxgetI18n.ready() : Promise.resolve()).catch(() => {}).then(() => {
    $('#taskLabel').textContent = pick('下载进度', 'Download progress');
    $('#taskTitle').textContent = pick('正在读取下载进度…', 'Reading download progress…');
    $('#taskStage').textContent = pick('正在准备', 'Preparing');
    $('#taskNote').textContent = pick('Chrome 会自动完成合并与保存。可以关掉小窗口或此页，请保持 Chrome 运行。', 'Chrome finishes merging and saving on its own. You can close the popup or this page; keep Chrome running.');
    refresh();
});
