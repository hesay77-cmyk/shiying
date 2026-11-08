(function () {
  'use strict';

  var API = 'https://pan.baidu.com';
  var MAX_FILES = 100;
  var MAX_DEPTH = 10;
  var BATCH = 20;
  var PAGE = 100;
  var MAX_REQUESTS = 120;
  var TIMEOUT_MS = 25000;

  var previous = globalThis.ShiyingNetdiskPage;

  function fail(message) {
    return { ok: false, error: message };
  }

  function ResolveError(message) {
    this.message = message;
  }

  // Sends one GET through the Ruxget bridge and resolves with the parsed JSON body.
  function createCaller(intent) {
    var counter = 0;
    return function call(url) {
      return new Promise(function (resolve, reject) {
        if (counter >= MAX_REQUESTS) {
          reject(new ResolveError('请求次数过多，请减少所选内容后重试'));
          return;
        }
        var id = ++counter;
        var timer = null;
        function onMessage(event) {
          var data = event.data;
          if (event.source !== window || event.origin !== location.origin) return;
          if (!data || data.channel !== 'shiying-netdisk-reply' || data.intent !== intent || data.id !== id) return;
          finish();
          if (data.ok && data.value) resolve(data.value.data);
          else reject(new ResolveError(data.error || '网盘请求失败，请刷新页面后重试'));
        }
        function finish() {
          window.removeEventListener('message', onMessage);
          if (timer) clearTimeout(timer);
        }
        timer = setTimeout(function () {
          finish();
          reject(new ResolveError('网盘请求超时，请刷新页面后重试'));
        }, TIMEOUT_MS);
        window.addEventListener('message', onMessage);
        window.postMessage({
          channel: 'shiying-netdisk-request',
          intent: intent,
          id: id,
          action: 'api',
          payload: { url: url, method: 'GET' }
        }, location.origin);
      });
    };
  }

  function checkErrno(data) {
    var errno = data && typeof data === 'object' ? Number(data.errno) : NaN;
    if (errno === 0) return data;
    if (errno === -6) throw new ResolveError('百度网盘登录已失效，请刷新页面后重试');
    throw new ResolveError('百度网盘返回错误（错误码 ' + (isNaN(errno) ? '未知' : errno) + '），请刷新页面后重试');
  }

  async function listFolder(call, dir) {
    var all = [];
    var start = 0;
    for (;;) {
      var url = API + '/api/list?dir=' + encodeURIComponent(dir) +
        '&order=time&desc=1&start=' + start + '&limit=' + PAGE + '&web=1&clienttype=0';
      var data = checkErrno(await call(url));
      var list = Array.isArray(data.list) ? data.list : [];
      all = all.concat(list);
      if (list.length < PAGE) break;
      start += PAGE;
    }
    return all;
  }

  function currentFolder() {
    var hash = location.hash || '';
    var query = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?') + 1) : '';
    var path = '';
    try { path = new URLSearchParams(query).get('path') || ''; } catch (e) { path = ''; }
    return path || '/';
  }

  function pageProblem() {
    var p = location.pathname;
    if (/^\/(s|share)\//.test(p)) return '请先把分享的文件保存到自己的百度网盘，再在网盘里用 Ruxget 下载';
    if (!/^\/disk\/(main|home)\/?$/.test(p) || (location.hash || '').indexOf('#/index') !== 0) {
      return '请在“我的文件”中选择要下载的文件';
    }
    return '';
  }

  function selectedIds() {
    var rows = document.querySelectorAll('tr[data-id].selected');
    var ids = [];
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute('data-id');
      if (id) ids.push(String(id));
    }
    return ids;
  }

  function isDlinkOk(url) {
    try {
      var u = new URL(url);
      return u.protocol === 'https:' && (u.hostname === 'baidu.com' || /\.baidu\.com$/.test(u.hostname));
    } catch (e) {
      return false;
    }
  }

  async function collect(call, roots) {
    var files = [];
    var truncated = false;
    var queue = [];
    roots.forEach(function (item) {
      if (Number(item.isdir) === 1) queue.push({ item: item, prefix: '', depth: 1 });
      else files.push({ item: item, rel: '' });
    });
    while (queue.length) {
      var job = queue.shift();
      var rel = job.prefix ? job.prefix + '/' + job.item.server_filename : job.item.server_filename;
      var children = await listFolder(call, job.item.path);
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (Number(child.isdir) === 1) {
          if (job.depth < MAX_DEPTH) queue.push({ item: child, prefix: rel, depth: job.depth + 1 });
        } else {
          files.push({ item: child, rel: rel });
        }
      }
      if (files.length > MAX_FILES) { truncated = true; break; }
    }
    if (files.length > MAX_FILES) { truncated = true; files = files.slice(0, MAX_FILES); }
    return { files: files, truncated: truncated };
  }

  async function run(intent) {
    var problem = pageProblem();
    if (problem) return fail(problem);
    var ids = selectedIds();
    if (!ids.length) return fail('请先勾选要下载的文件或文件夹');

    var call = createCaller(intent);
    var listing = await listFolder(call, currentFolder());
    var byId = {};
    listing.forEach(function (item) { byId[String(item.fs_id)] = item; });
    var roots = [];
    ids.forEach(function (id) { if (byId[id]) roots.push(byId[id]); });
    if (!roots.length) return fail('请先勾选要下载的文件或文件夹');

    var collected = await collect(call, roots);
    var entries = collected.files;
    var found = {};
    for (var i = 0; i < entries.length; i += BATCH) {
      var batch = entries.slice(i, i + BATCH);
      var targets = batch.map(function (e) { return e.item.path; });
      var url = API + '/api/filemetas?dlink=1&target=' + encodeURIComponent(JSON.stringify(targets));
      var data = checkErrno(await call(url));
      (Array.isArray(data.info) ? data.info : []).forEach(function (info) {
        if (info && info.dlink && isDlinkOk(info.dlink)) {
          if (info.fs_id != null) found['id:' + info.fs_id] = info.dlink;
          if (info.path) found['path:' + info.path] = info.dlink;
        }
      });
    }

    var headers = { 'User-Agent': navigator.userAgent, 'Referer': location.origin + '/' };
    var result = [];
    var missing = 0;
    entries.forEach(function (e) {
      var link = found['id:' + e.item.fs_id] || found['path:' + e.item.path];
      if (!link) { missing++; return; }
      var file = {
        url: link,
        title: String(e.item.server_filename).slice(0, 512),
        key: String(e.item.fs_id),
        path: e.rel,
        headers: { 'User-Agent': headers['User-Agent'], 'Referer': headers.Referer }
      };
      if (typeof e.item.size === 'number') file.size = e.item.size;
      result.push(file);
    });
    if (!result.length) return fail('未能获取下载地址，请刷新页面后重试');

    var warnings = [];
    if (collected.truncated) warnings.push('一次最多下载 100 个文件，其余请分批下载');
    if (missing) warnings.push('有 ' + missing + ' 个文件未能获取下载地址');
    var out = { ok: true, files: result };
    if (warnings.length) out.warning = warnings.join('；');
    return out;
  }

  var api = {
    resolve: async function (intent, provider, values) {
      if (provider !== 'baidu') {
        if (previous && typeof previous.resolve === 'function') return previous.resolve(intent, provider, values);
        return fail('不支持的网盘');
      }
      try {
        return await run(intent);
      } catch (error) {
        if (error instanceof ResolveError) return fail(error.message);
        return fail('百度网盘处理失败，请刷新页面后重试');
      }
    }
  };

  globalThis.ShiyingNetdiskPage = api;
})();
