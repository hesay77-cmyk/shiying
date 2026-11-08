(function () {
  'use strict';
  var API = 'https://api-pan.xunlei.com';
  var MAX_FILES = 100, MAX_DEPTH = 10, MAX_REQUESTS = 120, WAIT_MS = 25000, PARALLEL = 4;

  function fail(error) { return { ok: false, error: error }; }
  function Stop(message) { this.message = message; }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  // Reads login data from localStorage; returns {headers} or {error}.
  function readLogin() {
    var keys = [], i, k;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (k && k.indexOf('credentials_') === 0) keys.push(k.slice('credentials_'.length));
      }
    } catch (e) { keys = []; }
    var clientId = '';
    for (i = 0; i < keys.length; i++) {
      if (localStorage.getItem('captcha_' + keys[i]) !== null) { clientId = keys[i]; break; }
    }
    if (!clientId && keys.length) clientId = keys[0];
    var cred = clientId ? readJson('credentials_' + clientId) : null;
    var access = cred && typeof cred.access_token === 'string' ? cred.access_token : '';
    if (!access) return { error: '请先登录迅雷云盘，再点 Ruxget 下载' };
    var cap = readJson('captcha_' + clientId);
    var captcha = cap && typeof cap.token === 'string' ? cap.token : '';
    var m = /^wdi10\.([0-9a-f]{32})/.exec(localStorage.getItem('deviceid') || '');
    if (!captcha || !m) return { error: '迅雷云盘登录信息不完整，请刷新页面后重试' };
    return {
      headers: {
        'authorization': 'Bearer ' + access,
        'x-captcha-token': captcha,
        'x-client-id': clientId,
        'x-device-id': m[1]
      }
    };
  }

  function createClient(intent, headers) {
    var counter = 0;
    function send(url) {
      return new Promise(function (resolve, reject) {
        if (counter >= MAX_REQUESTS) { reject(new Stop('请求次数过多，请减少所选内容后重试')); return; }
        var id = ++counter, done = false;
        function finish(fn, val) {
          if (done) return;
          done = true;
          window.removeEventListener('message', onMessage);
          clearTimeout(timer);
          fn(val);
        }
        function onMessage(event) {
          var d = event.data;
          if (event.source !== window || event.origin !== location.origin) return;
          if (!d || d.channel !== 'shiying-netdisk-reply' || d.intent !== intent || d.id !== id) return;
          if (d.ok) finish(resolve, d.value || {});
          else finish(reject, new Stop(d.error || '请求失败，请刷新页面后重试'));
        }
        var timer = setTimeout(function () { finish(reject, new Stop('请求超时，请刷新页面后重试')); }, WAIT_MS);
        window.addEventListener('message', onMessage);
        window.postMessage({
          channel: 'shiying-netdisk-request', intent: intent, id: id, action: 'api',
          payload: { url: url, method: 'GET', headers: headers }
        }, location.origin);
      });
    }
    // Resolves with parsed data, or throws Stop with the mapped message.
    return function get(path) {
      return send(API + path).then(function (value) {
        var data = value.data, status = value.status;
        if (status === 200 || status === undefined) return data || {};
        var err = (data && data.error) || '', desc = (data && data.error_description) || '';
        if (status === 401 || err === 'unauthenticated' || /token/.test(err)) throw new Stop('迅雷云盘登录已过期，请刷新页面后重试');
        if (err === 'captcha_invalid' || /captcha/.test(err)) throw new Stop('迅雷云盘需要重新验证，请刷新页面后重试');
        throw new Stop('迅雷云盘返回错误：' + (desc || err));
      });
    };
  }

  // Runs worker over items with at most `limit` in flight; keeps result order.
  function mapLimit(items, limit, worker) {
    var results = new Array(items.length), next = 0, failed = null;
    function lane() {
      if (failed || next >= items.length) return Promise.resolve();
      var i = next++;
      return worker(items[i], i).then(function (r) { results[i] = r; return lane(); }, function (e) { failed = failed || { e: e }; });
    }
    var lanes = [], n = Math.min(limit, items.length);
    for (var j = 0; j < n; j++) lanes.push(lane());
    return Promise.all(lanes).then(function () { if (failed) throw failed.e; return results; });
  }

  function selectedIds() {
    var ids = [], rows = document.querySelectorAll('li[data-file-id]');
    for (var i = 0; i < rows.length; i++) {
      var box = rows[i].querySelector('input[type=checkbox]');
      var id = rows[i].getAttribute('data-file-id');
      if (box && box.checked && id) ids.push(id);
    }
    return ids;
  }

  function addressOf(detail) {
    if (detail.web_content_link) return detail.web_content_link;
    var l = detail.links && detail.links['application/octet-stream'];
    return (l && l.url) || '';
  }

  function isFolder(x) { return x && x.kind === 'drive#folder'; }

  function listFolder(get, folderId, limitCount) {
    var out = [];
    var filters = encodeURIComponent(JSON.stringify({ phase: { eq: 'PHASE_TYPE_COMPLETE' }, trashed: { eq: false } }));
    function page(token) {
      var path = '/drive/v1/files?parent_id=' + encodeURIComponent(folderId) + '&filters=' + filters +
        '&limit=100&with_audit=true' + (token ? '&page_token=' + encodeURIComponent(token) : '');
      return get(path).then(function (data) {
        out = out.concat(data.files || []);
        if (data.next_page_token && out.length < limitCount) return page(data.next_page_token);
        return out;
      });
    }
    return page('');
  }

  async function run(intent) {
    if (/^\/s\//.test(location.pathname)) return fail('请先把分享的文件保存到自己的迅雷云盘，再在网盘里用 Ruxget 下载');
    var login = readLogin();
    if (login.error) return fail(login.error);
    var ids = selectedIds();
    if (!ids.length) return fail('请先勾选要下载的文件或文件夹');
    var get = createClient(intent, login.headers);

    var details = await mapLimit(ids, PARALLEL, function (id) { return get('/drive/v1/files/' + encodeURIComponent(id)); });

    // Build the ordered file candidates (limit MAX_FILES + 1 to know whether more exist).
    var candidates = [], truncated = false;
    async function expand(folderId, prefix, depth) {
      if (depth > MAX_DEPTH) return;
      var items = await listFolder(get, folderId, MAX_FILES + 1);
      for (var i = 0; i < items.length; i++) {
        if (candidates.length > MAX_FILES) return;
        var it = items[i];
        if (isFolder(it)) await expand(it.id, prefix + '/' + it.name, depth + 1);
        else candidates.push({ id: it.id, name: it.name, size: it.size, path: prefix });
      }
    }
    for (var d = 0; d < details.length; d++) {
      if (candidates.length > MAX_FILES) break;
      var det = details[d];
      if (isFolder(det)) await expand(det.id, det.name, 1);
      else candidates.push({ id: det.id, name: det.name, size: det.size, path: '', detail: det });
    }
    if (candidates.length > MAX_FILES) { truncated = true; candidates.length = MAX_FILES; }

    var resolved = await mapLimit(candidates, PARALLEL, function (c) {
      if (c.detail) return Promise.resolve(c.detail);
      return get('/drive/v1/files/' + encodeURIComponent(c.id));
    });

    var files = [], missing = 0;
    var headers = { 'User-Agent': navigator.userAgent, 'Referer': location.origin + '/' };
    for (var k = 0; k < candidates.length; k++) {
      var c = candidates[k], det2 = resolved[k], url = addressOf(det2 || {});
      if (!url) { missing++; continue; }
      var file = { url: url, title: String(c.name || det2.name || c.id).slice(0, 512), key: c.id, path: c.path, headers: headers };
      var size = Number(c.size !== undefined ? c.size : det2.size);
      if (c.size !== undefined && c.size !== '' && isFinite(size) && size >= 0) file.size = size;
      files.push(file);
    }
    if (!files.length) return fail('未能获取下载地址，请刷新页面后重试');
    var warnings = [];
    if (missing) warnings.push('有 ' + missing + ' 个文件未能获取下载地址');
    if (truncated) warnings.push('一次最多下载 100 个文件，其余请分批下载');
    var result = { ok: true, files: files };
    if (warnings.length) result.warning = warnings.join('；');
    return result;
  }

  var existing = globalThis.ShiyingNetdiskPage;
  var previous = existing && typeof existing.resolve === 'function' ? existing.resolve.bind(existing) : null;
  function resolve(intent, provider, values) {
    if (provider !== 'xunlei') {
      return previous ? previous(intent, provider, values) : Promise.resolve(fail('不支持的网盘'));
    }
    return run(intent).catch(function (e) {
      return fail(e instanceof Stop ? e.message : '迅雷云盘处理失败，请刷新页面后重试');
    });
  }
  if (existing) existing.resolve = resolve;
  else globalThis.ShiyingNetdiskPage = { resolve: resolve };
})();
