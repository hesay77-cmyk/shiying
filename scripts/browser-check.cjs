// 自己生成媒体，在独立浏览器中验收。不会读取或更改个人 Chrome 资料。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {chromium} = require(process.env.SHIYING_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const run = path.join(root, '.checks', String(Date.now()));
fs.mkdirSync(run, {recursive:true});
const fixture = path.join(run, 'media');
fs.mkdirSync(fixture);
const ffmpeg = process.env.SHIYING_FFMPEG;
if (!ffmpeg) throw new Error('请设置 SHIYING_FFMPEG');
const ff = args => execFileSync(ffmpeg, ['-hide_banner','-loglevel','error', ...args], {windowsHide:true});
ff(['-f','lavfi','-i','testsrc2=size=640x360:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(fixture,'test360.mp4')]);
ff(['-i',path.join(fixture,'test360.mp4'),'-vn','-c:a','copy',path.join(fixture,'music.m4a')]);
for (const height of [360,720]) {
    fs.mkdirSync(path.join(fixture,String(height)));
    ff(['-i',path.join(fixture,'test360.mp4'),'-vf',`scale=-2:${height}`,'-c:v','libx264','-preset','ultrafast','-c:a','aac','-f','hls','-hls_time','2','-hls_list_size','0',path.join(fixture,String(height),'list.m3u8')]);
}
fs.writeFileSync(path.join(fixture,'master.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360\n360/list.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720\n720/list.m3u8\n');
const requested = [];
let origin;
const server = http.createServer((req,res) => {
    requested.push({url:req.url, referer:req.headers.referer});
    if (req.url === '/' || req.url === '/second') {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        return res.end(`<!doctype html><title>${req.url === '/' ? '拾影验收 · 本地视频' : '另一个网页'}</title><video controls autoplay muted src="/test360.mp4"></video><audio src="/music.m4a" preload="auto"></audio><script>fetch('/master.m3u8');</script>`);
    }
    const name = decodeURIComponent(new URL(req.url, origin).pathname).slice(1);
    const file = path.resolve(fixture,name);
    if (!file.startsWith(fixture + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    // 分段文件要求原网页来源头，验证下载器没有漏掉 Referer。
    if (name.endsWith('.ts') && req.headers.referer !== origin + '/') { res.writeHead(403); return res.end('missing referer'); }
    const types = {'.mp4':'video/mp4','.m4a':'audio/mp4','.m3u8':'application/vnd.apple.mpegurl','.ts':'video/mp2t'};
    const bytes = fs.readFileSync(file);
    res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Accept-Ranges','bytes');
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    if (range) {
        const start = Number(range[1]), end = Math.min(bytes.length-1,range[2] ? Number(range[2]) : bytes.length-1);
        res.writeHead(206, {'Content-Range':`bytes ${start}-${end}/${bytes.length}`, 'Content-Length':end-start+1});
        return res.end(bytes.subarray(start,end+1));
    }
    res.setHeader('Content-Length',bytes.length); res.end(bytes);
});
async function poll(action, timeout = 25000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const result = await action(); if (result) return result; await new Promise(resolve=>setTimeout(resolve,200)); }
    throw new Error('验收等待超时');
}
(async () => {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [], downloadEvents = [], external = [];
    const context = await chromium.launchPersistentContext(path.join(run,'profile'), {channel:'chromium', executablePath:process.env.SHIYING_CHROMIUM, headless:true, acceptDownloads:true, downloadsPath:path.join(run,'downloads'), viewport:{width:440,height:600}, locale:'en-US', args:[`--disable-extensions-except=${path.join(root,'build')}`,`--load-extension=${path.join(root,'build')}`,'--lang=en-US']});
    context.on('page', page => {page.on('pageerror', error=>errors.push(error.message));page.on('download', download=>downloadEvents.push(download));});
    context.on('request', req=>{if (/^https?:/.test(req.url()) && !req.url().startsWith(origin) && !req.url().startsWith('http://127.0.0.1:17863/')) external.push(req.url());});
    let success = false;
    try {
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const id = new URL(worker.url()).hostname;
        await poll(()=>worker.evaluate(()=>G.initLocalComplete && G.initSyncComplete));
        assert.equal(await worker.evaluate(()=>G.M3u8Ffmpeg), false);
        const page = await context.newPage();
        await page.goto(origin);
        const tabId = await worker.evaluate(async url=>(await chrome.tabs.query({})).find(tab=>tab.url===url).id, origin+'/');
        await poll(()=>worker.evaluate(tabId=>cacheData[tabId]?.some(item=>item.ext==='m3u8') && cacheData[tabId]?.some(item=>item.ext==='mp4') && cacheData[tabId]?.some(item=>item.ext==='m4a'),tabId));
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
        await popup.waitForSelector('.media-item');
        assert.equal(await popup.locator('.media-item').count(),3);
        await popup.screenshot({path:path.join(run,'main-light.png')});
        await popup.emulateMedia({colorScheme:'dark'});
        await popup.screenshot({path:path.join(run,'main-dark.png')});
        await popup.emulateMedia({colorScheme:'light'});
        await popup.setViewportSize({width:320,height:600});
        assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
        await popup.screenshot({path:path.join(run,'main-320.png')});
        await popup.setViewportSize({width:440,height:600});
        await popup.locator('[data-filter=audio]').click();
        assert.equal(await popup.locator('.media-item').count(),1);
        await popup.locator('[data-filter=all]').click();
        const hls = popup.locator('.media-item').filter({has:popup.locator('.format', {hasText:'分段视频'})});
        await hls.locator('.detail-button').click();
        await poll(async()=>await hls.locator('select option').count()===3);
        await hls.locator('select').selectOption(origin+'/720/list.m3u8');
        await popup.screenshot({path:path.join(run,'quality.png')});
        const previous = await worker.evaluate(async()=>(await chrome.downloads.search({})).map(item=>item.id));
        await hls.locator('.download-button').click();
        const hlsDownload = await poll(async()=>worker.evaluate(async ids=>(await chrome.downloads.search({})).find(item=>!ids.includes(item.id) && item.state==='complete'),previous),45000);
        console.log('HLS 下载状态', JSON.stringify({file:path.basename(hlsDownload.filename),state:hlsDownload.state,events:downloadEvents.map(item=>item.suggestedFilename())}));
        const completed = await poll(async()=>downloadEvents.find(item=>item.suggestedFilename().endsWith('.mp4')));
        const saved = path.join(run,'hls-result.mp4');
        await completed.saveAs(saved);
        const taskPage = context.pages().find(item=>item.url().includes('/m3u8.html?'));
        await taskPage.setViewportSize({width:1080,height:850});
        await taskPage.screenshot({path:path.join(run,'hls-task.png'),fullPage:true});
        const probe = spawnSync(ffmpeg,['-hide_banner','-i',saved,'-f','null','-'],{windowsHide:true,encoding:'utf8'});
        assert.equal(probe.status,0);
        assert.match(probe.stderr,/Video:.*1280x720/);
        assert.match(probe.stderr,/Audio: aac/);
        assert.ok(fs.statSync(saved).size>1000);
        assert.ok(requested.some(item=>item.url.startsWith('/720/') && item.url.endsWith('.ts') && item.referer===origin+'/'));
        const mp4 = popup.locator('.media-item').filter({has:popup.locator('.format', {hasText:/^MP4$/})});
        const beforeDirect = await worker.evaluate(async()=>(await chrome.downloads.search({})).map(item=>item.id));
        const beforeEventCount = downloadEvents.length;
        await mp4.locator('.download-button').click();
        await poll(async()=>context.pages().some(item=>item.url().includes('/downloader.html?')));
        await popup.close();
        const direct = await poll(async()=>worker.evaluate(async ids=>(await chrome.downloads.search({})).find(item=>!ids.includes(item.id) && item.state==='complete'),beforeDirect));
        const event = await poll(async()=>downloadEvents[beforeEventCount]);
        const directSaved = path.join(run,'direct-result.mp4'); await event.saveAs(directSaved);
        assert.deepEqual(fs.readFileSync(directSaved),fs.readFileSync(path.join(fixture,'test360.mp4')));
        const fresh = await context.newPage(); await fresh.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);
        await fresh.waitForSelector('.media-item');
        await fresh.locator('#search').fill('没有这个文件');
        assert.equal(await fresh.locator('.media-item').count(),0);
        assert.match(await fresh.locator('#empty').innerText(),/没有符合/);
        await fresh.locator('#search').fill('');
        await fresh.locator('#clear').click();
        await poll(async()=>await fresh.locator('.media-item').count()===0);
        await fresh.screenshot({path:path.join(run,'empty.png')});
        const advanced = await context.newPage(); await advanced.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`); await advanced.waitForTimeout(700);
        assert.match(await advanced.locator('#currentTab').innerText(),/当前页面/);
        const help = await context.newPage(); await help.goto(`chrome-extension://${id}/shiying-help.html`);
        await help.locator('.help-details summary').click();
        assert.match(await help.locator('body').innerText(),/GPL-3.0/);
        assert.deepEqual(errors,[]);
        assert.deepEqual(external,[]);
        const summary = {passed:true, screenshots:run, checks:['扩展实际加载','英文浏览器中的中文回落','视频/音频/HLS 识别','720p 清晰度选择','带来源头的 HLS 本地 MP4 合并及解码','关闭小窗口后 MP4 下载继续并逐字节一致','筛选与空列表','320px/浅色/深色界面','高级工具与许可页','未连接第三方转换服务'], errors, external};
        fs.writeFileSync(path.join(root,'.checks','latest.json'),JSON.stringify(summary,null,2));
        success = true;
        console.log(JSON.stringify(summary,null,2));
    } finally {
        if (!success) for (const page of context.pages()) if (/m3u8|downloader/.test(page.url())) console.log('失败时下载页', await page.locator('body').innerText().catch(()=>''));
        if (!success) console.log('页面错误', JSON.stringify(errors));
        await context.close(); server.close();
    }
})().catch(error=>{console.error(error.stack); server.close();process.exitCode=1;});
