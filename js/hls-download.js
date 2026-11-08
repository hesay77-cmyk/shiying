// Ruxget，2026-11-08，按功能说明书 04-HLS下载页 从零编写。
import { createFile } from '../lib/mp4box/mp4box.all.mjs';

/* ------------------------------------------------------------------ 文案 */

const TEXT = {
  zh: {
    pageName: 'Ruxget · 视频下载',
    keepOpen: '请保持这个页面打开，下载进度会显示在这里。',
    showAdvanced: '显示高级选项',
    hideAdvanced: '收起高级选项',
    playlistField: '播放列表地址（.m3u8）',
    sourceField: '来源网页（可选）',
    readButton: '读取',
    needHttp: '请输入以 http 或 https 开头的地址',
    loading: '正在读取视频信息…',
    summary: '共 {0} 个分段，总时长 {1}',
    liveSummary: '这是直播',
    videoField: '画面',
    audioField: '声音',
    filenameField: '文件名',
    download: '下载',
    record: '开始录制',
    stop: '停止下载',
    stopSave: '停止并保存',
    restart: '重新下载',
    retryFailed: '重试失败的分段',
    savePartial: '保存已下载的部分',
    showFile: '打开文件所在位置',
    stageDownload: '正在下载',
    stageConvert: '正在转换为 MP4',
    stageMerge: '正在合成 MP4',
    stageSave: '正在保存',
    stageDone: '下载完成',
    stageStopped: '已停止',
    stageWaiting: '正在等待最后的分段',
    recorded: '已录制 {0}',
    received: '已下载 {0}',
    gap: '中间有 {0} 秒没有录到。',
    liveLarge: '录制内容较大，建议尽快停止并保存',
    liveEnded: '直播已结束，已保存录制内容。',
    liveReadFailed: '连续读取失败，已保存录制内容。',
    liveNothing: '还没有录到任何内容。',
    drm: '这个视频受版权保护，无法下载。',
    notPlaylist: '这个地址返回的不是视频播放列表。',
    emptyPlaylist: '播放列表是空的，请回到原网页重新播放后再试。',
    readFailed: '无法读取视频信息（{0}）。请回到原网页刷新并重新播放后再试。',
    readFailedNoSource: '无法读取视频信息（{0}）。这个链接可能需要登录，或已经过期。',
    networkError: '网络错误',
    badPlaylist: '视频信息格式无法识别。',
    tooLarge: '视频较大，在浏览器中下载可能失败。安装了 Ruxget 桌面版时，建议用桌面版下载。',
    failedSegments: '有 {0} 个分段没有下载成功。',
    keyFailed: '无法取得解密密钥。可以在高级选项中填写自定义密钥。',
    keyWrong: '解密失败，密钥可能不正确。可以在高级选项中填写自定义密钥。',
    tsSaved: '这个视频无法转换为 MP4，已保存为 TS 文件，多数播放器可以直接播放。',
    rawSaved: '合成 MP4 失败，已直接保存下载的原始数据。',
    mergeFailedSeparate: '合成 MP4 失败，已分别保存画面和声音。',
    separateSaved: '这个视频的格式不能在浏览器中合成，已分别保存画面和声音。',
    comboSeparate: '这个组合不能合成一个 MP4，下载后会分别保存画面和声音。',
    downloadSeparate: '分别下载画面和声音',
    outOfMemory: '视频太大，浏览器无法处理。建议选择较低清晰度，或用 Ruxget 桌面版下载。',
    saveFailed: '保存失败，请检查下载文件夹是否可写，或在 Chrome 设置中换一个下载位置。',
    saveCode: '（{0}）',
    sizeAbout: '约 {0}',
    needAccess: '视频分段存放在另一个网站（{0}），需要允许访问后才能下载。',
    allowAccess: '允许访问',
    listSep: '、',
    advancedTitle: '高级选项',
    playlistAddress: '播放列表地址',
    segmentList: '分段地址',
    audioSegments: '声音分段地址',
    copyAll: '复制全部地址',
    copied: '已复制全部地址。',
    copyFailed: '无法复制，请在文本框中手动选择。',
    rangeTitle: '下载范围',
    rangeFrom: '从（序号或时间）',
    rangeTo: '到（序号或时间）',
    rangeBad: '请填写分段序号或 时:分:秒',
    audioOnly: '只下载声音',
    customKey: '自定义密钥',
    keyPlaceholder: '32 位十六进制或 Base64',
    ivPlaceholder: 'IV（可选）：32 位十六进制',
    keyBad: '密钥需要是 16 字节：32 位十六进制或 Base64',
    ivBad: 'IV 需要是 32 位十六进制',
    customHeaders: '自定义请求头（每行“名称: 值”）',
    headersSaved: '请求头已更新，之后的请求都会使用。',
    extraQuery: '分段地址附加参数',
    extraPlaceholder: '例如 token=abc',
    copyCommand: '复制 N_m3u8DL-RE 命令',
    commandCopied: '已复制 N_m3u8DL-RE 命令。',
    preview: '预览',
    closePreview: '关闭预览',
    previewFailed: '无法预览这个视频。',
    soundFallback: '声音 {0}',
    soundOnlyVariant: '仅声音',
    trackFallback: '清晰度 {0}',
    suffixVideo: '-画面',
    suffixAudio: '-声音',
    suffixPartial: '-不完整',
    defaultName: '网页视频',
    unexpected: '下载过程中出现意外错误，请重新下载。',
    unknownError: '未知错误'
  },
  en: {
    pageName: 'Ruxget · Video Download',
    keepOpen: 'Keep this page open. Download progress appears here.',
    showAdvanced: 'Show advanced options',
    hideAdvanced: 'Hide advanced options',
    playlistField: 'Playlist address (.m3u8)',
    sourceField: 'Source page (optional)',
    readButton: 'Read',
    needHttp: 'Enter an address that starts with http or https',
    loading: 'Reading video information…',
    summary: '{0} segments, total length {1}',
    liveSummary: 'This is a live stream',
    videoField: 'Video',
    audioField: 'Audio',
    filenameField: 'File name',
    download: 'Download',
    record: 'Start recording',
    stop: 'Stop download',
    stopSave: 'Stop and save',
    restart: 'Download again',
    retryFailed: 'Retry failed segments',
    savePartial: 'Save what was downloaded',
    showFile: 'Show in folder',
    stageDownload: 'Downloading',
    stageConvert: 'Converting to MP4',
    stageMerge: 'Building MP4',
    stageSave: 'Saving',
    stageDone: 'Download complete',
    stageStopped: 'Stopped',
    stageWaiting: 'Waiting for the last segments',
    recorded: 'Recorded {0}',
    received: '{0} downloaded',
    gap: '{0} seconds in between were not recorded.',
    liveLarge: 'The recording is large. Stop and save it soon.',
    liveEnded: 'The live stream has ended. The recording was saved.',
    liveReadFailed: 'The playlist could not be read several times in a row. The recording was saved.',
    liveNothing: 'Nothing has been recorded yet.',
    drm: 'This video is copy-protected and cannot be downloaded.',
    notPlaylist: 'This address did not return a video playlist.',
    emptyPlaylist: 'The playlist is empty. Go back to the source page, play the video again, then try again.',
    readFailed: 'Could not read the video information ({0}). Go back to the source page, reload and play the video, then try again.',
    readFailedNoSource: 'Could not read the video information ({0}). The link may need a sign-in, or it has expired.',
    networkError: 'network error',
    badPlaylist: 'The video information is in a format that cannot be recognized.',
    tooLarge: 'This video is large and may fail to download in the browser. If Ruxget Desktop is installed, use it instead.',
    failedSegments: '{0} segments could not be downloaded.',
    keyFailed: 'The decryption key could not be obtained. You can enter a custom key in the advanced options.',
    keyWrong: 'Decryption failed; the key may be wrong. You can enter a custom key in the advanced options.',
    tsSaved: 'This video could not be converted to MP4. It was saved as a TS file, which most players can play.',
    rawSaved: 'Building the MP4 failed. The downloaded data was saved as it is.',
    mergeFailedSeparate: 'Building the MP4 failed. The video and audio were saved as separate files.',
    separateSaved: 'This video’s format cannot be combined in the browser. The video and audio were saved as separate files.',
    comboSeparate: 'This combination cannot be combined into one MP4. The video and audio will be saved as separate files.',
    downloadSeparate: 'Download video and audio separately',
    outOfMemory: 'The video is too large for the browser. Choose a lower quality, or use Ruxget Desktop.',
    saveFailed: 'Saving failed. Check that the download folder is writable, or choose another download location in Chrome settings.',
    saveCode: '({0})',
    sizeAbout: 'about {0}',
    needAccess: 'The video segments are stored on another site ({0}). Allow access to download them.',
    allowAccess: 'Allow access',
    listSep: ', ',
    advancedTitle: 'Advanced options',
    playlistAddress: 'Playlist address',
    segmentList: 'Segment addresses',
    audioSegments: 'Audio segment addresses',
    copyAll: 'Copy all addresses',
    copied: 'All addresses copied.',
    copyFailed: 'Copying failed. Select the text in the box instead.',
    rangeTitle: 'Download range',
    rangeFrom: 'From (number or time)',
    rangeTo: 'To (number or time)',
    rangeBad: 'Enter a segment number or h:mm:ss',
    audioOnly: 'Audio only',
    customKey: 'Custom key',
    keyPlaceholder: '32 hex digits or Base64',
    ivPlaceholder: 'IV (optional): 32 hex digits',
    keyBad: 'The key must be 16 bytes: 32 hex digits or Base64',
    ivBad: 'The IV must be 32 hex digits',
    customHeaders: 'Custom request headers (one “Name: value” per line)',
    headersSaved: 'Request headers updated. They apply to all further requests.',
    extraQuery: 'Extra parameters for segment addresses',
    extraPlaceholder: 'for example token=abc',
    copyCommand: 'Copy N_m3u8DL-RE command',
    commandCopied: 'N_m3u8DL-RE command copied.',
    preview: 'Preview',
    closePreview: 'Close preview',
    previewFailed: 'This video cannot be previewed.',
    soundFallback: 'Audio {0}',
    soundOnlyVariant: 'Audio only',
    trackFallback: 'Quality {0}',
    suffixVideo: '-video',
    suffixAudio: '-audio',
    suffixPartial: '-incomplete',
    defaultName: 'web-video',
    unexpected: 'An unexpected error occurred. Download again.',
    unknownError: 'unknown error'
  }
};

let lang = 'zh';
const t = (key, ...args) => String((TEXT[lang] && TEXT[lang][key]) ?? TEXT.zh[key] ?? key).replace(/\{(\d)\}/g, (_, i) => args[i] ?? '');

// Elements whose text comes from a message key; re-rendered when the language changes.
const bound = new Map();
function say(el, key, ...args) {
  if (!el) return;
  if (key == null) { bound.delete(el); el.textContent = ''; return; }
  bound.set(el, [key, args]);
  el.textContent = t(key, ...args.map(a => (typeof a === 'function' ? a() : a)));
}

function detectLanguage(setting) {
  if (setting === 'zh_CN') return 'zh';
  if (setting === 'en') return 'en';
  const ui = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || navigator.language || '';
  return /^zh/i.test(ui) ? 'zh' : 'en';
}

function applyLanguage() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const [el, [key, args]] of bound) el.textContent = t(key, ...args.map(a => (typeof a === 'function' ? a() : a)));
  $('advancedToggle').textContent = t(advancedOpen ? 'hideAdvanced' : 'showAdvanced');
  $('rangeFrom').placeholder = t('rangeFrom');
  $('rangeTo').placeholder = t('rangeTo');
  $('rangeFrom').setAttribute('aria-label', t('rangeFrom'));
  $('rangeTo').setAttribute('aria-label', t('rangeTo'));
  $('customKey').placeholder = t('keyPlaceholder');
  $('customIv').placeholder = t('ivPlaceholder');
  $('extraQuery').placeholder = t('extraPlaceholder');
  $('previewButton').textContent = t(preview.hls ? 'closePreview' : 'preview');
  if (!params.title) say($('subtitle'), 'keepOpen');
  if (info) { renderOptions(); renderSummary(); renderStartButton(); }
  renderTitle();
}

/* ------------------------------------------------------------------ 工具 */

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

