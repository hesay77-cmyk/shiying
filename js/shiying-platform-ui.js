// 中文平台卡片；不展示网站的通知音效或零散切片。
const ShiyingPlatformUI = (() => {
    const $ = selector => document.querySelector(selector);
    let desktopMode = 'never';
    let catalog, currentTab, currentJob, generation = 0, starting = false, preference = {height:1080,format:'mp4',method:'chrome'}, desktopState = 'idle';
    const pick=(zh,en)=>RuxgetI18n.pick(zh,en);
    const selectedFormat=()=>document.querySelector('input[name=platformFormat]:checked')?.value||'mp4';
    const prefsReady=chrome.storage.local.get('shiyingVideoPreference').then(data=>Object.assign(preference,data.shiyingVideoPreference||{}));
    // A one-off way back to the browser when the settings send this video to the desktop app (it changes no setting).
    function updateBrowserLink(){const link=$('#platformUseBrowser');if(!link)return;link.hidden=!(catalog&&effectiveMethod()==='desktop');link.textContent=pick('这次用插件下载','Use the extension this time');}
    // Desktop mode: one quiet line on why (and whether the app is connected). Browser mode, desktop app not connected:
    // one quiet line that leads to it (never for long videos, which already get the 改用桌面版 hint).
    function updateDesktopLines(){const why=$('#desktopWhy'),promo=$('#desktopPromo');if(!why||!promo)return;const desktop=catalog&&effectiveMethod()==='desktop';
        why.hidden=!desktop;why.dataset.state=desktopState;why.textContent=desktopState==='ready'?pick('桌面版已连接 · 支持多线程下载与断点续传','Ruxget Desktop is connected · multi-connection downloads that resume'):pick('桌面版支持多线程下载与断点续传','Ruxget Desktop downloads with several connections and resumes after a break');
        promo.hidden=!(catalog&&!desktop&&!['ready','checking','idle'].includes(desktopState)&&Number(catalog.duration)<1800);promo.textContent=pick('大文件与断点续传，可使用 Ruxget 桌面版（免费，3 MB）','For large files and resumable downloads, use Ruxget Desktop (free, 3 MB)');}
    // B站 without signing in: one quiet line on why only 480p and lower are offered (see ShiyingPlatform.bilibiliCatalog).
    function updateLoginNote(){const note=$('#platformLoginNote');if(!note)return;note.hidden=!catalog?.loginLimited||selectedFormat()==='mp3';note.textContent=pick('B站未登录时最高提供 480p。在本浏览器登录 B站后，可选择更高清晰度。','Bilibili offers up to 480p to visitors who aren’t signed in. Sign in to Bilibili in this browser for higher qualities.');}
    // Site name and length under the title; rendered again when the language changes while the panel is open.
    function renderMeta(){if(!catalog)return;const duration=Math.max(0,Math.round(catalog.duration)),minutes=Math.floor(duration/60),seconds=duration%60;$('#platformMeta').textContent=`${catalog.siteName?RuxgetText.tr(catalog.siteName):pick('B站','Bilibili')}${pick('　',' · ')}${minutes}:${String(seconds).padStart(2,'0')}`;}
    function updateActions(){renderMeta();updateBrowserLink();updateDesktopLines();updateLoginNote();document.querySelector('label[for=formatVideo]').textContent=pick('视频','Video');document.querySelector('label[for=formatAudio]').textContent=pick('MP3 音频','MP3 audio');const active=starting||(currentJob?.url===catalog?.url&&!['complete','error','cancelled'].includes(currentJob?.status));const audio=selectedFormat()==='mp3';$('#formatAudio').disabled=!catalog||!catalog.audioAvailable;$('#formatVideo').disabled=!catalog;$('#platformQuality').hidden=audio;$('#platformAudioNote').hidden=!audio;$('#platformAudioNote').textContent=pick('原站最佳音轨','Best available audio');$('#platformDownload').disabled=!catalog||active||(audio&&!catalog.audioAvailable);$('#platformAudio').disabled=!catalog||active||!catalog.audioAvailable;const desktop=effectiveMethod()==='desktop';$('#platformMethod').disabled=!catalog||active;$('#platformDownload').textContent=desktop?(audio?pick('桌面版下载 MP3','Desktop MP3'):pick('用桌面版下载','Download in app')):audio?pick('下载 MP3','Download MP3'):pick('下载视频','Download video');$('#platformDownload').title=desktop?pick('交给 Ruxget 桌面版，可暂停续传','Send to Ruxget Desktop (pause and resume)'):pick('在 Chrome 里下载并保存','Download and save in Chrome');renderMethods();}
    function savePreference(){const option=$('#platformQuality').selectedOptions[0];preference={...preference,format:selectedFormat(),height:parseInt(option?.textContent)||Number(option?.value)||preference.height};chrome.storage.local.set({shiyingVideoPreference:preference});updateActions();}
    // Download method: one main button; settings → 交给桌面版 decides who downloads (see effectiveMethod).
    const desktopNotes={idle:['可暂停续传，适合大文件','Pause, resume, large files'],checking:['正在检查桌面版…','Checking the desktop app…'],ready:['已连接 · 可暂停续传','Connected · pause and resume'],permission:['首次使用时允许连接即可','Allow the connection on first use'],missing:['还没有安装桌面版','Desktop app not installed'],connection:['已安装，需要重新连接','Installed, needs reconnecting']};
    function renderMethods(){
        const method=effectiveMethod()==='desktop'?'desktop':'chrome';
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
        renderMethods();updateDesktopLines();
    }
    // The one rule for who downloads (settings → 交给桌面版): never, large (videos of 30 minutes or more), all.
    // desktopMode is declared at the top (used by updateActions from the start).
    chrome.storage.local.get(['ruxgetDesktopMode','ruxgetTakeover']).then(data=>{desktopMode=['never','large','all'].includes(data.ruxgetDesktopMode)?data.ruxgetDesktopMode:data.ruxgetTakeover?.enabled?'large':'never';updateActions();renderHint();}).catch(()=>{});
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.ruxgetDesktopMode){desktopMode=changes.ruxgetDesktopMode.newValue||'never';updateActions();renderHint();}});
    function effectiveMethod(){return desktopMode==='all'||desktopMode==='large'&&catalog&&Number(catalog.duration)>=1800?'desktop':'chrome';}
    function setMethod(method){preference={...preference,method:method==='desktop'?'desktop':'chrome'};chrome.storage.local.set({shiyingVideoPreference:preference});updateActions();renderHint();}
    const menuOptions=()=>[...document.querySelectorAll('#methodMenu [role^=menuitem]')];
    function openMethods(){if($('#platformMethod').disabled)return;$('#methodMenu').hidden=false;$('#platformMethod').setAttribute('aria-expanded','true');renderMethods();(menuOptions().find(o=>o.getAttribute('aria-checked')==='true')||menuOptions()[0]).focus();checkDesktop();}
    function closeMethods(focusToggle=true){if($('#methodMenu').hidden)return;$('#methodMenu').hidden=true;$('#platformMethod').setAttribute('aria-expanded','false');if(focusToggle)$('#platformMethod').focus();}
    $('#platformMethod').addEventListener('click',()=>$('#methodMenu').hidden?openMethods():closeMethods());
    $('#methodMenu').addEventListener('click',event=>{const option=event.target.closest('[data-method]');if(option){setMethod(option.dataset.method);closeMethods(false);$('#platformDownload').focus();return;}if(event.target.closest('#methodSetup')){closeMethods(false);chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html#connection')});}});
    $('#methodMenu').addEventListener('keydown',event=>{const options=menuOptions(),index=options.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();closeMethods();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(index+(event.key==='ArrowDown'?1:options.length-1))%options.length].focus();}else if(event.key==='Tab')closeMethods(false);});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#methodMenu,#platformMethod'))closeMethods(false);});
    // Videos handed to the desktop app in this browser session: {"url|format|quality": {at, started}} (session storage,
    // since the toolbar panel closes at every click outside it). No second "改用桌面版" hint for them, and one the desktop
    // app already started quietly isn't sent again.
    const SENT='ruxgetDesktopSent';let sentList={};
    const sentStore=chrome.storage.session||chrome.storage.local;
    sentStore.get(SENT).then(data=>{sentList=data[SENT]||{};renderHint();}).catch(()=>{});
    chrome.storage.onChanged.addListener((changes,area)=>{if(changes[SENT]&&area===(chrome.storage.session?'session':'local')){sentList=changes[SENT].newValue||{};renderHint();}});
    const desktopKey=()=>catalog?[catalog.url,selectedFormat(),$('#platformQuality').value].join('|'):'';
    const sentToDesktop=()=>!!catalog&&Object.keys(sentList).some(key=>key.startsWith(catalog.url+'|'));
    function rememberSent(key,started){const now=Date.now(),next={};for(const [k,v] of Object.entries(sentList))if(now-(v?.at||0)<6*3600000)next[k]=v;next[key]={at:now,started};sentList=next;sentStore.set({[SENT]:next}).catch(()=>{});}
    async function sendDesktop(){
        if(!catalog||starting)return;
        if(sentList[desktopKey()]?.started){$('#platformError').hidden=true;$('#platformNote').textContent=pick('已经交给桌面版了，在「已下载」里看进度','Already sent to Ruxget Desktop; follow it in Downloads');return;}
        starting=true;updateActions();$('#platformError').hidden=true;$('#platformNote').textContent='';
        try{const key=desktopKey(),reply=await ShiyingNative.send(desktopPayload);desktopState='ready';rememberSent(key,reply?.stage==='started');$('#cardHint').hidden=true;$('#platformNote').textContent=reply?.stage==='started'?pick('已交给桌面版，在「已下载」里看进度', 'Sent to Ruxget Desktop; follow it in Downloads'):pick('已交给 Ruxget 桌面版，请在桌面窗口确认下载','Sent to Ruxget Desktop. Confirm it in the app window.');}
        catch(error){if(error.denied){$('#platformNote').textContent=effectiveMethod()==='desktop'?pick('没有允许连接桌面版。可点「这次用插件下载」。','Ruxget Desktop wasn’t allowed to connect. Choose “Use the extension this time”.'):pick(`没有允许连接桌面版。可点「${$('#platformDownload').textContent}」用插件下载。`,`Ruxget Desktop wasn’t allowed to connect. Click “${$('#platformDownload').textContent}” to download with the extension.`);return;}if(error.cancelled){desktopState=error.connectionIssue||desktopState;if(error.desktopAction==='chrome'){/* the button is still disabled from the hand-off: enable it first, or download() returns at once */starting=false;updateActions();await download(selectedFormat());return;}if(error.connectionIssue)$('#platformNote').textContent=effectiveMethod()==='desktop'?pick('没有连上桌面版。打开桌面版后再点下载，或点「这次用插件下载」。','Ruxget Desktop isn’t connected. Open it and download again, or choose “Use the extension this time”.'):pick('没有连上桌面版。打开桌面版后再试，或直接点「下载视频」用插件下载。','Ruxget Desktop isn’t connected. Open it and try again, or click “Download video” to download it with the extension.');return;}$('#platformError').textContent=RuxgetText.tr(error.message);$('#platformError').hidden=false;}
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
        if(!job){renderHint();return;}
        const percent=Number.isFinite(job.progress)?Math.max(0,Math.min(100,job.progress)):0;
        $('#platformStage').textContent=RuxgetText.tr(job.error||job.stage);
        $('#platformPercent').textContent=Math.round(percent)+'%';
        $('#platformProgress').value=percent;
        $('#platformCancel').hidden=['complete','error','cancelled'].includes(job.status);
        if($('#platformDelete').dataset.armed!==job.id)disarmDelete();
        $('#platformDelete').hidden=!['complete','error','cancelled'].includes(job.status);
        $('#platformOpen').hidden=!(job.status==='complete'&&Number.isInteger(job.downloadId));$('#platformOpen').textContent=pick('打开','Open');
        $('#platformJob').title=$('#platformOpen').hidden?'':pick('双击打开文件','Double-click to open the file');
        renderHint();
    }
    // One quiet line under the card, never a pop-up and never something to dismiss:
    // a desktop suggestion when a download failed or the video is long, else (after 5 finished downloads) a rating link.
    // The rating line shows in at most 5 popup openings and never again once clicked.
    const RATE_LIMIT=5,CHROME_STORE='nlhoddnpmoakgikfpdmdkjmahcaokbcl';
    let rateCounted=false,hintSerial=0;
    function rateLink(){
        if(chrome.runtime.id===CHROME_STORE)return {url:'https://chromewebstore.google.com/detail/'+CHROME_STORE+'/reviews',text:pick('用着顺手的话，去商店给 Ruxget 写个评价 ⭐','Enjoying Ruxget? A rating in the store helps ⭐')};
        return {url:'https://github.com/hesay77-cmyk/shiying',text:pick('用着顺手的话，去 GitHub 给 Ruxget 点个 Star ⭐','Enjoying Ruxget? A star on GitHub helps ⭐')};
    }
    function hintLine(text,action,label,onClick){
        const hint=$('#cardHint'),span=document.createElement('span');span.textContent=text;
        const nodes=[span];if(action){const link=document.createElement(action);link.className='hint-link';link.textContent=label;if(action==='a'){link.href=onClick.url;link.target='_blank';link.rel='noopener';}link.addEventListener('click',onClick.handler||onClick);nodes.push(link);}
        hint.replaceChildren(...nodes);hint.hidden=false;
    }
    async function renderHint(){
        const serial=++hintSerial,hint=$('#cardHint');if(!hint)return;
        const job=currentJob,toDesktop=()=>sendDesktop(),onBrowser=effectiveMethod()!=='desktop'&&!sentToDesktop();
        if(job?.status==='error'&&onBrowser){hintLine(pick('下载没成功？可以改用桌面版下载，支持断点续传。','Didn’t work? The desktop app can download it with pause and resume.'),'button',pick('改用桌面版','Use the desktop app'),toDesktop);return;}
        if(catalog&&Number(catalog.duration)>=1800&&onBrowser&&(!job||!['complete','error','cancelled'].includes(job.status))){hintLine(pick('视频较长，用桌面版下载更稳，可以暂停续传。','Long video: the desktop app is steadier and can pause and resume.'),'button',pick('改用桌面版','Use the desktop app'),toDesktop);return;}
        if(job?.status==='complete'){
            const {ruxgetDoneCount:done=0,ruxgetRate:rate={}}=await chrome.storage.local.get(['ruxgetDoneCount','ruxgetRate']);
            if(serial!==hintSerial)return;
            if(done>=5&&!rate.clicked&&(rate.shown||0)<RATE_LIMIT){
                const link=rateLink();
                if(!rateCounted){rateCounted=true;chrome.storage.local.set({ruxgetRate:{...rate,shown:(rate.shown||0)+1}});}
                hintLine('', 'a', link.text, {url:link.url,handler:()=>chrome.storage.local.set({ruxgetRate:{...rate,clicked:true}}).then(()=>{hint.hidden=true;})});
                return;
            }
        }
        hint.hidden=true;hint.replaceChildren();
    }
    // Two clicks: the first only arms the button, so a stray click never deletes a file.
    let deleteTimer=0;
    function disarmDelete(){clearTimeout(deleteTimer);const button=$('#platformDelete');delete button.dataset.armed;button.classList.remove('is-armed');button.textContent=currentJob&&currentJob.status!=='complete'?pick('移除记录','Remove'):pick('删除文件','Delete file');}
    // 0.4.73: the card shows only the download of the video it shows. Every read (the tab's video, a pasted link,
    // the refresh button) looks the job up again by that video's address, and a failed read for an address without a
    // download leaves no job: a finished or failed download of another video, with its 「删除文件」, never stays behind.
    async function restoreJob(urls,serial){
        const {shiyingJobIds:ids=[]}=await chrome.storage.local.get('shiyingJobIds');
        const records=await chrome.storage.local.get(ids.slice(-50).map(id=>'shiyingJob:'+id));
        const job=ids.slice().reverse().map(id=>records['shiyingJob:'+id]).find(item=>item&&urls.includes(item.url));
        if(serial!==generation)return;
        renderJob(job||null);
        if(job&&!['complete','error','cancelled'].includes(job.status)){
            const snapshot=await send('shiyingPlatformJob',{id:job.id});
            if(serial===generation&&currentJob?.id===job.id)renderJob(snapshot);
        }
    }
    chrome.storage.onChanged.addListener((changes,area)=>{
        if(area!=='local'||!currentJob)return;
        const change=changes['shiyingJob:'+currentJob.id];if(!change)return;
        // Deleted elsewhere (recent list, progress page): clear the card instead of showing a stale download.
        renderJob(change.newValue||null);
    });
    $('#platformDetails').addEventListener('click',()=>{if(currentJob)chrome.tabs.create({url:chrome.runtime.getURL('shiying-task.html?id='+encodeURIComponent(currentJob.id))});});
    // Open the saved file: the "打开" button, or a double-click anywhere on the finished download (not on its buttons).
    const openJob=()=>{if(currentJob?.status==='complete'&&Number.isInteger(currentJob.downloadId))RuxgetOpen.file(currentJob.downloadId,text=>{if(typeof notify==='function')notify(text);});};
    $('#platformOpen').addEventListener('click',openJob);
    $('#platformJob').addEventListener('dblclick',event=>{if(!event.target.closest('button'))openJob();});
    $('#platformDelete').addEventListener('click',async()=>{
        const button=$('#platformDelete');if(!currentJob)return;
        if(button.dataset.armed!==currentJob.id){button.dataset.armed=currentJob.id;button.classList.add('is-armed');button.textContent=currentJob.status==='complete'?pick('再点一次确认删除','Click again to delete'):pick('再点一次移除记录（文件不受影响）','Click again to remove the record (no file is deleted)');clearTimeout(deleteTimer);deleteTimer=setTimeout(disarmDelete,4000);return;}
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
        closeMethods(false);$('#subtitleBox').hidden=true;$('#collectionOpen').hidden=true;
        $('#platformRead').disabled = true;
        let source = null;
        try {source = ShiyingPlatform.source($('#platformURL').value.trim());} catch {}
        if (currentJob && currentJob.url !== source?.url) renderJob(null);
        try {
            if (!source) ShiyingPlatform.source($('#platformURL').value.trim());
            const result = await send('shiyingPlatformRead', {url:source.url});
            if (serial !== generation) return;
            catalog = result;pasteNote('');
            $('#platformTitle').textContent = result.title;
            $('#platformTitle').title = result.title;
            $('#platformTitle').dataset.liveTitle = result.title;
            renderMeta();
            $('#platformNote').textContent = '';renderHint();
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
            const subtitles=result.subtitles||[];$('#subtitleBox').hidden=true;$('#platformSubtitleLang').replaceChildren(...subtitles.map((item,index)=>new Option(item.name||item.lang,String(index))));$('#platformSubtitleLang').hidden=subtitles.length<2;
            $('#platformSubtitles').textContent=subtitles.length===1?pick('下载字幕（'+(subtitles[0].name||subtitles[0].lang)+'）','Subtitles ('+(subtitles[0].name||subtitles[0].lang)+')'):pick('下载字幕','Subtitles');
            // B站 videos may have several parts; other sites offer a list only when the page came from one.
            $('#collectionOpen').hidden=!(result.site==='bilibili'&&Number(result.parts)>1||result.listUrl);if(desktopState==='idle')checkDesktop();else updateDesktopLines();$('#collectionOpen').textContent=result.site==='bilibili'?pick('分 P 勾选下载…','Choose parts…'):pick('播放列表勾选下载…','Choose from list…');
        } catch (error) {
            if (serial !== generation) return;
            $('#platformTitle').textContent = pick('暂时没有读到视频','Couldn’t read the video yet');
            $('#platformMeta').textContent = '';
            $('#platformNote').textContent = '';
            $('#platformError').textContent = RuxgetText.tr(error.message);
            $('#platformError').hidden = false;
            $('#platformQuality').replaceChildren(new Option(pick('读取成功后选择','Choose after reading'), ''));
        } finally {if (serial === generation){$('#platformRead').disabled = false;updateActions();}}
        if (serial !== generation) return;
        const urls = [source?.url, catalog?.url].filter(Boolean);
        if (!urls.length) {renderJob(null);return;}
        try {await restoreJob(urls, serial);} catch {/* The catalog stays usable without a job snapshot. */}
    }
    // A share text from an app or site (title plus link) becomes just the link as soon as it is pasted.
    $('#platformURL').addEventListener('input', () => {pasteNote('');const field=$('#platformURL'),value=field.value.trim(),link=value.match(/https?:\/\/[^\s<>"'，。、；）)】」]+/i);if(link&&link[0]!==value)field.value=link[0];});
    const fileLink=value=>{try{const link=new URL(value);if(!/^https?:$/.test(link.protocol))return false;let name=link.pathname.split('/').pop()||'';try{name=decodeURIComponent(name);}catch{}return /\.[a-z0-9]{1,8}$/i.test(name)&&!/\.(html?|xhtml|php|aspx?|jsp|shtml|cgi)$/i.test(name);}catch{return false;}};
    // 0.4.72: notes about the pasted link stay under the box (a toast vanished before a long one could be read) until
    // the link is edited or read successfully.
    function pasteNote(text,tone='warn'){const note=$('#platformPasteNote');if(!note)return;note.textContent=text?RuxgetText.tr(text):'';note.dataset.tone=tone;note.hidden=!text;}
    const say=text=>pasteNote(text);
    // A playlist link (.m3u8 / .mpd) is not a file: Chrome would save only its text. It opens in the extension's own
    // stream page instead (m3u8.html merges the segments in the browser; mpd.html picks the tracks), after access to
    // that one site. Called in the click, so Chrome can ask for the site.
    const streamKind=link=>{const name=link.pathname.toLowerCase();return /\.m3u8$/.test(name)?'m3u8':/\.mpd$/.test(name)?'mpd':'';};
    function openStream(url){
        let link;try{link=new URL(url);}catch{return false;}
        const kind=/^https?:$/.test(link.protocol)?streamKind(link):'';if(!kind)return false;
        pasteNote('');
        let name=link.pathname.split('/').pop()||'';try{name=decodeURIComponent(name);}catch{}name=name.replace(/\.(m3u8?|mpd)$/i,'')||pick('网页视频','Web video');
        chrome.permissions.request({origins:[link.protocol+'//'+link.hostname+'/*']}).catch(()=>false).then(async granted=>{
            if(!granted){pasteNote(pick('需要允许访问这个网站，才能读取这个播放列表。','Allow access to this site to read the playlist.'));return;}
            const result=await chrome.runtime.sendMessage({Message:'shiyingDownload',tabId:currentTab?.id,data:{url:link.href,ext:kind,title:name,webUrl:link.href}});
            if(!result?.ok)throw new Error(result?.error||'没有打开下载页，请重试');
            pasteNote(kind==='m3u8'?pick('这是分段视频的播放列表，已在新标签页中下载并合并，完成后由 Chrome 保存。','This is a streaming playlist. It is downloading and merging in a new tab; Chrome saves the file when it is done.'):pick('这是音画分轨的播放列表，已在新标签页中打开，选好画面和声音后下载。','This is a DASH playlist with separate tracks. It opened in a new tab; pick the video and audio there, then download.'),'info');
        }).catch(error=>pasteNote(error.message||String(error)));
        return true;
    }
    $('#platformForm').addEventListener('submit', event => {event.preventDefault();let url=$('#platformURL').value.trim();
        if(/^BV[0-9A-Za-z]{10}$/.test(url)){url='https://www.bilibili.com/video/'+url+'/';$('#platformURL').value=url;}
        if(url&&!/^[a-z][a-z0-9+.-]*:/i.test(url)&&/^[\w-]+(\.[\w-]+)+(\/|\?|$)/.test(url)){url='https://'+url;$('#platformURL').value=url;}
        let parsed=null;try{parsed=new URL(url);}catch{}
        if(!parsed||!/^https?:$/.test(parsed.protocol)){say(/^magnet:/i.test(url)?pick('磁力链接请用 Ruxget 桌面版下载：打开桌面版，点「新建下载」（复制的链接会自动填好）。','Magnet links download in Ruxget Desktop: open it and click “New download” (a copied link is filled in).'):pick('请粘贴完整的网址，例如 https://www.bilibili.com/video/…','Paste a full link, such as https://www.bilibili.com/video/…'));return;}
        // A Bilibili short link that already names the video (b23.tv/BV…) is read as that video's page.
        const bv=/^(b23\.tv|bili2233\.cn)$/i.test(parsed.hostname)&&parsed.pathname.match(/^\/(BV[0-9A-Za-z]{10})\/?$/);if(bv){url='https://www.bilibili.com/video/'+bv[1]+'/';$('#platformURL').value=url;parsed=new URL(url);}
        let videoPage=true;try{ShiyingPlatform.source(url);}catch{videoPage=false;}
        if(!videoPage&&/^(b23\.tv|bili2233\.cn|v\.douyin\.com|v\.kuaishou\.com|xhslink\.com)$/i.test(parsed.hostname)){say(pick('这是 App 分享的短链接，这里读不出来。先在浏览器里打开它，跳到视频页后再点 Ruxget。','This is an app share link that can’t be read here. Open it in the browser first, then click Ruxget on the video page.'));return;}
        if(!videoPage&&openStream(url))return;
        if(!videoPage&&fileLink(url)&&document.querySelector('#linkDownload')){$('#linkDownloadURL').value=url;$('#linkDownloadError').hidden=true;$('#linkDownload').showModal();return;}
       if(parsed.searchParams.has('list')&&!parsed.searchParams.has('v')){window.ShiyingCollectionUI.open(url,true);return;}read();});
    // Some video servers need the page as Referer; that requires an optional permission for them, asked once per site.
    function serverAccess(){const origins=catalog?.mediaOrigins||[];return origins.length?chrome.permissions.request({origins}).catch(()=>false):Promise.resolve(true);}
    // Settings → 下载视频时一起保存字幕: the video's subtitles (Chinese first) are saved as an .srt next to it, quietly.
    function saveSubtitles(video,format){const list=video?.subtitles||[];if(format==='mp3'||!list.length)return;chrome.storage.local.get('ruxgetSaveSubtitles').then(data=>{if(!data.ruxgetSaveSubtitles)return;let index=list.findIndex(item=>/^(ai-)?zh/i.test(item.lang||''));if(index<0)index=0;return send('shiyingPlatformSubtitle',{id:video.id,index,saveAs:false});}).catch(()=>{});}
    async function download(format) {
        if (!catalog || starting || $('#platformDownload').disabled) return;
        const access=serverAccess();starting=true;
        if(!await access){starting=false;$('#platformError').textContent=pick('需要允许访问这个网站的视频服务器才能下载；只用于这个网站的视频。','Allow access to this site’s video servers to download; it is only used for its videos.');$('#platformError').hidden=false;return;}
        const selectedCatalog=catalog, serial=generation;starting=true;savePreference();
        $('#platformDownload').disabled = true;
        $('#platformAudio').disabled = true;
        // 0.4.72: the note describes the download happening now: an earlier 「已交给桌面版」 goes once the extension downloads.
        $('#platformError').hidden = true;$('#platformNote').textContent = '';
        try {const job=await send('shiyingPlatformStart', {id:selectedCatalog.id,format,height:format === 'mp3' ? undefined : Number($('#platformQuality').value),saveAs:$('#saveAs').checked});if(serial!==generation)return;renderJob(job);saveSubtitles(selectedCatalog,format);document.body.classList.remove('choices-open');$('#platformChoices').setAttribute('aria-expanded','false');}
        catch (error) {$('#platformError').textContent = RuxgetText.tr(error.message); $('#platformError').hidden = false;}
        finally {starting=false;updateActions();}
    }
    $('#platformSubtitles').addEventListener('click',async()=>{if(!catalog)return;const button=$('#platformSubtitles'),label=button.textContent;button.disabled=true;$('#platformError').hidden=true;try{await send('shiyingPlatformSubtitle',{id:catalog.id,index:Number($('#platformSubtitleLang').value||0),saveAs:$('#saveAs').checked});$('#platformNote').textContent=pick('字幕已保存为 SRT 文件','Subtitles saved as an SRT file');}catch(error){$('#platformError').textContent=RuxgetText.tr(error.message);$('#platformError').hidden=false;}finally{button.disabled=false;button.textContent=label;}});
    // 0.4.72: a video the desktop app already started (same format and quality) isn't downloaded a second time by a
    // stray click: the first click only says so, a second one downloads another copy with the extension.
    let againKey='';
    function downloadHere(){const key=desktopKey();if(sentList[key]?.started&&againKey!==key){againKey=key;$('#platformError').hidden=true;$('#platformNote').textContent=pick('已经交给桌面版了，在「已下载」里看进度。如需再用插件下载一份，请再点一次。','Already sent to Ruxget Desktop; follow it in Downloads. Click again to download another copy with the extension.');return;}againKey='';download(selectedFormat());}
    $('#platformDownload').addEventListener('click', () => effectiveMethod()==='desktop'?sendDesktop():downloadHere());
    $('#platformUseBrowser').addEventListener('click', downloadHere);
    $('#platformAudio').addEventListener('click', () => download('mp3'));
    $('#desktopPromo')?.addEventListener('click', () => chrome.tabs.create({url:ShiyingNative.DESKTOP_RELEASE_URL}));
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
        $('#platformURL').value = source?.url || '';pasteNote('');
        $('#platformEntry').hidden = false;
        if (source && serial === generation) await read();
    }
    return {bind,stream:openStream,url:()=>currentTab?.url||$('#platformURL').value,refresh:() => $('#platformCard').hidden ? Promise.resolve() : read(),desktop:desktopPayload};
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
