// 中文平台卡片；不展示网站的通知音效或零散切片。
const ShiyingPlatformUI = (() => {
    const $ = selector => document.querySelector(selector);
    let catalog, currentTab, currentJob, generation = 0, starting = false, preference = {height:1080,format:'mp4',method:'chrome'}, desktopState = 'idle';
    const pick=(zh,en)=>RuxgetI18n.pick(zh,en);
    const selectedFormat=()=>document.querySelector('input[name=platformFormat]:checked')?.value||'mp4';
    const prefsReady=chrome.storage.local.get('shiyingVideoPreference').then(data=>Object.assign(preference,data.shiyingVideoPreference||{}));
    function updateActions(){document.querySelector('label[for=formatVideo]').textContent=pick('视频','Video');document.querySelector('label[for=formatAudio]').textContent=pick('MP3 音频','MP3 audio');const active=starting||(currentJob?.url===catalog?.url&&!['complete','error','cancelled'].includes(currentJob?.status));const audio=selectedFormat()==='mp3';$('#formatAudio').disabled=!catalog||!catalog.audioAvailable;$('#formatVideo').disabled=!catalog;$('#platformQuality').hidden=audio;$('#platformAudioNote').hidden=!audio;$('#platformAudioNote').textContent=pick('原站最佳音轨','Best available audio');$('#platformDownload').disabled=!catalog||active||(audio&&!catalog.audioAvailable);$('#platformAudio').disabled=!catalog||active||!catalog.audioAvailable;const desktop=preference.method==='desktop';$('#platformMethod').disabled=!catalog||active;$('#platformDownload').textContent=desktop?(audio?pick('桌面版下载 MP3','Desktop MP3'):pick('用桌面版下载','Download in app')):audio?pick('下载 MP3','Download MP3'):pick('下载视频','Download video');$('#platformDownload').title=desktop?pick('交给 Ruxget 桌面版，可暂停续传','Send to Ruxget Desktop (pause and resume)'):pick('在 Chrome 里下载并保存','Download and save in Chrome');renderMethods();}
    function savePreference(){const option=$('#platformQuality').selectedOptions[0];preference={...preference,format:selectedFormat(),height:parseInt(option?.textContent)||Number(option?.value)||preference.height};chrome.storage.local.set({shiyingVideoPreference:preference});updateActions();}
    // Download method: one main button; the ▾ menu picks Chrome or the desktop app and is remembered.
    const desktopNotes={idle:['可暂停续传，适合大文件','Pause, resume, large files'],checking:['正在检查桌面版…','Checking the desktop app…'],ready:['已连接 · 可暂停续传','Connected · pause and resume'],permission:['首次使用时允许连接即可','Allow the connection on first use'],missing:['还没有安装桌面版','Desktop app not installed'],connection:['已安装，需要重新连接','Installed, needs reconnecting']};
    function renderMethods(){
        const method=preference.method==='desktop'?'desktop':'chrome';
        document.querySelectorAll('#methodMenu [data-method]').forEach(option=>option.setAttribute('aria-checked',String(option.dataset.method===method)));
        $('[data-method-label=chrome]').textContent=pick('用浏览器下载','Download in Chrome');$('[data-method-note=chrome]').textContent=pick('在 Chrome 里保存，最省心','Saved by Chrome, simplest');$('[data-method-label=desktop]').textContent=pick('用桌面版下载','Download in Ruxget Desktop');
        const status=$('#desktopMethodStatus'),note=desktopNotes[desktopState]||desktopNotes.idle;status.dataset.state=desktopState;status.textContent=pick(note[0],note[1]);
        $('#methodMenuTitle').textContent=pick('下载方式','Download with');$('#methodSetup').firstChild.textContent=desktopState==='ready'?pick('桌面版设置与帮助','Desktop app help'):pick('安装与连接桌面版','Install and connect the app');
        $('#platformMethod').setAttribute('aria-label',pick('选择下载方式','Choose how to download'));$('#platformMethod').title=$('#platformMethod').getAttribute('aria-label');
    }
    async function checkDesktop(){
        // Never prompts: Chrome only asks for the native permission after a click on the main button.
        desktopState='checking';renderMethods();
        try{if(!await chrome.permissions.contains({permissions:['nativeMessaging']}))desktopState='permission';else{const reply=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});desktopState=reply?.ok?'ready':'connection';}}
        catch(error){desktopState=ShiyingNative.connectionIssue(error)||'connection';}
        renderMethods();
    }
    function setMethod(method){preference={...preference,method:method==='desktop'?'desktop':'chrome'};chrome.storage.local.set({shiyingVideoPreference:preference});updateActions();}
    const menuOptions=()=>[...document.querySelectorAll('#methodMenu [role^=menuitem]')];
    function openMethods(){if($('#platformMethod').disabled)return;$('#methodMenu').hidden=false;$('#platformMethod').setAttribute('aria-expanded','true');renderMethods();(menuOptions().find(o=>o.getAttribute('aria-checked')==='true')||menuOptions()[0]).focus();checkDesktop();}
    function closeMethods(focusToggle=true){if($('#methodMenu').hidden)return;$('#methodMenu').hidden=true;$('#platformMethod').setAttribute('aria-expanded','false');if(focusToggle)$('#platformMethod').focus();}
    $('#platformMethod').addEventListener('click',()=>$('#methodMenu').hidden?openMethods():closeMethods());
    $('#methodMenu').addEventListener('click',event=>{const option=event.target.closest('[data-method]');if(option){setMethod(option.dataset.method);closeMethods(false);$('#platformDownload').focus();return;}if(event.target.closest('#methodSetup')){closeMethods(false);chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html#connection')});}});
    $('#methodMenu').addEventListener('keydown',event=>{const options=menuOptions(),index=options.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();closeMethods();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(index+(event.key==='ArrowDown'?1:options.length-1))%options.length].focus();}else if(event.key==='Tab')closeMethods(false);});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#methodMenu,#platformMethod'))closeMethods(false);});
    async function sendDesktop(){
        if(!catalog||starting)return;starting=true;updateActions();$('#platformError').hidden=true;$('#platformNote').textContent='';
        try{await ShiyingNative.send(desktopPayload);desktopState='ready';$('#platformNote').textContent=pick('已交给 Ruxget 桌面版，请在桌面窗口确认下载','Sent to Ruxget Desktop. Confirm it in the app window.');}
        catch(error){if(error.cancelled){desktopState=error.connectionIssue||desktopState;if(error.desktopAction==='chrome')setMethod('chrome');return;}$('#platformError').textContent=RuxgetText.tr(error.message);$('#platformError').hidden=false;}
        finally{starting=false;updateActions();}
    }
    function desktopPayload(){if(!catalog)throw new Error('请先读取视频');return send('shiyingPlatformDesktop',{id:catalog.id,format:selectedFormat(),height:Number($('#platformQuality').value)});}
    $('#platformFormat').addEventListener('change',savePreference);$('#platformQuality').addEventListener('change',savePreference);document.addEventListener('ruxget-i18n-applied',updateActions);
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
        currentJob=job;updateActions();
        $('#platformJob').hidden=!job;
        document.body.classList.toggle('has-job',!!job);
        if(!job)return;
        const percent=Number.isFinite(job.progress)?Math.max(0,Math.min(100,job.progress)):0;
        $('#platformStage').textContent=RuxgetText.tr(job.error||job.stage);
        $('#platformPercent').textContent=Math.round(percent)+'%';
        $('#platformProgress').value=percent;
        $('#platformCancel').hidden=['complete','error','cancelled'].includes(job.status);
        if($('#platformDelete').dataset.armed!==job.id)disarmDelete();
        $('#platformDelete').hidden=!['complete','error','cancelled'].includes(job.status);
    }
    // Two clicks: the first only arms the button, so a stray click never deletes a file.
    let deleteTimer=0;
    function disarmDelete(){clearTimeout(deleteTimer);const button=$('#platformDelete');delete button.dataset.armed;button.classList.remove('is-armed');button.textContent=currentJob&&currentJob.status!=='complete'?pick('移除记录','Remove'):pick('删除文件','Delete file');}
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
        const change=changes['shiyingJob:'+currentJob.id];if(!change)return;
        // Deleted elsewhere (recent list, progress page): clear the card instead of showing a stale download.
        renderJob(change.newValue||null);
    });
    $('#platformDetails').addEventListener('click',()=>{if(currentJob)chrome.tabs.create({url:chrome.runtime.getURL('shiying-task.html?id='+encodeURIComponent(currentJob.id))});});
    $('#platformDelete').addEventListener('click',async()=>{
        const button=$('#platformDelete');if(!currentJob)return;
        if(button.dataset.armed!==currentJob.id){button.dataset.armed=currentJob.id;button.classList.add('is-armed');button.textContent=pick('再点一次确认删除','Click again to delete');clearTimeout(deleteTimer);deleteTimer=setTimeout(disarmDelete,4000);return;}
        button.disabled=true;
        try{const hadFile=currentJob.status==='complete',result=await send('shiyingPlatformDelete',{id:currentJob.id,removeFile:hadFile});renderJob(null);if(typeof notify==='function')notify(!hadFile?pick('已移除记录','Removed'):result.removed?pick('已删除文件','File deleted'):pick('文件已不在原位置，已移除记录','The file was already gone; record removed'));}
        catch(error){$('#platformError').textContent=RuxgetText.tr(error.message);$('#platformError').hidden=false;}
        finally{button.disabled=false;disarmDelete();}
    });
    $('#platformCancel').addEventListener('click',async()=>{if(!currentJob)return;$('#platformCancel').disabled=true;try{renderJob(await send('shiyingPlatformCancel',{id:currentJob.id}));}catch(error){$('#platformError').textContent=RuxgetText.tr(error.message);$('#platformError').hidden=false;}finally{$('#platformCancel').disabled=false;}});
    $('#platformChoices').addEventListener('click',()=>{const expanded=document.body.classList.toggle('choices-open');$('#platformChoices').setAttribute('aria-expanded',expanded);});
    async function read() {
        const serial = ++generation;
        await (window.RuxgetI18n?RuxgetI18n.ready().catch(()=>{}):Promise.resolve());
        catalog = null;
        delete $('#platformTitle').dataset.liveTitle;
        layout(true);
        $('#platformTitle').textContent = pick('正在读取视频…','Reading the video…');
        $('#platformTitle').removeAttribute('title');
        $('#platformMeta').textContent = pick('正在查找清晰度和声音','Looking for qualities and audio');
        $('#platformNote').textContent = '';
        $('#platformError').hidden = true;
        $('#platformQuality').replaceChildren(new Option(pick('正在读取清晰度','Reading qualities'), ''));
        $('#platformQuality').disabled = true;
        $('#platformDownload').disabled = true;
        $('#platformAudio').disabled = true;
        closeMethods(false);$('#subtitleBox').hidden=true;
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
            $('#platformMeta').textContent = `${result.siteName?RuxgetText.tr(result.siteName):pick('B站','Bilibili')}　${minutes}:${String(seconds).padStart(2,'0')}`;
            $('#platformNote').textContent = '';
            $('#platformQuality').replaceChildren(...result.choices.map(choice => new Option(choice.label, choice.height)));
            await prefsReady;
            if(serial!==generation)return;
            const level = choice => parseInt(choice.label) || choice.height;
            const defaultChoice = result.choices.find(choice => level(choice) <= preference.height) || result.choices.at(-1);
            $('#formatAudio').checked=preference.format==='mp3';$('#formatVideo').checked=preference.format!=='mp3';
            $('#platformQuality').value = String(defaultChoice.height);
            $('#platformQuality').disabled = false;
            $('#platformDownload').disabled = false;
            $('#platformAudio').disabled = !result.audioAvailable;
            // Subtitles: one language shows its name on the button; several show a picker.
            const subtitles=result.subtitles||[];$('#subtitleBox').hidden=!subtitles.length;$('#platformSubtitleLang').replaceChildren(...subtitles.map((item,index)=>new Option(item.name||item.lang,String(index))));$('#platformSubtitleLang').hidden=subtitles.length<2;
            $('#platformSubtitles').textContent=subtitles.length===1?pick('下载字幕（'+(subtitles[0].name||subtitles[0].lang)+'）','Subtitles ('+(subtitles[0].name||subtitles[0].lang)+')'):pick('下载字幕','Subtitles');
            // B站 videos may have several parts; other sites offer a list only when the page came from one.
            $('#collectionOpen').hidden=!(result.site==='bilibili'||result.listUrl);$('#collectionOpen').textContent=result.site==='bilibili'?pick('分 P 勾选下载…','Choose parts…'):pick('播放列表勾选下载…','Choose from list…');
        } catch (error) {
            if (serial !== generation) return;
            $('#platformTitle').textContent = pick('暂时没有读到视频','Couldn’t read the video yet');
            $('#platformMeta').textContent = '';
            $('#platformNote').textContent = '';
            $('#platformError').textContent = RuxgetText.tr(error.message);
            $('#platformError').hidden = false;
            $('#platformQuality').replaceChildren(new Option(pick('读取成功后选择','Choose after reading'), ''));
        } finally {if (serial === generation){$('#platformRead').disabled = false;updateActions();}}
    }
    $('#platformForm').addEventListener('submit', event => {event.preventDefault();const url=$('#platformURL').value.trim();if(new URL(url).searchParams.has('list')&&!new URL(url).searchParams.has('v')){window.ShiyingCollectionUI.open(url,true);return;}read();});
    // Some video servers need the page as Referer; that requires an optional permission for them, asked once per site.
    function serverAccess(){const origins=catalog?.mediaOrigins||[];return origins.length?chrome.permissions.request({origins}).catch(()=>false):Promise.resolve(true);}
    async function download(format) {
        if (!catalog || starting || $('#platformDownload').disabled) return;
        const access=serverAccess();starting=true;
        if(!await access){starting=false;$('#platformError').textContent=pick('需要允许访问这个网站的视频服务器才能下载；只用于这个网站的视频。','Allow access to this site’s video servers to download; it is only used for its videos.');$('#platformError').hidden=false;return;}
        const selectedCatalog=catalog, serial=generation;starting=true;savePreference();
        $('#platformDownload').disabled = true;
        $('#platformAudio').disabled = true;
        $('#platformError').hidden = true;
        try {const job=await send('shiyingPlatformStart', {id:selectedCatalog.id,format,height:format === 'mp3' ? undefined : Number($('#platformQuality').value),saveAs:$('#saveAs').checked});if(serial!==generation)return;renderJob(job);document.body.classList.remove('choices-open');$('#platformChoices').setAttribute('aria-expanded','false');}
        catch (error) {$('#platformError').textContent = RuxgetText.tr(error.message); $('#platformError').hidden = false;}
        finally {starting=false;updateActions();}
    }
    $('#platformSubtitles').addEventListener('click',async()=>{if(!catalog)return;const button=$('#platformSubtitles'),label=button.textContent;button.disabled=true;$('#platformError').hidden=true;try{await send('shiyingPlatformSubtitle',{id:catalog.id,index:Number($('#platformSubtitleLang').value||0),saveAs:$('#saveAs').checked});$('#platformNote').textContent=pick('字幕已保存为 SRT 文件','Subtitles saved as an SRT file');}catch(error){$('#platformError').textContent=RuxgetText.tr(error.message);$('#platformError').hidden=false;}finally{button.disabled=false;button.textContent=label;}});
    $('#platformDownload').addEventListener('click', () => preference.method==='desktop'?sendDesktop():download(selectedFormat()));
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
        closeMethods(false);
        let source;
        try {source = ShiyingPlatform.source(tab.url);} catch {}
        layout(!!source);
        $('#platformURL').value = source?.url || '';
        $('#platformEntry').hidden = false;
        if (source && serial === generation) {await read();try{await restoreJob(tab);}catch{/* The existing catalog remains usable if no job snapshot is available. */}}
    }
    return {bind,url:()=>currentTab?.url||$('#platformURL').value,refresh:() => $('#platformCard').hidden ? Promise.resolve() : read(),desktop:desktopPayload};
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
