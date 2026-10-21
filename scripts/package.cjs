const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Two editions from one source tree:
//   build/       Chrome Web Store edition — no YouTube module, permissions or page button (store policy).
//   build-full/  GitHub edition — the store edition plus js/shiying-youtube.js and its permissions.
const output = path.join(root, 'build'), full = path.join(root, 'build-full');
const YOUTUBE_MODULE = 'js/shiying-youtube.js';
for (const folder of [output, full]) fs.rmSync(folder, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for (const folder of ['css','img','js','lib','catch-script']) fs.cpSync(path.join(root, folder), path.join(output, folder), {recursive:true});
// Copy every locale pack (zh_CN, en, ...); Chrome picks by browser UI + our ruxgetUiLanguage override.
for (const locale of fs.readdirSync(path.join(root, '_locales'), {withFileTypes:true})) {
  if (!locale.isDirectory()) continue;
  fs.cpSync(path.join(root, '_locales', locale.name), path.join(output, '_locales', locale.name), {recursive:true});
}
for (const name of fs.readdirSync(root)) if (name.endsWith('.html') || ['manifest.json','LICENSE','NOTICE.md','PRIVACY.md','使用说明.md'].includes(name)) fs.copyFileSync(path.join(root,name), path.join(output,name));
fs.rmSync(path.join(output, YOUTUBE_MODULE), {force:true});

// Full edition.
fs.cpSync(output, full, {recursive:true});
fs.copyFileSync(path.join(root, YOUTUBE_MODULE), path.join(full, YOUTUBE_MODULE));
const replaceOnce = (file, before, after) => {
  const target = path.join(full, file), text = fs.readFileSync(target, 'utf8');
  if (text.split(before).length !== 2) throw new Error(`full edition patch did not match in ${file}: ${before}`);
  fs.writeFileSync(target, text.replace(before, () => after));
};
const manifestFile = path.join(full, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const youtubePages = ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://youtube.com/*'];
manifest.version_name = manifest.version + ' 完整版';
manifest.description = '免费开源、无广告：B站、YouTube、抖音、快手、小红书视频一键保存为 MP4 或 MP3，带字幕；网盘和 BT 可交给配套桌面版。';
manifest.host_permissions = [...youtubePages, 'https://youtu.be/*', 'https://*.googlevideo.com/*', ...manifest.host_permissions];
for (const script of manifest.content_scripts) {
  script.matches = [...(script.js.includes('js/content-script.js') ? [...youtubePages, 'https://youtu.be/*'] : youtubePages), ...script.matches];
  const floating = script.js.indexOf('js/shiying-floating.js');
  if (floating >= 0) script.js.splice(floating, 0, YOUTUBE_MODULE);
}
for (const resource of manifest.web_accessible_resources) resource.matches = [...youtubePages, 'https://youtu.be/*', ...resource.matches];
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
replaceOnce('shiying.html', '<script src="js/shiying-platform.js" defer></script>', '<script src="js/shiying-platform.js" defer></script>\n  <script src="js/shiying-youtube.js" defer></script>');
replaceOnce('js/shiying-background.js', "importScripts('/js/shiying-collection-background.js');", "importScripts('/js/shiying-collection-background.js');\nimportScripts('/js/shiying-youtube.js');");

const measure = folder => { let bytes = 0, files = 0; const walk = dir => { for (const item of fs.readdirSync(dir, {withFileTypes:true})) { const file = path.join(dir, item.name); if (item.isDirectory()) walk(file); else { bytes += fs.statSync(file).size; files++; } } }; walk(folder); return {folder, files, bytes}; };
// The store build must not contain YouTube code, permissions or wording beyond the access block that refuses it.
const leaks = [];
const scan = dir => { for (const item of fs.readdirSync(dir, {withFileTypes:true})) { const file = path.join(dir, item.name); if (item.isDirectory()) { scan(file); continue; } if (!/\.(js|json|html|md)$/.test(item.name) || /[\\/]lib[\\/]/.test(file)) continue; const text = fs.readFileSync(file, 'utf8'); if (/youtube|googlevideo|youtu\.be/i.test(text.replace(/^.*Chrome Web Store policy.*$/m, '').replace(/^.*RuxgetFullEdition&&.*$/m, ''))) leaks.push(path.relative(output, file)); } };
scan(output);
if (leaks.length) throw new Error('store build mentions YouTube: ' + leaks.join(', '));
console.log(JSON.stringify({store:measure(output), full:measure(full)}));
