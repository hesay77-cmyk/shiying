// English for Chinese messages produced by the download engine (stages and errors).
// Translate only at display time: callers keep comparing the original Chinese strings.
(function (global) {
  const exact = {
    // Download stages
    '正在准备下载': 'Preparing download',
    '正在下载视频画面': 'Downloading video',
    '正在下载声音': 'Downloading audio',
    '正在合并画面与声音': 'Merging video and audio',
    '正在检查声音与完整时长': 'Checking audio and duration',
    '正在检查完整画面': 'Checking the full video',
    '正在生成 MP3': 'Creating MP3',
    '正在检查 MP3 文件': 'Checking the MP3 file',
    '检查通过，正在保存': 'Checks passed, saving',
    'Chrome 正在保存文件': 'Chrome is saving the file',
    '下载完成，文件和声音已检查': 'Done. File and audio checked',
    '下载已中断': 'Download interrupted',
    '保存中断': 'Saving interrupted',
    '下载失败': 'Download failed',
    '已取消': 'Cancelled',
    // Errors from the engine, platform readers and playlists
    'Chrome 曾关闭，请重新读取视频后下载': 'Chrome was closed. Read the video again, then download.',
    '文件保存中断，请重新下载': 'Saving was interrupted. Please download again.',
    'B站列表读取失败': 'Couldn’t read the Bilibili list',
    '下载处理还没准备好，请重试': 'The downloader isn’t ready yet. Try again.',
    '下载耗时过长，请检查网络后重试': 'The download took too long. Check your network and try again.',
    '下载选项无效': 'Invalid download options',
    '列表为空、需要登录或无法访问；尚未添加下载': 'The list is empty, needs sign-in, or can’t be opened. Nothing was added.',
    '列表信息不完整，请重试': 'The list information is incomplete. Try again.',
    '列表已过期，请重新读取': 'The list has expired. Read it again.',
    '原站媒体大小发生变化，请重新读取': 'The media size changed on the site. Read the video again.',
    '原站暂时不提供这个视频，请确认网页能播放后重新读取': 'The site isn’t offering this video right now. Make sure it plays, then read it again.',
    '原站暂时没有返回视频，请稍后重新读取': 'The site didn’t return the video. Read it again later.',
    '原站没有提供完整文件大小，请重新读取': 'The site didn’t give the full file size. Read the video again.',
    '原站返回的媒体地址不可用，请重新读取': 'The media address from the site isn’t usable. Read the video again.',
    '声音时长不完整，请重新下载': 'The audio is incomplete. Please download again.',
    '声音没有完整解码，请重新下载': 'The audio didn’t decode fully. Please download again.',
    '媒体文件没有完整读取，请重新下载': 'The media file wasn’t read completely. Please download again.',
    '媒体轨下载不完整，请重试': 'A media track didn’t download completely. Try again.',
    '已取消下载': 'Download cancelled',
    '已有下载正在处理，请稍后再添加': 'Another download is in progress. Add this one later.',
    '已有播放列表队列，请先停止它再添加': 'A playlist queue is running. Stop it before adding another.',
    '当前 Chrome 不能检查这个视频，请选择其他清晰度': 'This Chrome can’t check this video. Choose another quality.',
    '成品文件未通过播放格式检查，请重新下载': 'The file failed the playback check. Please download again.',
    '成品时长或清晰度不符合选择，请重新下载': 'The file’s length or quality doesn’t match your choice. Please download again.',
    '文件来源不符合当前任务': 'The file source doesn’t match this task',
    '文件缺少画面或声音': 'The file is missing video or audio',
    '文件还没保存完成': 'The file isn’t saved yet',
    '无法确认完整媒体文件，请重新读取': 'Couldn’t confirm the complete media file. Read the video again.',
    '无法识别这个操作': 'Unknown action',
    '暂时没读到完整音视频轨，请播放视频后重新读取': 'Couldn’t get complete audio and video tracks. Play the video, then read it again.',
    '没有取得可合并的画面与声音': 'Couldn’t get video and audio to merge',
    '没有取得完整音视频轨，请在 B站播放后重试': 'Couldn’t get complete tracks. Play the video on Bilibili, then try again.',
    '没有找到 B站视频编号': 'Couldn’t find the Bilibili video ID',
    '没有找到下载记录，请重新开始': 'Download record not found. Please start again.',
    '没有找到这个分 P，请检查视频网址': 'This part wasn’t found. Check the video link.',
    '没有读到分 P 列表，请检查视频网址': 'Couldn’t read the list of parts. Check the video link.',
    '没有读到完整成品，请重新下载': 'Couldn’t read the finished file. Please download again.',
    '没有读到完整视频，请重新读取': 'Couldn’t read the complete video. Read it again.',
    '没有读到播放列表，请确认列表可公开访问': 'Couldn’t read the playlist. Make sure it’s public.',
    '没读到完整视频时长，请重新读取': 'Couldn’t read the full video length. Read it again.',
    '画面没有完整解码，请重新下载': 'The video didn’t decode fully. Please download again.',
    '目前支持已发布的视频，直播请使用高级工具': 'Published videos are supported. For live streams, use the advanced tools.',
    '视频信息已过期，请重新读取': 'The video information has expired. Read it again.',
    '视频清单过大，请使用下载页解析': 'The video manifest is too large. Use the download page to parse it.',
    '视频清晰度或时长不符合选择，请重新下载': 'The video’s quality or length doesn’t match your choice. Please download again.',
    '视频网页加载超时，请重新读取': 'The video page timed out. Read it again.',
    '视频网页还在准备，请稍后重新读取': 'The video page is still loading. Read it again shortly.',
    '视频页已切换，请重新打开': 'The video page changed. Open Ruxget again.',
    '视频页已切换，请重新读取清晰度': 'The video page changed. Read the qualities again.',
    '请从 Ruxget 工具栏恢复下载浮钮': 'Restore the download button from the Ruxget toolbar icon',
    '请使用 HTTPS 视频网址': 'Use an HTTPS video link',
    '请使用完整的 HTTPS 播放列表网址': 'Use a full HTTPS playlist link',
    '请先切换到视频页': 'Switch to a video page first',
    '请勾选可下载的条目': 'Select the items you want to download',
    '请在 Ruxget 面板中发送桌面下载': 'Send desktop downloads from the Ruxget panel',
    '请在当前视频页使用 Ruxget': 'Use Ruxget on the current video page',
    '请在当前视频页打开 Ruxget': 'Open Ruxget on the current video page',
    '请在网页中重新播放视频，获取有效链接': 'Play the video on the page again to get a valid link',
    '请粘贴 B站视频的 BV 或 av 网址': 'Paste a Bilibili BV or av link',
    '请输入完整的 B站视频网址': 'Enter a full Bilibili video link',
    '这个入口目前支持 B站视频': 'This supports Bilibili videos',
    '支持 B站多 P 视频': 'Supports multi-part Bilibili videos',
    '请使用完整的 HTTPS 视频网址': 'Use a full HTTPS video link',
    '请选择实际可用的清晰度': 'Choose an available quality',
    '请选择视频或 MP3': 'Choose video or MP3',
    '这个任务不属于当前视频': 'This task belongs to another video',
    
    '这个视频地址无法直接读取': 'This video link can’t be read directly',
    '这个视频文件太大，请选择较低清晰度': 'This video is too large. Choose a lower quality.',
    '这是视频切片，请在高级工具中处理': 'This is a video segment. Use the advanced tools.',
    '音视频轨没有完整下载，请重新读取': 'The audio/video tracks didn’t fully download. Read the video again.',
    // Bridge, floating button and progress page
    '视频读取失败，请重试': 'Couldn’t read the video. Try again.',
    '还没读到下载进度，请稍后重试': 'Progress isn’t available yet. Try again shortly.',
    '连接暂时中断，请在工具栏重新打开 Ruxget': 'Connection lost. Reopen Ruxget from the toolbar.',
    'Ruxget 已更新，请刷新这个视频页': 'Ruxget was updated. Refresh this video page.',
    '桌面版未接收任务': 'The desktop app didn’t accept the task',
    '未允许连接桌面版，仍可使用原有下载入口': 'The desktop connection wasn’t allowed. You can still download in Chrome.',
    '请先读取视频': 'Read the video first',
    '这个字幕是空的': 'These subtitles are empty',
    '字幕读取失败，请刷新视频网页后重试': 'Couldn’t read the subtitles. Refresh the video page and try again',
    '没有找到这个字幕': 'Subtitle not found',
    // 抖音、快手、小红书
    '抖音': 'Douyin',
    '快手': 'Kuaishou',
    '小红书': 'Xiaohongshu',
    '请打开单个抖音视频': 'Open a single Douyin video',
    '请打开单个快手视频': 'Open a single Kuaishou video',
    '请打开单条小红书视频笔记': 'Open a single Xiaohongshu video note',
    '没有读到视频，请先播放一下再试': 'Couldn’t find the video. Play it, then try again',
    '没有读到这条笔记，请刷新网页后重试': 'Couldn’t read this note. Refresh the page and try again',
    '这条笔记没有视频': 'This note has no video',
    '没有取得可下载的视频地址，请播放后重新读取': 'No downloadable video found. Play it, then read again'
  };
  const patterns = [
    [/^B站返回 (\d+)，请刷新视频网页后重试$/, 'Bilibili returned $1. Refresh the video page and try again.'],
    [/^原站返回 (\d+)，请重新读取视频$/, 'The site returned $1. Read the video again.'],
    [/^网站返回 (\d+)，请重新播放视频后再试$/, 'The site returned $1. Play the video again and retry.'],
    [/^播放列表读取失败（HTTP (\d+)）$/, 'Couldn’t read the playlist (HTTP $1)']
  ];
  function tr(text) {
    if (typeof text !== 'string' || !text || !global.RuxgetI18n || global.RuxgetI18n.getLang() !== 'en') return text;
    if (Object.prototype.hasOwnProperty.call(exact, text)) return exact[text];
    for (const [pattern, english] of patterns) if (pattern.test(text)) return text.replace(pattern, english);
    return text;
  }
  // Static pages keep Chinese in the markup and English beside it: data-en (text), data-en-html (trusted page markup),
  // data-en-title / data-en-aria / data-en-placeholder. The Chinese is restored when switching back.
  function applyPage(root) {
    const en = !!global.RuxgetI18n && global.RuxgetI18n.getLang() === 'en';
    (root || document).querySelectorAll('[data-en],[data-en-html],[data-en-title],[data-en-aria],[data-en-placeholder]').forEach(el => {
      const swap = (key, read, write) => { if (!(key in el.dataset)) return; const store = 'zh' + key.slice(2); if (!(store in el.dataset)) el.dataset[store] = read(); write(en ? el.dataset[key] : el.dataset[store]); };
      swap('enHtml', () => el.innerHTML, v => { el.innerHTML = v; });
      swap('en', () => el.textContent, v => { el.textContent = v; });
      swap('enTitle', () => el.title, v => { el.title = v; });
      swap('enAria', () => el.getAttribute('aria-label') || '', v => el.setAttribute('aria-label', v));
      swap('enPlaceholder', () => el.placeholder, v => { el.placeholder = v; });
    });
    if (document.documentElement) document.documentElement.lang = en ? 'en' : 'zh-CN';
  }
  global.RuxgetText = { tr, exact, applyPage };
  if (typeof document !== 'undefined' && global.RuxgetI18n && document.documentElement && document.querySelector && !(typeof location !== 'undefined' && /^https?:/.test(location.protocol))) {
    global.RuxgetI18n.ready().then(() => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyPage()); else applyPage(); });
    document.addEventListener('ruxget-i18n-applied', () => applyPage());
  }
})(globalThis);
