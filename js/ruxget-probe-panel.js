// Ruxget，2026-11-08，按功能说明书 06-页面播放器探测 从零编写。
// Panel half of 页面播放器探测: the quiet switch after 「显示全部请求」, and the 「网页播放器缓存」 card at the top of
// 本页视频 with 保存 and 清空记录. shiying.js calls attach() each time it draws the list; the card keeps itself up to
// date from js/ruxget-probe.js (ruxgetProbeChanged).
const RuxgetProbePanel = (() => {
    'use strict';
    const $ = selector => document.querySelector(selector);
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh;
    let tabId = null, info = {on: false, tracks: []}, busy = false, loading = 0;
    const entry = document.createElement('span');
    entry.className = 'probe-entry';

    const offered = tab => !!tab && /^https?:\/\//i.test(tab.url || '') && typeof ShiyingAccess !== 'undefined' && ShiyingAccess.allows(tab.url);
    const send = (Message, extra = {}) => chrome.runtime.sendMessage({Message, tabId, ...extra});
    function say(text) { if (typeof notify === 'function') notify(text); }

    async function load() {
        if (tabId === null) return;
        const asked = tabId, turn = ++loading;
        const reply = await send('ruxgetProbeState').catch(() => null);
        if (asked !== tabId || turn !== loading) return;
        info = reply && typeof reply === 'object' && 'on' in reply ? reply : {on: false, tracks: []};
        paint();
    }

    // ---------- the switch ----------
    function paintEntry() {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'hint-link'; button.disabled = busy;
        if (info.on) {
            const text = document.createElement('span');
            // 0.4.81: plain words for everyone (it was 页面播放器探测 / Page player probe).
            text.textContent = pick('正在找网页里藏起来的视频', 'Looking for hidden videos');
            text.title = pick('请播放视频，找到的会显示在列表里', 'Play the video; anything found shows up in the list');
            button.textContent = pick('关闭', 'Turn off');
            button.title = pick('关闭后网页会刷新一次，恢复原样', 'The page reloads once and is back to normal');
            entry.replaceChildren(text, ' · ', button);
        } else {
            button.textContent = pick('找出网页里藏起来的视频', 'Find videos hidden in the page');
            button.title = pick('有些网站的视频在列表里找不到，打开后会刷新网页再找一次（只对这个标签页）', 'Some sites’ videos don’t show up in the list. This reloads the page and looks again (this tab only).');
            entry.replaceChildren(button);
        }
        button.addEventListener('click', () => toggle(!info.on));
    }
    async function toggle(on) {
        if (busy || tabId === null) return;
        busy = true; paint();
        try {
            const reply = await send('ruxgetProbeSet', {on});
            if (!reply || reply.ok === false) throw new Error(reply?.error || pick('没能切换，请重试', 'Couldn’t switch it. Try again.'));
            info = {on: reply.on === true, tracks: []};
            say(on ? pick('网页已刷新，请播放视频，Ruxget 会再找一次', 'The page reloaded. Play the video and Ruxget will look again.') : pick('已停止查找，网页已刷新', 'Stopped looking; the page reloaded.'));
        } catch (error) { say(error.message || String(error)); }
        finally { busy = false; paint(); }
    }

    // ---------- the card ----------
    const CODECS = [[/^(avc1|avc3)/i, 'H.264'], [/^(hev1|hvc1)/i, 'H.265'], [/^(vp09|vp9)/i, 'VP9'], [/^vp8/i, 'VP8'], [/^av01/i, 'AV1'],
        [/^mp4a\.(69|6b)/i, 'MP3'], [/^mp4a/i, 'AAC'], [/^opus/i, 'Opus'], [/^vorbis/i, 'Vorbis'], [/^flac/i, 'FLAC'], [/^ec-3/i, 'E-AC-3'], [/^ac-3/i, 'AC-3']];
    const AUDIO = /^(mp4a|opus|vorbis|flac|ac-3|ec-3|mp3|alac)/i;
    function describe(type) {
        const lower = String(type || '');
        const codecs = ((/codecs\s*=\s*"?([^";]+)"?/i.exec(lower) || [])[1] || '').split(',').map(s => s.trim()).filter(Boolean);
        const audio = /^audio\//i.test(lower) || (codecs.length > 0 && codecs.every(c => AUDIO.test(c)));
        const names = codecs.map(c => (CODECS.find(([re]) => re.test(c)) || [null, c])[1]);
        const container = (/^(?:video|audio)\/([\w.-]+)/i.exec(lower) || [])[1];
        return {audio, label: [...new Set(names)].join(' + ') || (container ? container.toUpperCase() : pick('未知格式', 'Unknown format'))};
    }
    function size(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'], power = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
        return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
    }
    function paintCard() {
        let box = $('#probeCard');
        if (!box) { const list = $('#mediaList'); if (!list) return; box = document.createElement('div'); box.id = 'probeCard'; list.before(box); }
        const tracks = info.on ? info.tracks || [] : [];
        box.hidden = !tracks.length;
        if (!tracks.length) { box.replaceChildren(); return; }
        const card = document.createElement('article'), row = document.createElement('div'), icon = document.createElement('div'), body = document.createElement('div'), title = document.createElement('h3'), lines = document.createElement('div');
        card.className = 'media-item probe-card'; row.className = 'media-row'; icon.className = 'file-icon'; body.className = 'media-info'; lines.className = 'probe-tracks';
        icon.setAttribute('aria-hidden', 'true'); icon.textContent = '▷';
        title.textContent = pick('从网页播放器录下的内容', 'Recorded from the page’s player');
        for (const track of tracks) {
            const {audio, label} = describe(track.type), line = document.createElement('span');
            line.textContent = [audio ? pick('声音', 'Audio') : pick('画面', 'Video'), label, pick('已记录 ', 'Recorded ') + size(track.size)].join(' · ') + (track.full ? pick('（记录已达上限）', ' (recording limit reached)') : '');
            lines.append(line);
        }
        body.append(title, lines);
        row.append(icon, body);
        const tools = document.createElement('div'), saveButton = document.createElement('button'), clearButton = document.createElement('button');
        tools.className = 'row-tools probe-tools';
        saveButton.type = clearButton.type = 'button';
        saveButton.className = 'download-button'; clearButton.className = 'text-button';
        saveButton.textContent = pick('保存', 'Save'); clearButton.textContent = pick('清空记录', 'Clear recording');
        saveButton.disabled = busy || !tracks.some(t => t.size > 0); clearButton.disabled = busy;
        saveButton.addEventListener('click', () => act('ruxgetProbeSave'));
        clearButton.addEventListener('click', () => act('ruxgetProbeClear'));
        tools.append(saveButton, clearButton);
        const hint = document.createElement('p');
        hint.className = 'quality-note probe-hint';
        hint.textContent = pick('播放到结尾后再保存，记录的就是完整视频；拖动进度会让记录不连续。', 'Save after the video has played to the end to get all of it; seeking leaves gaps in the recording.');
        card.append(row, tools, hint);
        box.replaceChildren(card);
        const empty = $('#empty'); if (empty) empty.hidden = true;
    }
    async function act(name) {
        if (busy) return;
        busy = true; paint();
        try {
            const reply = await send(name, {labels: {video: pick('画面', 'Video'), audio: pick('声音', 'Audio')}});
            if (!reply || reply.ok === false) throw new Error(reply?.error || pick('网页没有回应，请刷新网页后重试', 'The page did not answer; reload it and try again'));
            if (name === 'ruxgetProbeClear') info = {...info, tracks: (info.tracks || []).map(t => ({...t, size: 0, full: false}))};
            say(name === 'ruxgetProbeSave' ? pick('已开始保存，文件会出现在 Chrome 下载列表中', 'Saving; the files will appear in Chrome’s downloads') : pick('已清空记录，从现在起重新记录', 'Recording cleared; recording starts again from now'));
        } catch (error) { say(error.message || String(error)); }
        finally { busy = false; paint(); }
    }

    function paint() { paintEntry(); paintCard(); }

    // Called from shiying.js render(): puts the switch on the 「显示全部请求」 line; returns whether it is offered.
    function attach(note, tab, id) {
        const show = offered(tab);
        document.body.classList.toggle('probe-offered', show);
        if (id !== tabId) { tabId = id ?? null; info = {on: false, tracks: []}; load().catch(() => {}); }
        if (!show) { entry.remove(); paintCard(); return false; }
        paint();
        if (note.childNodes.length) note.append(' ');
        note.append(entry);
        return true;
    }
    chrome.runtime.onMessage.addListener(message => {
        if (message && message.Message === 'ruxgetProbeChanged' && message.tabId === tabId) load().catch(() => {});
    });
    return {attach, refresh: load};
})();
