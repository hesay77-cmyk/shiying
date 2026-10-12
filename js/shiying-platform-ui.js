// 中文平台卡片；不展示网站的通知音效或零散切片。
const ShiyingPlatformUI = (() => {
    const $ = selector => document.querySelector(selector);
    let catalog, currentTab, generation = 0;
    const send = async (Message, extra = {}) => {
        const result = await chrome.runtime.sendMessage({Message, tabId:currentTab?.id, ...extra});
        if (!result?.ok) throw new Error(result?.error || '视频读取失败，请重试');
        return result;
    };
    function layout(platform) {
        document.body.classList.toggle('platform-mode', platform);
        $('#mediaArea').hidden = platform;
        $('#copyAll').hidden = platform;
        $('#platformCard').hidden = !platform;
    }
    async function read() {
        const serial = ++generation;
        catalog = null;
        layout(true);
        $('#platformTitle').textContent = '正在读取视频…';
        $('#platformTitle').removeAttribute('title');
        $('#platformMeta').textContent = '正在查找清晰度和声音';
        $('#platformNote').textContent = '';
        $('#platformError').hidden = true;
        $('#platformQuality').replaceChildren(new Option('正在读取清晰度', ''));
        $('#platformQuality').disabled = true;
        $('#platformDownload').disabled = true;
        $('#platformAudio').disabled = true;
        $('#platformRead').disabled = true;
        try {
            const source = ShiyingPlatform.source($('#platformURL').value.trim());
            const result = await send('shiyingPlatformRead', {url:source.url});
            if (serial !== generation) return;
            catalog = result;
            $('#platformTitle').textContent = result.title;
            $('#platformTitle').title = result.title;
            const minutes = Math.floor(result.duration / 60), seconds = Math.round(result.duration % 60);
            $('#platformMeta').textContent = `${result.site === 'bilibili' ? 'B站' : 'YouTube'}　${minutes}:${String(seconds).padStart(2,'0')}`;
            $('#platformNote').textContent = '';
            $('#platformQuality').replaceChildren(...result.choices.map(choice => new Option(choice.label, choice.height)));
            const defaultChoice = result.choices.find(choice => choice.height <= 1080) || result.choices.at(-1);
            $('#platformQuality').value = String(defaultChoice.height);
            $('#platformQuality').disabled = false;
            $('#platformDownload').disabled = false;
            $('#platformAudio').disabled = !result.audioAvailable;
        } catch (error) {
            if (serial !== generation) return;
            $('#platformTitle').textContent = '暂时没有读到视频';
            $('#platformMeta').textContent = '';
            $('#platformNote').textContent = '';
            $('#platformError').textContent = error.message;
            $('#platformError').hidden = false;
            $('#platformQuality').replaceChildren(new Option('读取成功后选择', ''));
        } finally {if (serial === generation) $('#platformRead').disabled = false;}
    }
    $('#platformForm').addEventListener('submit', event => {event.preventDefault(); read();});
    async function download(format) {
        if (!catalog) return;
        $('#platformDownload').disabled = true;
        $('#platformAudio').disabled = true;
        $('#platformError').hidden = true;
        try {await send('shiyingPlatformStart', {id:catalog.id,format,height:format === 'mp3' ? undefined : Number($('#platformQuality').value)});}
        catch (error) {$('#platformError').textContent = error.message; $('#platformError').hidden = false;}
        finally {$('#platformDownload').disabled = !catalog; $('#platformAudio').disabled = !catalog?.audioAvailable;}
    }
    $('#platformDownload').addEventListener('click', () => download('mp4'));
    $('#platformAudio').addEventListener('click', () => download('mp3'));
    async function bind(tab) {
        const serial = ++generation;
        catalog = null;
        $('#platformRead').disabled = false;
        $('#platformDownload').disabled = true;
        $('#platformAudio').disabled = true;
        $('#platformError').hidden = true;
        currentTab = tab;
        let source;
        try {source = ShiyingPlatform.source(tab.url);} catch {}
        layout(!!source);
        $('#platformURL').value = source?.url || '';
        $('#platformEntry').hidden = false;
        if (source && serial === generation) await read();
    }
    return {bind,refresh:() => $('#platformCard').hidden ? Promise.resolve() : read()};
})();
