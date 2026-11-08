// Ruxget 网盘适配器：阿里云盘（www.alipan.com）。在网页主世界运行，通过 Ruxget 转发接口请求。
(function () {
  'use strict';
  var existing = globalThis.ShiyingNetdiskPage;
  if (existing && existing.__aliyunLoaded) return;

  var MAX_FILES = 100, MAX_DEPTH = 10, PARALLEL = 4, TIMEOUT_MS = 25000, MAX_REQUESTS = 120;
  var USER_API = 'https://user.aliyundrive.com/v2/user/get';
  var LIST_API = 'https://api.aliyundrive.com/adrive/v3/file/list';
  var URL_API = 'https://api.aliyundrive.com/v2/file/get_download_url';

  var MSG = {
    share: '请先把分享的文件保存到自己的阿里云盘，再在网盘里用 Ruxget 下载',
    view: '请在“全部文件”中选择要下载的文件',
    login: '请先登录阿里云盘，再点 Ruxget 下载',
    nothing: '请先选中要下载的文件或文件夹',
    expired: '阿里云盘登录已过期，请刷新页面后重试',
    noUrl: '未能获取下载地址，请刷新页面后重试',
    limit: '一次最多下载 100 个文件，其余请分批下载'
  };

  function Fail(message) { this.message = message; }

  function readToken() {
    try {
      var t = JSON.parse(localStorage.getItem('token'));
      if (t && t.access_token && t.device_id) return { access: String(t.access_token), device: String(t.device_id) };
    } catch (e) { /* 读不到按未登录处理 */ }
    return null;
  }

  // 返回 call(url, body)：经 Ruxget 转发，成功时给出接口的 JSON 数据，失败以 Fail 抛出。
  function createCaller(intent, token) {
    var seq = 0;
    var headers = {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + token.access,
      'x-device-id': token.device
    };
    return function call(url, bodyObject) {
      if (seq >= MAX_REQUESTS) return Promise.reject(new Fail('请求次数过多，请分批下载'));
      var id = ++seq;
      return new Promise(function (resolve, reject) {
        var timer;
        function onMessage(event) {
          var d = event.data;
          if (event.source !== window || event.origin !== location.origin) return;
          if (!d || d.channel !== 'shiying-netdisk-reply' || d.intent !== intent || d.id !== id) return;
          window.removeEventListener('message', onMessage);
          clearTimeout(timer);
          if (!d.ok) return reject(new Fail(d.error || '网盘请求失败，请刷新页面后重试'));
          var v = d.value || {}, data = v.data;
          var code = data && data.code ? String(data.code) : '';
          if (v.status === 401 || code.indexOf('AccessToken') >= 0) return reject(new Fail(MSG.expired));
          if ((v.status && v.status !== 200) || code) {
            return reject(new Fail('阿里云盘返回错误：' + ((data && (data.message || data.code)) || ('HTTP ' + v.status))));
          }
          resolve(data || {});
        }
        timer = setTimeout(function () {
          window.removeEventListener('message', onMessage);
          reject(new Fail('网盘请求超时，请刷新页面后重试'));
        }, TIMEOUT_MS);
        window.addEventListener('message', onMessage);
        window.postMessage({
          channel: 'shiying-netdisk-request', intent: intent, id: id, action: 'api',
          payload: { url: url, method: 'POST', body: JSON.stringify(bodyObject), headers: headers }
        }, location.origin);
      });
    };
  }

  // 当前文件夹的 file_id；不是“全部文件”视图时返回 null。
  function currentFolder() {
    var parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'drive' || parts[1] !== 'file' || parts[2] !== 'all') return null;
    if (parts.length === 3) return 'root';
    return decodeURIComponent(parts[parts.length - 1]);
  }

  // 页面上每张卡片的名称与是否选中（按页面顺序）。
  function readCards() {
    var out = [];
    var nodes = document.querySelectorAll('[data-is-selected]');
    for (var i = 0; i < nodes.length; i++) {
      var titleEl = nodes[i].querySelector('[class^="title--"], [class*=" title--"]');
      out.push({
        name: titleEl ? titleEl.textContent.trim() : '',
        selected: nodes[i].getAttribute('data-is-selected') === 'true'
      });
    }
    return out;
  }

  // 列出文件夹内容，翻页读取；maxItems 非 0 时累计够数就停。
  async function listFolder(call, driveId, parentId, maxItems) {
    var items = [], marker = '';
    for (var page = 0; page < 200; page++) {
      var body = {
        drive_id: driveId, parent_file_id: parentId, limit: 100, all: false, fields: '*',
        order_by: 'updated_at', order_direction: 'DESC'
      };
      if (marker) body.marker = marker;
      var data = await call(LIST_API, body);
      var got = Array.isArray(data.items) ? data.items : [];
      for (var i = 0; i < got.length; i++) items.push(got[i]);
      marker = data.next_marker || '';
      if (!marker || (maxItems && items.length >= maxItems)) break;
    }
    return items;
  }

  async function run(intent) {
    var folder = currentFolder();
    if (folder === null) return { ok: false, error: MSG.view };
    var token = readToken();
    if (!token) return { ok: false, error: MSG.login };

    var cards = readCards();
    if (!cards.some(function (c) { return c.selected; })) return { ok: false, error: MSG.nothing };

    var call = createCaller(intent, token);
    var user = await call(USER_API, {});
    var driveId = user.resource_drive_id || user.default_drive_id;
    if (!driveId) return { ok: false, error: MSG.noUrl };

    var listing = await listFolder(call, driveId, folder, 0);

    // 按名称对应；同名时第 n 张同名卡片对应列表中第 n 个同名项。
    var seen = {}, chosen = [];
    cards.forEach(function (c) {
      var n = seen[c.name] || 0;
      seen[c.name] = n + 1;
      if (!c.selected) return;
      var k = 0;
      for (var i = 0; i < listing.length; i++) {
        if (listing[i].name !== c.name) continue;
        if (k++ === n) { chosen.push(listing[i]); return; }
      }
    });
    if (!chosen.length) return { ok: false, error: MSG.nothing };

    // 逐层展开文件夹（最多 10 层）；多读一个文件即可判断是否超过上限。
    var files = [], truncated = false;
    var queue = chosen.map(function (it) { return { item: it, path: '', depth: 0 }; });
    while (queue.length) {
      var cur = queue.shift();
      if (cur.item.type === 'folder') {
        if (cur.depth >= MAX_DEPTH) continue;
        var sub = await listFolder(call, driveId, cur.item.file_id, MAX_FILES + 1);
        var base = cur.path ? cur.path + '/' + cur.item.name : cur.item.name;
        for (var j = 0; j < sub.length; j++) queue.push({ item: sub[j], path: base, depth: cur.depth + 1 });
      } else {
        if (files.length >= MAX_FILES) { truncated = true; break; }
        files.push({ item: cur.item, path: cur.path });
      }
    }

    // 逐个取下载地址，同时最多 PARALLEL 个请求。
    var urls = new Array(files.length), next = 0;
    async function worker() {
      while (next < files.length) {
        var idx = next++;
        var data = await call(URL_API, { drive_id: driveId, file_id: files[idx].item.file_id });
        urls[idx] = data && typeof data.url === 'string' && /^https:\/\//.test(data.url) ? data.url : '';
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(PARALLEL, files.length); w++) workers.push(worker());
    await Promise.all(workers);

    var out = [], missing = 0;
    files.forEach(function (f, i) {
      if (!urls[i]) { missing++; return; }
      var entry = {
        url: urls[i], title: String(f.item.name).slice(0, 512), key: f.item.file_id, path: f.path,
        headers: { 'User-Agent': navigator.userAgent, 'Referer': location.origin + '/' }
      };
      if (typeof f.item.size === 'number') entry.size = f.item.size;
      out.push(entry);
    });
    if (!out.length) return { ok: false, error: MSG.noUrl };

    var warnings = [];
    if (truncated) warnings.push(MSG.limit);
    if (missing) warnings.push('有 ' + missing + ' 个文件未能获取下载地址');
    var result = { ok: true, files: out };
    if (warnings.length) result.warning = warnings.join('；');
    return result;
  }

  async function resolve(intent, provider) {
    try {
      if (provider !== 'aliyun') return { ok: false, error: '不支持的网盘' };
      if (location.pathname.indexOf('/s/') === 0) return { ok: false, error: MSG.share };
      return await run(intent);
    } catch (e) {
      return { ok: false, error: e instanceof Fail ? e.message : '阿里云盘处理失败，请刷新页面后重试' };
    }
  }

  var api = globalThis.ShiyingNetdiskPage;
  if (api && typeof api.resolve === 'function') {
    // 页面上已有别的适配器：按 provider 分派，不覆盖。
    var old = api.resolve;
    api.resolve = function (intent, provider, values) {
      return provider === 'aliyun' ? resolve(intent, provider) : old.call(api, intent, provider, values);
    };
    api.__aliyunLoaded = true;
  } else {
    globalThis.ShiyingNetdiskPage = { resolve: resolve, __aliyunLoaded: true };
  }
})();
