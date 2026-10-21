const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build-chrome-store');
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
const youtubeHost = /youtube\.com|youtu\.be|googlevideo\.com|ytimg\.com|youtube-nocookie\.com/i;

function patternsOf(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(patternsOf);
    if (typeof value === 'string') return [value];
    return Object.values(value).flatMap(patternsOf);
}

const permissionText = [
    ...patternsOf(manifest.host_permissions),
    ...patternsOf(manifest.optional_host_permissions),
    ...patternsOf(manifest.content_scripts),
    ...patternsOf(manifest.web_accessible_resources)
].join('\n');
assert(!youtubeHost.test(permissionText), permissionText);
assert(manifest.host_permissions.some(pattern => pattern.includes('bilibili.com')));
assert(manifest.host_permissions.some(pattern => pattern.includes('bilivideo.com')));
assert(manifest.content_scripts.some(script => script.js.includes('js/content-script.js') && script.matches.some(pattern => pattern.includes('bilibili.com'))));
assert.equal(manifest.description, '__MSG_description__');
assert.ok(manifest.version > '0.4.42' || manifest.version === '0.4.43');
assert(!fs.existsSync(path.join(output, 'js', 'shiying-youtube.js')));

for (const locale of ['zh_CN', 'en']) {
    const messages = JSON.parse(fs.readFileSync(path.join(output, '_locales', locale, 'messages.json'), 'utf8'));
    assert(!/youtube/i.test(JSON.stringify(messages)), locale);
    assert([...messages.description.message].length <= 132);
}
assert(JSON.parse(fs.readFileSync(path.join(output, '_locales/zh_CN/messages.json'), 'utf8')).description.message.includes('B站'));

function walk(folder, visit) {
    for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
        const file = path.join(folder, item.name);
        if (item.isDirectory()) walk(file, visit);
        else visit(file);
    }
}
const marketing = [];
walk(output, file => {
    if (!/\.(js|html|json|md)$/i.test(file)) return;
    if (['PRIVACY.md', 'NOTICE.md'].includes(path.basename(file))) return;
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/function editionBlocksHost\(hostname\) \{[\s\S]*?\n    \}/, '');
    text = text.replace(/yt-navigate-finish/g, '');
    if (/youtube|youtu\.be|googlevideo|ytimg|YouTube/i.test(text)) marketing.push(path.relative(output, file));
});
assert.deepEqual(marketing, []);

const platform = require(path.join(output, 'js', 'shiying-platform.js'));
assert.equal(typeof platform.youtubeCatalog, 'undefined');
assert.equal(platform.source('https://www.bilibili.com/video/BV15z4y1U7HS/').site, 'bilibili');
assert.throws(() => platform.source('https://www.youtube.com/watch?v=abcdefghijk'));
assert.throws(() => platform.source('https://youtu.be/abcdefghijk'));
assert.equal(platform.mediaURL('https://upos-sz-mirrorcos.bilivideo.com/video.m4s', 'bilibili').includes('bilivideo.com'), true);
assert.throws(() => platform.mediaURL('https://rr1.googlevideo.com/videoplayback', 'youtube'));
assert(!/youtubeCatalog|googlevideo|youtubei|VISITOR_DATA|visitorData/i.test(fs.readFileSync(path.join(output, 'js', 'shiying-background.js'), 'utf8')));
assert(!/catalog\.site==='youtube'|googlevideo/i.test(fs.readFileSync(path.join(output, 'js', 'shiying-engine.js'), 'utf8')));
assert(/readBilibiliPage|bilibiliCatalog/.test(fs.readFileSync(path.join(output, 'js', 'shiying-platform.js'), 'utf8')));

const accessSource = fs.readFileSync(path.join(output, 'js', 'shiying-access.js'), 'utf8');
const context = {document: {}, URL, chrome: {runtime: {getManifest: () => manifest}, permissions: {getAll: async () => ({origins: manifest.host_permissions}), request() { return Promise.resolve(false); }, remove() { return Promise.resolve(true); }}}};
vm.createContext(context);
vm.runInContext(accessSource + '\nglobalThis.access=ShiyingAccess;', context);
assert.equal(context.access.origin('https://www.youtube.com/watch?v=abcdefghijk'), null);
assert.equal(context.access.origin('https://m.youtube.com/watch?v=abcdefghijk'), null);
assert.equal(context.access.origin('https://youtu.be/abcdefghijk'), null);
assert.equal(context.access.blocks('https://rr1.googlevideo.com/video'), true);
assert.equal(context.access.blocks('https://www.bilibili.com/video/BV15z4y1U7HS/'), false);
assert.equal(context.access.origin('https://www.bilibili.com/video/BV15z4y1U7HS/'), 'https://www.bilibili.com/*');

const zipName = fs.readdirSync(path.join(root, 'release')).find(name => name.startsWith('Ruxget-') && name.endsWith('-Chrome-Web-Store.zip'));
assert.ok(zipName, 'missing store zip');
const listing = require('node:child_process').spawnSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); names=z.namelist();\nprint("manifest.json" in names)\nprint(any(n.startswith("desktop/") for n in names))', path.join(root, 'release', zipName)], {encoding: 'utf8'});
assert.equal(listing.status, 0);
const [hasManifest, hasDesktop] = listing.stdout.trim().split(/\s+/);
assert.equal(hasManifest, 'True');
assert.equal(hasDesktop, 'False');
assert.rejects(context.access.request(['https://www.youtube.com/*'])).then(() => {
    console.log('Chrome Web Store package excludes YouTube permissions and keeps Bilibili');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
