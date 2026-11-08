// Ruxget，2026-11-09，按功能说明书 07-网盘-夸克 从零编写。
(function () {
  'use strict';
  var previous = globalThis.ShiyingNetdiskPage;
  if (previous && previous.__ruxgetQuarkUc) return;

  var SORT_PATH = '/1/clouddrive/file/sort';
  var DOWNLOAD_PATH = '/1/clouddrive/file/download';
  // 两家网盘结构相同，只有这些配置不同。
  var PROVIDERS = {
    quark: {
      name: '夸克网盘',
      apiHost: 'https://drive-pc.quark.cn',
      query: 'pr=ucpro&fr=pc&uc_param_str=',
      hostPattern: /(^|\.)(quark\.cn|aliyuncs\.com)$/
    },
    uc: {
      name: 'UC 网盘',
      apiHost: 'https://pc-api.uc.cn',
      query: 'pr=UCBrowser&fr=pc',
      hostPattern: /(^|\.)uc\.cn$/
    }
  };
  var cfg = PROVIDERS.quark;
  var ROOT_FID = '0';
  var PAGE_SIZE = 50;
  var MAX_FILES = 100;
  var MAX_DEPTH = 10;
  var BATCH_SIZE = 20;
  var MAX_CALLS = 120;
  var CALL_TIMEOUT_MS = 25000;

  var TEXT = {
    share: '',
    nothingSelected: '请先勾选要下载的文件或文件夹',
    notFound: '在当前文件夹中找不到所选的项，请刷新页面后重试',
    apiPrefix: '',
    apiDefault: '请刷新页面并确认登录状态后重试',
    noAddress: '未能获取下载地址，请刷新页面并确认登录状态后重试',
    someNoAddress: function (n) { return '有 ' + n + ' 个文件未能获取下载地址'; },
    tooMany: '一次最多下载 100 个文件，其余请分批下载',
    tooDeep: '超过 10 层的子文件夹未展开',
    tooManyCalls: '请求次数已达上限，部分文件夹未能完整展开',
    bridgeFailed: '与 Ruxget 的连接失败，请刷新页面后重试',
    timeout: '',
    emptyFolderOnly: '所选文件夹中没有可下载的文件',
    unexpected: ''
  };

  function applyProvider(key) {
    cfg = PROVIDERS[key];
    TEXT.share = '请先把分享的文件保存到自己的' + (key === 'uc' ? ' ' : '') + cfg.name + '，再在网盘里用 Ruxget 下载';
    TEXT.apiPrefix = cfg.name + '返回错误：';
    TEXT.timeout = '等待' + cfg.name + '响应超时，请稍后重试';
    TEXT.unexpected = '处理' + cfg.name + '数据时出错，请刷新页面后重试';
  }
  applyProvider('quark');

  // 用于在流程中途携带中文说明结束 resolve 的错误类型。
  function Failure(message) { this.message = message; }

  // ---------- 与 Ruxget 的消息转发 ----------

  function createBridge(intent) {
    var nextId = 1;
    var pending = {};

    function onMessage(event) {
      if (event.source !== window || event.origin !== location.origin) return;
      var data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.channel !== 'shiying-netdisk-reply' || data.intent !== intent) return;
      var entry = pending[data.id];
      if (!entry) return;
      delete pending[data.id];
      clearTimeout(entry.timer);
      entry.done(data);
    }
    window.addEventListener('message', onMessage);

    function call(payload) {
      if (nextId > MAX_CALLS) return Promise.reject(new Failure(TEXT.tooManyCalls));
      var id = nextId++;
      return new Promise(function (resolve, reject) {
        var entry = {
          done: function (reply) {
            if (reply.ok === true) resolve(reply.value || {});
            else reject(new Failure(typeof reply.error === 'string' && reply.error ? reply.error : TEXT.bridgeFailed));
          },
          timer: setTimeout(function () {
            delete pending[id];
            reject(new Failure(TEXT.timeout));
          }, CALL_TIMEOUT_MS)
        };
        pending[id] = entry;
        try {
          window.postMessage({ channel: 'shiying-netdisk-request', intent: intent, id: id, action: 'api', payload: payload }, location.origin);
        } catch (e) {
          delete pending[id];
          clearTimeout(entry.timer);
          reject(new Failure(TEXT.bridgeFailed));
        }
      });
    }

    function close() {
      window.removeEventListener('message', onMessage);
      Object.keys(pending).forEach(function (key) { clearTimeout(pending[key].timer); });
      pending = {};
    }

    return { call: call, close: close, remaining: function () { return MAX_CALLS - nextId + 1; } };
  }

  // 检查夸克接口自身的 status/code，返回 data 字段。
  function unwrap(value) {
    var body = value && value.data;
    if (!body || typeof body !== 'object') throw new Failure(TEXT.apiPrefix + TEXT.apiDefault);
    if (Number(body.code) !== 0 || (body.status !== undefined && Number(body.status) !== 200)) {
      var message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : TEXT.apiDefault;
      throw new Failure(TEXT.apiPrefix + message);
    }
    return body;
  }

  // ---------- 页面信息 ----------

  function isSharePage() {
    return /^\/s\//.test(location.pathname);
  }

  function currentFolderFid() {
    var hash = String(location.hash || '').replace(/^#/, '').split('?')[0];
    var parts = hash.split('/').filter(function (s) { return s !== ''; });
    if (parts[0] !== 'list' || parts[1] !== 'all' || parts.length < 3) return ROOT_FID;
    var last = parts[parts.length - 1];
    try { last = decodeURIComponent(last); } catch (e) { /* 保留原文 */ }
    var cut = last.indexOf('-');
    var fid = cut >= 0 ? last.slice(0, cut) : last;
    return /^[0-9a-zA-Z]+$/.test(fid) ? fid : ROOT_FID;
  }

  function readSelectedRows() {
    var rows = document.querySelectorAll('tr.ant-table-row, tr[data-row-key]');
    var picked = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var box = row.querySelector('input.ant-checkbox-input');
      var selected = row.classList.contains('ant-table-row-selected') || !!(box && box.checked);
      if (!selected) continue;
      var key = row.getAttribute('data-row-key') || '';
      var nameEl = row.querySelector('.filename-text');
      var name = '';
      if (nameEl) name = (nameEl.getAttribute('title') || nameEl.textContent || '').trim();
      if (!key && !name) continue;
      picked.push({ fid: key, name: name });
    }
    return picked;
  }

  // ---------- 列目录 ----------

  function sortUrl(pdirFid, page) {
    return cfg.apiHost + SORT_PATH + '?' + cfg.query +
      '&pdir_fid=' + encodeURIComponent(pdirFid) +
      '&_page=' + page + '&_size=' + PAGE_SIZE +
      '&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc';
  }

  // 逐页列出文件夹；onPage 返回 false 时提前停止。返回 {items, complete}。
  function listFolder(bridge, pdirFid, onPage) {
    var items = [];
    function step(page) {
      return bridge.call({ url: sortUrl(pdirFid, page), method: 'GET' }).then(function (value) {
        var body = unwrap(value);
        var list = body.data && Array.isArray(body.data.list) ? body.data.list : [];
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].fid) items.push(list[i]);
        var meta = body.metadata || {};
        var total = Number(meta._total);
        var more = list.length > 0 && (isFinite(total) ? items.length < total : list.length >= PAGE_SIZE);
        if (!more) return { items: items, complete: true };
        if (onPage && onPage(items) === false) return { items: items, complete: false };
        return step(page + 1);
      });
    }
    return step(1);
  }

  function isFolder(item) {
    if (item.dir === true) return true;
    if (item.file === true) return false;
    return item.dir === 1 || item.dir === '1';
  }

  // 把勾选行对应到列表项：有 fid 的按 fid，没有的按文件名依次对应。
  function matchSelection(selected, items, used) {
    var result = [];
    var missing = 0;
    for (var i = 0; i < selected.length; i++) {
      var sel = selected[i];
      var found = null;
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (used[j]) continue;
        if (sel.fid ? it.fid === sel.fid : it.file_name === sel.name) { found = j; break; }
      }
      if (found === null) { missing++; result.push(null); }
      else { used[found] = true; result.push(items[found]); }
    }
    return { matched: result, missing: missing };
  }

  // ---------- 收集文件 ----------

  function collectFiles(bridge, roots, warnings) {
    var files = [];
    var state = { truncated: false, tooDeep: false, outOfCalls: false };
    var reserve = Math.ceil(MAX_FILES / BATCH_SIZE);

    function pushFile(item, folderPath) {
      if (files.length >= MAX_FILES) { state.truncated = true; return false; }
      files.push({ item: item, path: folderPath });
      return true;
    }

    function walk(folder, folderPath, depth) {
      if (files.length >= MAX_FILES) { state.truncated = true; return Promise.resolve(); }
      if (bridge.remaining() <= reserve) { state.outOfCalls = true; return Promise.resolve(); }
      return listFolder(bridge, folder.fid, function (soFar) {
        var fileCount = 0;
        for (var k = 0; k < soFar.length; k++) if (!isFolder(soFar[k])) fileCount++;
        if (files.length + fileCount > MAX_FILES) return false;
        if (bridge.remaining() <= reserve) { state.outOfCalls = true; return false; }
        return true;
      }).then(function (listed) {
        if (!listed.complete && !state.outOfCalls) state.truncated = true;
        var subFolders = [];
        for (var i = 0; i < listed.items.length; i++) {
          var it = listed.items[i];
          if (isFolder(it)) subFolders.push(it);
          else if (!pushFile(it, folderPath)) return;
        }
        var chain = Promise.resolve();
        subFolders.forEach(function (sub) {
          chain = chain.then(function () {
            if (files.length >= MAX_FILES) { state.truncated = true; return; }
            if (depth >= MAX_DEPTH) { state.tooDeep = true; return; }
            return walk(sub, joinPath(folderPath, sub.file_name), depth + 1);
          });
        });
        return chain;
      });
    }

    var chain = Promise.resolve();
    roots.forEach(function (item) {
      chain = chain.then(function () {
        if (isFolder(item)) return walk(item, cleanSegment(item.file_name), 1);
        pushFile(item, '');
      });
    });
    return chain.then(function () {
      if (state.truncated) warnings.push(TEXT.tooMany);
      if (state.tooDeep) warnings.push(TEXT.tooDeep);
      if (state.outOfCalls) warnings.push(TEXT.tooManyCalls);
      return files;
    });
  }

  function cleanSegment(name) {
    return String(name || '').replace(/[\/\\]/g, '_').trim();
  }

  function joinPath(base, name) {
    var seg = cleanSegment(name);
    return base ? base + '/' + seg : seg;
  }

  // ---------- 取下载地址 ----------

  function isAllowedUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      var u = new URL(url);
      if (u.protocol !== 'https:') return false;
      var host = u.hostname.toLowerCase();
      return cfg.hostPattern.test(host);
    } catch (e) {
      return false;
    }
  }

  function fetchAddresses(bridge, fids) {
    var found = {};
    var chain = Promise.resolve();
    for (var start = 0; start < fids.length; start += BATCH_SIZE) {
      (function (batch) {
        chain = chain.then(function () {
          return bridge.call({
            url: cfg.apiHost + DOWNLOAD_PATH + '?' + cfg.query,
            method: 'POST',
            body: JSON.stringify({ fids: batch }),
            headers: { 'content-type': 'application/json' }
          }).then(function (value) {
            var body = unwrap(value);
            var list = Array.isArray(body.data) ? body.data : [];
            for (var i = 0; i < list.length; i++) {
              var entry = list[i];
              if (entry && entry.fid && isAllowedUrl(entry.download_url)) found[entry.fid] = entry;
            }
          });
        });
      })(fids.slice(start, start + BATCH_SIZE));
    }
    return chain.then(function () { return found; });
  }

  function makeTitle(name, fid) {
    var title = String(name || '').replace(/^.*[\/\\]/, '').trim();
    if (!title) title = String(fid);
    if (title.length > 512) title = title.slice(0, 512);
    return title;
  }

  // ---------- 主流程 ----------

  function run(intent) {
    if (isSharePage()) return Promise.resolve({ ok: false, error: TEXT.share });
    var selected = readSelectedRows();
    if (!selected.length) return Promise.resolve({ ok: false, error: TEXT.nothingSelected });

    var bridge = createBridge(intent);
    var warnings = [];
    var folderFid = currentFolderFid();

    // 1. 列当前文件夹，直到所有勾选项都找到。
    var wantFids = {};
    var nameOnly = 0;
    selected.forEach(function (s) { if (s.fid) wantFids[s.fid] = true; else nameOnly++; });

    function allFound(items) {
      var seen = {};
      var namedSeen = 0;
      for (var i = 0; i < items.length; i++) seen[items[i].fid] = true;
      for (var key in wantFids) if (!seen[key]) return false;
      if (nameOnly) {
        selected.forEach(function (s) {
          if (!s.fid && items.some(function (it) { return it.file_name === s.name; })) namedSeen++;
        });
        if (namedSeen < nameOnly) return false;
      }
      return true;
    }

    return listFolder(bridge, folderFid, function (items) { return !allFound(items); })
      .then(function (listed) {
        var match = matchSelection(selected, listed.items, {});
        var roots = match.matched.filter(Boolean);
        if (!roots.length) throw new Failure(TEXT.notFound);
        if (match.missing) warnings.push('有 ' + match.missing + ' 个所选项未在当前文件夹中找到');
        // 2. 展开文件夹。
        return collectFiles(bridge, roots, warnings);
      })
      .then(function (files) {
        if (!files.length) throw new Failure(TEXT.emptyFolderOnly);
        // 3. 分批取下载地址。
        var fids = files.map(function (f) { return f.item.fid; });
        return fetchAddresses(bridge, fids).then(function (found) {
          var out = [];
          var skipped = 0;
          var headers = { 'User-Agent': navigator.userAgent, 'Referer': location.origin + '/' };
          files.forEach(function (f) {
            var entry = found[f.item.fid];
            if (!entry) { skipped++; return; }
            var record = {
              url: entry.download_url,
              title: makeTitle(f.item.file_name || entry.file_name, f.item.fid),
              key: f.item.fid,
              path: f.path,
              headers: { 'User-Agent': headers['User-Agent'], 'Referer': headers.Referer }
            };
            var size = Number(f.item.size !== undefined ? f.item.size : entry.size);
            if (isFinite(size) && size >= 0) record.size = size;
            out.push(record);
          });
          if (!out.length) throw new Failure(TEXT.noAddress);
          if (skipped) warnings.push(TEXT.someNoAddress(skipped));
          var result = { ok: true, files: out };
          if (warnings.length) result.warning = warnings.join('；');
          return result;
        });
      })
      .catch(function (error) {
        return { ok: false, error: error instanceof Failure ? error.message : TEXT.unexpected };
      })
      .then(function (result) {
        bridge.close();
        return result;
      });
  }

  var api = {
    __ruxgetQuarkUc: true,
    resolve: function (intent, provider, values) {
      if (provider !== 'quark' && provider !== 'uc') {
        if (previous && typeof previous.resolve === 'function') return previous.resolve(intent, provider, values);
        return Promise.resolve({ ok: false, error: '不支持的网盘' });
      }
      try {
        applyProvider(provider);
        return run(intent).catch(function () { return { ok: false, error: TEXT.unexpected }; });
      } catch (e) {
        return Promise.resolve({ ok: false, error: TEXT.unexpected });
      }
    }
  };
  globalThis.ShiyingNetdiskPage = api;
})();