// Recording time is always shown with two-digit minutes ("05:32").
function formatRecord(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h > 0 ? `${two(h)}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

function formatBytes(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

function formatSize(bytes) {
  const mb = bytes / 1024 ** 2;
  if (mb < 1) return '1 MB';
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  return Math.round(mb) + ' MB';
}

function formatRate(bps) {
  if (!bps) return '';
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps';
  return Math.round(bps / 1000) + ' Kbps';
}

function formatFps(fps) {
  const n = Number(fps);
  if (!n || !isFinite(n)) return '';
  return (Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(2)) + ' fps';
}

const BAD_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
function cleanName(raw, ext) {
  let name = String(raw || '').replace(BAD_CHARS, '_').trim();
  name = name.replace(/\.(mp4|m4a|m4v|webm|mkv|mov|ts|m3u8|m3u|aac|mp3)$/i, '');
  name = name.replace(/[. ]+$/, '');
  if (!name) name = t('defaultName');
  const max = 150 - ext.length - 1;
  if (name.length > max) name = name.slice(0, max).replace(/[. ]+$/, '') || t('defaultName');
  return name + '.' + ext;
}
const stemOf = raw => cleanName(raw, 'x').replace(/\.x$/, '');

const isOutOfMemory = e => e instanceof RangeError || /allocation|out of memory/i.test(String(e && (e.message || e)));

const toArrayBuffer = u8 => (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));

/* ------------------------------------------------------------------ 语言代码（与 02 相同的规则） */

const LANG_ALIASES = { chi: 'zh', zho: 'zh', cmn: 'zh', yue: 'zh', eng: 'en', jpn: 'ja', kor: 'ko', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', rus: 'ru', ita: 'it', ara: 'ar', tha: 'th', vie: 'vi', und: '' };
function baseLanguage(code) {
  const head = String(code || '').trim().toLowerCase().split(/[-_]/)[0];
  return head in LANG_ALIASES ? LANG_ALIASES[head] : head;
}
function languageName(code) {
  const base = baseLanguage(code);
  if (!base) return '';
  try {
    const names = new Intl.DisplayNames([lang === 'zh' ? 'zh-CN' : 'en'], { type: 'language' });
    const name = names.of(base);
    if (name && name.toLowerCase() !== base) return name;
  } catch (_) { /* unknown code */ }
  return String(code);
}

/* ------------------------------------------------------------------ 状态 */

const query = new URLSearchParams(location.search);
const params = {
  url: query.get('url') || '',
  title: query.get('title') || '',
  filename: query.get('filename') || '',
  autoStart: query.get('autoStart') === '1',
  headers: {}
};
try {
  const h = JSON.parse(query.get('requestHeaders') || '{}');
  if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) if (v != null && String(v) !== '') params.headers[k] = String(v);
} catch (_) { /* ignore malformed headers */ }

let info = null;            // { master, url, variants: [variant], groups: {id: [rendition]}, live }
let advancedOpen = false;
let job = null;             // current download or recording
let progressText = null;    // for document.title
let finishedTitle = false;
let saveAsSetting = false;
const preview = { hls: null, video: null };

/* ------------------------------------------------------------------ 请求头规则 */

const headerRules = { ids: [], origins: new Set(), tabId: null };

async function currentTabId() {
  if (headerRules.tabId != null) return headerRules.tabId;
  try { const tab = await chrome.tabs.getCurrent(); headerRules.tabId = tab ? tab.id : -1; } catch (_) { headerRules.tabId = -1; }
  return headerRules.tabId;
}

const SKIP_HEADERS = new Set(['range', 'content-length', 'host', 'connection', 'accept-encoding', 'transfer-encoding']);
let ruleQueue = Promise.resolve();

// Session rules that add the task's request headers, only for this tab and only for the origins in use.
function allowOrigins(urls) {
  const run = async () => {
    const entries = Object.entries(params.headers).filter(([k]) => !SKIP_HEADERS.has(k.toLowerCase()));
    if (!entries.length || !chrome.declarativeNetRequest) return;
    const fresh = [];
    for (const u of urls) {
      try { const o = new URL(u).origin; if (/^https?:/.test(o) && !headerRules.origins.has(o)) { headerRules.origins.add(o); fresh.push(o); } } catch (_) { /* skip */ }
    }
    if (!fresh.length) return;
    const tabId = await currentTabId();
    const existing = new Set((await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id));
    const addRules = [];
    for (const origin of fresh) {
      let id;
      do { id = 700000000 + Math.floor(Math.random() * 100000000); } while (existing.has(id));
      existing.add(id);
      const condition = { urlFilter: '|' + origin + '/', resourceTypes: ['xmlhttprequest', 'media', 'other'] };
      if (tabId >= 0) condition.tabIds = [tabId];
      addRules.push({
        id, priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: entries.map(([header, value]) => ({ header: header.toLowerCase(), operation: 'set', value })) },
        condition
      });
    }
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules });
      headerRules.ids.push(...addRules.map(r => r.id));
    } catch (e) {
      console.warn('header rule failed', e);
    }
  };
  ruleQueue = ruleQueue.then(run, run);
  return ruleQueue;
}

function clearHeaderRules() {
  const removeRuleIds = headerRules.ids.splice(0);
  headerRules.origins.clear();
  if (!removeRuleIds.length || !chrome.declarativeNetRequest) return Promise.resolve();
  const run = () => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds }).catch(() => {});
  try { ruleQueue = ruleQueue.then(run, run); } catch (_) { /* page closing */ }
  return ruleQueue;
}

// Every address the current choice may request (playlists, keys, segments).
function knownUrls() {
  const urls = [params.url];
  if (!info) return urls;
  for (const v of info.variants) {
    urls.push(v.url);
    if (v.playlist) urls.push(...playlistUrls(v.playlist));
  }
  for (const list of Object.values(info.groups)) for (const r of list) {
    if (!r.url) continue;
    urls.push(r.url);
    if (r.playlist) urls.push(...playlistUrls(r.playlist));
  }
  return urls;
}

function playlistUrls(pl) {
  const out = new Set();
  for (const s of pl.segments) {
    out.add(s.url);
    if (s.map) out.add(s.map.url);
    if (s.key && s.key.uri) out.add(s.key.uri);
  }
  return [...out];
}

/* ------------------------------------------------------------------ 播放列表 */

class Blocked extends Error { constructor(key, ...args) { super(key); this.key = key; this.args = args; } }

function readAttributes(text) {
  const out = {};
  const re = /([A-Za-z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m;
  while ((m = re.exec(text))) out[m[1].toUpperCase()] = m[3] !== undefined ? m[3] : m[2].trim();
  return out;
}

const resolveUrl = (uri, base) => { try { return new URL(uri, base).href; } catch (_) { return ''; } };

function hexBytes(text) {
  const hex = String(text || '').replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length > 32) return null;
  const full = hex.padStart(32, '0');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(full.substr(i * 2, 2), 16);
  return out;
}

// A key tag is copy protection when it is not plain AES-128 / NONE, or names a key system.
function keyIsProtected(a) {
  const method = String(a.METHOD || '').toUpperCase();
  const format = String(a.KEYFORMAT || '').trim().toLowerCase();
  if (method === 'NONE') return false;
  if (method !== 'AES-128') return true;
  return !!format && format !== 'identity';
}

function parsePlaylistText(text, url) {
  if (!/^\uFEFF?\s*#EXTM3U/.test(text)) throw new Blocked('notPlaylist');
  const lines = text.split(/\r?\n/).map(l => l.trim());
  if (lines.some(l => l.startsWith('#EXT-X-STREAM-INF'))) return parseMaster(lines, url);
  return parseMedia(lines, url);
}

function parseMaster(lines, url) {
  const variants = [], groups = {}, seen = new Set();
  let isProtected = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const a = readAttributes(line.slice(18));
      let j = i + 1;
      while (j < lines.length && (!lines[j] || lines[j].startsWith('#'))) j++;
      if (j >= lines.length) continue;
      i = j;
      const vurl = resolveUrl(lines[j], url);
      if (!vurl || seen.has(vurl)) continue;
      seen.add(vurl);
      const res = /^(\d+)x(\d+)$/i.exec(a.RESOLUTION || '');
      variants.push({
        url: vurl,
        bandwidth: Number(a.BANDWIDTH) || 0,
        average: Number(a['AVERAGE-BANDWIDTH']) || 0,
        width: res ? Number(res[1]) : 0,
        height: res ? Number(res[2]) : 0,
        codecs: a.CODECS || '',
        fps: a['FRAME-RATE'] || '',
        audio: a.AUDIO || '',
        playlist: null, loading: null
      });
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      const a = readAttributes(line.slice(13));
      if (String(a.TYPE).toUpperCase() !== 'AUDIO') continue;
      const id = a['GROUP-ID'] || '';
      (groups[id] = groups[id] || []).push({
        group: id,
        name: a.NAME || '',
        language: a.LANGUAGE || '',
        isDefault: String(a.DEFAULT).toUpperCase() === 'YES',
        url: a.URI ? resolveUrl(a.URI, url) : '',
        playlist: null, loading: null
      });
    } else if (line.startsWith('#EXT-X-SESSION-KEY:')) {
      if (keyIsProtected(readAttributes(line.slice(19)))) isProtected = true;
    }
  }
  if (isProtected) throw new Blocked('drm');
  if (!variants.length) throw new Blocked('emptyPlaylist');
  // Sound-only qualities go last and are never the default (spec v2 R5).
  variants.sort((x, y) => (isSoundOnlyVariant(x) - isSoundOnlyVariant(y)) || (y.width * y.height - x.width * x.height) || (y.bandwidth - x.bandwidth));
  return { master: true, url, variants, groups };
}

function parseMedia(lines, url) {
  let sequence = 0, target = 0, ended = false, type = '';
  let key = null, map = null, duration = null, range = null, discontinuity = false, isProtected = false;
  const lastEnd = new Map();
  const segments = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#')) {
      const colon = line.indexOf(':');
      const tag = colon > 0 ? line.slice(0, colon) : line;
      const value = colon > 0 ? line.slice(colon + 1) : '';
      switch (tag) {
        case '#EXTINF': duration = parseFloat(value) || 0; break;
        case '#EXT-X-TARGETDURATION': target = Number(value) || 0; break;
        case '#EXT-X-MEDIA-SEQUENCE': sequence = Number(value) || 0; break;
        case '#EXT-X-ENDLIST': ended = true; break;
        case '#EXT-X-PLAYLIST-TYPE': type = value.trim().toUpperCase(); break;
        case '#EXT-X-DISCONTINUITY': discontinuity = true; break;
        case '#EXT-X-BYTERANGE': {
          const m = /^(\d+)(?:@(\d+))?$/.exec(value.trim());
          range = m ? { length: Number(m[1]), offset: m[2] != null ? Number(m[2]) : null } : null;
          break;
        }
        case '#EXT-X-KEY': {
          const a = readAttributes(value);
          const method = String(a.METHOD || '').toUpperCase();
          if (keyIsProtected(a)) { isProtected = true; key = null; }
          else if (method === 'AES-128' && a.URI) key = { uri: resolveUrl(a.URI, url), iv: a.IV ? hexBytes(a.IV) : null };
          else key = null;
          break;
        }
        case '#EXT-X-MAP': {
          const a = readAttributes(value);
          if (!a.URI) break;
          const murl = resolveUrl(a.URI, url);
          let mr = null;
          const m = /^(\d+)(?:@(\d+))?$/.exec(String(a.BYTERANGE || '').trim());
          if (m) mr = { start: Number(m[2] || 0), end: Number(m[2] || 0) + Number(m[1]) - 1 };
          map = { url: murl, range: mr, key, init: true };
          break;
        }
        default: break;
      }
      continue;
    }
    const surl = resolveUrl(line, url);
    if (!surl) continue;
    let r = null;
    if (range) {
      const start = range.offset != null ? range.offset : (lastEnd.get(surl) ?? 0);
      r = { start, end: start + range.length - 1 };
      lastEnd.set(surl, r.end + 1);
    }
    const start = segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0;
    segments.push({ url: surl, duration: duration || 0, start, seq: sequence + segments.length, range: r, key, map, discontinuity });
    duration = null; range = null; discontinuity = false;
  }
  const live = !ended && type !== 'VOD';
  const total = segments.reduce((s, x) => s + x.duration, 0);
  return { master: false, url, segments, sequence, target, ended, live, duration: total, isProtected, container: containerOf(segments) };
}

function containerOf(segments) {
  if (!segments.length) return 'ts';
  if (segments[0].map) return 'fmp4';
  const ext = ((/\.([a-z0-9]+)$/i.exec(new URL(segments[0].url).pathname) || [])[1] || '').toLowerCase();
  if (ext === 'aac' || ext === 'adts') return 'aac';
  if (ext === 'mp3') return 'mp3';
  if (ext === 'm4s' || ext === 'mp4' || ext === 'm4a' || ext === 'm4v') return 'fmp4';
  return 'ts';
}

class ReadError extends Error { constructor(status) { super('read ' + status); this.status = status; } }

async function fetchText(url, signal) {
  let response;
  try { response = await fetch(url, { credentials: 'include', cache: 'no-store', signal }); } catch (e) { if (signal && signal.aborted) throw e; throw new ReadError(null); }
  if (!response.ok) throw new ReadError(response.status);
  try { return { text: await response.text(), url: response.url || url }; } catch (_) { throw new ReadError(null); }
}

async function readMedia(url, signal) {
  await allowOrigins([url]);
  const { text, url: finalUrl } = await fetchText(url, signal);
  const pl = parsePlaylistText(text, finalUrl);
  if (pl.master) throw new Blocked('badPlaylist');
  return pl;
}

// Media playlists of a master are read once and kept.
function ensurePlaylist(entry) {
  if (entry.playlist) return Promise.resolve(entry.playlist);
  if (!entry.loading) {
    entry.loading = readMedia(entry.url).then(pl => {
      entry.playlist = pl;
      allowOrigins(playlistUrls(pl));
      return pl;
    }, e => { entry.loading = null; throw e; });
  }
  return entry.loading;
}

/* ------------------------------------------------------------------ 界面：读取 */

const hasSource = () => Object.keys(params.headers).some(k => /^referr?er$/i.test(k) && params.headers[k]);
const readFailKey = () => (hasSource() ? 'readFailed' : 'readFailedNoSource');
const statusArg = e => (e && e.status ? e.status : () => t('networkError'));

function showBlocked(key, ...args) {
  $('loading').hidden = true;
  $('chooser').hidden = true;
  $('advancedToggle').hidden = true;
  $('advancedCard').hidden = true;
  closePreview();
  const el = $('blocked');
  el.hidden = false;
  say(el, key, ...args);
}

function blockFor(e) {
  if (e instanceof Blocked) return showBlocked(e.key, ...e.args);
  if (e instanceof ReadError) return showBlocked(readFailKey(), statusArg(e));
  console.error(e);
  return showBlocked('badPlaylist');
}

async function loadPlaylist(url) {
  $('formCard').hidden = true;
  $('mainCard').hidden = false;
  $('loading').hidden = false;
  $('blocked').hidden = true;
  $('chooser').hidden = true;
  try {
    await allowOrigins([url]);
    const { text, url: finalUrl } = await fetchText(url);
    const top = parsePlaylistText(text, finalUrl);
    if (top.master) {
      info = { master: true, url: finalUrl, variants: top.variants, groups: top.groups };
    } else {
      info = { master: false, url: finalUrl, variants: [{ url: finalUrl, bandwidth: 0, average: 0, width: 0, height: 0, codecs: '', fps: '', audio: '', playlist: top, loading: null }], groups: {} };
      allowOrigins(playlistUrls(top));
    }
    // The default quality (and its sound) is read now: it gives the total length for the size estimates.
    const first = info.variants[defaultVariantIndex()];
    await ensurePlaylist(first);
    const rendition = defaultRendition(first);
    if (rendition) await ensurePlaylist(rendition);
    checkPlayable(first, rendition);
  } catch (e) {
    return blockFor(e);
  }
  showChooser(url);
}

function checkPlayable(variant, rendition) {
  for (const pl of [variant.playlist, rendition && rendition.playlist]) {
    if (!pl) continue;
    if (pl.isProtected) throw new Blocked('drm');
    if (!pl.segments.length) throw new Blocked('emptyPlaylist');
  }
}

function renditionsOf(variant) {
  if (!variant || !variant.audio || !info.groups[variant.audio]) return [];
  return info.groups[variant.audio].filter(r => r.url);
}

function defaultRendition(variant) {
  const list = renditionsOf(variant);
  if (!list.length) return null;
  const want = lang === 'zh' ? 'zh' : 'en';
  const same = list.filter(r => baseLanguage(r.language) === want);
  if (same.length) return same.find(r => r.isDefault) || same[0];
  return list.find(r => r.isDefault) || list[0];
}

function selectedVariant() {
  if (!info) return null;
  return info.variants[$('videoSelect').selectedIndex] || info.variants[0];
}

function selectedRendition() {
  const list = renditionsOf(selectedVariant());
  if (!list.length) return null;
  return list[$('audioSelect').selectedIndex] || list[0];
}

const isLive = () => { const v = selectedVariant(); return !!(v && v.playlist && v.playlist.live); };

function showChooser(url) {
  $('loading').hidden = true;
  $('chooser').hidden = false;
  $('videoField').hidden = info.variants.length < 2;
  renderOptions(true);
  const base = params.filename || params.title || '';
  $('filenameInput').value = cleanName(base, 'mp4');
  $('headersBox').value = Object.entries(params.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  const link = $('playlistLink');
  link.href = url; link.textContent = url;
  $('advancedToggle').hidden = false;
  selectionChanged().then(() => {
    if (params.autoStart && !isLive() && !permission.missing.length && !job) startJob('normal');
  });
}

// A quality without a picture: no resolution and only sound codecs (spec v2 R5).
const isSoundOnlyVariant = v => !v.width && !v.height && !!v.codecs && !videoFormat(v.codecs) && wantsAudio(v.codecs);

function variantLabel(v, i, duration) {
  const parts = [];
  if (isSoundOnlyVariant(v)) {
    parts.push(t('soundOnlyVariant'));
    const r = v.average || v.bandwidth;
    if (r) parts.push(formatRate(r));
    if (r && duration > 0 && !liveList()) parts.push(t('sizeAbout', formatSize(r * duration / 8)));
    return parts.join(' · ');
  }
  if (v.width && v.height) parts.push(`${v.width}×${v.height}`);
  const fmt = videoFormat(v.codecs);
  if (fmt) parts.push(fmt);
  const rate = v.average || v.bandwidth;
  if (rate) parts.push(formatRate(rate));
  const fps = formatFps(v.fps);
  if (fps) parts.push(fps);
  if (!parts.length) parts.push(t('trackFallback', i + 1));
  if (rate && duration > 0 && !liveList()) parts.push(t('sizeAbout', formatSize(rate * duration / 8)));
  return parts.join(' · ');
}

// Default quality: the highest one no taller than 1080 lines (sound-only qualities do not count); when every
// quality is taller, the lowest one (spec v3 R7). The list is already sorted sharpest first.
function defaultVariantIndex() {
  if (!info) return 0;
  const pictures = info.variants.map((v, i) => ({ v, i })).filter(x => !isSoundOnlyVariant(x.v));
  if (!pictures.length) return 0;
  const fit = pictures.find(x => !x.v.height || x.v.height <= 1080);
  return (fit || pictures[pictures.length - 1]).i;
}

// A live stream shows no size estimates (spec v2 R5).
const liveList = () => !!(info && info.variants.some(v => v.playlist && v.playlist.live));

function videoFormat(codecs) {
  for (const c of String(codecs).split(',').map(x => x.trim().toLowerCase())) {
    if (/^(avc1|avc3)/.test(c)) return 'H.264';
    if (/^(hvc1|hev1)/.test(c)) return 'HEVC';
    if (/^av01/.test(c)) return 'AV1';
    if (/^(vp09|vp9)/.test(c)) return 'VP9';
  }
  return '';
}

// Total length: from the selected quality once read, otherwise from any quality already read.
function totalDuration() {
  const v = selectedVariant();
  if (v && v.playlist) return v.playlist.duration;
  const any = info.variants.find(x => x.playlist);
  return any ? any.playlist.duration : 0;
}

function renderOptions(initial) {
  const vs = $('videoSelect'), as = $('audioSelect');
  const keepV = initial ? defaultVariantIndex() : vs.selectedIndex;
  const duration = totalDuration();
  vs.replaceChildren(...info.variants.map((v, i) => new Option(variantLabel(v, i, v.playlist ? v.playlist.duration : duration), String(i))));
  vs.selectedIndex = keepV >= 0 && keepV < info.variants.length ? keepV : 0;
  const variant = selectedVariant();
  const list = renditionsOf(variant);
  const keepA = initial ? -1 : as.selectedIndex;
  const prevUrl = !initial && as.dataset.url ? as.dataset.url : '';
  const counts = {};
  for (const r of list) { const b = baseLanguage(r.language); counts[b] = (counts[b] || 0) + 1; }
  as.replaceChildren(...list.map((r, i) => {
    const language = languageName(r.language);
    let label = language || r.name || t('soundFallback', i + 1);
    if (language && r.name && counts[baseLanguage(r.language)] > 1) label += ' · ' + r.name;
    return new Option(label, String(i));
  }));
  $('audioField').hidden = !list.length;
  if (list.length) {
    let index = list.findIndex(r => r.url === prevUrl);
    if (index < 0 && keepA >= 0 && keepA < list.length && !prevUrl) index = keepA;
    if (index < 0) index = list.indexOf(defaultRendition(variant));
    as.selectedIndex = Math.max(0, index);
    as.dataset.url = list[as.selectedIndex].url;
  } else {
    as.dataset.url = '';
  }
}

let selectionTicket = 0;
// Everything that depends on the current picture / sound choice. Playlists not read yet are read first.
async function selectionChanged() {
  const ticket = ++selectionTicket;
  const variant = selectedVariant(), rendition = selectedRendition();
  const msg = $('selectMessage');
  msg.hidden = true; say(msg, null);
  const pending = [variant, rendition].filter(x => x && !x.playlist);
  if (pending.length) {
    $('downloadButton').disabled = true;
    try {
      for (const x of pending) await ensurePlaylist(x);
      if (ticket !== selectionTicket) return;
      checkPlayable(variant, rendition);
    } catch (e) {
      if (ticket !== selectionTicket) return;
      if (e instanceof Blocked && e.key === 'drm') return showBlocked('drm');
      msg.hidden = false;
      if (e instanceof Blocked) say(msg, e.key, ...e.args);
      else if (e instanceof ReadError) say(msg, readFailKey(), statusArg(e));
      else say(msg, 'badPlaylist');
      $('downloadButton').disabled = true;
      return;
    }
    renderOptions();
  }
  if (ticket !== selectionTicket) return;
  renderSummary();
  renderLists();
  renderStartButton();
  await checkPermissions();
}

function selectionSources(mode) {
  const variant = selectedVariant(), rendition = selectedRendition();
  if (!variant || !variant.playlist) return [];
  if (mode === 'audio') {
    if (rendition && rendition.playlist) return [{ role: 'audio', playlist: rendition.playlist, codecs: '' }];
    return [{ role: 'main', playlist: variant.playlist, codecs: variant.codecs }];
  }
  const out = [{ role: rendition ? 'video' : 'main', playlist: variant.playlist, codecs: variant.codecs }];
  if (rendition && rendition.playlist) out.push({ role: 'audio', playlist: rendition.playlist, codecs: '' });
  return out;
}

// Whether the chosen picture and separate sound can go into one MP4 in the browser.
function canCombine(sources) {
  if (sources.length < 2) return true;
  const [v, a] = sources;
  if (!['ts', 'fmp4'].includes(v.playlist.container)) return false;
  if (!['ts', 'fmp4', 'aac'].includes(a.playlist.container)) return false;
  const vc = String(v.codecs).toLowerCase();
  if (v.playlist.container === 'ts' && /(hvc1|hev1|av01|vp09)/.test(vc)) return false;
  return true;
}

function renderStartButton() {
  const btn = $('downloadButton');
  const live = isLive();
  const sources = selectionSources('normal');
  const separate = !live && sources.length > 1 && !canCombine(sources);
  $('comboNote').hidden = !separate;
  if (separate) say($('comboNote'), 'comboSeparate'); else say($('comboNote'), null);
  say(btn, live ? 'record' : (separate ? 'downloadSeparate' : 'download'));
  $('rangeGroup').hidden = live;
  btn.disabled = !!permission.missing.length || !selectedVariant() || !selectedVariant().playlist;
  $('audioOnlyButton').disabled = btn.disabled || !!(job && job.state === 'running');
}

function renderSummary() {
  const variant = selectedVariant(), rendition = selectedRendition();
  if (!variant || !variant.playlist) return;
  if (variant.playlist.live) { say($('summary'), 'liveSummary'); $('sizeWarning').hidden = true; return; }
  const count = variant.playlist.segments.length + (rendition && rendition.playlist ? rendition.playlist.segments.length : 0);
  say($('summary'), 'summary', count, formatClock(variant.playlist.duration));
  const rate = variant.average || variant.bandwidth;
  const big = rate * variant.playlist.duration / 8 > 2 * 1024 ** 3;
  $('sizeWarning').hidden = !big;
  if (big) say($('sizeWarning'), 'tooLarge'); else say($('sizeWarning'), null);
}

function addressLines(pl) {
  if (!pl) return '';
  const lines = [];
  const extra = $('extraQuery').value;
  let lastMap = null;
  for (const s of pl.segments) {
    if (s.map && s.map.url !== lastMap) { lines.push(withQuery(s.map.url, extra)); lastMap = s.map.url; }
    const u = withQuery(s.url, extra);
    if (lines[lines.length - 1] !== u) lines.push(u);
  }
  return lines.join('\n');
}

function renderLists() {
  const variant = selectedVariant(), rendition = selectedRendition();
  $('videoList').value = addressLines(variant && variant.playlist);
  $('audioListField').hidden = !(rendition && rendition.playlist);
  $('audioList').value = addressLines(rendition && rendition.playlist);
}

function withQuery(url, extra) {
  const q = String(extra || '').trim().replace(/^[?&]+/, '');
  if (!q) return url;
  const hash = url.indexOf('#');
  const head = hash >= 0 ? url.slice(0, hash) : url, tail = hash >= 0 ? url.slice(hash) : '';
  return head + (head.includes('?') ? (/[?&]$/.test(head) ? '' : '&') : '?') + q + tail;
}

/* Segments on sites the extension may not reach (02 v2 R4). */
const permission = { missing: [], hosts: [] };

function originPatterns(urls) {
  const out = new Map();
  for (const u of urls) {
    try { const x = new URL(u); if (/^https?:$/.test(x.protocol)) out.set(`${x.protocol}//${x.hostname}/*`, x.hostname); } catch (_) { /* skip */ }
  }
  return out;
}

