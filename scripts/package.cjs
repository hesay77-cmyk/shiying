const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build');
fs.mkdirSync(output, {recursive:true});
for (const folder of ['css','img','js','lib','catch-script']) fs.cpSync(path.join(root, folder), path.join(output, folder), {recursive:true});
// 只打包简体中文：任何 Chrome 界面语言都会回落到中文。
// Copy every locale pack (zh_CN, en, ...); Chrome picks by browser UI + our ruxgetUiLanguage override.
for (const locale of fs.readdirSync(path.join(root, '_locales'), {withFileTypes:true})) {
  if (!locale.isDirectory()) continue;
  fs.cpSync(path.join(root, '_locales', locale.name), path.join(output, '_locales', locale.name), {recursive:true});
}
for (const name of fs.readdirSync(root)) if (name.endsWith('.html') || ['manifest.json','LICENSE','NOTICE.md','PRIVACY.md','使用说明.md'].includes(name)) fs.copyFileSync(path.join(root,name), path.join(output,name));
let bytes = 0, files = 0;
function measure(folder) { for (const item of fs.readdirSync(folder, {withFileTypes:true})) { const file = path.join(folder,item.name); if (item.isDirectory()) measure(file); else { bytes += fs.statSync(file).size; files++; } } }
measure(output);
console.log(JSON.stringify({folder:output,files,bytes}));
