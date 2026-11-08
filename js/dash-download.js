// Ruxget，2026-11-08，按功能说明书 02-DASH下载页 从零编写。
import { createFile } from '../lib/mp4box/mp4box.all.mjs';

/* ------------------------------------------------------------------ 文案 */

const TEXT = {
  zh: {
    pageName: 'Ruxget · 视频下载',
    keepOpen: '请保持这个页面打开，下载进度会显示在这里。',
    showAdvanced: '显示高级选项',
    hideAdvanced: '收起高级选项',
    manifestField: '清单地址（.mpd）',
    sourceField: '来源网页（可选）',
    readButton: '读取',
    needHttp: '请输入以 http 或 https 开头的地址',
    loading: '正在读取视频信息…',
    summary: '共 {0} 个分段，总时长 {1}',
    videoField: '画面',
    audioField: '声音',
    filenameField: '文件名',
    download: '下载',
    stop: '停止下载',
    restart: '重新下载',
    retryFailed: '重试失败的分段',
    showFile: '打开文件所在位置',
    stageVideo: '正在下载画面',
    stageAudio: '正在下载声音',
    stageMerge: '正在合成 MP4',
    stageSave: '正在保存',
    stageDone: '下载完成',
    stageStopped: '已停止',
    received: '已下载 {0}',
    drm: '这个视频受版权保护，无法下载。',
    live: '这是直播，目前只能下载已发布的视频。',
    readFailed: '无法读取视频信息（{0}）。请回到原网页刷新并重新播放后再试。',
    networkError: '网络错误',
    badManifest: '视频信息格式无法识别。',
    pageTextGone: '网页生成的播放列表已失效，请重新播放后再试。',
    tooLarge: '视频较大，在浏览器中下载可能失败。安装了 Ruxget 桌面版时，建议用桌面版下载。',
    failedSegments: '有 {0} 个分段没有下载成功。',
    mergeFailed: '合成 MP4 失败。可以在高级选项中分别下载画面和声音。',
    outOfMemory: '视频太大，浏览器无法处理。建议选择较低清晰度，或用 Ruxget 桌面版下载。',
    saveFailed: '保存失败，请检查下载文件夹是否可写，或在 Chrome 设置中换一个下载位置。',
    saveCode: '（{0}）',
    readFailedNoSource: '无法读取视频信息（{0}）。这个链接可能需要登录，或已经过期。',
    summaryWhole: '总时长 {0}',
    sizeAbout: '约 {0}',
    downloadSeparate: '分别下载画面和声音',
    comboSeparate: '这个组合不能合成一个 MP4，下载后会分别保存画面和声音。',
    mergeFailedSeparate: '合成 MP4 失败，已分别保存画面和声音。',
    needAccess: '视频分段存放在另一个网站（{0}），需要允许访问后才能下载。',
    allowAccess: '允许访问',
    listSep: '、',
    separateSaved: '这个视频的格式不能在浏览器中合成，已分别保存画面和声音。',
    advancedTitle: '高级选项',
    manifestAddress: '清单地址',
    videoSegments: '画面分段地址',
    audioSegments: '声音分段地址',
    copyAll: '复制全部地址',
    copied: '已复制全部地址。',
    copyFailed: '无法复制，请在文本框中手动选择。',
    videoOnly: '只下载画面',
    audioOnly: '只下载声音',
    trackFallback: '轨道 {0}',
    soundFallback: '声音 {0}',
    suffixVideo: '-画面',
    suffixAudio: '-声音',
    defaultName: '网页视频',
    unknownError: '未知错误'
  },
  en: {
    pageName: 'Ruxget · Video Download',
    keepOpen: 'Keep this page open. Download progress appears here.',
    showAdvanced: 'Show advanced options',
    hideAdvanced: 'Hide advanced options',
    manifestField: 'Manifest address (.mpd)',
    sourceField: 'Source page (optional)',
    readButton: 'Read',
    needHttp: 'Enter an address that starts with http or https',
    loading: 'Reading video information…',
    summary: '{0} segments, total length {1}',
    videoField: 'Video',
    audioField: 'Audio',
    filenameField: 'File name',
    download: 'Download',
    stop: 'Stop download',
    restart: 'Download again',
    retryFailed: 'Retry failed segments',
    showFile: 'Show in folder',
    stageVideo: 'Downloading video',
    stageAudio: 'Downloading audio',
    stageMerge: 'Building MP4',
    stageSave: 'Saving',
    stageDone: 'Download complete',
    stageStopped: 'Stopped',
    received: '{0} downloaded',
    drm: 'This video is copy-protected and cannot be downloaded.',
    live: 'This is a live stream. Only published videos can be downloaded for now.',
    readFailed: 'Could not read the video information ({0}). Go back to the source page, reload and play the video, then try again.',
    networkError: 'network error',
    badManifest: 'The video information is in a format that cannot be recognized.',
    pageTextGone: 'The playlist made by the page is no longer available. Play the video again, then retry.',
    tooLarge: 'This video is large and may fail to download in the browser. If Ruxget Desktop is installed, use it instead.',
    failedSegments: '{0} segments could not be downloaded.',
    mergeFailed: 'Building the MP4 failed. You can download the video and audio separately in the advanced options.',
    outOfMemory: 'The video is too large for the browser. Choose a lower quality, or use Ruxget Desktop.',
    saveFailed: 'Saving failed. Check that the download folder is writable, or choose another download location in Chrome settings.',
    saveCode: '({0})',
    readFailedNoSource: 'Could not read the video information ({0}). The link may need a sign-in, or it has expired.',
    summaryWhole: 'Total length {0}',
    sizeAbout: 'about {0}',
    downloadSeparate: 'Download video and audio separately',
    comboSeparate: 'This combination cannot be combined into one MP4. The video and audio will be saved as separate files.',
    mergeFailedSeparate: 'Building the MP4 failed. The video and audio were saved as separate files.',
    needAccess: 'The video segments are stored on another site ({0}). Allow access to download them.',
    allowAccess: 'Allow access',
    listSep: ', ',
    separateSaved: 'This video’s format cannot be combined in the browser. The video and audio were saved as separate files.',
    advancedTitle: 'Advanced options',
    manifestAddress: 'Manifest address',
    videoSegments: 'Video segment addresses',
    audioSegments: 'Audio segment addresses',
    copyAll: 'Copy all addresses',
    copied: 'All addresses copied.',
    copyFailed: 'Copying failed. Select the text in the box instead.',
    videoOnly: 'Video only',
    audioOnly: 'Audio only',
    trackFallback: 'Track {0}',
    soundFallback: 'Audio {0}',
    suffixVideo: '-video',
    suffixAudio: '-audio',
    defaultName: 'web-video',
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
  if (!params.title) say($('subtitle'), 'keepOpen');
  if (manifest) { renderOptions(); renderSummary(); }
  renderTitle();
}

/* ------------------------------------------------------------------ 工具 */

// Elements are cached so that a field removed from the page (a missing track kind) can still be referenced.
const elements = new Map();
const $ = id => { if (!elements.has(id)) { const el = document.getElementById(id); if (!el) return null; elements.set(id, el); } return elements.get(id); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

function formatBytes(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

function formatRate(bps, preferKbps) {
  if (!bps) return '';
  if (!preferKbps && bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps';
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
  name = name.replace(/\.(mp4|m4a|m4v|mpd|webm|mkv|mov|ts|m3u8)$/i, '');
  name = name.replace(/[. ]+$/, '');
  if (!name) name = t('defaultName');
  const max = 150 - ext.length - 1;
  if (name.length > max) name = name.slice(0, max).replace(/[. ]+$/, '') || t('defaultName');
  return name + '.' + ext;
}

const isOutOfMemory = e => e instanceof RangeError || /allocation|out of memory|memory/i.test(String(e && (e.message || e)));

/* ------------------------------------------------------------------ 语言代码 */

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
  textKey: query.get('textKey') || '',
  headers: {}
};
try {
  const h = JSON.parse(query.get('requestHeaders') || '{}');
  if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) if (v != null && String(v) !== '') params.headers[k] = String(v);
} catch (_) { /* ignore malformed headers */ }

let manifest = null;        // { duration, videos: [track], audios: [track] }
let advancedOpen = false;
let job = null;             // current download
let progressText = null;    // for document.title
let finishedTitle = false;

/* ------------------------------------------------------------------ 请求头规则 */

const headerRules = { ids: [], origins: new Set(), tabId: null, ready: null };

async function currentTabId() {
  if (headerRules.tabId != null) return headerRules.tabId;
  try { const tab = await chrome.tabs.getCurrent(); headerRules.tabId = tab ? tab.id : -1; } catch (_) { headerRules.tabId = -1; }
  return headerRules.tabId;
}

const SKIP_HEADERS = new Set(['range', 'content-length', 'host', 'connection', 'accept-encoding', 'transfer-encoding']);
async function allowOrigins(urls) {
  const entries = Object.entries(params.headers).filter(([k]) => !SKIP_HEADERS.has(k.toLowerCase()));
  if (!entries.length || !chrome.declarativeNetRequest) return;
  const fresh = [];
  for (const u of urls) {
    try { const o = new URL(u).origin; if (!headerRules.origins.has(o)) { headerRules.origins.add(o); fresh.push(o); } } catch (_) { /* skip */ }
  }
  if (!fresh.length) return;
  const tabId = await currentTabId();
  const existing = new Set((await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id));
  const addRules = [];
  for (const origin of fresh) {
    let id;
    do { id = 800000000 + Math.floor(Math.random() * 100000000); } while (existing.has(id));
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
}

function clearHeaderRules() {
  if (!headerRules.ids.length || !chrome.declarativeNetRequest) return;
  const removeRuleIds = headerRules.ids.splice(0);
  headerRules.origins.clear();
  try { chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds }).catch(() => {}); } catch (_) { /* page closing */ }
}

/* ------------------------------------------------------------------ 清单 */

class Blocked extends Error { constructor(key, ...args) { super(key); this.key = key; this.args = args; } }

function byteRange(range) {
  if (!range) return null;
  const offset = Number(range.offset ?? 0), length = Number(range.length ?? 0);
  if (!isFinite(offset) || !(length > 0)) return null;
  return { start: offset, end: offset + length - 1 };
}

function segmentList(playlist) {
  const list = [];
  const segs = playlist.segments || [];
  if (segs.length) {
    const first = segs[0];
    if (first.map && (first.map.resolvedUri || first.map.uri)) list.push({ url: first.map.resolvedUri || first.map.uri, range: byteRange(first.map.byterange), init: true });
    for (const s of segs) list.push({ url: s.resolvedUri || s.uri, range: byteRange(s.byterange), duration: s.duration || 0 });
  } else {
    // A single complete file (SegmentBase): download the whole file.
    const url = (playlist.sidx && (playlist.sidx.resolvedUri || playlist.sidx.uri)) || playlist.resolvedUri || playlist.uri;
    if (url) list.push({ url, range: null, whole: true });
  }
  return list.filter(s => s.url);
}

// Container and codec facts for a track. mimeType and codecs may sit on the Representation or only on its
// AdaptationSet (spec v2 R1), so they are read from the manifest XML, Representation first.
const MP4_CODECS = /^(avc1|avc3|hvc1|hev1|av01|mp4a|ec-3|ac-3)/i;
const WEBM_CODECS = /^(vp8|vp9|vp09|vorbis)/i;
function containerOf(mime, codecs, segments) {
  if (/webm/i.test(mime)) return 'webm';
  if (/mp4/i.test(mime)) return 'mp4';
  const c = codecs.split(',')[0].trim();
  if (MP4_CODECS.test(c)) return 'mp4';
  const media = segments.find(s => !s.init) || segments[0];
  const ext = media ? (/\.([a-z0-9]+)(?:[?#]|$)/i.exec(new URL(media.url, location.href).pathname) || [])[1] : '';
  if (/^webm$/i.test(ext || '')) return 'webm';
  if (/^(mp4|m4s|m4a|m4v)$/i.test(ext || '')) return 'mp4';
  if (WEBM_CODECS.test(c)) return 'webm';
  return 'unknown';
}

function formatOf(codecs) {
  const c = codecs.split(',')[0].trim().toLowerCase();
  if (/^(avc1|avc3)/.test(c)) return 'H.264';
  if (/^(hvc1|hev1)/.test(c)) return 'HEVC';
  if (/^av01/.test(c)) return 'AV1';
  if (/^(vp09|vp9)/.test(c)) return 'VP9';
  if (/^vp8/.test(c)) return 'VP8';
  if (/^mp4a/.test(c)) return 'AAC';
  if (/^opus/.test(c)) return 'Opus';
  if (/^vorbis/.test(c)) return 'Vorbis';
  if (/^ac-3/.test(c)) return 'AC-3';
  if (/^ec-3/.test(c)) return 'E-AC-3';
  return '';
}

function representationInfo(root) {
  const map = new Map();
  for (const rep of root.getElementsByTagNameNS('*', 'Representation')) {
    const id = rep.getAttribute('id');
    if (id == null || map.has(id)) continue;
    const set = rep.parentElement && rep.parentElement.localName === 'AdaptationSet' ? rep.parentElement : null;
    const pick = name => rep.getAttribute(name) || (set && set.getAttribute(name)) || '';
    map.set(id, { mime: pick('mimeType'), codecs: pick('codecs'), contentType: pick('contentType'), lang: pick('lang') });
  }
  return map;
}

function trackFrom(playlist, kind, index, groupLanguage, groupName, info) {
  const a = playlist.attributes || {};
  const segments = segmentList(playlist);
  const xml = (info && info.get(String(a.NAME ?? a.id ?? ''))) || {};
  const codecs = String(xml.codecs || a.CODECS || '');
  const mime = String(xml.mime || a.mimeType || '');
  const container = containerOf(mime, codecs, segments);
  return {
    kind, index, segments, codecs, mime, container, format: formatOf(codecs),
    bandwidth: Number(a.BANDWIDTH) || 0,
    width: a.RESOLUTION ? Number(a.RESOLUTION.width) || 0 : 0,
    height: a.RESOLUTION ? Number(a.RESOLUTION.height) || 0 : 0,
    fps: a['FRAME-RATE'],
    language: groupLanguage || a.lang || '',
    name: groupName || a.NAME || '',
    duration: segments.reduce((s, x) => s + (x.duration || 0), 0)
  };
}

const VIDEO_CODECS = /^(avc1|avc3|hvc1|hev1|av01)/i;
const AUDIO_CODECS = /^(mp4a|ec-3|ac-3|opus)/i;
function canMerge(track) {
  if (track.container !== 'mp4') return false;
  const c = track.codecs.split(',')[0].trim();
  if (!c) return true;
  return track.kind === 'video' ? VIDEO_CODECS.test(c) : AUDIO_CODECS.test(c);
}

function parseManifest(text, url) {
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch (_) { throw new Blocked('badManifest'); }
  const root = doc && doc.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length || root.localName !== 'MPD') throw new Blocked('badManifest');
  if (root.getElementsByTagNameNS('*', 'ContentProtection').length) throw new Blocked('drm');
  if ((root.getAttribute('type') || 'static').toLowerCase() === 'dynamic') throw new Blocked('live');

  let parsed;
  try { parsed = window.mpdParser.parse(text, { manifestUri: url }); } catch (e) { console.warn(e); throw new Blocked('badManifest'); }

  const info = representationInfo(root);
  const videos = [], audios = [], seen = new Set();
  const facts = p => {
    const a = p.attributes || {};
    const xml = info.get(String(a.NAME ?? a.id ?? '')) || {};
    return { mime: xml.mime || a.mimeType || '', contentType: xml.contentType || a.contentType || '', codecs: xml.codecs || a.CODECS || '' };
  };
  const isAudio = p => {
    const f = facts(p);
    return /^audio\//i.test(f.mime) || f.contentType === 'audio' || (!(p.attributes || {}).RESOLUTION && /^(mp4a|ec-3|ac-3|opus|vorbis)/i.test(f.codecs));
  };
  const isText = p => { const f = facts(p); return /^(text\/|application\/(ttml|mp4))/i.test(f.mime) && !/^(audio|video)/i.test(f.mime) || f.contentType === 'text'; };
  for (const p of parsed.playlists || []) {
    if (seen.has(p)) continue; seen.add(p);
    const a = p.attributes || {};
    if (isText(p)) continue;
    if (isAudio(p)) audios.push(trackFrom(p, 'audio', audios.length, a.lang, a.NAME, info));
    else videos.push(trackFrom(p, 'video', videos.length, '', '', info));
  }
  const groups = (parsed.mediaGroups && parsed.mediaGroups.AUDIO) || {};
  for (const group of Object.values(groups)) {
    for (const [label, entry] of Object.entries(group || {})) {
      for (const p of (entry && entry.playlists) || []) {
        if (seen.has(p)) continue; seen.add(p);
        audios.push(trackFrom(p, 'audio', audios.length, entry.language, label, info));
      }
    }
  }
  const usable = list => {
    const keys = new Set();
    return list.filter(tr => {
      if (!tr.segments.length) return false;
      const key = tr.bandwidth + ' ' + tr.segments.map(s => s.url + (s.range ? '#' + s.range.start : '')).join(' ');
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  };
  const v = usable(videos), au = usable(audios);
  if (!v.length && !au.length) throw new Blocked('badManifest');

  v.sort((x, y) => (y.width * y.height - x.width * x.height) || (y.height - x.height) || (y.bandwidth - x.bandwidth));
  au.sort((x, y) => y.bandwidth - x.bandwidth);
  const duration = Number(parsed.duration) || Math.max(0, ...v.map(x => x.duration), ...au.map(x => x.duration));
  return { duration, videos: v, audios: au };
}

/* ------------------------------------------------------------------ 界面：读取 */

const hasSource = () => Object.keys(params.headers).some(k => /^referr?er$/i.test(k) && params.headers[k]);

// A finished, stopped or failed download makes way for a new choice.
function resetFinishedJob() {
  if (!job || job.state === 'running' || job.state === 'failedSegments') return;
  if (job.state !== 'done') { job.stopped = true; job.controller.abort(); job.release(); }
  job = null;
  finishedTitle = false;
  progressText = null;
  renderTitle();
  showJobMessage(null);
  $('progressArea').hidden = true;
  $('startArea').hidden = false;
}

// Header rules for origins that just became reachable.
function allowOriginsAgain() {
  const urls = [...manifest.videos, ...manifest.audios].flatMap(tr => tr.segments.map(s => s.url));
  allowOrigins(urls);
}

function showBlocked(key, ...args) {
  $('loading').hidden = true;
  $('chooser').hidden = true;
  $('advancedToggle').hidden = true;
  $('advancedCard').hidden = true;
  const el = $('blocked');
  el.hidden = false;
  say(el, key, ...args);
}

async function loadManifest(url) {
  $('formCard').hidden = true;
  $('mainCard').hidden = false;
  $('loading').hidden = false;
  $('blocked').hidden = true;
  $('chooser').hidden = true;
  await allowOrigins([url]);
  let response;
  // spec 06 §6: a manifest the page made itself comes from the probe's copy; the url parameter (its page) is the base.
  if (params.textKey && url === params.url) {
    const reply = await chrome.runtime.sendMessage({ Message: 'ruxgetPageText', key: params.textKey }).catch(() => null);
    if (!reply || !reply.ok || typeof reply.text !== 'string') return showBlocked('pageTextGone');
    response = { ok: true, url, text: async () => reply.text };
  } else try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  } catch (_) {
    return showBlocked(hasSource() ? 'readFailed' : 'readFailedNoSource', () => t('networkError'));
  }
  if (!response.ok) return showBlocked(hasSource() ? 'readFailed' : 'readFailedNoSource', response.status);
  let text;
  try { text = await response.text(); } catch (_) { return showBlocked(hasSource() ? 'readFailed' : 'readFailedNoSource', () => t('networkError')); }
  try {
    manifest = parseManifest(text, response.url || url);
  } catch (e) {
    if (e instanceof Blocked) return showBlocked(e.key, ...e.args);
    console.error(e);
    return showBlocked('badManifest');
  }
  await allowOrigins([...manifest.videos, ...manifest.audios].flatMap(tr => tr.segments.map(s => s.url)));
  showChooser(url);
}

// Defaults prefer tracks that can go into one MP4 (spec v2 R2). Lists are already sorted best first.
// Spec v3 R7: among mergeable pictures, the sharpest one no taller than 1080 (higher bitrate first, as the list is
// sorted); when every one is taller, the lowest. Without mergeable pictures the same rule runs over all of them.
function defaultVideoIndex() {
  const all = manifest.videos.map((v, i) => ({ v, i }));
  const mergeable = all.filter(x => canMerge(x.v));
  const pool = mergeable.length ? mergeable : all;
  if (!pool.length) return 0;
  const fits = pool.find(x => (x.v.height || 0) <= 1080);
  return (fits || pool[pool.length - 1]).i;
}

function defaultAudioIndex() {
  const want = lang === 'zh' ? 'zh' : 'en';
  const all = manifest.audios.map((a, i) => ({ a, i }));
  const same = all.filter(x => baseLanguage(x.a.language || x.a.name) === want);
  const pool = same.length ? same : all;
  const best = pool.find(x => canMerge(x.a)) || pool[0];
  return best ? best.i : 0;
}

function showChooser(url) {
  $('loading').hidden = true;
  $('chooser').hidden = false;
  for (const id of ['videoSelect', 'audioSelect', 'videoField', 'audioField']) $(id);
  if (!manifest.videos.length) $('videoField').remove();
  if (!manifest.audios.length) $('audioField').remove();
  $('videoListField').hidden = !manifest.videos.length;
  $('audioListField').hidden = !manifest.audios.length;
  $('videoOnlyButton').hidden = !manifest.videos.length;
  $('audioOnlyButton').hidden = !manifest.audios.length;
  renderOptions();
  $('videoSelect').selectedIndex = manifest.videos.length ? defaultVideoIndex() : -1;
  $('audioSelect').selectedIndex = manifest.audios.length ? defaultAudioIndex() : -1;
  renderOptions();
  const base = params.filename || params.title || '';
  $('filenameInput').value = cleanName(base, 'mp4');
  const link = $('manifestLink');
  link.href = url; link.textContent = url;
  $('advancedToggle').hidden = false;
  selectionChanged();
}

// Everything that depends on the current picture / sound choice.
function selectionChanged() {
  renderSummary();
  renderLists();
  renderCombo();
  checkPermissions();
}

function selectionMergeable() {
  const { video, audio } = selectedTracks();
  const list = [video, audio].filter(Boolean);
  return list.length > 0 && list.every(canMerge);
}

function renderCombo() {
  const { video, audio } = selectedTracks();
  const separate = !!(video && audio) && !selectionMergeable();
  $('comboNote').hidden = !separate;
  if (separate) say($('comboNote'), 'comboSeparate'); else say($('comboNote'), null);
  say($('downloadButton'), separate ? 'downloadSeparate' : 'download');
}

/* Segments on sites the extension may not reach (spec v2 R4). */
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
  const { video, audio } = selectedTracks();
  const urls = [video, audio].filter(Boolean).flatMap(tr => tr.segments.map(s => s.url));
  const ticket = ++permissionCheck;
  const missing = await missingPatterns(urls);
  if (ticket !== permissionCheck) return;
  permission.missing = missing.map(m => m.pattern);
  permission.hosts = [...new Set(missing.map(m => m.host))];
  renderPermission();
}

function renderPermission() {
  const need = permission.missing.length > 0;
  $('permNote').hidden = !need;
  $('permButton').hidden = !need;
  if (need) say($('permNote'), 'needAccess', () => permission.hosts.join(t('listSep'))); else say($('permNote'), null);
  const busy = job && job.state === 'running';
  $('downloadButton').disabled = need;
  for (const id of ['videoOnlyButton', 'audioOnlyButton']) $(id).disabled = need || !!busy;
}

// Must be called straight from the click so Chrome accepts the request.
function requestAccess(patterns, after) {
  if (!patterns.length) return;
  let pending;
  try { pending = chrome.permissions.request({ origins: patterns }); } catch (e) { console.warn(e); return; }
  Promise.resolve(pending).then(granted => { if (granted) after(); }, e => console.warn(e));
}

function renderOptions() {
  const vs = $('videoSelect'), as = $('audioSelect');
  const keepV = vs.selectedIndex, keepA = as.selectedIndex;
  const chosenAudio = manifest.audios[keepA] || null;
  vs.replaceChildren(...manifest.videos.map((v, i) => {
    const parts = [];
    if (v.width && v.height) parts.push(`${v.width}×${v.height}`);
    else parts.push(v.name || t('trackFallback', i + 1));
    if (v.format) parts.push(v.format);
    if (v.bandwidth) parts.push(formatRate(v.bandwidth));
    const fps = formatFps(v.fps);
    if (fps) parts.push(fps);
    const size = estimate(v) + estimate(chosenAudio);
    if (size > 0) parts.push(t('sizeAbout', formatSize(size)));
    return new Option(parts.join(' · '), String(i));
  }));
  as.replaceChildren(...manifest.audios.map((a, i) => {
    // mpd-parser names an unlabeled, language-less group "main"; that is not a real name.
    const name = a.name && !(a.name === 'main' && !a.language) && !/^\d+$/.test(a.name) ? a.name : '';
    const parts = [languageName(a.language) || name || t('soundFallback', i + 1)];
    if (a.format) parts.push(a.format);
    if (a.bandwidth) parts.push(formatRate(a.bandwidth, true));
    return new Option(parts.join(' · '), String(i));
  }));
  if (keepV >= 0 && keepV < manifest.videos.length) vs.selectedIndex = keepV;
  if (keepA >= 0 && keepA < manifest.audios.length) as.selectedIndex = keepA;
}

function selectedTracks() {
  if (!manifest) return { video: null, audio: null };
  const vi = $('videoSelect').selectedIndex, ai = $('audioSelect').selectedIndex;
  return { video: manifest.videos[vi] || null, audio: manifest.audios[ai] || null };
}

const mediaCount = tr => (tr ? tr.segments.filter(s => !s.init).length : 0);
const estimate = tr => (tr ? (tr.bandwidth * (manifest.duration || tr.duration)) / 8 : 0);

// A track that is one complete file (no segment list, or byte ranges of a single address).
const isWholeFile = tr => !!tr && new Set(tr.segments.map(s => s.url)).size === 1;

function formatSize(bytes) {
  const mb = bytes / 1024 ** 2;
  if (mb < 1) return '1 MB';
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  return Math.round(mb) + ' MB';
}

function renderSummary() {
  const { video, audio } = selectedTracks();
  const segmented = [video, audio].filter(tr => tr && !isWholeFile(tr));
  if (segmented.length) say($('summary'), 'summary', segmented.reduce((s, tr) => s + mediaCount(tr), 0), formatClock(manifest.duration));
  else say($('summary'), 'summaryWhole', formatClock(manifest.duration));
  const big = estimate(video) + estimate(audio) > 2 * 1024 ** 3;
  $('sizeWarning').hidden = !big;
  if (big) say($('sizeWarning'), 'tooLarge');
}

function addressLines(tr) {
  if (!tr) return '';
  const lines = [];
  for (const s of tr.segments) if (lines[lines.length - 1] !== s.url) lines.push(s.url);
  return lines.join('\n');
}

function renderLists() {
  const { video, audio } = selectedTracks();
  $('videoList').value = addressLines(video);
  $('audioList').value = addressLines(audio);
}

/* ------------------------------------------------------------------ 下载 */

async function fetchSegment(seg, signal) {
  const headers = {};
  if (seg.range) headers.Range = `bytes=${seg.range.start}-${seg.range.end}`;
  const response = await fetch(seg.url, { headers, signal, credentials: 'include', cache: 'no-store' });
  if (!response.ok) { const e = new Error('HTTP ' + response.status); e.status = response.status; throw e; }
  let buffer = await response.arrayBuffer();
  if (seg.range) {
    const want = seg.range.end - seg.range.start + 1;
    if (response.status === 200 && buffer.byteLength > want) buffer = buffer.slice(seg.range.start, seg.range.end + 1);
    if (buffer.byteLength !== want) throw new Error('short range');
  }
  return buffer;
}

const RETRY_DELAYS = [500, 1000, 1500];
const PARALLEL = 6;

function trackFileExt(track) {
  if (track.container === 'webm') return 'webm';
  return track.kind === 'audio' ? 'm4a' : 'mp4';
}

// After failed segments: offer access when network errors hit sites without permission (spec v2 R4).
async function offerJobAccess(current) {
  const urls = current.tracks.flatMap(x => [...x.netFailed].map(i => x.track.segments[i].url));
  if (!urls.length) return;
  const missing = await missingPatterns(urls);
  if (job !== current || current.state !== 'failedSegments' || !missing.length) return;
  current.missing = missing.map(m => m.pattern);
  const note = $('jobPermNote');
  note.hidden = false;
  say(note, 'needAccess', [...new Set(missing.map(m => m.host))].join(t('listSep')));
  $('jobPermButton').hidden = false;
}

class Job {
  constructor(mode) {
    const { video, audio } = selectedTracks();
    this.mode = mode; // 'both' | 'video' | 'audio'
    this.tracks = [];
    if (video && mode !== 'audio') this.tracks.push({ track: video, parts: new Array(video.segments.length), failed: new Set(), netFailed: new Set(), done: 0 });
    if (audio && mode !== 'video') this.tracks.push({ track: audio, parts: new Array(audio.segments.length), failed: new Set(), netFailed: new Set(), done: 0 });
    this.controller = new AbortController();
    this.bytes = 0;
    this.stopped = false;
    this.downloadId = null;
    this.blobUrls = [];
    const est = this.tracks.map(x => estimate(x.track) || 1);
    const sum = est.reduce((a, b) => a + b, 0) || 1;
    this.tracks.forEach((x, i) => { x.share = 95 * est[i] / sum; });
    this.baseName = $('filenameInput').value;
  }

  get percent() {
    let p = 0;
    for (const x of this.tracks) p += x.share * (x.done / Math.max(1, x.track.segments.length));
    return p;
  }

  async downloadTrack(entry, indexes) {
    const signal = this.controller.signal;
    const queue = indexes.slice();
    const worker = async () => {
      while (queue.length && !this.stopped) {
        const i = queue.shift();
        const seg = entry.track.segments[i];
        let attempt = 0;
        for (;;) {
          try {
            const buffer = await fetchSegment(seg, signal);
            if (this.stopped) return;
            entry.parts[i] = buffer;
            entry.failed.delete(i);
            entry.netFailed.delete(i);
            entry.done++;
            this.bytes += buffer.byteLength;
            updateProgress();
            break;
          } catch (e) {
            if (this.stopped || signal.aborted) return;
            if (isOutOfMemory(e)) throw e;
            if (attempt >= RETRY_DELAYS.length) { entry.failed.add(i); if (e instanceof TypeError) entry.netFailed.add(i); else entry.netFailed.delete(i); break; }
            await sleep(RETRY_DELAYS[attempt++]);
            if (this.stopped) return;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  }

  release() {
    for (const x of this.tracks) x.parts = [];
    for (const u of this.blobUrls) URL.revokeObjectURL(u);
    this.blobUrls = [];
  }
}

function failedCount() {
  return job ? job.tracks.reduce((s, x) => s + x.failed.size, 0) : 0;
}

function lockInputs(locked) {
  for (const id of ['videoSelect', 'audioSelect', 'filenameInput', 'videoOnlyButton', 'audioOnlyButton']) $(id).disabled = locked;
  if (!locked) renderPermission();
}

function setStage(key) { say($('stage'), key); }

function updateProgress(forced) {
  if (!job) return;
  const pct = Math.max(0, Math.min(100, Math.floor(forced ?? job.percent)));
  job.lastPercent = pct;
  $('barFill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', String(pct));
  $('percent').textContent = pct + '%';
  say($('received'), 'received', formatBytes(job.bytes));
  progressText = pct + '%';
  renderTitle();
}

function renderTitle() {
  if (finishedTitle) document.title = t('stageDone');
  else if (progressText) document.title = progressText + ' · ' + t('pageName');
  else document.title = t('pageName');
}

function showJobMessage(key, ...args) {
  const el = $('jobMessage');
  $('jobDetail').hidden = true; say($('jobDetail'), null);
  $('jobPermNote').hidden = true; $('jobPermButton').hidden = true;
  if (!key) { el.hidden = true; say(el, null); return; }
  el.hidden = false;
  el.classList.toggle('error', key !== 'separateSaved');
  say(el, key, ...args);
}

function setButtons(state) {
  // state: running | stopped | failedSegments | done
  const stop = $('stopButton');
  stop.hidden = state === 'done';
  say(stop, state === 'running' ? 'stop' : 'restart');
  $('retryFailedButton').hidden = state !== 'failedSegments';
  $('showFileButton').hidden = state !== 'done';
}

async function startJob(mode) {
  if (job && !job.stopped && job.state === 'running') return;
  if (job) { job.stopped = true; job.controller.abort(); job.release(); }
  if (permission.missing.length) return;
  const current = new Job(mode);
  if (!current.tracks.length) return;
  job = current;
  job.state = 'running';
  finishedTitle = false;
  $('startArea').hidden = true;
  $('progressArea').hidden = false;
  showJobMessage(null);
  lockInputs(true);
  setButtons('running');
  updateProgress(0);
  await allowOrigins(current.tracks.flatMap(x => x.track.segments.map(s => s.url)));
  await runDownloads(current, null);
}

async function runDownloads(current, onlyFailed) {
  try {
    for (const entry of current.tracks) {
      if (current.stopped) return;
      const indexes = onlyFailed ? [...entry.failed] : entry.track.segments.map((_, i) => i);
      if (!indexes.length) continue;
      setStage(entry.track.kind === 'video' ? 'stageVideo' : 'stageAudio');
      await current.downloadTrack(entry, indexes);
    }
    if (current.stopped) return;
    const failed = failedCount();
    if (failed) {
      current.state = 'failedSegments';
      showJobMessage('failedSegments', failed);
      setButtons('failedSegments');
      lockInputs(false);
      offerJobAccess(current);
      return;
    }
    await finishJob(current);
  } catch (e) {
    if (current.stopped) return;
    console.error(e);
    failJob(current, isOutOfMemory(e) ? 'outOfMemory' : 'mergeFailed');
  }
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
}

async function retryFailed() {
  if (!job || job.state !== 'failedSegments') return;
  const current = job;
  current.state = 'running';
  showJobMessage(null);
  lockInputs(true);
  setButtons('running');
  await runDownloads(current, true);
}

async function stopJob() {
  if (!job) return;
  if (job.state === 'running') {
    const current = job;
    current.stopped = true;
    current.state = 'stopped';
    current.controller.abort();
    if (current.downloadId != null) {
      try { await chrome.downloads.cancel(current.downloadId); } catch (_) { /* already gone */ }
      try { await chrome.downloads.erase({ id: current.downloadId }); } catch (_) { /* ignore */ }
    }
    current.release();
    setStage('stageStopped');
    setButtons('stopped');
    lockInputs(false);
    clearHeaderRules();
    progressText = null;
    renderTitle();
  } else {
    // 重新下载
    startJob(job.mode);
  }
}

/* ------------------------------------------------------------------ 保存 */

let saveAsSetting = false;

function saveBlob(current, blob, filename) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    current.blobUrls.push(url);
    let id = null, settled = false;
    const listener = delta => {
      if (delta.id !== id || settled) return;
      if (delta.state && delta.state.current === 'complete') { settled = true; chrome.downloads.onChanged.removeListener(listener); resolve(id); }
      else if (delta.state && delta.state.current === 'interrupted') {
        settled = true; chrome.downloads.onChanged.removeListener(listener);
        const reason = (delta.error && delta.error.current) || 'interrupted';
        reject(Object.assign(new Error(reason), { saveError: true, userCanceled: reason === 'USER_CANCELED' }));
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    chrome.downloads.download({ url, filename: saveAsSetting ? filename : 'Ruxget/' + filename, saveAs: !!saveAsSetting, conflictAction: 'uniquify' }).then(newId => {
      id = newId;
      current.downloadId = newId;
      if (current.stopped) { chrome.downloads.cancel(newId).catch(() => {}); }
      chrome.downloads.search({ id: newId }).then(([item]) => {
        if (settled || !item) return;
        if (item.state === 'complete') { settled = true; chrome.downloads.onChanged.removeListener(listener); resolve(id); }
        else if (item.state === 'interrupted') { settled = true; chrome.downloads.onChanged.removeListener(listener); reject(Object.assign(new Error(item.error || 'interrupted'), { saveError: true })); }
      });
    }, error => {
      chrome.downloads.onChanged.removeListener(listener);
      reject(Object.assign(new Error((error && error.message) || String(error)), { saveError: true }));
    });
  });
}

async function finishJob(current) {
  current.state = 'running';
  setStage('stageMerge');
  updateProgress(95);
  await sleep(0);
  const files = [];
  const mergeable = current.tracks.every(x => canMerge(x.track));
  let mergeFallback = false;

  // Raw tracks, each in its real container (spec v2 R3).
  const separateFiles = () => {
    const separate = current.tracks.length > 1;
    const stem = cleanName(current.baseName, 'x').replace(/\.x$/, '');
    return current.tracks.map(x => {
      const base = stem + (separate ? t(x.track.kind === 'video' ? 'suffixVideo' : 'suffixAudio') : '');
      const type = x.track.mime || (x.track.container === 'webm' ? x.track.kind + '/webm' : x.track.kind + '/mp4');
      return { blob: new Blob(x.parts, { type }), name: cleanName(base, trackFileExt(x.track)) };
    });
  };

  if (mergeable) {
    let blob = null;
    try {
      blob = await buildMp4(current.tracks.map(x => ({ kind: x.track.kind, parts: x.parts })), manifest.duration);
    } catch (e) {
      if (current.stopped) return;
      console.error(e);
      if (isOutOfMemory(e)) return failJob(current, 'outOfMemory');
      // Keep what was downloaded: save the tracks as they are (spec v2 R2).
      mergeFallback = current.tracks.length > 1;
    }
    if (blob) files.push({ blob, name: cleanName(current.baseName, current.mode === 'audio' ? 'm4a' : 'mp4') });
    else files.push(...separateFiles());
  } else {
    files.push(...separateFiles());
  }
  if (current.stopped) return;
  for (const x of current.tracks) x.parts = [];

  setStage('stageSave');
  updateProgress(97);
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
    return;
  }
  if (current.stopped) return;
  current.state = 'done';
  current.savedId = lastId;
  current.release();
  clearHeaderRules();
  setStage('stageDone');
  updateProgress(100);
  finishedTitle = true;
  renderTitle();
  if (mergeFallback) showJobMessage('mergeFailedSeparate');
  else if (!mergeable && current.tracks.length > 1) showJobMessage('separateSaved');
  setButtons('done');
  lockInputs(false);
}

/* ------------------------------------------------------------------ MP4 合成 */

// Parse one track (initialization segment + media segments) with mp4box.js and return its sample table.
function readTrack(parts) {
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
  const trak = file.moov.traks[0];
  const stsd = trak.mdia.minf.stbl.stsd;
  const entry = stsd.entries[0];
  const type = entry && entry.type;
  if (!type || /^(enc[avts]|drms|drmi)$/i.test(type)) throw new Error('unsupported sample entry ' + type);
  const handler = trak.mdia.hdlr.handler;
  // The sample description is copied as-is from the initialization data.
  const first = parts[0];
  if (stsd.start + stsd.size > first.byteLength) throw new Error('stsd outside first part');
  const stsdBytes = new Uint8Array(first, stsd.start, stsd.size).slice();
  const samples = trak.samples.map(s => ({ offset: s.offset, size: s.size, dts: s.dts, cts: s.cts, duration: s.duration, sync: !!s.is_sync, desc: (s.description_index || 0) + 1 }));
  if (!samples.length) throw new Error('no samples');
  const elst = trak.edts && trak.edts.elst && trak.edts.elst.entries ? trak.edts.elst.entries : [];
  const mediaEdit = elst.find(e => Number(e.media_time) >= 0);
  return {
    handler, type, stsdBytes, samples, parts, starts,
    timescale: trak.mdia.mdhd.timescale,
    language: trak.mdia.mdhd.language || 0x55c4,
    width: trak.tkhd.width, height: trak.tkhd.height,
    sourceMediaTime: mediaEdit ? Number(mediaEdit.media_time) : null
  };
}

// Locate the bytes of a sample in the downloaded parts.
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

// Build a regular (non-fragmented) MP4 from one or two tracks, moov in front, samples interleaved about once a second.
async function buildMp4(inputs, expectedDuration) {
  const tracks = inputs.map(input => {
    const tr = readTrack(input.parts);
    tr.kind = input.kind;
    return tr;
  });
  const MOVIE_TS = 1000;

  for (const tr of tracks) {
    const dts0 = tr.samples[0].dts;
    tr.dts0 = dts0;
    tr.mediaDuration = tr.samples.reduce((s, x) => s + x.duration, 0);
    const minCts = tr.samples.reduce((m, x) => Math.min(m, x.cts), Infinity);
    if (dts0 === 0 && tr.sourceMediaTime != null) tr.mediaTime = tr.sourceMediaTime;
    else tr.mediaTime = Math.max(0, minCts - dts0);
    tr.startSeconds = dts0 > 0 ? dts0 / tr.timescale : 0;
  }
  const earliest = Math.min(...tracks.map(tr => tr.startSeconds));
  for (const tr of tracks) {
    tr.delayMs = Math.round((tr.startSeconds - earliest) * MOVIE_TS);
    if (tr.delayMs < 2) tr.delayMs = 0;
    // Presentation ends at the last composition time, not the last decode time (B-frames shift them).
    const endCts = tr.samples.reduce((m, x) => Math.max(m, x.cts + x.duration), 0) - tr.dts0;
    tr.presentMs = Math.max(0, Math.round((Math.max(endCts, tr.mediaDuration) - tr.mediaTime) / tr.timescale * MOVIE_TS));
    tr.totalMs = tr.delayMs + tr.presentMs;

    // Chunks of about one second of samples, contiguous runs merged into as few slices as possible.
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
  const allChunks = tracks.flatMap(tr => tr.chunks).sort((a, b) => a.time - b.time || (a.track.kind === 'video' ? -1 : 1));
  const mdatPayload = allChunks.reduce((s, c) => s + c.size, 0);
  const movieMs = Math.max(...tracks.map(tr => tr.totalMs));

  const ftyp = box('ftyp', new Writer().ascii('isom').u32(0x200).ascii('isom').ascii('iso2').ascii('avc1').ascii('mp41').join());

  const buildMoov = (offsets, wide) => {
    const mvhd = fullBox('mvhd', 0, 0, w => {
      w.u32(0).u32(0).u32(MOVIE_TS).u32(movieMs).u32(0x10000).u16(0x100).zeros(10);
      MATRIX.forEach(m => w.u32(m));
      w.zeros(24).u32(tracks.length + 1);
    });
    const traks = tracks.map((tr, index) => {
      const video = tr.handler === 'vide';
      const tkhd = fullBox('tkhd', 0, 3, w => {
        w.u32(0).u32(0).u32(index + 1).u32(0).u32(tr.totalMs).zeros(8).u16(0).u16(0).u16(video ? 0 : 0x100).u16(0);
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
      const hdlr = fullBox('hdlr', 0, 0, w => w.u32(0).ascii(video ? 'vide' : (tr.handler || 'soun')).zeros(12).ascii(video ? 'VideoHandler' : 'SoundHandler').u8(0));
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

  // First pass decides offset width, second pass writes the real offsets.
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

  // Check the result with mp4box.js before handing it to Chrome.
  await verifyHeader(ftyp, moov, tracks.length, expectedDuration, movieMs / MOVIE_TS);

  const pieces = [ftyp, moov, mdatHeader];
  for (const c of allChunks) for (const s of c.slices) pieces.push(new Uint8Array(c.track.parts[s.part], s.start, s.end - s.start));
  const blob = new Blob(pieces, { type: tracks.some(tr => tr.handler === 'vide') ? 'video/mp4' : 'audio/mp4' });
  if (blob.size !== ftyp.byteLength + moov.byteLength + mdatHeader.byteLength + mdatPayload) throw new Error('size mismatch');
  return blob;
}

function verifyHeader(ftyp, moov, trackCount, expectedDuration, builtSeconds) {
  return new Promise((resolve, reject) => {
    const file = createFile();
    let info = null;
    file.onReady = i => { info = i; };
    file.onError = e => reject(new Error('verify: ' + e));
    const head = new Uint8Array(ftyp.byteLength + moov.byteLength);
    head.set(ftyp, 0); head.set(moov, ftyp.byteLength);
    const ab = head.buffer;
    ab.fileStart = 0;
    try { file.appendBuffer(ab); file.flush(); } catch (e) { return reject(e); }
    if (!info) return reject(new Error('verify: not readable'));
    if (info.tracks.length !== trackCount) return reject(new Error('verify: track count ' + info.tracks.length));
    const seconds = info.duration / info.timescale;
    if (Math.abs(seconds - builtSeconds) > 0.01) return reject(new Error('verify: duration mismatch'));
    if (expectedDuration > 0 && Math.abs(seconds - expectedDuration) > 2) return reject(new Error('verify: duration ' + seconds + ' vs ' + expectedDuration));
    for (const tr of info.tracks) if (!tr.nb_samples) return reject(new Error('verify: empty track'));
    resolve();
  });
}

/* ------------------------------------------------------------------ 手动表单 */

function showForm() {
  $('formCard').hidden = false;
  $('mainCard').hidden = true;
  $('manualForm').addEventListener('submit', event => {
    event.preventDefault();
    const url = $('manifestInput').value.trim();
    const source = $('sourceInput').value.trim();
    const msg = $('formMessage');
    if (!/^https?:\/\/\S+$/i.test(url) || (source && !/^https?:\/\/\S+$/i.test(source))) {
      msg.hidden = false; say(msg, 'needHttp'); return;
    }
    msg.hidden = true;
    params.url = url;
    params.textKey = '';
    params.headers = source ? { Referer: source } : {};
    loadManifest(url);
  });
}

/* ------------------------------------------------------------------ 启动 */

function bindEvents() {
  $('advancedToggle').addEventListener('click', () => {
    advancedOpen = !advancedOpen;
    $('advancedCard').hidden = !advancedOpen;
    $('advancedToggle').textContent = t(advancedOpen ? 'hideAdvanced' : 'showAdvanced');
    $('advancedToggle').setAttribute('aria-expanded', String(advancedOpen));
  });
  const changed = () => { resetFinishedJob(); renderOptions(); selectionChanged(); };
  $('videoSelect').addEventListener('change', changed);
  $('audioSelect').addEventListener('change', changed);
  $('downloadButton').addEventListener('click', () => startJob('both'));
  $('videoOnlyButton').addEventListener('click', () => startJob('video'));
  $('audioOnlyButton').addEventListener('click', () => startJob('audio'));
  $('stopButton').addEventListener('click', stopJob);
  $('retryFailedButton').addEventListener('click', retryFailed);
  $('permButton').addEventListener('click', () => requestAccess(permission.missing.slice(), () => { allowOriginsAgain(); checkPermissions(); }));
  $('jobPermButton').addEventListener('click', () => requestAccess((job && job.missing) || [], () => { allowOriginsAgain(); $('jobPermNote').hidden = true; $('jobPermButton').hidden = true; }));
  $('filenameInput').addEventListener('input', resetFinishedJob);
  $('showFileButton').addEventListener('click', () => { if (job && job.savedId != null) chrome.downloads.show(job.savedId); });
  $('copyButton').addEventListener('click', async () => {
    const text = [$('videoList').value, $('audioList').value].filter(Boolean).join('\n');
    const msg = $('advancedMessage');
    msg.hidden = false;
    try { await navigator.clipboard.writeText(text); say(msg, 'copied'); } catch (_) { say(msg, 'copyFailed'); }
  });
  addEventListener('pagehide', () => {
    if (job) { job.stopped = true; job.controller.abort(); job.release(); }
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
  if (!/^https?:\/\//i.test(params.url)) { showForm(); $('manifestInput').value = params.url; const m = $('formMessage'); m.hidden = false; say(m, 'needHttp'); return; }
  loadManifest(params.url);
}

init();