async function missingPatterns(urls) {
  const missing = [];
  for (const [pattern, host] of originPatterns(urls)) {
    let ok = false;
    try { ok = await chrome.permissions.contains({ origins: [pattern] }); } catch (_) { ok = false; }
    if (!ok) missing.push({ pattern, host });
  }
  return missing;
}

let permissionCheck = 0;
async function checkPermissions() {
  const urls = selectionSources('normal').flatMap(s => playlistUrls(s.playlist));
  const ticket = ++permissionCheck;
  const missing = await missingPatterns(urls);
  if (ticket !== permissionCheck) return;
  permission.missing = missing.map(m => m.pattern);
  permission.hosts = [...new Set(missing.map(m => m.host))];
  const need = permission.missing.length > 0;
  $('permNote').hidden = !need;
  $('permButton').hidden = !need;
  if (need) say($('permNote'), 'needAccess', () => permission.hosts.join(t('listSep'))); else say($('permNote'), null);
  renderStartButton();
}

// Must be called straight from the click so Chrome accepts the request.
function requestAccess(patterns, after) {
  if (!patterns.length) return;
  let pending;
  try { pending = chrome.permissions.request({ origins: patterns }); } catch (e) { console.warn(e); return; }
  Promise.resolve(pending).then(granted => { if (granted) after(); }, e => console.warn(e));
}

