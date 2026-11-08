// Ruxget 0.4.79: the recognition rules that used to live on the old advanced options page, now a folded section of
// Ruxget's own settings. The engine (js/ruxget-engine.js) reads them from chrome.storage.sync: Ext (file types),
// blockUrl and blockUrlWhite (sites). Size conditions already saved on a rule are kept as they are.
(() => {
    const $ = selector => document.querySelector(selector);
    const pick = (zh, en) => window.RuxgetI18n ? RuxgetI18n.pick(zh, en) : zh;
    const live = (node, render, attr) => window.RuxgetI18n?.live ? RuxgetI18n.live(node, render, attr) : (attr ? node.setAttribute(attr, render()) : (node.textContent = render()));
    // The engine's defaults (spec 05 §2): on, except ts.
    const DEFAULT_ON = 'flv hlv f4v mp4 mp3 wma wav m4a webm ogg ogv acc aac mov mkv m4s m3u8 m3u mpeg avi wmv asf movie divx mpeg4 vid mpd weba opus'.split(' ');
    const DEFAULT_OFF = ['ts'];
    const rule = (ext, state) => ({ext, size:0, operator:'>=', unit:'KB', state});
    const box = $('#recognitionRules');
    if (!box) return;
    const types = $('#ruleTypes'), sites = $('#ruleSites'), white = $('#ruleWhite'), note = $('#ruleNote');
    live($('#ruleSummary'), () => pick('识别规则', 'Recognition rules'));
    live($('#ruleTypesLabel'), () => pick('识别这些文件类型（用空格分隔）', 'Recognise these file types (separated by spaces)'));
    live($('#ruleSitesLabel'), () => pick('不识别这些网址（每行一个，可用 * 代替任意部分）', 'Don’t recognise on these addresses (one per line; * matches anything)'));
    live($('#ruleWhiteLabel'), () => pick('改为只在这些网址识别', 'Recognise only on these addresses instead'));
    live($('#ruleSave'), () => pick('保存规则', 'Save rules'));
    live($('#ruleReset'), () => pick('恢复默认', 'Restore defaults'));
    let current = [];
    const say = text => { note.textContent = text; note.hidden = !text; };
    async function load() {
        const {Ext, blockUrl = [], blockUrlWhite = false} = await chrome.storage.sync.get(['Ext', 'blockUrl', 'blockUrlWhite']);
        current = Array.isArray(Ext) && Ext.length ? Ext : [...DEFAULT_ON.map(ext => rule(ext, true)), ...DEFAULT_OFF.map(ext => rule(ext, false))];
        types.value = current.filter(item => item.state).map(item => item.ext).join(' ');
        sites.value = (Array.isArray(blockUrl) ? blockUrl : []).filter(item => item && item.state !== false).map(item => item.url).join('\n');
        white.checked = blockUrlWhite === true;
    }
    async function save() {
        const wanted = [...new Set(types.value.toLowerCase().split(/[\s,，、;；]+/).map(ext => ext.replace(/^\*?\./, '').trim()).filter(ext => /^[a-z0-9]{1,10}$/.test(ext)))];
        if (!wanted.length) { say(pick('至少要识别一种文件类型。', 'Keep at least one file type.')); return; }
        const known = new Map(current.map(item => [item.ext, item]));
        const next = [...current.map(item => ({...item, state:wanted.includes(item.ext)})), ...wanted.filter(ext => !known.has(ext)).map(ext => rule(ext, true))];
        const list = [...new Set(sites.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))].slice(0, 500).map(url => ({url, state:true}));
        await chrome.storage.sync.set({Ext:next, blockUrl:list, blockUrlWhite:white.checked && list.length > 0});
        current = next;
        say(white.checked && !list.length ? pick('已保存。白名单为空时不生效。', 'Saved. An empty list can’t be an allow list.') : pick('已保存。', 'Saved.'));
    }
    $('#ruleSave').addEventListener('click', () => save().catch(error => say(error.message || String(error))));
    $('#ruleReset').addEventListener('click', async () => {
        await chrome.storage.sync.remove(['Ext', 'blockUrl', 'blockUrlWhite']);
        await load(); say(pick('已恢复默认。', 'Defaults restored.'));
    });
    for (const field of [types, sites, white]) field.addEventListener('input', () => say(''));
    load().catch(() => {});
})();
