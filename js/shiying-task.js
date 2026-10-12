const $ = selector => document.querySelector(selector);
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
        const job = await request('shiyingPlatformJob');
        $('#reconnect').hidden = true;
        $('#taskError').hidden = !job.error;
        $('#taskError').textContent = job.error || '';
        $('#taskTitle').textContent = job.title;
        document.body.dataset.status = job.status;
        $('#taskLabel').textContent = job.status === 'complete' ? '下载完成' : '下载进度';
        $('#taskMeta').textContent = job.format === 'mp3' ? 'MP3 · 仅声音' : `${job.height}p · MP4 · 含声音`;
        $('#taskStage').textContent = job.stage;
        $('#taskProgress').value = job.progress;
        $('#taskPercent').textContent = `${job.progress}%`;
        const ended = ['complete','error','cancelled'].includes(job.status);
        $('#cancelTask').hidden = ended;
        if (job.status === 'complete') {
            const checked = job.verification;
            $('#taskResult').hidden = false;
            $('#resultLabel').textContent = job.format === 'mp3' ? '格式' : '画面';
            $('#resultVideo').textContent = job.format === 'mp3' ? 'MP3 · 仅声音' : `${checked.width} × ${checked.height}`;
            $('#resultAudio').textContent = checked.audioActive ? '已检测到声音' : '原视频的声音为静音';
            $('#resultIntegrity').textContent = `${Math.floor(checked.duration/60)} 分 ${Math.round(checked.duration%60)} 秒，完整检查通过`;
            $('#resultFile').textContent = job.file;
            $('#openFile').hidden = false;
            $('#taskNote').textContent = `已保存 ${(checked.bytes/1024/1024).toFixed(1)} MB。可以关闭这个页面。`;
        } else if (!ended) timer = setTimeout(refresh,1000);
        else $('#taskNote').textContent = job.status === 'cancelled' ? '可以回到拾影重新读取视频。' : '回到拾影重新读取视频后，可再次下载。';
    } catch (error) {
        $('#taskError').textContent = error.message;
        $('#taskError').hidden = false;
        $('#reconnect').hidden = false;
        $('#taskStage').textContent = '连接暂时中断';
        // 助手可能正在重启；保持每 5 秒重连，实际任务状态由助手确认。
        timer = setTimeout(refresh,5000);
    }
}
$('#reconnect').addEventListener('click',refresh);
$('#cancelTask').addEventListener('click',async()=>{try{await request('shiyingPlatformCancel');await refresh()}catch(error){$('#taskError').textContent=error.message;$('#taskError').hidden=false}});
$('#openFile').addEventListener('click',async()=>{try{await request('shiyingPlatformOpen')}catch(error){$('#taskError').textContent=error.message;$('#taskError').hidden=false}});
refresh();