/* ------------------------------------------------------------------ 高级选项的输入 */

// "3" is a segment number (from 1); "1:30" or "01:02:03" is a time.
function parseRangeValue(text) {
  const s = String(text || '').trim();
  if (!s) return { empty: true };
  if (/^\d+$/.test(s)) return { index: Number(s) };
  const m = /^(\d+)(?::([0-5]?\d))(?::([0-5]?\d))?(\.\d+)?$/.exec(s);
  if (!m) return null;
  const parts = [m[1], m[2], m[3]].filter(x => x != null).map(Number);
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return { time: seconds + (m[4] ? Number(m[4]) : 0) };
}

// Returns { first, last } segment indexes (0-based, both included) and the chosen time span { from, to } in
// playlist seconds (a typed time is kept exactly; a segment number stands for that segment's edges), or null when
// the input is invalid. typed is true when either box is filled.
function rangeIndexes(pl) {
  const n = pl.segments.length;
  const from = parseRangeValue($('rangeFrom').value), to = parseRangeValue($('rangeTo').value);
  if (!from || !to) return null;
  const starts = [];
  let acc = 0;
  for (const s of pl.segments) { starts.push(acc); acc += s.duration; }
  const byTime = (sec, end) => {
    for (let i = 0; i < n; i++) {
      const a = starts[i], b = starts[i] + pl.segments[i].duration;
      if (sec < b || i === n - 1) return end && sec <= a && i > 0 ? i - 1 : i;
    }
    return n - 1;
  };
  let first = 0, last = n - 1;
  if (from.index != null) { if (from.index < 1 || from.index > n) return null; first = from.index - 1; }
  else if (from.time != null) first = byTime(from.time, false);
  if (to.index != null) { if (to.index < 1 || to.index > n) return null; last = to.index - 1; }
  else if (to.time != null) last = byTime(to.time, true);
  if (first > last) return null;
  const end = i => starts[i] + pl.segments[i].duration;
  let fromT = from.time != null ? Math.max(starts[first], Math.min(from.time, end(first))) : starts[first];
  let toT = to.time != null ? Math.max(starts[last], Math.min(to.time, end(last))) : end(last);
  if (toT - fromT < 0.05) return null;
  return { first, last, from: fromT, to: toT, typed: !from.empty || !to.empty };
}

function validateRange() {
  const variant = selectedVariant();
  const msg = $('rangeMessage');
  const bad = !!(variant && variant.playlist && !variant.playlist.live && !rangeIndexes(variant.playlist));
  msg.hidden = !bad;
  if (bad) say(msg, 'rangeBad'); else say(msg, null);
  return !bad;
}

function decodeKeyText(text) {
  const s = String(text || '').trim();
  if (!s) return { empty: true };
  if (/^(0x)?[0-9a-f]{32}$/i.test(s)) return { bytes: hexBytes(s) };
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    if (bin.length === 16) return { bytes: Uint8Array.from(bin, c => c.charCodeAt(0)) };
  } catch (_) { /* not base64 */ }
  return null;
}

function customKeyState() {
  const key = decodeKeyText($('customKey').value);
  const ivText = $('customIv').value.trim();
  const iv = ivText ? (/^(0x)?[0-9a-f]{32}$/i.test(ivText) ? hexBytes(ivText) : null) : undefined;
  const msg = $('keyMessage');
  let bad = null;
  if (!key) bad = 'keyBad';
  else if (iv === null) bad = 'ivBad';
  msg.hidden = !bad;
  if (bad) say(msg, bad); else say(msg, null);
  if (bad) return null;
  return { key: key.empty ? null : key.bytes, iv: iv || null };
}

function parseHeaderBox(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim(), value = line.slice(i + 1).trim();
    if (name && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && value) out[name] = value;
  }
  return out;
}

async function headersChanged() {
  params.headers = parseHeaderBox($('headersBox').value);
  await clearHeaderRules();
  await allowOrigins(knownUrls());
  const msg = $('advancedMessage');
  msg.hidden = false; say(msg, 'headersSaved');
}

function commandText() {
  const quote = s => '"' + String(s).replace(/(["\\$`])/g, '\\$1') + '"';
  const parts = ['N_m3u8DL-RE', quote(info ? info.url : params.url)];
  for (const [k, v] of Object.entries(params.headers)) parts.push('-H', quote(`${k}: ${v}`));
  parts.push('--save-name', quote(stemOf($('filenameInput').value)));
  return parts.join(' ');
}

async function copyText(text, okKey) {
  const msg = $('advancedMessage');
  msg.hidden = false;
  try { await navigator.clipboard.writeText(text); say(msg, okKey); } catch (_) { say(msg, 'copyFailed'); }
}

/* ------------------------------------------------------------------ 预览 */

function loadHlsLibrary() {
  if (window.Hls) return Promise.resolve(window.Hls);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lib/hls.min.js';
    s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js missing')));
    s.onerror = () => reject(new Error('hls.js missing'));
    document.head.appendChild(s);
  });
}

async function togglePreview() {
  if (preview.hls) { closePreview(); return; }
  const variant = selectedVariant();
  if (!variant) return;
  const msg = $('advancedMessage');
  try {
    const Hls = await loadHlsLibrary();
    if (!Hls.isSupported()) throw new Error('unsupported');
    await allowOrigins(knownUrls());
    const video = document.createElement('video');
    video.controls = true; video.muted = true; video.playsInline = true;
    const box = $('previewBox');
    box.replaceChildren(video);
    box.hidden = false;
    const hls = new Hls({ enableWorker: false, xhrSetup: xhr => { xhr.withCredentials = true; } });
    preview.hls = hls; preview.video = video;
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (info.master) {
        const i = hls.levels.findIndex(l => (l.url && [].concat(l.url).includes(variant.url)) || l.uri === variant.url);
        if (i >= 0) hls.currentLevel = i;
        const r = selectedRendition();
        if (r) { const a = hls.audioTracks.findIndex(x => x.url === r.url); if (a >= 0) hls.audioTrack = a; }
      }
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, data) => { if (data && data.fatal) { closePreview(); msg.hidden = false; say(msg, 'previewFailed'); } });
    hls.loadSource(info.master ? info.url : variant.url);
    hls.attachMedia(video);
  } catch (e) {
    console.warn(e);
    closePreview();
    msg.hidden = false; say(msg, 'previewFailed');
  }
  $('previewButton').textContent = t(preview.hls ? 'closePreview' : 'preview');
}

function closePreview() {
  if (preview.hls) { try { preview.hls.destroy(); } catch (_) { /* ignore */ } }
  preview.hls = null;
  if (preview.video) { preview.video.removeAttribute('src'); preview.video.load(); }
  preview.video = null;
  const box = $('previewBox');
  if (box) { box.replaceChildren(); box.hidden = true; }
  const btn = $('previewButton');
  if (btn) btn.textContent = t('preview');
}

/* ------------------------------------------------------------------ 下载：请求与解密 */

class KeyError extends Error { constructor(key) { super(key); this.key = key; } }

const RETRY_DELAYS = [500, 1000, 1500];
const PARALLEL = 6;
const keyCache = new Map();   // key address -> 16 raw bytes (each key is downloaded once)
const cryptoKeys = new Map(); // hex of key bytes -> CryptoKey

async function withRetries(fn, signal) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (signal.aborted || e instanceof KeyError || isOutOfMemory(e) || attempt >= RETRY_DELAYS.length) throw e;
      await sleep(RETRY_DELAYS[attempt]);
      if (signal.aborted) throw e;
    }
  }
}

async function keyBytes(uri, signal) {
  if (keyCache.has(uri)) return keyCache.get(uri);
  let bytes;
  try {
    bytes = await withRetries(async () => {
      const response = await fetch(uri, { credentials: 'include', cache: 'no-store', signal });
      if (!response.ok) throw Object.assign(new Error('HTTP ' + response.status), { status: response.status });
      return new Uint8Array(await response.arrayBuffer());
    }, signal);
  } catch (e) {
    if (signal.aborted) throw e;
    throw new KeyError('keyFailed');
  }
  if (bytes.byteLength !== 16) throw new KeyError('keyFailed');
  keyCache.set(uri, bytes);
  return bytes;
}

async function cryptoKeyFor(bytes) {
  const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  if (!cryptoKeys.has(id)) cryptoKeys.set(id, crypto.subtle.importKey('raw', bytes, { name: 'AES-CBC' }, false, ['decrypt']));
  return cryptoKeys.get(id);
}

