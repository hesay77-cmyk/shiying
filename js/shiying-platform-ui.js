// 中文平台卡片；不展示网站的通知音效或零散切片。
const ShiyingPlatformUI = (() => {
    const $ = selector => document.querySelector(selector);
    let catalog, currentTab, currentJob, generation = 0;
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
    function renderJob(job){
        currentJob=job;
        $('#platformJob').hidden=!job;
        document.body.classList.toggle('has-job',!!job);
        if(!job)return;
        const percent=Number.isFinite(job.progress)?Math.max(0,Math.min(100,job.progress)):0;
        $('#platformStage').textContent=job.error||job.stage;
        $('#platformPercent').textContent=Math.round(percent)+'%';
        $('#platformProgress').value=percent;
        $('#platformCancel').hidden=['complete','error','cancelled'].includes(job.status);
    }
    async function restoreJob(tab){
        const url=ShiyingPlatform.source(tab.url).url;
        const current=()=>{try{return currentTab?.id===tab.id&&ShiyingPlatform.source(currentTab.url).url===url;}catch{return false;}};
        const {shiyingJobIds:ids=[]}=await chrome.storage.local.get('shiyingJobIds');
        const records=await chrome.storage.local.get(ids.slice(-50).map(id=>'shiyingJob:'+id));
        const job=ids.slice().reverse().map(id=>records['shiyingJob:'+id]).find(item=>item?.url===url);
        if(!current())return;
        renderJob(job);
        if(job&&!['complete','error','cancelled'].includes(job.status)){
            const snapshot=await send('shiyingPlatformJob',{id:job.id});
            if(current()&&currentJob?.id===job.id)renderJob(snapshot);
        }
    }
    chrome.storage.onChanged.addListener((changes,area)=>{
        if(area!=='local'||!currentJob)return;
        const job=changes['shiyingJob:'+currentJob.id]?.newValue;
        if(job)renderJob(job);
    });
    $('#platformDetails').addEventListener('click',()=>{if(currentJob)chrome.tabs.create({url:chrome.runtime.getURL('shiying-task.html?id='+encodeURIComponent(currentJob.id))});});
    $('#platformCancel').addEventListener('click',async()=>{if(!currentJob)return;$('#platformCancel').disabled=true;try{renderJob(await send('shiyingPlatformCancel',{id:currentJob.id}));}catch(error){$('#platformError').textContent=error.message;$('#platformError').hidden=false;}finally{$('#platformCancel').disabled=false;}});
    $('#platformChoices').addEventListener('click',()=>{const expanded=document.body.classList.toggle('choices-open');$('#platformChoices').setAttribute('aria-expanded',expanded);});
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
        $('#platformDesktop').disabled = true;
        $('#platformRead').disabled = true;
        try {
            const source = ShiyingPlatform.source($('#platformURL').value.trim());
            const result = await send('shiyingPlatformRead', {url:source.url});
            if (serial !== generation) return;
            catalog = result;
            $('#platformTitle').textContent = result.title;
            $('#platformTitle').title = result.title;
            $('#platformTitle').dataset.liveTitle = result.title;
            const duration = Math.max(0,Math.round(result.duration)), minutes = Math.floor(duration / 60), seconds = duration % 60;
            let siteName = result.site === 'bilibili' ? 'B站' : '视频';
            /* shiying-store-omit */
            if (result.site !== 'bilibili') siteName = 'YouTube';
            /* shiying-store-omit-end */
            $('#platformMeta').textContent = `${siteName}　${minutes}:${String(seconds).padStart(2,'0')}`;
            $('#platformNote').textContent = '';
            $('#platformQuality').replaceChildren(...result.choices.map(choice => new Option(choice.label, choice.height)));
            const defaultChoice = result.choices.find(choice => choice.height <= 1080) || result.choices.at(-1);
            $('#platformQuality').value = String(defaultChoice.height);
            $('#platformQuality').disabled = false;
            $('#platformDownload').disabled = false;
            $('#platformAudio').disabled = !result.audioAvailable;
            $('#platformDesktop').disabled = false;
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
        try {renderJob(await send('shiyingPlatformStart', {id:catalog.id,format,height:format === 'mp3' ? undefined : Number($('#platformQuality').value),saveAs:$('#saveAs').checked}));document.body.classList.remove('choices-open');$('#platformChoices').setAttribute('aria-expanded','false');}
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
        renderJob(null);
        document.body.classList.remove('choices-open');
        $('#platformChoices').setAttribute('aria-expanded','false');
        $('#platformDesktop').disabled = true;
        let source;
        try {source = ShiyingPlatform.source(tab.url);} catch {}
        layout(!!source);
        $('#platformURL').value = source?.url || '';
        $('#platformEntry').hidden = false;
        if (source && serial === generation) {await read();try{await restoreJob(tab);}catch{/* The existing catalog remains usable if no job snapshot is available. */}}
    }
    return {bind,refresh:() => $('#platformCard').hidden ? Promise.resolve() : read(),desktop:() => {
        if (!catalog) throw new Error('请先读取视频');
        return send('shiyingPlatformDesktop', {id:catalog.id,height:Number($('#platformQuality').value)});
    }};
})();


;(() => {
  const prev = window.ShiyingPlatformUI;
  if (!prev || prev.refreshLiveLabels) return;
  window.ShiyingPlatformUI = Object.assign({}, prev, {
    refreshLiveLabels() {
      try {
        const el = document.querySelector('#platformTitle');
        if (!el) return;
        if (el.dataset.liveTitle) { el.textContent = el.dataset.liveTitle; el.title = el.dataset.liveTitle; }
      } catch (e) {}
    }
  });
})();
