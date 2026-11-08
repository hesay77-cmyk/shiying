// Checks the language entry names of _locales: the 67 names inherited from an earlier plugin are gone,
// and every name the pages, scripts and manifest use as a language entry exists in both languages.
//   node scripts/locale-keys-check.cjs
// The download pages (dash-download, hls-download, file-download) keep their own text tables and do not read _locales,
// so their data-i18n names and t('x') calls are not language entries and are skipped.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const OLD = `catCatch description confirm play screenshot loop volume downloader parser mpdParser download copy selectAll filter clear pause settings enable disable option suffix delete extension type alert flag result match address test preview operation about default loading segmentList downloadProgress requestHeaders audioOnly saveAs stopDownload start end resolution duration bitrate key close downloaded merging audio video exit saving saveFailed popup verifying blockUrl sort desc getTime fileSize title Script save contextMenus reverse`.split(/\s+/);
const SKIP_DIRS = new Set(['.git', 'desktop', 'third-party-source', 'lib', 'node_modules', 'docs', '_locales', 'build', 'build-full', 'reports', '.checks', 'release', 'dist', 'scripts']);
const OWN_TEXT = new Set(['dash-download.html', 'hls-download.html', 'file-download.html', 'dash-download.js', 'hls-download.js', 'file-download.js']);
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^﻿/, ''));
const catalogs = {zh_CN: read('_locales/zh_CN/messages.json'), en: read('_locales/en/messages.json')};
const problems = [];
if (OLD.length !== 67 || new Set(OLD).size !== 67) problems.push('the old-name list must hold 67 distinct names');
for (const [lang, messages] of Object.entries(catalogs)) {
  for (const name of OLD) if (name in messages) problems.push(`${lang}: old name still present: ${name}`);
}
const zhKeys = Object.keys(catalogs.zh_CN), enKeys = Object.keys(catalogs.en);
for (const key of zhKeys) if (!(key in catalogs.en)) problems.push(`missing in en: ${key}`);
for (const key of enKeys) if (!(key in catalogs.zh_CN)) problems.push(`missing in zh_CN: ${key}`);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(html|js|cjs)$/.test(entry.name) || entry.name === 'manifest.json') if (entry.name !== 'ruxget-locale-data.js' && !OWN_TEXT.has(entry.name) && entry.name !== 'locale-keys-check.cjs') files.push(full);
  }
})(root);

const patterns = [
  /data-i18n(?:-[a-z]+)?\s*=\s*["']([^"']+)["']/g,
  /\b(?:getMessage|tMsg|tSub|RuxgetI18n\.t|t)\(\s*(['"`])([A-Za-z0-9_]+)\1/g,
  /__MSG_([A-Za-z0-9_@]+)__/g
];
const used = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const name = match[2] && pattern === patterns[1] ? match[2] : match[1];
      // `t(` also appears as a local helper of unrelated scripts; only names that are not plain catalog names are reported for the explicit calls.
      const explicit = pattern !== patterns[1] || /(?:getMessage|tMsg|tSub|RuxgetI18n\.t)\($/.test(match[0].replace(/\(\s*(['"`])[A-Za-z0-9_]+\1$/, '('));
      if (!explicit && !(name in catalogs.zh_CN)) continue;
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(path.relative(root, file));
    }
  }
}
// manifest names that Chrome resolves itself
for (const [name, where] of used) {
  for (const lang of Object.keys(catalogs)) if (!(name in catalogs[lang])) problems.push(`${lang}: "${name}" is used (${[...where].join(', ')}) but missing`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`ok: ${zhKeys.length} entries, none of the ${OLD.length} old names remain, ${used.size} names used by pages/scripts all exist in zh_CN and en`);
