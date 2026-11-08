(function () {
  'use strict';
  var API = 'https://api.123278.com';
  var MAX_FILES = 100, MAX_DEPTH = 10, MAX_REQUESTS = 120, TIMEOUT = 25000, PARALLEL = 4;
  if (globalThis.ShiyingNetdiskPage && globalThis.ShiyingNetdiskPage.__pan123) return;
  var previous = globalThis.ShiyingNetdiskPage && globalThis.ShiyingNetdiskPage.resolve;

  function Fail(message) { this.message = message; }
  var fail = function (m) { return new Fail(m); };

  function readToken() {
    var raw = '';
    try { raw = localStorage.getItem('authorToken') || ''; } catch (e) { raw = ''; }
    raw = String(raw).trim();
    if (raw.charAt(0) === '"') {
      try { var parsed = JSON.parse(raw); raw = typeof parsed === 'string' ? parsed.trim() : ''; } catch (e) { raw = ''; }
    }
    return raw;
  }

  function createBridge(intent) {
    var nextId = 0;
    return function call(payload) {
      return new Promise(function (resolve, reject) {
        if (nextId >= MAX_REQUESTS) { reject(fail('请求次数过多，请减少所选内容后重试')); return; }
        var id = ++nextId, done = false;
        var timer = setTimeout(function () { finish(function () { reject(fail('123 云盘请求超时，请稍后重试')); }); }, TIMEOUT);
        function onMessage(event) {
          var d = event.data;
          if (event.source !== window || event.origin !== location.origin) return;
          if (!d || d.channel !== 'shiying-netdisk-reply' || d.intent !== intent || d.id !== id) return;
          finish(function () {
            if (d.ok && d.value) resolve(d.value);
            else reject(fail(d.error || '123 云盘请求失败'));
          });
        }
        function finish(fn) {
          if (done) return;
          done = true; clearTimeout(timer); window.removeEventListener('message', onMessage); fn();
        }
        window.addEventListener('message', onMessage);
        window.postMessage({ channel: 'shiying-netdisk-request', intent: intent, id: id, action: 'api', payload: payload }, location.origin);
      });
    };
  }

  function makeApi(call, token) {
    function request(method, url, bodyObj) {
      var headers = { authorization: 'Bearer ' + token };
      var payload = { url: url, method: method, headers: headers };
      if (method === 'POST') {
        headers['content-type'] = 'application/json;charset=UTF-8';
        payload.body = JSON.stringify(bodyObj);
      }
      return call(payload).then(function (value) {
        var status = value && value.status;
        var data = value && value.data;
        if (status === 401 || (data && data.code === 20101)) throw fail('123 云盘登录已过期，请刷新页面后重试');
        if (!data || typeof data !== 'object') throw fail('123 云盘返回错误：' + (status || '无响应'));
        if (data.code !== 0) throw fail('123 云盘返回错误：' + (data.message || data.code));
        return data.data || {};
      });
    }
    function listFolder(folderId) {
      var items = [];
      function page(next, no) {
        var q = new URLSearchParams({
          driveId: '0', limit: '100', next: String(next), orderBy: 'update_time', orderDirection: 'desc',
          parentFileId: String(folderId), trashed: 'false', SearchData: '', Page: String(no),
          OnlyLookAbnormalFile: '0', event: 'homeListFile', operateType: '4', inDirectSpace: 'false'
        });
        return request('GET', API + '/b/api/file/list/new?' + q.toString()).then(function (d) {
          var got = d.InfoList || [];
          items = items.concat(got);
          var n = d.Next;
          if (n === undefined || n === null || String(n) === '-1' || !got.length) return items;
          return page(n, no + 1);
        });
      }
      return page(0, 1);
    }
    function downloadUrl(f) {
      return request('POST', API + '/b/api/v2/file/download_info', {
        driveId: 0, etag: f.Etag, fileId: f.FileId, s3keyFlag: f.S3KeyFlag, type: f.Type, fileName: f.FileName, size: f.Size
      }).then(function (d) {
        var first = (d.dispatchList || [])[0];
        if (!first || typeof first.prefix !== 'string' || first.prefix.indexOf('https://') !== 0 || !d.downloadPath) return '';
        return first.prefix + d.downloadPath;
      });
    }
    return { listFolder: listFolder, downloadUrl: downloadUrl };
  }

  function currentFolder() {
    var v = new URLSearchParams(location.search).get('homeFilePath');
    return v && /^\d+$/.test(v) ? v : '0';
  }

  function selectedIds() {
    var ids = [], seen = {};
    document.querySelectorAll('[role="row"][data-row-key]').forEach(function (row) {
      var box = row.querySelector('input[type="checkbox"]');
      var id = row.getAttribute('data-row-key');
      if (box && box.checked && id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return ids;
  }

  // Gathers up to MAX_FILES + 1 files so the caller can tell whether anything was left out.
  function collect(api, selected) {
    var files = [];
    function full() { return files.length > MAX_FILES; }
    function walkFolder(folder, path, depth) {
      if (depth > MAX_DEPTH || full()) return Promise.resolve();
      return api.listFolder(folder.FileId).then(function (children) {
        return walkList(children, path, depth);
      });
    }
    function walkList(list, base, depth) {
      var chain = Promise.resolve();
      list.forEach(function (item) {
        chain = chain.then(function () {
          if (full()) return;
          if (item.Type === 1) return walkFolder(item, base + '/' + item.FileName, depth + 1);
          files.push({ item: item, path: base });
        });
      });
      return chain;
    }
    var chain = Promise.resolve();
    selected.forEach(function (item) {
      chain = chain.then(function () {
        if (full()) return;
        if (item.Type === 1) return walkFolder(item, item.FileName, 1);
        files.push({ item: item, path: '' });
      });
    });
    return chain.then(function () { return files; });
  }

  function mapLimit(list, limit, fn) {
    var results = new Array(list.length), index = 0, failed = null;
    function worker() {
      if (failed || index >= list.length) return Promise.resolve();
      var i = index++;
      return fn(list[i]).then(function (r) { results[i] = r; return worker(); }, function (e) { failed = failed || e; });
    }
    var workers = [];
    for (var k = 0; k < Math.min(limit, list.length); k++) workers.push(worker());
    return Promise.all(workers).then(function () { if (failed) throw failed; return results; });
  }

  function run(intent) {
    if (location.pathname.indexOf('/s/') === 0) throw fail('请先把分享的文件保存到自己的 123 云盘，再在网盘里用 Ruxget 下载');
    var token = readToken();
    if (!token) throw fail('请先登录 123 云盘，再点 Ruxget 下载');
    var ids = selectedIds();
    if (!ids.length) throw fail('请先勾选要下载的文件或文件夹');
    var api = makeApi(createBridge(intent), token);
    return api.listFolder(currentFolder()).then(function (list) {
      var byId = {};
      list.forEach(function (it) { byId[String(it.FileId)] = it; });
      var selected = ids.map(function (id) { return byId[id]; }).filter(Boolean);
      if (!selected.length) throw fail('请先勾选要下载的文件或文件夹');
      return collect(api, selected);
    }).then(function (found) {
      var truncated = found.length > MAX_FILES;
      if (truncated) found = found.slice(0, MAX_FILES);
      return mapLimit(found, PARALLEL, function (entry) { return api.downloadUrl(entry.item); }).then(function (urls) {
        var headers = { 'User-Agent': navigator.userAgent, 'Referer': location.origin + '/' };
        var files = [], missing = 0;
        found.forEach(function (entry, i) {
          if (!urls[i]) { missing++; return; }
          var f = { url: urls[i], title: entry.item.FileName, key: String(entry.item.FileId), path: entry.path, headers: headers };
          if (typeof entry.item.Size === 'number') f.size = entry.item.Size;
          files.push(f);
        });
        if (!files.length) throw fail('未能获取下载地址，请刷新页面后重试');
        var warnings = [];
        if (truncated) warnings.push('一次最多下载 100 个文件，其余请分批下载');
        if (missing) warnings.push('有 ' + missing + ' 个文件未能获取下载地址');
        var result = { ok: true, files: files };
        if (warnings.length) result.warning = warnings.join('；');
        return result;
      });
    });
  }

  function resolve(intent, provider, values) {
    if (provider !== 'pan123') {
      if (previous) return previous.apply(this, arguments);
      return Promise.resolve({ ok: false, error: '不支持的网盘' });
    }
    return new Promise(function (ok) { ok(run(intent)); }).catch(function (e) {
      return { ok: false, error: e instanceof Fail ? e.message : '123 云盘处理失败，请刷新页面后重试' };
    });
  }

  globalThis.ShiyingNetdiskPage = { resolve: resolve, __pan123: true };
})();