function sequenceIv(seq) {
  const iv = new Uint8Array(16);
  let n = BigInt(Math.max(0, Math.floor(seq)));
  for (let i = 15; i >= 0 && n > 0n; i--) { iv[i] = Number(n & 255n); n >>= 8n; }
  return iv;
}

// One request: playlist headers come from the session rules; byte ranges use Range.
async function fetchItem(item, signal, job) {
  const headers = {};
  if (item.range) headers.Range = `bytes=${item.range.start}-${item.range.end}`;
  const response = await fetch(withQuery(item.url, job.extraQuery), { headers, signal, credentials: 'include', cache: 'no-store' });
  if (!response.ok) { const e = new Error('HTTP ' + response.status); e.status = response.status; throw e; }
  let buffer = await response.arrayBuffer();
  if (item.range) {
    const want = item.range.end - item.range.start + 1;
    if (response.status === 200 && buffer.byteLength > want) buffer = buffer.slice(item.range.start, item.range.end + 1);
    if (buffer.byteLength !== want) throw new Error('short range');
  }
  if (item.key) buffer = await decryptItem(item, buffer, signal, job);
  return buffer;
}

async function decryptItem(item, buffer, signal, job) {
  const raw = job.customKey ? job.customKey : await keyBytes(item.key.uri, signal);
  const key = await cryptoKeyFor(raw);
  const iv = job.customIv || item.key.iv || sequenceIv(item.ivSeq);
  try {
    return await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, buffer);
  } catch (_) {
    throw new KeyError('keyWrong');
  }
}

// The requests for one playlist: the initialization segment (fMP4) first, then the media segments.
function itemsFor(segments) {
  const items = [];
  let lastMap = null;
  for (const s of segments) {
    if (s.map && s.map !== lastMap && !lastMap) {
      items.push({ url: s.map.url, range: s.map.range, key: s.map.key, ivSeq: s.seq, init: true, duration: 0 });
    }
    if (s.map) lastMap = s.map;
    items.push({ url: s.url, range: s.range, key: s.key, ivSeq: s.seq, seq: s.seq, duration: s.duration, start: s.start });
  }
  return items;
}

/* ------------------------------------------------------------------ 下载：任务 */

function newSource(spec, segments) {
  return {
    role: spec.role, playlist: spec.playlist, codecs: spec.codecs, container: spec.playlist.container,
    items: itemsFor(segments), parts: [], failed: new Set(), netFailed: new Set(), done: 0
  };
}

class Job {
  constructor(mode, live) {
    this.mode = mode;            // 'normal' | 'audio'
    this.live = live;
    this.sources = [];
    this.controller = new AbortController();
    this.bytes = 0;
    this.stopped = false;
    this.state = 'running';
    this.downloadId = null;
    this.blobUrls = [];
    this.baseName = $('filenameInput').value;
    this.extraQuery = $('extraQuery').value;
    this.customKey = null;
    this.customIv = null;
  }

  get percent() {
    let p = 0;
    for (const s of this.sources) p += s.share * (s.done / Math.max(1, s.items.length));
    return p;
  }

