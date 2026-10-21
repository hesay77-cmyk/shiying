// Chrome Web Store package. The default `package.cjs` build keeps YouTube for GitHub.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build-chrome-store');
const release = path.join(root, 'release');
const STORE_FLOOR = '0.4.43';
const OMIT = /\/\* shiying-store-omit \*\/[\s\S]*?\/\* shiying-store-omit-end \*\//g;
const YOUTUBE_HOST = /youtube\.com|youtube-nocookie\.com|googlevideo\.com|ytimg\.com|youtu\.be/i;

function compareVersion(left, right) {
    const a = String(left).split('.').map(part => Number(part) || 0);
    const b = String(right).split('.').map(part => Number(part) || 0);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index++) {
        const delta = (a[index] || 0) - (b[index] || 0);
        if (delta) return delta;
    }
    return 0;
}

function copyTree() {
    fs.rmSync(output, {recursive: true, force: true});
    fs.mkdirSync(output, {recursive: true});
    for (const folder of ['css', 'img', 'js', 'lib', 'catch-script']) {
        fs.cpSync(path.join(root, folder), path.join(output, folder), {recursive: true});
    }
    for (const locale of fs.readdirSync(path.join(root, '_locales'), {withFileTypes: true})) {
        if (!locale.isDirectory()) continue;
        fs.cpSync(path.join(root, '_locales', locale.name), path.join(output, '_locales', locale.name), {recursive: true});
    }
    for (const name of fs.readdirSync(root)) {
        if (name.endsWith('.html') || ['manifest.json', 'LICENSE', 'NOTICE.md', 'PRIVACY.md', '使用说明.md'].includes(name)) {
            fs.copyFileSync(path.join(root, name), path.join(output, name));
        }
    }
}

