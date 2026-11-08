const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../js/shiying-core.js');
const result = core.playlist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"\n720/list.m3u8?token=a\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360\n/360.m3u8\n', 'https://example.test/video/master.m3u8');
assert.equal(result.variants[0].label, '720p');
assert.equal(result.variants[0].url, 'https://example.test/video/720/list.m3u8?token=a');
assert.equal(result.variants[1].url, 'https://example.test/360.m3u8');
assert.equal(core.playlist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="a.m3u8"', 'https://example.test/m.m3u8').separateAudio, true);
assert.throws(() => core.playlist('<html>error</html>', 'https://example.test'));
assert.equal(core.playlist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\njavascript:alert(1)', 'https://example.test').variants.length, 0);
assert.equal(core.validURL('javascript:alert(1)'), false);
assert.equal(core.validURL('https://example.test/video.mp4'), true);
assert.equal(core.kind({type:'application/vnd.apple.mpegurl'}), 'hls');
assert.equal(core.kind({ext:'m4s', type:'video/mp4'}), 'fragment');
assert.equal(core.kind({ext:'mpd'}), 'dash');
assert.equal(core.kind({ext:'m4a'}), 'audio');
assert.equal(core.name({name:'%bad'}), '%bad');
assert.equal(core.filename({title:'CON',ext:'mp4'}), '视频_CON.mp4');
assert.equal(core.filename({title:'../../你好:视频',ext:'mp4'}).includes('/'), false);
assert.equal(core.size(1024*1024), '1.0 MB');
// 0.4.73 finished-file check: B站 BV1Xx411c7cH P1 360p is stored 640×360 with non-square pixels and Chrome plays it as
// 640×480; it used to fail at 97% on every try. A truly different picture still fails.
{const stored = {width:640, height:360};
 assert.equal(core.pictureMatches({width:640, height:480}, stored), true, 'non-square pixels (4:3 shown from 640×360)');
 assert.equal(core.pictureMatches({width:640, height:360}, stored), true, 'square pixels');
 assert.equal(core.pictureMatches({width:853, height:360}, stored), true, 'wide pixels');
 assert.equal(core.pictureMatches({width:360, height:640}, stored), true, 'rotated phone video');
 assert.equal(core.pictureMatches({width:1920, height:1080}, {width:1920, height:1088}), true, 'cropped coded size');
 assert.equal(core.pictureMatches({width:852, height:480}, stored), false, '480p picture for a 360p choice');
 assert.equal(core.pictureMatches({width:1280, height:720}, stored), false, '720p picture for a 360p choice');
 assert.equal(core.pictureMatches({width:0, height:0}, stored), false, 'no picture');
 assert.equal(core.pictureMatches({width:640, height:2000}, stored), false, 'impossible stretch');
 const engine = fs.readFileSync(path.join(__dirname, '..', 'js/shiying-engine.js'), 'utf8'), page = fs.readFileSync(path.join(__dirname, '..', 'shiying-engine.html'), 'utf8');
 assert.ok(/Shiying\.pictureMatches\(actual,\{width,height\}\)/.test(engine) && !/actual\.height!==job\.height/.test(engine), 'the engine compares the played picture with the merged track');
 assert.ok(page.indexOf('js/shiying-core.js') >= 0 && page.indexOf('js/shiying-core.js') < page.indexOf('js/shiying-engine.js'), 'the engine page loads js/shiying-core.js first');}
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/manifest.json')));
assert.equal(manifest.default_locale, 'zh_CN');
assert.equal(manifest.action.default_popup, 'shiying.html');
assert.deepEqual(fs.readdirSync(path.join(root, 'build/_locales')), ['en', 'zh_CN']); // Chinese and English interface since 0.4.29
for (const name of fs.readdirSync(path.join(root, 'build'))) if (name.endsWith('.html')) {
    const html = fs.readFileSync(path.join(root, 'build', name), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="((?:js|lib|css|img)\/[^"?#]+)"/g)) assert.ok(fs.existsSync(path.join(root, 'build', match[1])), `${name}: ${match[1]}`);
}
// The synchronous catalog of the tool pages must match each edition's _locales.
const localeData = require('./locale-data.cjs');
for (const folder of ['', 'build', 'build-full']) assert.ok(localeData.inSync(path.join(root, folder)), `${folder || 'source'}: ${localeData.FILE} differs from _locales`);
for (const name of ['m3u8.html', 'mpd.html', 'json.html', 'downloader.html', 'preview.html', 'popup.html', 'options.html', 'shiying-help.html']) {
    const html = fs.readFileSync(path.join(root, 'build', name), 'utf8'), data = html.indexOf('js/ruxget-locale-data.js'), polyfill = html.indexOf('js/polyfill.js');
    assert.ok(data >= 0 && data < polyfill, `${name}: js/ruxget-locale-data.js must load before js/polyfill.js`);
}
assert.ok(fs.readFileSync(path.join(root, 'build/LICENSE'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE'));
assert.ok(fs.readFileSync(path.join(root, 'build/js/init.js'), 'utf8').includes('M3u8Ffmpeg: false'));
console.log('逻辑、中文包、资源路径与许可检查通过');