  async downloadSource(src, indexes) {
    const signal = this.controller.signal;
    const queue = indexes.slice();
    let fatal = null;
    const worker = async () => {
      while (queue.length && !this.stopped && !fatal) {
        const i = queue.shift();
        try {
          const buffer = await withRetries(() => fetchItem(src.items[i], signal, this), signal);
          if (this.stopped) return;
          src.parts[i] = buffer;
          src.failed.delete(i); src.netFailed.delete(i);
          src.done++;
          this.bytes += buffer.byteLength;
          updateProgress();
        } catch (e) {
          if (this.stopped || signal.aborted) return;
          if (e instanceof KeyError || isOutOfMemory(e)) { fatal = e; return; }
          src.failed.add(i);
          if (e instanceof TypeError) src.netFailed.add(i); else src.netFailed.delete(i);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    if (fatal) throw fatal;
  }

  release() {
    for (const s of this.sources) s.parts = [];
    for (const u of this.blobUrls) URL.revokeObjectURL(u);
    this.blobUrls = [];
  }
}

const failedCount = () => (job ? job.sources.reduce((s, x) => s + x.failed.size, 0) : 0);

function lockInputs(locked) {
  for (const id of ['videoSelect', 'audioSelect', 'filenameInput', 'rangeFrom', 'rangeTo', 'customKey', 'customIv', 'extraQuery', 'headersBox']) $(id).disabled = locked;
  $('audioOnlyButton').disabled = locked || !!permission.missing.length;
}

function setStage(key, ...args) { say($('stage'), key, ...args); }

function updateProgress(forced) {
  if (!job) return;
  if (job.live) { updateLive(); return; }
  const pct = Math.max(0, Math.min(100, Math.floor(forced ?? job.percent)));
  // A full bar is drawn at once, without the easing that would leave it short of 100% (spec v2 R4).
  $('barFill').style.transition = pct >= 100 ? 'none' : '';
  $('barFill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', String(pct));
  $('percent').textContent = pct + '%';
  say($('received'), 'received', formatBytes(job.bytes));
  progressText = pct + '%';
  renderTitle();
}

function renderTitle() {
  if (finishedTitle) document.title = t('stageDone');
  else if (progressText) document.title = (typeof progressText === 'function' ? progressText() : progressText) + ' · ' + t('pageName');
  else document.title = t('pageName');
}

function showJobMessage(key, ...args) {
  const el = $('jobMessage');
  $('jobDetail').hidden = true; say($('jobDetail'), null);
  $('jobPermNote').hidden = true; $('jobPermButton').hidden = true;
  if (!key) { el.hidden = true; say(el, null); return; }
  el.hidden = false;
  const quiet = ['separateSaved', 'tsSaved', 'liveEnded', 'liveReadFailed'].includes(key);
  el.classList.toggle('error', !quiet);
  el.classList.toggle('muted', quiet);
  say(el, key, ...args);
}

function setButtons(state) {
  // running | stopped | failed | failedSegments | done | recording | saving
  const stop = $('stopButton');
  stop.hidden = state === 'done' || state === 'saving' || (job && job.live && state !== 'recording');
  stop.disabled = false;
  say(stop, state === 'recording' ? 'stopSave' : (state === 'running' ? 'stop' : 'restart'));
  $('retryFailedButton').hidden = state !== 'failedSegments';
  $('savePartialButton').hidden = state !== 'failedSegments';
  $('showFileButton').hidden = state !== 'done';
}

// A finished, stopped or failed download makes way for a new choice.
function resetFinishedJob() {
  if (!job || ['running', 'recording', 'saving', 'failedSegments'].includes(job.state)) return;
  if (job.state !== 'done') { job.stopped = true; job.controller.abort(); job.release(); }
  job = null;
  finishedTitle = false;
  progressText = null;
  renderTitle();
  showJobMessage(null);
  $('progressArea').hidden = true;
  $('startArea').hidden = false;
  renderStartButton();
}

function prepareJobArea(live) {
  finishedTitle = false;
  $('startArea').hidden = true;
  $('progressArea').hidden = false;
  $('progressRow').hidden = live;
  $('liveNote').hidden = true;
  $('gapNote').hidden = true; say($('gapNote'), null);
  showJobMessage(null);
  lockInputs(true);
}

function readJobInputs(current) {
  const keyState = customKeyState();
  if (!keyState) { openAdvanced(); return false; }
  current.customKey = keyState.key;
  current.customIv = keyState.iv;
  return true;
}

async function startJob(mode) {
  if (job && (job.state === 'running' || job.state === 'recording' || job.state === 'saving')) return;
  if (permission.missing.length) return;
  if (isLive()) return startRecording(mode);
  const variant = selectedVariant();
  if (!variant || !variant.playlist) return;
  if (!validateRange()) { openAdvanced(); return; }
  const current = new Job(mode, false);
  if (!readJobInputs(current)) return;
  if (job) { job.stopped = true; job.controller.abort(); job.release(); }

  const specs = selectionSources(mode);
  if (!specs.length) return;
  // The range is given in segments of the picture playlist; the separate sound follows by time.
  const { first, last, from, to, typed } = rangeIndexes(variant.playlist);
  const whole = first === 0 && last === variant.playlist.segments.length - 1 && !typed;
  current.expected = to - from;
  // A range keeps only that time span in every track (spec v2 R1).
  current.window = typed ? { from, to } : null;
  for (const spec of specs) {
    let segs;
    if (spec.playlist === variant.playlist) segs = variant.playlist.segments.slice(first, last + 1);
    else if (whole) segs = spec.playlist.segments;
    else {
      segs = [];
      let a = 0;
      for (const s of spec.playlist.segments) { const b = a + s.duration; if (b > from + 0.001 && a < to - 0.001) segs.push(s); a = b; }
    }
    current.sources.push(newSource(spec, segs));
  }
  current.combine = canCombine(specs);
  const weights = current.sources.map(s => (s.role === 'audio' ? 1 : 8) * s.items.length);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  current.sources.forEach((s, i) => { s.share = 90 * weights[i] / sum; });

  job = current;
  prepareJobArea(false);
  setButtons('running');
  setStage('stageDownload');
  updateProgress(0);
  await allowOrigins(current.sources.flatMap(s => s.items.map(i => i.url).concat(s.items.filter(i => i.key).map(i => i.key.uri))));
  await runDownloads(current, false);
}

async function runDownloads(current, onlyFailed) {
  try {
    // Keys first: one download per key address; a missing key stops before any segment is fetched.
    if (!current.customKey) {
      const uris = new Set();
      for (const s of current.sources) s.items.forEach((it, i) => { if (it.key && (!onlyFailed || s.failed.has(i))) uris.add(it.key.uri); });
      for (const uri of uris) await keyBytes(uri, current.controller.signal);
    }
    for (const src of current.sources) {
      if (current.stopped) return;
      const indexes = onlyFailed ? [...src.failed] : src.items.map((_, i) => i);
      if (!indexes.length) continue;
      setStage('stageDownload');
      await current.downloadSource(src, indexes);
    }
    if (current.stopped) return;
    const failed = failedCount();
    if (failed) {
      current.state = 'failedSegments';
      showJobMessage('failedSegments', failed);
      setButtons('failedSegments');
      offerJobAccess(current);
      return;
    }
    await finishJob(current, false);
  } catch (e) {
    if (current.stopped) return;
    if (e instanceof KeyError) return failJob(current, e.key);
    console.error(e);
    failJob(current, isOutOfMemory(e) ? 'outOfMemory' : 'unexpected');
  }
}

// After failed segments: offer access when network errors hit sites without permission (02 v2 R4).
async function offerJobAccess(current) {
  const urls = current.sources.flatMap(s => [...s.netFailed].map(i => s.items[i].url));
  if (!urls.length) return;
  const missing = await missingPatterns(urls);
  if (job !== current || current.state !== 'failedSegments' || !missing.length) return;
  current.missing = missing.map(m => m.pattern);
  const note = $('jobPermNote');
  note.hidden = false;
  say(note, 'needAccess', [...new Set(missing.map(m => m.host))].join(t('listSep')));
  $('jobPermButton').hidden = false;
}

function failJob(current, key, ...args) {
  current.state = 'failed';
  current.stopped = true;
  current.controller.abort();
  current.release();
  showJobMessage(key, ...args);
  setButtons('failed');
  lockInputs(false);
  clearHeaderRules();
  progressText = null;
  renderTitle();
}

async function retryFailed() {
  if (!job || job.state !== 'failedSegments') return;
  const current = job;
  current.state = 'running';
  showJobMessage(null);
  setButtons('running');
  await allowOrigins(knownUrls());
  await runDownloads(current, true);
}

async function savePartial() {
  if (!job || job.state !== 'failedSegments') return;
  const current = job;
  current.state = 'running';
  showJobMessage(null);
  setButtons('saving');
  try { await finishJob(current, true); } catch (e) { console.error(e); failJob(current, isOutOfMemory(e) ? 'outOfMemory' : 'unexpected'); }
}

async function stopJob() {
  if (!job) return;
  if (job.live) {
    if (job.state === 'recording') finishRecording(job, null);
    return;
  }
  if (job.state === 'running' || job.state === 'failedSegments') {
    const current = job;
    current.stopped = true;
    current.state = 'stopped';
    current.controller.abort();
    if (current.downloadId != null) {
      try { await chrome.downloads.cancel(current.downloadId); } catch (_) { /* already gone */ }
      try { await chrome.downloads.erase({ id: current.downloadId }); } catch (_) { /* ignore */ }
    }
    current.release();
    showJobMessage(null);
    setStage('stageStopped');
    setButtons('stopped');
    lockInputs(false);
    progressText = null;
    renderTitle();
  } else {
    // 重新下载
    const mode = job.mode;
    job.state = 'stopped';
    startJob(mode);
  }
}

/* ------------------------------------------------------------------ 直播录制 */

const clampPoll = target => Math.min(10, Math.max(2, Number(target) || 2)) * 1000;

async function startRecording(mode) {
  const current = new Job(mode, true);
  if (!readJobInputs(current)) return;
  if (job) { job.stopped = true; job.controller.abort(); job.release(); }
  const specs = selectionSources(mode);
  if (!specs.length) return;
  job = current;
  current.state = 'recording';
  current.recorders = specs.map(spec => ({
    spec, url: spec.playlist.url, container: spec.playlist.container, role: spec.role,
    segments: new Map(),     // seq -> { item, buffer, state }
    seen: new Map(),         // seq -> duration
    nextSeq: null, failures: 0, mapItem: null, mapBuffer: null, target: spec.playlist.target, timer: null
  }));
  current.queue = [];
  current.inflight = new Set();
  current.missedSeconds = 0;
  prepareJobArea(true);
  setButtons('recording');
  updateLive();
  await allowOrigins(specs.flatMap(s => playlistUrls(s.playlist)));
  for (const rec of current.recorders) {
    // Start from the newest three segments of a fresh copy of the list.
    let pl = rec.spec.playlist;
    try { pl = await readMedia(rec.url, current.controller.signal); } catch (_) { /* use the copy already read */ }
    if (current.stopped) return;
    acceptSegments(current, rec, pl, true);
    schedulePoll(current, rec, clampPoll(pl.target || rec.target));
    if (pl.ended) { finishRecording(current, 'liveEnded'); return; }
  }
}

function acceptSegments(current, rec, pl, initial) {
  rec.target = pl.target || rec.target;
  if (pl.isProtected) { finishRecording(current, null); return; }
  for (const s of pl.segments) rec.seen.set(s.seq, s.duration);
  let fresh;
  if (rec.nextSeq == null) fresh = initial ? pl.segments.slice(-3) : pl.segments;
  else fresh = pl.segments.filter(s => s.seq >= rec.nextSeq);
  if (!fresh.length) return;
  if (rec.nextSeq != null && fresh[0].seq > rec.nextSeq && rec === current.recorders[0]) {
    current.missedSeconds += (fresh[0].seq - rec.nextSeq) * (rec.target || 2);
  }
  if (!rec.mapItem && fresh[0].map) {
    rec.mapItem = { url: fresh[0].map.url, range: fresh[0].map.range, key: fresh[0].map.key, ivSeq: fresh[0].seq, init: true };
    enqueue(current, rec, null, rec.mapItem);
  }
  for (const s of fresh) {
    const item = { url: s.url, range: s.range, key: s.key, ivSeq: s.seq, seq: s.seq, duration: s.duration };
    rec.segments.set(s.seq, { item, buffer: null, state: 'queued' });
    enqueue(current, rec, s.seq, item);
  }
  rec.nextSeq = fresh[fresh.length - 1].seq + 1;
  allowOrigins(playlistUrls(pl));
}

function enqueue(current, rec, seq, item) {
  current.queue.push({ rec, seq, item });
  pump(current);
}

function pump(current) {
  while (current.inflight.size < PARALLEL && current.queue.length && !current.aborted) {
    const task = current.queue.shift();
    const p = (async () => {
      const signal = current.controller.signal;
      try {
        const buffer = await withRetries(() => fetchItem(task.item, signal, current), signal);
        if (current.aborted) return;
        if (task.seq == null) task.rec.mapBuffer = buffer;
        else { const entry = task.rec.segments.get(task.seq); entry.buffer = buffer; entry.state = 'done'; }
        current.bytes += buffer.byteLength;
      } catch (e) {
        if (current.aborted) return;
        if (task.seq != null) { const entry = task.rec.segments.get(task.seq); if (entry) entry.state = 'failed'; }
        if (e instanceof KeyError && !current.keyError) current.keyError = e.key;
      } finally {
        updateLive();
      }
    })();
    current.inflight.add(p);
    p.finally(() => { current.inflight.delete(p); pump(current); });
  }
}

function schedulePoll(current, rec, delay) {
  clearTimeout(rec.timer);
  rec.timer = setTimeout(() => pollOnce(current, rec), delay);
}

async function pollOnce(current, rec) {
  if (current.state !== 'recording') return;
  let pl = null;
  try { pl = await readMedia(rec.url, current.controller.signal); } catch (_) { pl = null; }
  if (current.state !== 'recording') return;
  if (!pl) {
    rec.failures++;
    if (rec.failures >= 3) return finishRecording(current, 'liveReadFailed');
  } else {
    rec.failures = 0;
    acceptSegments(current, rec, pl, false);
    if (current.state !== 'recording') return;
    if (pl.ended) return finishRecording(current, 'liveEnded');
  }
  schedulePoll(current, rec, clampPoll(rec.target));
}

function recordedSeconds(current) {
  const rec = current.recorders && current.recorders[0];
  if (!rec) return 0;
  let s = 0;
  for (const e of rec.segments.values()) if (e.state === 'done') s += e.item.duration;
  return s;
}

function updateLive() {
  const current = job;
  if (!current || !current.live) return;
  if (current.state === 'recording') {
    setStage('recorded', formatRecord(recordedSeconds(current)));
    progressText = () => t('recorded', formatRecord(recordedSeconds(current)));
  }
  say($('received'), 'received', formatBytes(current.bytes));
  const big = current.bytes > 2 * 1024 ** 3;
  $('liveNote').hidden = !big;
  if (big) say($('liveNote'), 'liveLarge');
  if (current.missedSeconds > 0) { $('gapNote').hidden = false; say($('gapNote'), 'gap', Math.round(current.missedSeconds)); }
  renderTitle();
}

async function finishRecording(current, reason) {
  if (current.state !== 'recording') return;
  current.state = 'saving';
  for (const rec of current.recorders) clearTimeout(rec.timer);
  setButtons('saving');
  if (reason) showJobMessage(reason);
  setStage('stageWaiting');
  // Wait for the segments already on their way, at most 10 seconds.
  const deadline = Date.now() + 10000;
  while ((current.inflight.size || current.queue.length) && Date.now() < deadline) {
    await Promise.race([Promise.allSettled([...current.inflight]), sleep(250)]);
  }
  current.aborted = true;
  current.queue = [];
  current.controller.abort();
  // Build the sources from what arrived, in media sequence order.
  current.sources = [];
  for (const rec of current.recorders) {
    const seqs = [...rec.segments.keys()].filter(q => rec.segments.get(q).state === 'done').sort((a, b) => a - b);
    const items = [], parts = [];
    if (rec.mapItem) { if (!rec.mapBuffer) continue; items.push(rec.mapItem); parts.push(rec.mapBuffer); }
    for (const q of seqs) { const e = rec.segments.get(q); items.push(e.item); parts.push(e.buffer); }
    if (!seqs.length) continue;
    let span = 0;
    for (let q = seqs[0]; q <= seqs[seqs.length - 1]; q++) span += rec.seen.has(q) ? rec.seen.get(q) : (rec.target || 2);
    current.sources.push({ role: rec.role, playlist: rec.spec.playlist, codecs: rec.spec.codecs, container: rec.container, items, parts, failed: new Set(), netFailed: new Set(), done: items.length, span });
  }
  const main = current.sources[0];
  if (!main) {
    current.state = 'failed';
    current.release();
    showJobMessage(current.keyError || 'liveNothing');
    setStage('stageStopped');
    setButtons('failed');
    lockInputs(false);
    $('startArea').hidden = false;
    renderStartButton();
    progressText = null; renderTitle();
    return;
  }
  current.expected = main.span;
  current.combine = canCombine(current.sources);
  current.state = 'running';
  await finishJob(current, false, reason);
}

/* ------------------------------------------------------------------ 合成与保存 */

function saveBlob(current, blob, filename) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    current.blobUrls.push(url);
    let id = null, settled = false;
    const done = (fn, value) => { if (settled) return; settled = true; chrome.downloads.onChanged.removeListener(listener); fn(value); };
    const listener = delta => {
      if (delta.id !== id) return;
      if (delta.state && delta.state.current === 'complete') done(resolve, id);
      else if (delta.state && delta.state.current === 'interrupted') {
        const reason = (delta.error && delta.error.current) || 'interrupted';
        done(reject, Object.assign(new Error(reason), { saveError: true }));
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    chrome.downloads.download({ url, filename, saveAs: !!saveAsSetting, conflictAction: 'uniquify' }).then(newId => {
      id = newId;
      current.downloadId = newId;
      if (current.stopped && !current.live) chrome.downloads.cancel(newId).catch(() => {});
      chrome.downloads.search({ id: newId }).then(([item]) => {
        if (!item) return;
        if (item.state === 'complete') done(resolve, id);
        else if (item.state === 'interrupted') done(reject, Object.assign(new Error(item.error || 'interrupted'), { saveError: true }));
      });
    }, error => done(reject, Object.assign(new Error((error && error.message) || String(error)), { saveError: true })));
  });
}

const RAW_EXT = { ts: 'ts', aac: 'aac', mp3: 'mp3' };
const rawExt = (src, audioRole) => RAW_EXT[src.container] || (audioRole ? 'm4a' : 'mp4');
const rawType = ext => ({ ts: 'video/mp2t', aac: 'audio/aac', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4' })[ext] || 'application/octet-stream';
const presentParts = src => src.parts.filter(Boolean);

// Media of one playlist as MP4 tracks: fMP4 is read as it is, TS (and packed AAC) is converted with mux.js.
function tracksOf(src) {
  const parts = presentParts(src);
  if (!parts.length) throw new Error('no data');
  let tracks;
  if (src.container === 'fmp4') tracks = readTracks(parts);
  else if (src.container === 'ts' || src.container === 'aac') tracks = transmux(parts);
  else throw new Error('cannot convert ' + src.container);
  // Where this playlist's first downloaded segment sits on the playlist timeline. Separate playlists are lined up
  // by this, not by their own timestamps, which may start anywhere (an fMP4 segment at 0:30 may say 0:40).
  const firstMedia = src.items.findIndex((it, i) => !it.init && src.parts[i]);
  const anchor = firstMedia >= 0 ? Number(src.items[firstMedia].start) || 0 : 0;
  for (const tr of tracks) { tr.anchor = anchor; tr.group = src; tr.fmp4 = src.container === 'fmp4'; }
  return tracks;
}

function transmux(parts) {
  const muxjs = window.muxjs;
  if (!muxjs || !muxjs.mp4 || !muxjs.mp4.Transmuxer) throw new Error('mux.js missing');
  const tm = new muxjs.mp4.Transmuxer({ remux: false, keepOriginalTimestamps: true });
  const out = {};
  tm.on('data', segment => {
    if (!segment || (segment.type !== 'video' && segment.type !== 'audio') || !segment.data || !segment.data.byteLength) return;
    const entry = out[segment.type] || (out[segment.type] = { init: segment.initSegment, frags: [] });
    entry.frags.push(toArrayBuffer(segment.data));
  });
  for (const p of parts) tm.push(new Uint8Array(p));
  tm.flush();
  const tracks = [];
  for (const kind of ['video', 'audio']) {
    const entry = out[kind];
    if (!entry || !entry.init || !entry.frags.length) continue;
    tracks.push(...readTracks([toArrayBuffer(entry.init), ...entry.frags]));
  }
  return tracks;
}

const wantsAudio = codecs => /mp4a|ac-3|ec-3|opus|mp3/i.test(String(codecs || ''));

// Pick the tracks for the file: the picture from the picture playlist, the sound from the separate sound
// playlist when there is one, otherwise from the picture playlist.
function pickTracks(current) {
  const audioOnly = current.mode === 'audio';
  const videoSrc = current.sources.find(s => s.role !== 'audio');
  const audioSrc = current.sources.find(s => s.role === 'audio');
  const chosen = [];
  if (videoSrc) {
    const tracks = tracksOf(videoSrc);
    const v = tracks.find(tr => tr.handler === 'vide');
    const a = tracks.find(tr => tr.handler === 'soun');
    if (!audioOnly) { if (!v && !a) throw new Error('no track'); if (v) chosen.push(v); }
    if (!audioSrc) {
      if (a) chosen.push(a);
      else if (audioOnly || wantsAudio(videoSrc.codecs)) throw new Error('sound missing');
    }
  }
  if (audioSrc) {
    const a = tracksOf(audioSrc).find(tr => tr.handler === 'soun');
    if (!a) throw new Error('sound missing');
    chosen.push(a);
  }
  if (!chosen.length) throw new Error('no track');
  return chosen;
}

async function finishJob(current, partial, reason) {
  const live = current.live;
  const anyTs = current.sources.some(s => s.container === 'ts' || s.container === 'aac');
  setStage(anyTs ? 'stageConvert' : 'stageMerge');
  if (!live) updateProgress(92);
  await sleep(0);
  const files = [];
  let note = reason || null;
  const base = stemOf(current.baseName) + (partial ? t('suffixPartial') : '');
  const separate = current.sources.length > 1;

  // Raw data of each playlist, in its own container.
  const rawFiles = () => current.sources.map(src => {
    const audioRole = src.role === 'audio' || current.mode === 'audio';
    const ext = rawExt(src, audioRole);
    const name = cleanName(base + (separate ? t(src.role === 'audio' ? 'suffixAudio' : 'suffixVideo') : ''), ext);
    return { blob: new Blob(presentParts(src), { type: rawType(ext) }), name };
  });

  const onlyMp3 = current.sources.length === 1 && current.sources[0].container === 'mp3';
  if (onlyMp3) files.push(...rawFiles());
  else if (!current.combine) { files.push(...rawFiles()); note = note || 'separateSaved'; }
  else {
    let blob = null, audioFile = false;
    try {
      const tracks = pickTracks(current);
      audioFile = !tracks.some(tr => tr.handler === 'vide');
      blob = await buildMp4(tracks, current.expected, current.window || null);
    } catch (e) {
      if (current.stopped) return;
      console.error(e);
      if (isOutOfMemory(e)) return failJob(current, 'outOfMemory');
    }
    if (blob) files.push({ blob, name: cleanName(base, audioFile ? 'm4a' : 'mp4') });
    else {
      files.push(...rawFiles());
      if (!reason) note = separate ? 'mergeFailedSeparate' : (anyTs ? 'tsSaved' : 'rawSaved');
    }
  }
  if (current.stopped) return;
  for (const s of current.sources) s.parts = [];

  setStage('stageSave');
  if (!live) updateProgress(97);
  let lastId = null;
  try {
    for (const f of files) {
      if (current.stopped) return;
      lastId = await saveBlob(current, f.blob, f.name);
    }
  } catch (e) {
    if (current.stopped) return;
    failJob(current, 'saveFailed');
    const detail = $('jobDetail');
    detail.hidden = false;
    say(detail, 'saveCode', e.message || t('unknownError'));
    if (live) { $('startArea').hidden = false; renderStartButton(); }
    return;
  }
  if (current.stopped) return;
  current.state = 'done';
  current.savedId = lastId;
  current.release();
  clearHeaderRules();
  setStage('stageDone');
  if (!live) updateProgress(100);
  finishedTitle = true;
  renderTitle();
  if (note) showJobMessage(note); else showJobMessage(null);
  if (live && current.missedSeconds > 0) { $('gapNote').hidden = false; say($('gapNote'), 'gap', Math.round(current.missedSeconds)); }
  setButtons('done');
  lockInputs(false);
  // A live stream can be recorded again (a new file); a finished video offers no second download.
  if (live) { $('startArea').hidden = false; renderStartButton(); }
}

/* ------------------------------------------------------------------ MP4 合成（沿用 02 的写法，扩展为一个文件多条轨） */

// Read every track of an fMP4 (initialization data + fragments) with mp4box.js.
function readTracks(parts) {
  const file = createFile();
  const starts = [];
  let pos = 0;
  file.onError = e => { throw new Error('mp4box: ' + e); };
  for (const part of parts) {
    if (!part) throw new Error('missing segment');
    const ab = part;
    ab.fileStart = pos;
    starts.push(pos);
    pos += ab.byteLength;
    file.appendBuffer(ab);
  }
  file.flush();
  if (!file.moov || !file.moov.traks || !file.moov.traks.length) throw new Error('no moov');
  const first = parts[0];
  const out = [];
  for (const trak of file.moov.traks) {
    const handler = trak.mdia.hdlr.handler;
    if (handler !== 'vide' && handler !== 'soun') continue;
    const stsd = trak.mdia.minf.stbl.stsd;
    const entry = stsd.entries[0];
    const type = entry && entry.type;
    if (!type || /^(enc[avts]|drms|drmi)$/i.test(type)) throw new Error('unsupported sample entry ' + type);
    if (stsd.start + stsd.size > first.byteLength) throw new Error('stsd outside first part');
    const stsdBytes = new Uint8Array(first, stsd.start, stsd.size).slice();
    const samples = trak.samples.map(s => ({ offset: s.offset, size: s.size, dts: s.dts, cts: s.cts, duration: s.duration, sync: !!s.is_sync, desc: (s.description_index || 0) + 1 }));
    if (!samples.length) continue;
    const elst = trak.edts && trak.edts.elst && trak.edts.elst.entries ? trak.edts.elst.entries : [];
    const mediaEdit = elst.find(e => Number(e.media_time) >= 0);
    out.push({
      handler, type, stsdBytes, samples, parts, starts,
      timescale: trak.mdia.mdhd.timescale,
      language: trak.mdia.mdhd.language || 0x55c4,
      width: trak.tkhd.width, height: trak.tkhd.height,
      sourceMediaTime: mediaEdit ? Number(mediaEdit.media_time) : null
    });
  }
  if (!out.length) throw new Error('no samples');
  return out;
}

function sampleView(track, s) {
  let lo = 0, hi = track.starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (track.starts[mid] <= s.offset) lo = mid; else hi = mid - 1; }
  const part = track.parts[lo], local = s.offset - track.starts[lo];
  if (local < 0 || local + s.size > part.byteLength) throw new Error('sample outside data');
  return { part: lo, start: local, end: local + s.size };
}

class Writer {
  constructor() { this.chunks = []; this.length = 0; }
  bytes(u8) { this.chunks.push(u8); this.length += u8.byteLength; return this; }
  u8(n) { return this.bytes(Uint8Array.of(n & 255)); }
  u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return this.bytes(b); }
  u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return this.bytes(b); }
  i32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n); return this.bytes(b); }
  u64(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(Math.round(n))); return this.bytes(b); }
  i64(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(Math.round(n))); return this.bytes(b); }
  ascii(s) { return this.bytes(new TextEncoder().encode(s)); }
  zeros(n) { return this.bytes(new Uint8Array(n)); }
  join() { const out = new Uint8Array(this.length); let p = 0; for (const c of this.chunks) { out.set(c, p); p += c.byteLength; } return out; }
}