function omitYouTube(source, file) {
    const starts = source.match(/\/\* shiying-store-omit \*\//g) || [];
    const ends = source.match(/\/\* shiying-store-omit-end \*\//g) || [];
    if (starts.length !== ends.length) throw new Error(`Unbalanced store markers in ${file}`);
    const next = source.replace(OMIT, '');
    if (next.includes('shiying-store-omit')) throw new Error(`Store marker left in ${file}`);
    return next;
}

function stripHostPatterns(list) {
    return (list || []).filter(pattern => !YOUTUBE_HOST.test(String(pattern)));
}

function writeManifest() {
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    const version = compareVersion(manifest.version, STORE_FLOOR) >= 0 ? manifest.version : STORE_FLOOR;
    manifest.version = version;
    manifest.version_name = version;
    manifest.description = '__MSG_description__';
    manifest.host_permissions = stripHostPatterns(manifest.host_permissions);
    if (manifest.optional_host_permissions) manifest.optional_host_permissions = stripHostPatterns(manifest.optional_host_permissions);
    for (const script of manifest.content_scripts || []) script.matches = stripHostPatterns(script.matches);
    for (const resource of manifest.web_accessible_resources || []) {
        if (resource.matches) resource.matches = stripHostPatterns(resource.matches);
    }
    if (!manifest.host_permissions.some(pattern => pattern.includes('bilibili.com'))) throw new Error('Store manifest lost Bilibili host permissions');
    if ((manifest.content_scripts || []).some(script => !script.matches?.length)) throw new Error('A content script lost every match');
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return version;
}

function writeLocales() {
    const descriptions = {
        zh_CN: '免费开源、无广告的中文视频下载助手，支持 B站清晰度选择、完整 MP4 与单独 MP3 下载。',
        en: 'Free and open-source web video downloader. Supports Bilibili quality selection, full MP4 and MP3 downloads.'
    };
    const aria = {zh_CN: 'B站下载', en: 'Bilibili download'};
    for (const [locale, description] of Object.entries(descriptions)) {
        const file = path.join(output, '_locales', locale, 'messages.json');
        const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
        messages.description.message = description;
        if (messages.uiBiliYtAria) messages.uiBiliYtAria.message = aria[locale];
        if ([...description].length > 132) throw new Error(`${locale} description is longer than 132 characters`);
        fs.writeFileSync(file, JSON.stringify(messages, null, 2) + '\n');
    }
}

function rewriteCopy() {
    const replacements = [
        ['打开正常可播放的 B站或 YouTube 视频', '打开正常可播放的 B站视频'],
        ['打开 B站或 YouTube 视频', '打开 B站视频'],
        ['打开 YouTube 或 B站视频', '打开 B站视频'],
        ['B站和 YouTube 的主流程使用固定站点权限', 'B站的主流程使用固定站点权限'],
        ['B站和 YouTube 下载', 'B站下载'],
        ['Bilibili and YouTube download', 'Bilibili download'],
        ['默认 B站/YouTube 主流程', '默认 B站主流程'],
        ['B站、YouTube', 'B站'],
        ['B站或 YouTube', 'B站'],
        ['B站/YouTube', 'B站'],
        ['Bilibili and YouTube', 'Bilibili']
    ];
    const files = [];
    function walk(folder) {
        for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
            const file = path.join(folder, item.name);
            if (item.isDirectory()) walk(file);
            else files.push(file);
        }
    }
    walk(output);
    for (const file of files) {
        if (!/\.(html|md)$/i.test(file)) continue;
        if (['PRIVACY.md', 'NOTICE.md'].includes(path.basename(file))) continue;
        let text = fs.readFileSync(file, 'utf8');
        const original = text;
        for (const [from, to] of replacements) text = text.split(from).join(to);
        if (text !== original) fs.writeFileSync(file, text);
    }
}

function blockYouTubeHosts() {
    const file = path.join(output, 'js', 'shiying-access.js');
    const source = fs.readFileSync(file, 'utf8');
    const current = `    function editionBlocksHost(hostname) {
        return false;
    }`;
    const store = `    function editionBlocksHost(hostname) {
        const host = String(hostname || '').toLowerCase().replace(/\\.$/, '');
        if (host === 'youtu.be' || host.endsWith('.youtu.be')) return true;
        return ['youtube.com', 'youtube-nocookie.com', 'googlevideo.com', 'ytimg.com'].some(domain => host === domain || host.endsWith('.' + domain));
    }`;
    if (!source.includes(current)) throw new Error('Could not find editionBlocksHost to replace');
    fs.writeFileSync(file, source.replace(current, store));
}

function stripMarkedScripts() {
    for (const name of ['shiying-platform.js', 'shiying-background.js', 'shiying-engine.js', 'shiying-floating.js', 'shiying-platform-ui.js']) {
        const file = path.join(output, 'js', name);
        const next = omitYouTube(fs.readFileSync(file, 'utf8'), name);
        fs.writeFileSync(file, next);
        const checked = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
        if (checked.status !== 0) throw new Error(checked.stderr || `${name} failed syntax check`);
    }
}

function zipPackage(version) {
    fs.mkdirSync(release, {recursive: true});
    const target = path.join(release, `Ruxget-${version}-Chrome-Web-Store.zip`);
    const script = `
import hashlib, os, sys, zipfile
output, target = sys.argv[1:]
if os.path.exists(target):
    os.remove(target)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for folder, dirs, files in os.walk(output):
        dirs.sort(); files.sort()
        for name in files:
            full = os.path.join(folder, name)
            archive.write(full, os.path.relpath(full, output).replace(os.sep, '/'))
names = zipfile.ZipFile(target).namelist()
if 'manifest.json' not in names:
    raise SystemExit('manifest.json is not at the zip root')
digest = hashlib.sha256(open(target, 'rb').read()).hexdigest()
print({'zip': target, 'bytes': os.path.getsize(target), 'sha256': digest, 'entries': len(names)})
`;
    const result = spawnSync('python3', ['-c', script, output, target], {encoding: 'utf8'});
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'zip failed');
    process.stdout.write(result.stdout);
    return target;
}

copyTree();
const version = writeManifest();
writeLocales();
rewriteCopy();
blockYouTubeHosts();
stripMarkedScripts();
const zip = zipPackage(version);
const checked = spawnSync(process.execPath, [path.join(__dirname, 'check-chrome-store.cjs')], {encoding: 'utf8'});
if (checked.status !== 0) {
    fs.rmSync(zip, {force: true});
    process.stderr.write(checked.stdout || '');
    process.stderr.write(checked.stderr || '');
    process.exit(checked.status || 1);
}
process.stdout.write(checked.stdout || '');
console.log(JSON.stringify({folder: output, version, zip}));
