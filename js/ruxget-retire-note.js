// Ruxget 0.4.77: one quiet line at the top of the old advanced tools (popup.html, options.html) saying that some of
// them go away in the next version. No dialog, nothing to dismiss; it follows the interface language as it changes.
(() => {
    const text = {
        zh: '这里的部分工具将在后续版本中移除。常用功能已移入 Ruxget 面板：本页视频列表下方的“显示全部请求”，以及粘贴文件链接后“更多”里的“来源网页”。',
        en: 'Some of these tools will be removed in a later version. The everyday ones are now in the Ruxget panel: “Show all requests” under the video list, and “Source page” under “More” after pasting a file link.'
    };
    const note = document.createElement('p');
    note.className = 'ruxget-retire-note';
    note.setAttribute('role', 'note');
    note.style.cssText = 'margin:0;padding:8px 16px;background:#EDE8D9;color:#6A6C55;font-size:12px;line-height:1.6;border-bottom:1px solid #E2DCC9';
    const apply = value => {
        const lang = value === 'zh_CN' ? 'zh' : value === 'en' ? 'en' : (chrome.i18n.getUILanguage() || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
        note.textContent = text[lang];
    };
    const place = () => document.body.prepend(note);
    if (document.body) place(); else document.addEventListener('DOMContentLoaded', place, {once: true});
    apply('auto');
    chrome.storage.local.get('ruxgetUiLanguage').then(data => apply(data.ruxgetUiLanguage)).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.ruxgetUiLanguage) apply(changes.ruxgetUiLanguage.newValue); });
})();