function box(type, ...children) {
  const body = children.filter(Boolean);
  const size = 8 + body.reduce((s, c) => s + c.byteLength, 0);
  const w = new Writer().u32(size).ascii(type);
  for (const c of body) w.bytes(c);
  return w.join();
}
const fullBox = (type, version, flags, fill, ...children) => {
  const w = new Writer().u8(version).u8(flags >> 16).u16(flags & 0xffff);
  if (fill) fill(w);
  return box(type, w.join(), ...children);
};

const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

function runLength(values) {
  const runs = [];
  for (const v of values) {
    const last = runs[runs.length - 1];
    if (last && last[1] === v) last[0]++; else runs.push([1, v]);
  }
  return runs;
}

// A regular (non-fragmented) MP4 with moov in front and samples interleaved about once a second.
// Times are worked out on the playlist timeline (seconds): every track carries the playlist position of its first
// downloaded segment (anchor) and, with others from the same playlist, its own earliest timestamp, so tracks from
// one playlist keep their mutual offset and tracks from separate playlists are lined up by the playlist.
// With a window { from, to } (a download range) every track is cut to that span and the file starts at 0.
async function buildMp4(tracks, expectedDuration, window) {
  const MOVIE_TS = 1000;
  const EPS = 0.001;
  const groupStart = new Map();
  for (const tr of tracks) {
    // fMP4 maps its timestamps to presentation time through the edit list of the initialization segment.
    tr.smt = tr.fmp4 && tr.sourceMediaTime != null ? tr.sourceMediaTime : 0;
    tr.abs = x => (x.cts - tr.smt) / tr.timescale;
    let minAbs = Infinity;
    for (const x of tr.samples) minAbs = Math.min(minAbs, tr.abs(x));
    // Priming samples before the edit list start are not shown.
    if (tr.smt && tr.samples[0].dts === 0) minAbs = Math.max(0, minAbs);
    tr.startAbs = minAbs;
    const key = tr.group || tr;
    groupStart.set(key, Math.min(groupStart.has(key) ? groupStart.get(key) : Infinity, minAbs));
  }
  for (const tr of tracks) {
    tr.srcMin = groupStart.get(tr.group || tr);
    tr.anchor = Number(tr.anchor) || 0;
    tr.P = x => tr.anchor + tr.abs(x) - tr.srcMin;
    tr.startP = tr.anchor + tr.startAbs - tr.srcMin;
    tr.endP = tr.samples.reduce((m, x) => Math.max(m, tr.P(x) + x.duration / tr.timescale), -Infinity);
  }
  const W0 = window ? window.from : Math.min(...tracks.map(tr => tr.startP));
  const W1 = window ? window.to : Math.max(...tracks.map(tr => tr.endP));

  for (const tr of tracks) {
    if (window) {
      const list = tr.samples;
      let lastIdx = -1;
      list.forEach((x, i) => { if (tr.P(x) < W1 - EPS) lastIdx = i; });
      let firstIdx;
      if (tr.handler === 'vide') {
        // Pictures start at the last key frame at or before the range start; the edit list hides the rest.
        firstIdx = 0;
        list.forEach((x, i) => { if (x.sync && i <= lastIdx && tr.P(x) <= W0 + EPS) firstIdx = i; });
      } else {
        firstIdx = list.findIndex(x => tr.P(x) + x.duration / tr.timescale > W0 + EPS);
      }
      if (firstIdx < 0 || lastIdx < firstIdx) throw new Error('nothing in range');
      tr.samples = list.slice(firstIdx, lastIdx + 1);
    }
    const dts0 = tr.samples[0].dts;
    tr.dts0 = dts0;
    tr.mediaDuration = tr.samples.reduce((sum, x) => sum + x.duration, 0);
    const firstP = tr.samples.reduce((m, x) => Math.min(m, tr.P(x)), Infinity);
    const lastEnd = tr.samples.reduce((m, x) => Math.max(m, tr.P(x) + x.duration / tr.timescale), -Infinity);
    const startP = Math.max(W0, tr.startP, firstP);
    const endP = Math.min(W1, lastEnd);
    if (!(endP > startP)) throw new Error('empty track');
    tr.delayMs = Math.round((startP - W0) * MOVIE_TS);
    if (tr.delayMs < 2) tr.delayMs = 0;
    const startCts = (startP - tr.anchor + tr.srcMin) * tr.timescale + tr.smt;
    tr.mediaTime = Math.max(0, Math.round(startCts) - dts0);
    tr.presentMs = Math.max(1, Math.round((endP - startP) * MOVIE_TS));
    tr.totalMs = tr.delayMs + tr.presentMs;
    tr.chunks = [];
    let chunk = null;
    for (const s of tr.samples) {
      if (!chunk || chunk.desc !== s.desc || (s.dts - chunk.firstDts) >= tr.timescale) {
        chunk = { desc: s.desc, firstDts: s.dts, count: 0, size: 0, slices: [], track: tr, time: (s.dts - tr.dts0) / tr.timescale + tr.delayMs / MOVIE_TS };
        tr.chunks.push(chunk);
      }
      const v = sampleView(tr, s);
      const last = chunk.slices[chunk.slices.length - 1];
      if (last && last.part === v.part && last.end === v.start) last.end = v.end; else chunk.slices.push(v);
      chunk.count++;
      chunk.size += s.size;
    }
  }
  const allChunks = tracks.flatMap(tr => tr.chunks).sort((a, b) => a.time - b.time || (a.track.handler === 'vide' ? -1 : 1));
  const mdatPayload = allChunks.reduce((s, c) => s + c.size, 0);
  const movieMs = Math.max(...tracks.map(tr => tr.totalMs));
  const hasVideo = tracks.some(tr => tr.handler === 'vide');
  const ftyp = box('ftyp', new Writer().ascii(hasVideo ? 'isom' : 'M4A ').u32(0x200).ascii('isom').ascii('iso2').ascii(hasVideo ? 'avc1' : 'M4A ').ascii('mp41').join());

  const buildMoov = (offsets, wide) => {
    const mvhd = fullBox('mvhd', 0, 0, w => {
      w.u32(0).u32(0).u32(MOVIE_TS).u32(movieMs).u32(0x10000).u16(0x100).zeros(10);
      MATRIX.forEach(m => w.u32(m));
      w.zeros(24).u32(tracks.length + 1);
    });
    const traks = tracks.map((tr, index) => {
      const video = tr.handler === 'vide';
      const tkhd = fullBox('tkhd', 0, 3, w => {
        w.u32(0).u32(0).u32(index + 1).u32(0).u32(tr.totalMs).zeros(8).u16(0).u16(video ? 0 : 1).u16(video ? 0 : 0x100).u16(0);
        MATRIX.forEach(m => w.u32(m));
        w.u32(video ? tr.width : 0).u32(video ? tr.height : 0);
      });
      const entries = [];
      if (tr.delayMs > 0) entries.push([tr.delayMs, -1]);
      entries.push([tr.presentMs, tr.mediaTime]);
      const edts = box('edts', fullBox('elst', 1, 0, w => {
        w.u32(entries.length);
        for (const [d, m] of entries) w.u64(d).i64(m).u16(1).u16(0);
      }));
      const mdhd = fullBox('mdhd', 1, 0, w => w.u64(0).u64(0).u32(tr.timescale).u64(tr.mediaDuration).u16(tr.language).u16(0));
      const hdlr = fullBox('hdlr', 0, 0, w => w.u32(0).ascii(video ? 'vide' : 'soun').zeros(12).ascii(video ? 'VideoHandler' : 'SoundHandler').u8(0));
      const xmhd = video ? fullBox('vmhd', 0, 1, w => w.zeros(8)) : fullBox('smhd', 0, 0, w => w.zeros(4));
      const dinf = box('dinf', fullBox('dref', 0, 0, w => w.u32(1), fullBox('url ', 0, 1)));
      const durs = runLength(tr.samples.map(s => s.duration));
      const stts = fullBox('stts', 0, 0, w => { w.u32(durs.length); for (const [c, d] of durs) w.u32(c).u32(d); });
      const offsetsCts = tr.samples.map(s => s.cts - s.dts);
      let ctts = null;
      if (offsetsCts.some(o => o !== 0)) {
        const neg = offsetsCts.some(o => o < 0);
        const runs = runLength(offsetsCts);
        ctts = fullBox('ctts', neg ? 1 : 0, 0, w => { w.u32(runs.length); for (const [c, o] of runs) { w.u32(c); if (neg) w.i32(o); else w.u32(o); } });
      }
      let stss = null;
      if (tr.samples.some(s => !s.sync)) {
        const sync = [];
        tr.samples.forEach((s, i) => { if (s.sync) sync.push(i + 1); });
        stss = fullBox('stss', 0, 0, w => { w.u32(sync.length); sync.forEach(n => w.u32(n)); });
      }
      const stscRows = [];
      tr.chunks.forEach((c, i) => {
        const last = stscRows[stscRows.length - 1];
        if (!last || last[1] !== c.count || last[2] !== c.desc) stscRows.push([i + 1, c.count, c.desc]);
      });
      const stsc = fullBox('stsc', 0, 0, w => { w.u32(stscRows.length); for (const r of stscRows) w.u32(r[0]).u32(r[1]).u32(r[2]); });
      const stsz = fullBox('stsz', 0, 0, w => { w.u32(0).u32(tr.samples.length); tr.samples.forEach(s => w.u32(s.size)); });
      const chunkOffsets = tr.chunks.map(c => offsets.get(c) || 0);
      const stco = wide
        ? fullBox('co64', 0, 0, w => { w.u32(chunkOffsets.length); chunkOffsets.forEach(o => w.u64(o)); })
        : fullBox('stco', 0, 0, w => { w.u32(chunkOffsets.length); chunkOffsets.forEach(o => w.u32(o)); });
      const stbl = box('stbl', tr.stsdBytes, stts, ctts, stss, stsc, stsz, stco);
      return box('trak', tkhd, edts, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, stbl)));
    });
    return box('moov', mvhd, ...traks);
  };

  const wide = ftyp.byteLength + mdatPayload + 16 + 1e6 > 0xffffffff;
  const placeholder = buildMoov(new Map(), wide);
  const mdatHeaderSize = wide ? 16 : 8;
  let cursor = ftyp.byteLength + placeholder.byteLength + mdatHeaderSize;
  const offsets = new Map();
  for (const c of allChunks) { offsets.set(c, cursor); cursor += c.size; }
  const moov = buildMoov(offsets, wide);
  if (moov.byteLength !== placeholder.byteLength) throw new Error('moov size changed');
  const mdatHeader = wide
    ? new Writer().u32(1).ascii('mdat').u64(mdatPayload + 16).join()
    : new Writer().u32(mdatPayload + 8).ascii('mdat').join();

  // Read the result back with mp4box.js: track count and length must be right (spec 4.6).
  await verifyHeader(ftyp, moov, tracks.length, expectedDuration, movieMs / MOVIE_TS);

  const pieces = [ftyp, moov, mdatHeader];
  for (const c of allChunks) for (const s of c.slices) pieces.push(new Uint8Array(c.track.parts[s.part], s.start, s.end - s.start));
  const blob = new Blob(pieces, { type: hasVideo ? 'video/mp4' : 'audio/mp4' });
  if (blob.size !== ftyp.byteLength + moov.byteLength + mdatHeader.byteLength + mdatPayload) throw new Error('size mismatch');
  return blob;
}

