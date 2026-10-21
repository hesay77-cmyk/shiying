/* Desktop UI + bilingual strings. Host status codes stay Chinese for logic. */
(()=>{'use strict';
const STORAGE_KEY='ruxgetUiLanguage';
const STR={
zh_CN:{
language:'语言',langAuto:'跟随系统',langZh:'中文',langEn:'English',uiLanguage:'界面语言',
add:'添加',linkAria:'下载链接',linkPlaceholder:'粘贴视频、文件或磁力链接',
chooseFolderTitle:'选择默认保存文件夹',saveToDownloads:'保存到下载文件夹',saveToPrefix:'保存到 ',saveFolder:'保存位置',changeFolder:'更改…',followsChrome:'跟随 Chrome 的下载位置，插件下载的文件也在这里',ownFolder:'你自己选的位置（不跟随 Chrome）',
chooseFolderDot:'选择文件夹 · ',miniWindow:'迷你窗',openMenu:'打开设置',
newDownload:'新建下载',batchAdd:'批量添加',importTorrent:'导入 BT 种子',downloadSettings:'下载设置',
videoComponents:'视频组件',connectChrome:'连接 Chrome 插件',aboutRuxget:'关于 Ruxget',hideToTray:'收起到托盘',
windowOps:'窗口操作',minimize:'最小化',maximize:'最大化或还原',closeApp:'关闭 Ruxget',
downloads:'下载',taskStatus:'任务状态',filterAll:'全部',filterActive:'进行中',filterComplete:'已完成',filterUnfinished:'未完成',
pause:'暂停',resume:'继续',deleteTask:'删除任务',emptyTitle:'添加一个下载链接',emptyBody:'粘贴或拖入下载链接，也可以拖入 BT 种子。YouTube、B站、SoundCloud 等常见视频网站的链接可以直接粘贴；部分网站需要登录，或暂时不支持。',
noTasksHere:'这里暂时没有任务',taskList:'下载任务列表',inspectorPanel:'下载详情面板',downloadDetails:'下载详情',
collapseDetails:'收起详情',freeOpenSource:'免费开源，无广告',expand:'展开 ↗',collapse:'收起',
deleteTaskKeepHint:'删除任务并选择是否保留文件',nextItem:'下一项',cancel:'取消',downloadLink:'下载链接',
downloadType:'下载类型',kindFile:'普通文件',kindVideo:'网页视频',kindAudio:'MP3 音频',kindMagnet:'磁力链接',kindTorrent:'BT 种子',
kindTracks:'浏览器所选视频',maxQuality:'最高画质',chooseFolderEllipsis:'选择文件夹…',categorizeByType:'按类型放入子文件夹',
startDownload:'开始下载',confirmBrowser:'确认浏览器下载',batchUrlsLabel:'每行一个链接，最多 100 条',
batchType:'批量下载类型',kindFileOrMagnet:'文件 / 磁力链接',batchMaxQuality:'批量最高画质',addToQueue:'添加到队列',
proxyLabel:'网页 / HTTP Tracker 代理',proxyPlaceholder:'例如 http://127.0.0.1:7890',proxySystem:'跟随系统代理',proxyNone:'不使用代理',proxyCustom:'自定义…',connections:'每个文件连接数',
fileSlots:'文件并行任务',videoSlots:'视频并行任务',rateLimit:'限速 KiB/s',btUpload:'BT 上传 KiB/s',
autoCategorize:'新任务默认按类型归档',saveSubtitles:'下载视频时同时保存字幕（SRT）',settingsNote:'限速为 0 表示不限；BT 节点直接联网。默认保存位置可在主界面上方修改。',
save:'保存',chooseFiles:'选择下载文件',chooseLater:'稍后选择',selectAll:'全选',clearSelection:'清空选择',
btNote:'未确认前不开始下载。跨文件校验可能保留少量未选文件的边界数据。',downloadSelected:'下载所选文件',
deleteThisTask:'删除这个任务？',alsoDeleteFiles:'同时删除文件',deleteTaskAndFiles:'删除任务和文件',deleteTaskOnly:'仅删除任务',
close:'关闭',dropHint:'松开添加种子或链接',selectFiles:'选文件',details:'详情',viewDetails:'查看详情',collapseDetailsBtn:'收起详情',
openFolder:'打开文件夹',chooseBtFiles:'选择 BT 文件',copyLink:'复制下载链接',selectMultiple:'选择多个任务',deleteTaskEllipsis:'删除任务…',
moreActions:'更多任务操作',segmentProgress:'分段进度',segmentEach:'查看每段进度',segmentN:'分段 $1',downloadAddrs:'下载地址与保存位置',
activeCount:'正在进行 $1 项',selectedCount:'已选 $1 项',selectJob:'选择 $1',progressOf:'$1下载进度',
miniCount:'Ruxget · $1 个任务',noDownloads:'暂无下载任务',expandToAdd:'展开窗口添加链接',
deleteNTasks:'删除 $1 个任务？',deleteEligible:'仅处理所选任务中可删除的 $1 项',pauseBeforeDelete:'请先暂停要删除的任务',
deleteWithFilesNote:'同时删除已下载文件和未完成数据，无法撤销。原始种子文件会保留。',
deleteKeepFilesNote:'只删除任务记录，保留已下载文件和未完成数据。',deleting:'正在删除…',
btSelected:'已选 $1 / $2 个文件',btHave:'已有 $1',
noteMagnet:'先获取文件列表，由你勾选后再开始下载。',
noteVideo:'画质为下载上限；实际可用画质取决于原站。需要登录的视频请从 Chrome 插件发送。',
noteTracks:'保留 Chrome 插件中选定的实际画质，画面和声音自动合并。',
dropBusy:'请先确认或取消当前操作，再拖入新任务',dropOneTorrent:'请一次拖入一个 BT 种子',
dropTorrentSize:'请拖入不超过 4 MiB 的 .torrent 文件',dropUnsupported:'当前运行环境不支持拖入文件，请使用“导入 BT 种子”',
dropOneLink:'请一次拖入一个网页、文件下载链接或磁力链接',dropBadLink:'请拖入网页、文件下载链接或磁力链接',
aboutTitle:'关于 Ruxget',aboutVersion:'版本 $1',aboutFree:'免费开源，无广告。',
host_已完成:'已完成',host_下载中:'下载中',host_已暂停:'已暂停',host_失败:'失败',host_排队中:'排队中',
host_等待下载:'等待下载',host_正在暂停:'正在暂停',host_准备组件:'准备组件',host_等待节点:'等待节点',host_等待选文件:'等待选文件',
'host_正在下载内容':'正在下载内容','host_首次使用，正在准备视频组件':'首次使用，正在准备视频组件'
},
en:{
language:'Language',langAuto:'Follow system',langZh:'Chinese',langEn:'English',uiLanguage:'UI language',
add:'Add',linkAria:'Download link',linkPlaceholder:'Paste a video, file, or magnet link',
chooseFolderTitle:'Choose default save folder',saveToDownloads:'Save to Downloads',saveToPrefix:'Save to ',saveFolder:'Save folder',changeFolder:'Change…',followsChrome:'Follows Chrome’s download folder; the extension saves here too',ownFolder:'Your own folder (doesn’t follow Chrome)',
chooseFolderDot:'Choose folder · ',miniWindow:'Mini',openMenu:'Open menu',
newDownload:'New download',batchAdd:'Batch add',importTorrent:'Import torrent',downloadSettings:'Download settings',
videoComponents:'Video components',connectChrome:'Connect Chrome extension',aboutRuxget:'About Ruxget',hideToTray:'Hide to tray',
windowOps:'Window',minimize:'Minimize',maximize:'Maximize or restore',closeApp:'Close Ruxget',
downloads:'Downloads',taskStatus:'Task status',filterAll:'All',filterActive:'Active',filterComplete:'Done',filterUnfinished:'Incomplete',
pause:'Pause',resume:'Resume',deleteTask:'Delete task',emptyTitle:'Add a download link',emptyBody:'Paste or drop a link, or drop a torrent file. Links from common video sites such as YouTube, Bilibili and SoundCloud work directly; some sites need a sign-in or aren’t supported.',
noTasksHere:'No tasks in this filter',taskList:'Download list',inspectorPanel:'Download details',downloadDetails:'Details',
collapseDetails:'Collapse details',freeOpenSource:'Free and open source',expand:'Expand ↗',collapse:'Collapse',
deleteTaskKeepHint:'Delete task and choose whether to keep files',nextItem:'Next',cancel:'Cancel',downloadLink:'Download link',
downloadType:'Download type',kindFile:'Regular file',kindVideo:'Web video',kindAudio:'MP3 audio',kindMagnet:'Magnet link',kindTorrent:'Torrent',
kindTracks:'Tracks from browser',maxQuality:'Max quality',chooseFolderEllipsis:'Choose folder…',categorizeByType:'Sort into type folders',
startDownload:'Start download',confirmBrowser:'Confirm browser download',batchUrlsLabel:'One link per line, up to 100',
batchType:'Batch type',kindFileOrMagnet:'File / magnet',batchMaxQuality:'Batch max quality',addToQueue:'Add to queue',
proxyLabel:'Web / HTTP tracker proxy',proxyPlaceholder:'e.g. http://127.0.0.1:7890',proxySystem:'Use system proxy',proxyNone:'No proxy',proxyCustom:'Custom…',connections:'Connections per file',
fileSlots:'Parallel file jobs',videoSlots:'Parallel video jobs',rateLimit:'Speed limit KiB/s',btUpload:'BT upload KiB/s',
autoCategorize:'Archive new tasks by type',saveSubtitles:'Also save subtitles (SRT) with videos',settingsNote:'0 = unlimited. BT peers connect directly. Change the default folder from the top bar.',
save:'Save',chooseFiles:'Choose files',chooseLater:'Choose later',selectAll:'Select all',clearSelection:'Clear',
btNote:'Download starts only after you confirm. Piece checks may keep a little data at file boundaries.',downloadSelected:'Download selected',
deleteThisTask:'Delete this task?',alsoDeleteFiles:'Also delete files',deleteTaskAndFiles:'Delete task and files',deleteTaskOnly:'Delete task only',
close:'Close',dropHint:'Drop to add a torrent or link',selectFiles:'Files',details:'Details',viewDetails:'View details',collapseDetailsBtn:'Hide details',
openFolder:'Open folder',chooseBtFiles:'Choose BT files',copyLink:'Copy link',selectMultiple:'Select multiple',deleteTaskEllipsis:'Delete task…',
moreActions:'More actions',segmentProgress:'Segment progress',segmentEach:'Show each segment',segmentN:'Segment $1',downloadAddrs:'URL and save path',
activeCount:'$1 active',selectedCount:'$1 selected',selectJob:'Select $1',progressOf:'$1 progress',
miniCount:'Ruxget · $1 tasks',noDownloads:'No downloads',expandToAdd:'Expand to add a link',
deleteNTasks:'Delete $1 tasks?',deleteEligible:'Only $1 deletable of the selection',pauseBeforeDelete:'Pause the task before deleting',
deleteWithFilesNote:'Deletes downloaded files and incomplete data. Cannot undo. Original .torrent is kept.',
deleteKeepFilesNote:'Removes the task record only. Files and incomplete data stay.',deleting:'Deleting…',
btSelected:'$1 / $2 files selected',btHave:'have $1',
noteMagnet:'Fetch the file list first, then pick what to download.',
noteVideo:'Quality is a ceiling; the site decides what is available. Logged-in videos should be sent from the Chrome extension.',
noteTracks:'Keeps the quality picked in the Chrome extension and merges video + audio.',
dropBusy:'Finish or cancel the current dialog before dropping another item',dropOneTorrent:'Drop one .torrent at a time',
dropTorrentSize:'Drop a .torrent under 4 MiB',dropUnsupported:'This build cannot accept dropped files. Use Import torrent.',
dropOneLink:'Drop one web, file, or magnet link',dropBadLink:'Drop a web, file, or magnet link',
aboutTitle:'About Ruxget',aboutVersion:'Version $1',aboutFree:'Free and open source. No ads.',
host_已完成:'Done',host_下载中:'Downloading',host_已暂停:'Paused',host_失败:'Failed',host_排队中:'Queued',
host_等待下载:'Waiting',host_正在暂停:'Pausing',host_准备组件:'Preparing components',host_等待节点:'Waiting for peers',host_等待选文件:'Choose files',
'host_正在下载内容':'Downloading content','host_首次使用，正在准备视频组件':'First run: preparing video components'
,'host_文件大小':'File size','host_已下载':'Downloaded','host_已经下载':'Downloaded','host_传输速度':'Speed','host_预计剩余':'Time left','host_能否续传':'Resume','host_活动连接':'Connections'
,'host_未知':'Unknown','host_正在收尾':'Finishing','host_等待节点重试':'Waiting to retry peers','host_等待选择文件':'Waiting to choose files','host_等待开始':'Waiting to start','host_准备组件中':'Preparing components','host_正在整理':'Processing','host_计算中':'Calculating'
,'host_支持（分块校验）':'Yes (piece checks)','host_获取信息后确认':'After metadata','host_取决于源站':'Depends on source','host_支持（需核对）':'Yes (verify needed)','host_支持':'Yes','host_无法安全续传':'Not safely','host_不支持':'No','host_尚未确认':'Unknown'
,'host_收到分段信息后显示，未知数据不会推算为已完成。':'Shown after segment info arrives. Unknown data is not counted as Done.'
,'host_当前媒体轨进度；内核暂不提供独立分片的字节进度。':'Current media-track progress. Per-fragment byte progress is not available yet.'
,'host_等待分段信息，未知数据不会推算成已完成':'Waiting for segment info. Unknown data is not counted as Done'
,'host_视频可能分轨下载':'Video may download in separate tracks','host_最终大小以合并后的文件为准':'final size is the merged file'
,'host_正在下载音频':'Downloading audio','host_正在下载画面':'Downloading video','host_当前音频轨':'Current audio track','host_当前画面轨':'Current video track'
,'host_文件':'File','host_视频':'Video'
,'host_任务已暂停；点击“继续”后才会重新寻找节点。':'Paused; resume to search for peers again.'
}
};
let uiPref='auto',uiLang='zh_CN';
const $=id=>document.getElementById(id),send=data=>window.chrome.webview.postMessage(data),selected=new Set();
let editorListCatalog=null,listReading=false,listRequest=0;
let state={jobs:[],settings:{}},filter='all',expanded='',selectMode=false,editorToken='',btId='',lastRender='',toastTimer,selectionInitialized=false,deletion=null;
function systemLang(){try{const n=(navigator.language||'').toLowerCase();return n.startsWith('zh')?'zh_CN':'en';}catch(e){return 'zh_CN';}}
function resolveLang(pref){return (pref==='en'||pref==='zh_CN')?pref:systemLang();}
function t(key,a,b){let msg=(STR[uiLang]&&STR[uiLang][key])||(STR.zh_CN[key])||key;if(a!=null)msg=msg.replace(/\$1/g,String(a));if(b!=null)msg=msg.replace(/\$2/g,String(b));return msg;}
function hostText(text){if(text==null||text==='')return '';const s=String(text);if(uiLang==='zh_CN')return s;const key='host_'+s;if(STR.en[key])return STR.en[key];
 let m;if((m=/^约 (\d+) 秒$/.exec(s)))return '~'+m[1]+'s';if((m=/^约 (\d+) 分 (\d+) 秒$/.exec(s)))return '~'+m[1]+'m '+m[2]+'s';if((m=/^约 (\d+) 小时 (\d+) 分$/.exec(s)))return '~'+m[1]+'h '+m[2]+'m';if((m=/^约 (\d+) 天$/.exec(s)))return '~'+m[1]+'d';
 if((m=/^(\d+) 个$/.exec(s)))return m[1];
 if(s.startsWith('区间 '))return 'Range '+s.slice(3);
 if(s.includes('；最终大小以合并后的文件为准')){const head=s.split('；最终大小以合并后的文件为准')[0];return hostText(head)+'; final size is the merged file';}
 // Longer phrases first so short tokens like 已完成 do not punch holes in full sentences
 const pairs=Object.entries({
  '收到分段信息后显示，未知数据不会推算为已完成。':'Shown after segment info arrives. Unknown data is not counted as Done.',
  '等待分段信息，未知数据不会推算成已完成':'Waiting for segment info. Unknown data is not counted as Done',
  '当前媒体轨进度；内核暂不提供独立分片的字节进度。':'Current media-track progress. Per-fragment byte progress is not available yet.',
  '任务已暂停；点击“继续”后才会重新寻找节点。':'Paused; resume to search for peers again.',
  '首次使用，正在准备视频组件':'First run: preparing video components',
  '正在准备视频组件':'Preparing video components',
  '正在下载内容':'Downloading content','正在下载音频':'Downloading audio','正在下载画面':'Downloading video',
  '视频可能分轨下载':'Video may download in separate tracks',
  '当前音频轨':'Current audio track','当前画面轨':'Current video track',
  '等待选文件':'Choose files','等待节点':'Waiting for peers','准备组件':'Preparing components',
  '支持（分块校验）':'Yes (piece checks)','支持（需核对）':'Yes (verify needed)','支持':'Yes','获取信息后确认':'After metadata','无法安全续传':'Not safely','取决于源站':'Depends on source','尚未确认':'Unknown','不支持':'No',
  '文件大小':'File size','已经下载':'Downloaded','已下载':'Downloaded','传输速度':'Speed','预计剩余':'Time left','能否续传':'Resume','活动连接':'Connections',
  '正在收尾':'Finishing','等待节点重试':'Waiting to retry peers','等待选择文件':'Waiting to choose files','等待开始':'Waiting to start','准备组件中':'Preparing components','正在整理':'Processing','计算中':'Calculating',
  // 0.4.47: common task-list stages, amounts and notices from the desktop engine.
  '大小待确认':'Size unknown',
  '正在合并画面和声音':'Merging video and audio',
  '正在整理文件':'Organizing files',
  '正在转换声音':'Converting audio',
  '正在准备组件':'Preparing components',
  '正在校验组件':'Verifying components',
  '组件已就绪':'Components ready',
  '视频组件未准备完成':'Video components aren’t ready',
  '视频组件尚未准备好，请继续重试':'Video components aren’t ready yet. Retry to continue',
  '下载失败，请重试':'Download failed. Try again',
  '下载中断，请重试':'Download interrupted. Try again',
  '下载内核启动失败，请重试':'The download engine didn’t start. Try again',
  '下载地址已过期，请回原网页重新获取。':'The download link expired. Get it again from the original page.',
  '链接不存在或已过期，请重新获取下载地址':'The link is missing or expired. Get the download link again',
  '网站拒绝了下载请求，请在原网页重新读取并发送':'The site refused the download. Read it again on the page and resend',
  '网站暂时限制请求，请稍后再试':'The site is limiting requests. Try again later',
  '网站未返回完整文件，请重新读取视频链接':'The site didn’t return the full file. Read the video link again',
  '源文件已变化或无法确认版本，请新建下载；原有未完成数据已保留':'The source changed or can’t be verified. Start a new download; unfinished data is kept',
  '任务仍在运行，请先暂停再删除':'The task is running. Pause it before deleting',
  '请先暂停这个任务':'Pause this task first',
  '请先暂停任务，再调整下载文件':'Pause the task before changing files',
  '已删除任务及其文件':'Task and files deleted',
  '已删除任务，文件已保留':'Task deleted, files kept',
  '已复制下载链接':'Download link copied',
  '已保存所选文件，加入下载队列':'Selected files saved and queued',
  '设置已保存':'Settings saved',
  '已修复连接，回到 Chrome 插件检查即可。':'Connection repaired. Check it again in the Chrome extension.',
  '正在读取列表，不会开始下载…':'Reading the list; nothing downloads yet…',
  '请勾选要下载的条目':'Select the items to download',
  '请输入完整的 HTTP 或 HTTPS 链接':'Enter a full HTTP or HTTPS link',
  '请拖入网页、文件下载链接或磁力链接':'Drop a page, a file link or a magnet link',
  '首次使用时自动准备':'Prepared on first use',
  '已就绪':'Ready',
  '需要修复安装':'Needs repair',
  '核心下载组件缺失或损坏，请重新运行 Ruxget 安装器':'Core download components are missing or damaged. Run the Ruxget installer again',
  '正在等待下载名额':'Waiting for a free slot',
  '正在连接 BT 节点':'Connecting to BitTorrent peers',
  '正在接收数据':'Receiving data',
  '正在校验已有文件':'Checking existing files',
  '等待可用节点':'Waiting for peers',
  '种子信息已获取，双击选择文件':'Torrent info ready. Double-click to choose files',
  '所选文件下载完成，已停止做种':'Selected files done; seeding stopped',
  'BT 下载中断，请继续重试':'BitTorrent download interrupted. Resume to retry',
  '网盘登录或下载链接已过期，请回到网盘重新获取':'The cloud drive sign-in or link expired. Get it again from the drive',
  '已添加到下载队列':'Added to queue',
  '已完成':'Done','下载中':'Downloading','已暂停':'Paused','失败':'Failed','排队中':'Queued','等待下载':'Waiting','正在暂停':'Pausing'
 }).sort((a,b)=>b[0].length-a[0].length);
 let out=s;for(const [zh,en] of pairs){if(out.includes(zh))out=out.split(zh).join(en);}
 return out;
}function applyStatic(){
 document.documentElement.lang=uiLang==='en'?'en':'zh-CN';
 document.querySelectorAll('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;const text=t(key);if(text&&text!==key){if(el.tagName==='OPTION')el.textContent=text;else el.textContent=text;}});
 document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{const text=t(el.dataset.i18nPlaceholder);if(text)el.setAttribute('placeholder',text);});
 document.querySelectorAll('[data-i18n-title]').forEach(el=>{const text=t(el.dataset.i18nTitle);if(text)el.setAttribute('title',text);});
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>{const text=t(el.dataset.i18nAria);if(text)el.setAttribute('aria-label',text);});
 const sel=$('languageSelect'),setSel=$('settingsLanguage');
 if(sel){const labels={auto:'A',zh_CN:'\u4e2d',en:'EN'};sel.dataset.lang=uiPref;sel.textContent=labels[uiPref]||'A';sel.title='A='+t('langAuto')+' \u00b7 \u4e2d='+t('langZh')+' \u00b7 EN='+t('langEn');sel.setAttribute('aria-label',t('language')+': '+(labels[uiPref]||'A'));}
 if(setSel)setSel.value=uiPref;

}
function setLanguage(pref,rerender,persist){
 if(pref!=='auto'&&pref!=='en'&&pref!=='zh_CN')pref='auto';
 uiPref=pref;uiLang=resolveLang(pref);
 try{localStorage.setItem(STORAGE_KEY,pref);}catch(e){}
 if(persist!==false){try{post('uiLanguage',{value:pref});}catch(e){}}
 applyStatic();if(rerender!==false){lastRender='';render(true);updateEditorNote();updateDeletion();updateBT();}
}
function loadLanguage(){
 let pref='auto';
 try{pref=localStorage.getItem(STORAGE_KEY)||'auto';}catch(e){}
 setLanguage(pref,false,false);
}
function applyLanguageFromHost(settings){
 const pref=(settings&&settings.UiLanguage)||'auto';
 if(pref===uiPref)return;
 setLanguage(pref,true,false);
}
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(text,cls,run)=>{const node=el('button',cls,text);node.type='button';node.addEventListener('click',run);return node;};
const notice=text=>{$('toast').textContent=hostText(text);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);};
const post=(command,extra={})=>send({command,...extra});
function closeMenus(){document.querySelector('.menu').open=false;$('taskMenu').hidden=true;}
function openDialog(id){closeMenus();const dialog=$(id);if(!dialog.open)dialog.showModal();}
function toggleDetails(id){expanded=expanded===id?'':id;render(true);}
function showDetails(id){expanded=id;render(true);}
function showDeletion(){if(!deletion||state.mini||$('deleteDialog').open)return;$('deleteTitle').textContent=deletion.ids.length===1?t('deleteThisTask'):t('deleteNTasks',deletion.ids.length);$('deleteName').textContent=deletion.name;$('deleteFiles').checked=true;updateDeletion();openDialog('deleteDialog');$('deleteCancel').focus();}
function updateDeletion(){if(!deletion)return;const sending=!!deletion.sent;$('deleteFiles').disabled=$('deleteConfirm').disabled=$('deleteCancel').disabled=sending||!!state.busy;$('deleteNote').textContent=$('deleteFiles').checked?t('deleteWithFilesNote'):t('deleteKeepFilesNote');$('deleteConfirm').textContent=sending?t('deleting'):$('deleteFiles').checked?t('deleteTaskAndFiles'):t('deleteTaskOnly');}
function removeTasks(ids){if(state.busy||document.querySelector('dialog[open]'))return;const jobs=state.jobs.filter(job=>ids.includes(job.id)&&job.canForget);if(!jobs.length){notice(t('pauseBeforeDelete'));return;}deletion={ids:jobs.map(job=>job.id),name:jobs.length===1?jobs[0].title:t('deleteEligible',jobs.length),sent:false};if(state.mini)post('expand');else showDeletion();}
function removeTask(job){removeTasks([job.id]);}
function jobAction(job){if(job.choose)post('choose',{id:job.id});else if(job.canResume)post('resume',{ids:[job.id]});else if(job.canPause)post('pause',{ids:[job.id]});else toggleDetails(job.id);}
function actionLabel(job){return job.choose?t('selectFiles'):job.canResume?t('resume'):job.canPause?t('pause'):t('details');}
function taskMenu(job,anchor){closeMenus();const menu=$('taskMenu');menu.replaceChildren();
 const add=(text,run)=>menu.append(button(text,'',()=>{closeMenus();run();}));
 add(expanded===job.id?t('collapseDetailsBtn'):t('viewDetails'),()=>toggleDetails(job.id));add(t('openFolder'),()=>post('folder',{id:job.id}));
 if(job.bt&&job.canChoose)add(t('chooseBtFiles'),()=>post('choose',{id:job.id}));
 add(t('copyLink'),()=>post('copy',{id:job.id}));
 add(t('selectMultiple'),()=>{selectMode=true;selected.add(job.id);render(true);});
 if(job.canForget)add(t('deleteTaskEllipsis'),()=>removeTask(job));
 menu.hidden=false;const r=anchor.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,r.right-menu.offsetWidth))+'px';menu.style.top=Math.max(12,Math.min(innerHeight-menu.offsetHeight-12,r.bottom+4))+'px';
}
function details(job){const box=el('section','item-details');box.setAttribute('aria-label',t('downloadDetails'));const metrics=el('div','detail-metrics');
 for(const [caption,value] of job.metrics){const cell=el('div');cell.append(el('small','',hostText(caption)),el('b','',hostText(value)));metrics.append(cell);}box.append(metrics);
 if(job.segments.length){const map=el('div','segment-map');map.setAttribute('aria-label',t('segmentProgress'));for(const piece of job.segments){const item=el('i');item.title=hostText(piece.label);const fill=el('span');fill.style.width=Math.max(0,Math.min(100,piece.percent))+'%';item.append(fill);map.append(item);}box.append(el('h3','section-title',t('segmentProgress')),map);const pieces=el('div','segment-list');for(const [index,piece] of job.segments.entries()){const line=el('div','segment-row');line.title=hostText(piece.label);line.append(el('span','',t('segmentN',index+1)));const bar=el('progress');bar.max=100;bar.value=Math.max(0,Math.min(100,piece.percent));bar.setAttribute('aria-label',hostText(piece.label));line.append(bar,el('span','',Math.round(bar.value)+'%'));pieces.append(line);}const more=el('details','segment-details');more.open=!!window.ruxgetSegmentsOpen;more.addEventListener('toggle',()=>window.ruxgetSegmentsOpen=more.open);more.append(el('summary','',t('segmentEach')),pieces);box.append(more);}
 else box.append(el('p','quality-note',hostText(job.segmentNote)));
 if(job.notice)box.append(el('p',job.error?'error':'quality-note',hostText(job.notice)));
 const addresses=el('details','detail-addresses'),addressToggle=el('summary','',t('downloadAddrs'));addressToggle.dataset.focus=job.id+'-addresses';addresses.append(addressToggle,el('p','resource-url',job.url),el('p','resource-url',job.destination));box.append(addresses);
 if(job.bt&&job.canChoose)box.append(button(t('chooseBtFiles'),'text-button',()=>post('choose',{id:job.id})));
 return box;
}
function renderInspector(job){
 const panel=$('inspector'),body=$('inspectorBody'),same=body.dataset.id===job?.id,top=same?body.scrollTop:0,addressesOpen=same&&!!body.querySelector('.detail-addresses[open]');body.dataset.id=job?.id||'';panel.hidden=!job;document.querySelector('.workspace').classList.toggle('has-inspector',!!job);body.replaceChildren();if(!job)return;
 const head=el('div','inspector-file');head.append(el('div','file-icon '+(job.kind==='audio'?'audio':job.kind==='file'?'document':'video'),job.bt?'BT':job.kind==='audio'?'♪':job.kind==='file'?'↓':'▷'),el('h3','',job.title));body.append(head);
 const status=el('div','inspector-progress');status.append(el('span','',hostText(job.stage)),el('b','',job.known?job.percent+'%':''));const bar=el('progress');bar.max=100;bar.value=job.known?job.progress:0;body.append(status,bar,details(job));
 const tools=el('div','inspector-actions'),canOperate=job.choose||job.canResume||job.canPause,primary=button(canOperate?actionLabel(job):t('openFolder'),'download-button',()=>canOperate?jobAction(job):post('folder',{id:job.id}));primary.disabled=!!state.busy;primary.dataset.focus=job.id+'-inspector-primary';tools.append(primary);if(canOperate){const folder=button(t('openFolder'),'text-button',()=>post('folder',{id:job.id}));folder.dataset.focus=job.id+'-inspector-folder';tools.append(folder);}if(job.canForget){const remove=button(t('deleteTask'),'text-button task-delete',()=>removeTask(job));remove.disabled=!!state.busy;remove.dataset.focus=job.id+'-inspector-remove';tools.append(remove);}$('inspectorActions').replaceChildren(...tools.childNodes);if(addressesOpen)body.querySelector('.detail-addresses').open=true;body.scrollTop=top;
}
function render(force=false){const fingerprint=JSON.stringify([state.jobs,expanded,filter,selectMode,[...selected],state.busy,uiLang]);if(!force&&fingerprint===lastRender){renderMini();return;}lastRender=fingerprint;
 document.body.classList.toggle('no-tasks',state.jobs.length===0);document.querySelectorAll('form button[type=submit],[data-batch]').forEach(node=>node.disabled=!!state.busy);document.querySelectorAll('[data-command=new],[data-command=torrent]').forEach(node=>node.disabled=!!state.busy);
 const list=$('taskList'),scroll=$('taskList').parentElement.scrollTop,focus=document.activeElement?.dataset.focus;
 $('appVersion').textContent=state.version?'Ruxget · '+state.version:'';$('count').textContent=state.jobs.length;$('activeCount').textContent=state.jobs.filter(j=>j.active).length?t('activeCount',state.jobs.filter(j=>j.active).length):'';
 const shown=state.jobs.filter(j=>filter==='all'||filter==='active'&&j.active||filter==='complete'&&j.status==='已完成'||filter==='unfinished'&&!j.active&&j.status!=='已完成');
 if(!selectionInitialized&&shown.length){expanded=shown[0].id;selectionInitialized=true;}if(expanded&&!shown.some(job=>job.id===expanded))expanded=shown[0]?.id||'';
 for(const id of [...selected])if(!state.jobs.some(j=>j.id===id))selected.delete(id);
 updateEditorList();updateBT();updateDeletion();for(const id of ['batchEditor','settings','btChooser'])$(id).querySelectorAll('[data-close]').forEach(node=>node.disabled=!!state.busy);$('batchTools').hidden=!selectMode;$('selectionCount').textContent=t('selectedCount',selected.size);$('taskList').classList.toggle('select-mode',selectMode);
 $('empty').hidden=shown.length>0;$('empty').querySelector('h3').textContent=state.jobs.length?t('noTasksHere'):t('emptyTitle');$('empty').querySelector('p').hidden=state.jobs.length>0;
 list.replaceChildren();for(const job of shown){const row=el('article','media-item'+(selected.has(job.id)?' task-selected':''));row.dataset.id=job.id;row.dataset.focus=job.id+'-row';row.classList.toggle('inspected',expanded===job.id);row.tabIndex=0;row.setAttribute('aria-label',job.title+'，'+hostText(job.status));row.addEventListener('dblclick',event=>{if(!event.target.closest('button,input,summary'))showDetails(job.id);});row.addEventListener('keydown',event=>{if(event.target!==row)return;if(event.key==='Enter'){event.preventDefault();toggleDetails(job.id);}if(event.key===' '){event.preventDefault();jobAction(job);}if(event.key==='Delete'&&job.canForget&&!state.busy){event.preventDefault();removeTask(job);}});row.addEventListener('click',event=>{if((event.ctrlKey||event.metaKey)&&!event.target.closest('button,input')){selectMode=true;selected.has(job.id)?selected.delete(job.id):selected.add(job.id);render(true);}else if(!event.target.closest('button,input,summary')&&expanded!==job.id)showDetails(job.id);});
  const line=el('div','media-row'),check=el('input','task-select');check.type='checkbox';check.checked=selected.has(job.id);check.setAttribute('aria-label',t('selectJob',job.title));check.addEventListener('change',()=>{check.checked?selected.add(job.id):selected.delete(job.id);render(true);});
  const icon=el('div','file-icon '+(job.kind==='audio'?'audio':job.kind==='file'?'document':'video'),job.bt?'BT':job.kind==='audio'?'♪':job.kind==='file'?'↓':'▷'),info=el('div','media-info'),title=el('h3','',job.title);title.title=job.title;const meta=el('div','meta');meta.append(el('span','format',hostText(job.typeLabel)),el('span','size',hostText(job.amount)));info.append(title,meta);
  const actions=el('div','task-actions'),act=button(actionLabel(job),'download-button',()=>jobAction(job));act.disabled=state.busy;act.dataset.focus=job.id+'-action';actions.append(act);if(job.canForget){const remove=button(t('deleteTask'),'text-button task-delete',()=>removeTask(job));remove.disabled=!!state.busy;remove.title=t('deleteTaskKeepHint');remove.dataset.focus=job.id+'-remove';remove.dataset.deleteTask=job.id;actions.append(remove);}line.append(check,icon,info,actions);row.append(line);
  const progress=el('div','job-capsule task-progress'),status=el('div','job-line');status.append(el('span','',hostText(job.stage)),el('b','',job.known?job.percent+'%':''));const bar=el('progress');bar.max=100;bar.value=job.known?job.progress:0;bar.setAttribute('aria-label',t('progressOf',job.title));progress.append(status,bar);row.append(progress);
  const tools=el('div','row-tools'),detail=button(expanded===job.id?t('collapseDetailsBtn'):t('viewDetails'),'text-button',()=>toggleDetails(job.id));detail.setAttribute('aria-expanded',expanded===job.id?'true':'false');detail.dataset.focus=job.id+'-details';const more=button('···','text-button',()=>taskMenu(job,more));more.setAttribute('aria-label',t('moreActions'));tools.append(detail,button(t('openFolder'),'text-button',()=>post('folder',{id:job.id})),more);row.append(tools);
  list.append(row);
 }
 renderInspector(shown.find(job=>job.id===expanded));list.parentElement.scrollTop=scroll;
 if(focus)document.querySelector('[data-focus="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});renderMini();
}
function renderMini(){document.body.classList.toggle('mini-mode',!!state.mini);$('miniSurface').hidden=!state.mini;const job=state.jobs.find(j=>j.id===state.miniId)||state.jobs[0];$('miniCount').textContent=t('miniCount',state.jobs.length);$('miniTitle').textContent=job?.title||t('noDownloads');$('miniStage').textContent=job?hostText(job.stage):t('expandToAdd');$('miniPercent').textContent=job?.known?job.percent+'%':'';$('miniProgress').value=job?.known?job.progress:0;$('miniAction').textContent=job?actionLabel(job):t('pause');$('miniAction').disabled=state.busy||!job;$('miniNext').disabled=state.jobs.length<2;$('miniDelete').hidden=!job?.canForget;$('miniDelete').disabled=!!state.busy;}
function showEditor(context){resetEditorList();editorToken=context.token;$('editorURL').value=context.url;$('editorURL').readOnly=context.locked;$('editorKind').querySelector('[value=tracks]')?.remove();if(context.kind==='tracks'&&!$('editorKind').querySelector('[value=tracks]'))$('editorKind').append(new Option(t('kindTracks'),'tracks'));$('editorKind').value=context.kind;$('editorKind').disabled=context.locked||context.kind==='torrent';$('editorHeight').replaceChildren(...[720,1080,2160,4320,...(context.locked?[context.height]:[])].filter((v,i,a)=>a.indexOf(v)===i).map(h=>new Option(h+'p',h)));$('editorHeight').value=context.height;$('editorHeight').disabled=context.locked;$('editorFolder').textContent=context.folder;$('editorFolder').title=context.folder;$('editorCategorize').checked=context.categorize;$('editorTitle').textContent=context.locked?t('confirmBrowser'):t('newDownload');updateEditorNote();updateEditorList();openDialog('editor');}
function updateEditorNote(){const kind=$('editorKind').value;$('editorPlaylist').hidden=!['video','audio'].includes(kind)||$('editorURL').readOnly;$('editorHeight').hidden=!['video','tracks'].includes(kind);$('editorNote').textContent=kind==='magnet'||kind==='torrent'?t('noteMagnet'):kind==='video'?t('noteVideo'):kind==='tracks'?t('noteTracks'):'';}
function showBT(job){btId=job.id;$('btTitle').textContent=job.title;const list=$('btFiles');list.replaceChildren();for(const file of job.files){const label=el('label'),check=el('input');check.type='checkbox';check.value=file.index;check.checked=file.selected;check.dataset.bytes=file.length;check.addEventListener('change',updateBT);const text=el('span','',file.path);text.append(el('small','',file.size+' · '+t('btHave',file.completed)));label.append(check,text);list.append(label);}updateBT();openDialog('btChooser');}
function updateBT(){const inputs=[...$('btFiles').querySelectorAll('input')],checked=inputs.filter(node=>node.checked);inputs.forEach(node=>node.disabled=!!state.busy);$('btAll').disabled=$('btNone').disabled=!!state.busy;$('btSummary').textContent=t('btSelected',checked.length,inputs.length);$('btStart').disabled=!!state.busy||!checked.some(node=>Number(node.dataset.bytes)>0);}
function updateBatchType(){$('batchHeight').hidden=$('batchKind').value!=='video';}
loadLanguage();
$('languageSelect').addEventListener('click',()=>{const order=['auto','zh_CN','en'];const cur=$('languageSelect').dataset.lang||'auto';const i=order.indexOf(cur);setLanguage(order[((i<0?0:i)+1)%order.length]);});
$('settingsLanguage').addEventListener('change',()=>setLanguage($('settingsLanguage').value));
document.querySelectorAll('[data-command]').forEach(node=>node.addEventListener('click',()=>{closeMenus();const command=node.dataset.command;if(command==='settings'){for(const field of $('settingsForm').elements){if(!field.name)continue;if(field.type==='checkbox')field.checked=!!state.settings[field.name];else field.value=state.settings[field.name]??'';}const proxy=state.settings.Proxy??'system';$('proxyMode').value=proxy==='system'?'system':proxy===''?'none':'custom';if(proxy==='system')$('settingsForm').elements.Proxy.value='';syncProxyField();$('settingsLanguage').value=uiPref;openDialog('settings');}else if(command==='batch'){$('batchFolder').textContent=state.settings.Folder;$('batchCategorize').checked=!!state.settings.AutoCategorize;updateBatchType();openDialog('batchEditor');}else post(command);}));
document.querySelectorAll('[data-resize]').forEach(node=>node.addEventListener('pointerdown',event=>{if(!event.isTrusted||event.button!==0||!event.isPrimary||state.maximized)return;event.preventDefault();post('resize',{hit:Number(node.dataset.resize)});}));
document.querySelectorAll('[data-window]').forEach(node=>node.onclick=()=>post('window',{action:node.dataset.window}));
$('miniToggle').onclick=()=>post('mini',{id:expanded||state.jobs.find(j=>j.active)?.id||state.jobs[0]?.id});$('expand').onclick=()=>post('expand');$('miniHide').onclick=()=>post('hide');$('miniNext').onclick=()=>post('next');$('miniAction').onclick=()=>{const job=state.jobs.find(j=>j.id===state.miniId)||state.jobs[0];if(job){if(job.choose||job.canPause||job.canResume)jobAction(job);else{expanded=job.id;post('expand');}}};
$('closeInspector').onclick=()=>{expanded='';render(true);};
$('chooseFolder').onclick=()=>post('pickFolder',{target:'default'});$('settingsChooseFolder').onclick=()=>post('pickFolder',{target:'default'});$('pickEditorFolder').onclick=()=>post('pickFolder',{target:'editor'});$('pickBatchFolder').onclick=()=>post('pickFolder',{target:'batch'});
$('miniDelete').onclick=()=>{const job=state.jobs.find(j=>j.id===state.miniId)||state.jobs[0];if(job)removeTask(job);};
$('addLink').onsubmit=event=>{event.preventDefault();post('new',{url:$('linkURL').value});};$('editorKind').onchange=updateEditorNote;
$('editorForm').onsubmit=event=>{event.preventDefault();if(listReading)return;const payload={token:editorToken,url:$('editorURL').value,kind:$('editorKind').value,height:Number($('editorHeight').value),categorize:$('editorCategorize').checked};if(editorListCatalog){payload.indices=[...$('editorListItems').querySelectorAll('input:checked')].map(i=>Number(i.value));if(!payload.indices.length)return;post('addCollection',payload);}else if(isPlaylistURL(payload.url))readEditorList();else post('add',payload);};
$('batchForm').onsubmit=event=>{event.preventDefault();post('batchAdd',{urls:$('batchURLs').value,kind:$('batchKind').value,height:Number($('batchHeight').value),categorize:$('batchCategorize').checked});};
function syncProxyField(){const custom=$('proxyMode').value==='custom';$('proxyCustomField').hidden=!custom;$('settingsForm').elements.Proxy.required=custom;}
$('proxyMode').onchange=()=>{syncProxyField();if(!$('proxyCustomField').hidden)$('settingsForm').elements.Proxy.focus();};
$('settingsForm').onsubmit=event=>{event.preventDefault();const config={};for(const field of $('settingsForm').elements)if(field.name)config[field.name]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;const mode=$('proxyMode').value;config.Proxy=mode==='system'?'system':mode==='none'?'':config.Proxy.trim();const langPref=$('settingsLanguage').value;config.UiLanguage=langPref;setLanguage(langPref,false,false);post('settingsSave',{config});};
$('deleteFiles').onchange=updateDeletion;$('deleteForm').onsubmit=event=>{event.preventDefault();if(!deletion||deletion.sent||state.busy)return;deletion.sent=true;updateDeletion();post('forget',{ids:deletion.ids,deleteFiles:$('deleteFiles').checked});};$('deleteDialog').addEventListener('cancel',event=>{if(deletion?.sent)event.preventDefault();else deletion=null;});
$('batchKind').onchange=updateBatchType;
$('btForm').onsubmit=event=>{event.preventDefault();if(state.busy||$('btStart').disabled)return;post('selectFiles',{id:btId,indices:[...$('btFiles').querySelectorAll('input:checked')].map(node=>Number(node.value))});};$('btAll').onclick=()=>{$('btFiles').querySelectorAll('input').forEach(node=>node.checked=true);updateBT();};$('btNone').onclick=()=>{$('btFiles').querySelectorAll('input').forEach(node=>node.checked=false);updateBT();};
document.querySelectorAll('[data-close]').forEach(node=>node.onclick=()=>{const dialog=node.closest('dialog');if(state.busy&&['editor','batchEditor','settings','btChooser'].includes(dialog.id))return;if(dialog.id==='deleteDialog'){if(deletion?.sent)return;deletion=null;}dialog.close();});document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('cancel',event=>{if(state.busy&&['batchEditor','settings','btChooser'].includes(dialog.id))event.preventDefault();});dialog.addEventListener('close',()=>{if(dialog.id==='editor'){post('cancelEditor',{token:editorToken});resetEditorList();}if(dialog.id==='batchEditor')post('cancelBatch');});});
document.querySelectorAll('[data-filter]').forEach(node=>node.onclick=()=>{filter=node.dataset.filter;selected.clear();selectMode=false;document.querySelectorAll('[data-filter]').forEach(button=>{button.classList.toggle('active',button===node);button.setAttribute('aria-pressed',String(button===node));});render(true);});
document.querySelectorAll('[data-batch]').forEach(node=>node.onclick=()=>node.dataset.batch==='forget'?removeTasks([...selected]):post(node.dataset.batch,{ids:[...selected]}));
document.addEventListener('click',event=>{if(!event.target.closest('.menu'))document.querySelector('.menu').open=false;if(!event.target.closest('#taskMenu')&&!event.target.closest('.row-tools'))$('taskMenu').hidden=true;});document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenus();if(selectMode){selectMode=false;selected.clear();render(true);}else if(!document.querySelector('dialog[open]')&&expanded){expanded='';render(true);}}});
window.chrome.webview.addEventListener('message',event=>{const data=event.data;if(data.type==='state'){state=data;applyLanguageFromHost(state.settings);document.body.classList.toggle('maximized',!!data.maximized);const folderName=data.settings.Folder.split(/[\\/]/).filter(Boolean).slice(-2).join('\\')||data.settings.Folder;$('settingsFolder').textContent=data.settings.Folder;$('settingsFolderNote').textContent=t(data.settings.FollowBrowser?'followsChrome':'ownFolder');$('folderLabel').textContent=t('saveToPrefix')+folderName;$('folderLabel').title=data.settings.Folder;$('chooseFolder').title=t('chooseFolderDot')+data.settings.Folder+(data.settings.FollowBrowser?' · '+t('followsChrome'):'');render();showDeletion();}else if(data.type==='collection'||data.type==='collectionStatus'||data.type==='collectionError')receiveCollection(data);else if(data.type==='editor')showEditor(data.context);else if(data.type==='folder'){const node=$(data.target==='editor'?'editorFolder':'batchFolder');node.textContent=data.path;node.title=data.path;}else if(data.type==='bt')showBT(data.job);else if(data.type==='notice'){if(data.close){if(data.close==='deleteDialog')deletion=null;$(data.close)?.close();if(data.close==='editor')$('linkURL').value='';}notice(data.text);}else if(data.type==='info'){let title=data.title,lines=data.lines||[];if(/关于/.test(title)||/About/i.test(title)){title=t('aboutTitle');lines=lines.map(line=>{const m=String(line).match(/^(版本|Version)\s*(.+)$/i);return m?t('aboutVersion',m[2]):/免费开源|open source/i.test(line)?t('aboutFree'):hostText(line);});}$('infoTitle').textContent=hostText(title);$('infoContent').replaceChildren();for(const line of lines)$('infoContent').append(el('p','',hostText(line)));if(data.action)$('infoContent').append(button(hostText(data.action.label),'download-button',()=>{if(data.action.command==='settings'){$('info').close();document.querySelector('[data-command=settings]').click();}else post(data.action.command);}));openDialog('info');}});
let dropTimer;
const hideDropHint=()=>{clearTimeout(dropTimer);$('dropHint').hidden=true;};
const acceptsDrop=event=>event.dataTransfer&&([...event.dataTransfer.types].includes('Files')||(!event.target.closest?.('input,textarea,[contenteditable=true]')&&[...event.dataTransfer.types].some(type=>type==='text/uri-list'||type==='text/plain')));
document.addEventListener('dragover',event=>{if(!acceptsDrop(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';$('dropHint').hidden=false;clearTimeout(dropTimer);dropTimer=setTimeout(hideDropHint,1500);});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)hideDropHint();});window.addEventListener('blur',hideDropHint);
document.addEventListener('drop',event=>{
 hideDropHint();if(!acceptsDrop(event))return;event.preventDefault();if(!event.isTrusted)return;
 if(state.busy||document.querySelector('dialog[open]')){notice(t('dropBusy'));return;}
 const files=[...event.dataTransfer.files];
 if(files.length){if(files.length!==1){notice(t('dropOneTorrent'));return;}if(!/\.torrent$/i.test(files[0].name)||files[0].size>4*1024*1024){notice(t('dropTorrentSize'));return;}if(typeof window.chrome.webview.postMessageWithAdditionalObjects!=='function'){notice(t('dropUnsupported'));return;}window.chrome.webview.postMessageWithAdditionalObjects('shiying-drop-torrent',files);return;}
 const lines=(event.dataTransfer.getData('text/uri-list')||event.dataTransfer.getData('text/plain')).split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
 if(lines.length!==1||lines[0].length>16384){notice(t('dropOneLink'));return;}
 try{const url=new URL(lines[0]);if(!['http:','https:','magnet:'].includes(url.protocol))throw new Error();post('dropLink',{url:lines[0]});}catch{notice(t('dropBadLink'));}
});


function flowText(zh,en){return uiLang==='en'?en:zh;}
function isPlaylistURL(value){try{const u=new URL(value);return ['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&u.pathname==='/playlist'&&u.searchParams.has('list');}catch{return false;}}
function resetEditorList(){listRequest++;if(listReading)post('cancelCollection',{token:editorToken});editorListCatalog=null;listReading=false;$('editorNote').hidden=false;$('editorList').hidden=true;$('editorListError').hidden=true;$('editorListItems').replaceChildren();$('editorListSearch').value='';$('editorPlaylist').disabled=false;$('editorURL').disabled=false;}
function updateEditorList(){
 const all=[...$('editorListItems').querySelectorAll('input:not(:disabled)')],checked=all.filter(i=>i.checked);
 $('editorListAll').checked=!!all.length&&checked.length===all.length;$('editorListAll').indeterminate=checked.length>0&&checked.length<all.length;
 $('editorListCount').textContent=flowText('已选 '+checked.length+' / '+all.length,checked.length+' / '+all.length+' selected');
 $('editorListAllLabel').textContent=flowText('全选','Select all');$('editorListSearch').placeholder=flowText('搜索条目','Search items');$('editorListSearch').setAttribute('aria-label',flowText('搜索条目','Search items'));$('editorPlaylist').textContent=listReading?flowText('读取中…','Reading…'):flowText('选择播放列表…','Choose from playlist…');$('newPlaylist').textContent=flowText('播放列表勾选下载…','Choose from playlist…');
 $('editorNote').hidden=!!editorListCatalog;$('editorTitle').textContent=editorListCatalog?flowText('选择要下载的视频','Choose videos to download'):$('editorURL').readOnly?t('confirmBrowser'):t('newDownload');$('editorPlaylist').hidden=!!editorListCatalog||!['video','audio'].includes($('editorKind').value)||$('editorURL').readOnly;$('newPlaylist').disabled=!!state.busy;$('editor').querySelector('[data-close]').disabled=!!state.busy;$('editorPlaylist').disabled=listReading||!!state.busy;$('confirmAdd').disabled=!!state.busy||listReading||(!!editorListCatalog&&checked.length===0);
 $('confirmAdd').textContent=editorListCatalog?flowText('下载所选 '+checked.length+' 项','Download '+checked.length+' selected'):isPlaylistURL($('editorURL').value)?flowText('读取列表','Read list'):t('startDownload');
}
function displayDuration(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):value||'';}
function readEditorList(){if(listReading||!$('editorURL').value.trim())return;editorListCatalog=null;listReading=true;$('editorList').hidden=true;$('editorListError').hidden=true;updateEditorList();post('readCollection',{token:editorToken,request:String(++listRequest),url:$('editorURL').value});}
function receiveCollection(data){if(data.token!==editorToken||data.request!==String(listRequest)||!$('editor').open)return;if(data.type==='collectionStatus'){$('editorNote').textContent=hostText(data.text);return;}listReading=false;
 if(data.type==='collectionError'){$('editorListError').textContent=data.text;$('editorListError').hidden=false;updateEditorList();return;}
 editorListCatalog=data.catalog;$('editorListTitle').textContent=data.catalog.title;$('editorListItems').replaceChildren();$('editorListLimit').textContent=data.catalog.hasMore?flowText('仅展示前 100 项，尚未载入全部列表。','First 100 items only; the entire list is not loaded.'):flowText('只下载勾选的条目，开始后可在任务列表暂停或删除。','Only checked items download. Pause or remove them in the task list.');
 data.catalog.entries.forEach((item,index)=>{const label=el('label'),check=el('input'),text=el('span','',item.title);check.type='checkbox';check.value=index;check.disabled=!item.available;check.onchange=updateEditorList;const note=el('small','',item.available?displayDuration(item.duration):flowText('暂不可用','Unavailable'));text.append(note);label.append(check,text);$('editorListItems').append(label);});$('editorList').hidden=false;updateEditorList();
}
$('editor').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
$('editorPlaylist').onclick=readEditorList;
$('newPlaylist').onclick=()=>{closeMenus();post('new',{url:'https://www.youtube.com/playlist?list='});};
$('editorURL').addEventListener('input',()=>{resetEditorList();const value=$('editorURL').value;try{const u=new URL(value);if(!$('editorKind').disabled&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be','bilibili.com','www.bilibili.com'].includes(u.hostname))$('editorKind').value='video';}catch{}updateEditorNote();updateEditorList();});
$('editorKind').addEventListener('change',()=>{if(!['video','audio'].includes($('editorKind').value))resetEditorList();updateEditorList();});
$('editorListAll').onchange=()=>{$('editorListItems').querySelectorAll('input:not(:disabled)').forEach(i=>i.checked=$('editorListAll').checked);updateEditorList();};
$('editorListSearch').oninput=()=>{const q=$('editorListSearch').value.toLowerCase();$('editorListItems').querySelectorAll('label').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(q));};

post('ready');
})();