function verifyHeader(ftyp, moov, trackCount, expectedDuration, builtSeconds) {
  return new Promise((resolve, reject) => {
    const file = createFile();
    let parsed = null;
    file.onReady = i => { parsed = i; };
    file.onError = e => reject(new Error('verify: ' + e));
    const head = new Uint8Array(ftyp.byteLength + moov.byteLength);
    head.set(ftyp, 0); head.set(moov, ftyp.byteLength);
    const ab = head.buffer;
    ab.fileStart = 0;
    try { file.appendBuffer(ab); file.flush(); } catch (e) { return reject(e); }
    if (!parsed) return reject(new Error('verify: not readable'));
    if (parsed.tracks.length !== trackCount) return reject(new Error('verify: track count ' + parsed.tracks.length));
    const seconds = parsed.duration / parsed.timescale;
    if (Math.abs(seconds - builtSeconds) > 0.01) return reject(new Error('verify: duration mismatch'));
    if (expectedDuration > 0 && Math.abs(seconds - expectedDuration) > 2) return reject(new Error('verify: duration ' + seconds + ' vs ' + expectedDuration));
    for (const tr of parsed.tracks) if (!tr.nb_samples) return reject(new Error('verify: empty track'));
    resolve();
  });
}

/* ------------------------------------------------------------------ 手动表单 */

function showForm() {
  $('formCard').hidden = false;
  $('mainCard').hidden = true;
  $('manualForm').addEventListener('submit', event => {
    event.preventDefault();
    const url = $('playlistInput').value.trim();
    const source = $('sourceInput').value.trim();
    const msg = $('formMessage');
    if (!/^https?:\/\/\S+$/i.test(url) || (source && !/^https?:\/\/\S+$/i.test(source))) {
      msg.hidden = false; say(msg, 'needHttp'); return;
    }
    msg.hidden = true;
    params.url = url;
    params.headers = source ? { Referer: source } : {};
    params.autoStart = false;
    loadPlaylist(url);
  });
}

/* ------------------------------------------------------------------ 启动 */

function openAdvanced() {
  if (advancedOpen) return;
  advancedOpen = true;
  $('advancedCard').hidden = false;
  $('advancedToggle').textContent = t('hideAdvanced');
  $('advancedToggle').setAttribute('aria-expanded', 'true');
}

function bindEvents() {
  $('advancedToggle').addEventListener('click', () => {
    advancedOpen = !advancedOpen;
    $('advancedCard').hidden = !advancedOpen;
    $('advancedToggle').textContent = t(advancedOpen ? 'hideAdvanced' : 'showAdvanced');
    $('advancedToggle').setAttribute('aria-expanded', String(advancedOpen));
  });
  $('videoSelect').addEventListener('change', () => { resetFinishedJob(); closePreview(); renderOptions(); selectionChanged(); });
  $('audioSelect').addEventListener('change', () => {
    const list = renditionsOf(selectedVariant());
    $('audioSelect').dataset.url = (list[$('audioSelect').selectedIndex] || {}).url || '';
    resetFinishedJob(); closePreview(); selectionChanged();
  });
  $('filenameInput').addEventListener('input', resetFinishedJob);
  $('downloadButton').addEventListener('click', () => startJob('normal'));
  $('audioOnlyButton').addEventListener('click', () => { resetFinishedJob(); startJob('audio'); });
  $('stopButton').addEventListener('click', stopJob);
  $('retryFailedButton').addEventListener('click', retryFailed);
  $('savePartialButton').addEventListener('click', savePartial);
  $('permButton').addEventListener('click', () => requestAccess(permission.missing.slice(), () => { allowOrigins(knownUrls()); checkPermissions(); }));
  $('jobPermButton').addEventListener('click', () => requestAccess((job && job.missing) || [], () => { allowOrigins(knownUrls()); $('jobPermNote').hidden = true; $('jobPermButton').hidden = true; }));
  $('showFileButton').addEventListener('click', () => { if (job && job.savedId != null) chrome.downloads.show(job.savedId); });
  $('copyButton').addEventListener('click', () => copyText([$('videoList').value, $('audioListField').hidden ? '' : $('audioList').value].filter(Boolean).join('\n'), 'copied'));
  $('commandButton').addEventListener('click', () => copyText(commandText(), 'commandCopied'));
  $('previewButton').addEventListener('click', togglePreview);
  // Changing the range after a finished download brings 下载 back (spec v2 R3).
  for (const id of ['rangeFrom', 'rangeTo']) $(id).addEventListener('input', () => { resetFinishedJob(); validateRange(); });
  $('customKey').addEventListener('input', customKeyState);
  $('customIv').addEventListener('input', customKeyState);
  $('headersBox').addEventListener('change', headersChanged);
  $('extraQuery').addEventListener('input', renderLists);
  addEventListener('pagehide', () => {
    if (job) {
      job.stopped = true; job.aborted = true; job.controller.abort();
      if (job.recorders) for (const rec of job.recorders) clearTimeout(rec.timer);
      job.release();
    }
    closePreview();
    clearHeaderRules();
  });
}

async function init() {
  let setting;
  try { setting = (await chrome.storage.local.get('ruxgetUiLanguage')).ruxgetUiLanguage; } catch (_) { /* default */ }
  lang = detectLanguage(setting);
  try { saveAsSetting = !!(await chrome.storage.sync.get('saveAs')).saveAs; } catch (_) { saveAsSetting = false; }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ruxgetUiLanguage) { lang = detectLanguage(changes.ruxgetUiLanguage.newValue); applyLanguage(); }
    if (area === 'sync' && changes.saveAs) saveAsSetting = !!changes.saveAs.newValue;
  });
  bindEvents();
  if (params.title) $('subtitle').textContent = params.title;
  applyLanguage();
  if (!params.url) return showForm();
  if (!/^https?:\/\//i.test(params.url)) { showForm(); $('playlistInput').value = params.url; const m = $('formMessage'); m.hidden = false; say(m, 'needHttp'); return; }
  loadPlaylist(params.url);
}

init();
