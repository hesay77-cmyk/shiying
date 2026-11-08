// Lists visible Chinese text left in the English interface (popup, its dialogs, desktop app, extension pages,
// and the inherited tool pages m3u8/mpd/json/downloader/preview/popup/options on a Chinese Chrome).
// 0.4.74: also the Chinese interface (no English labels, colons in each language's style) and switching the language
// while the panel or a tool page stays open (A2, D: visible pages switch in place, hidden idle pages may reload once,
// touched or busy pages and the page the change was made on never reload). Fixture titles are Chinese on purpose.
// Exit code 1 when anything is found.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(require('node:path').join((process.env.RUXGET_TMP||require('node:os').tmpdir()),'ruxget-english-scan-'));
// Fixture titles/paths are Chinese on purpose; the language switch names Chinese in Chinese by design.
const fixtureText=/Fixture clip|一段可以安心下载的视频|沿着海岸线的旅行|公开视频列表测试|第一集|第二集|已失效的视频|拾影|归档文件|reports\\|中 = 中文|中=Chinese|^中文$/;
const collect=()=>{const out=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){const text=node.textContent.trim();if(!/[\u3400-\u9fff]/.test(text))continue;const el=node.parentElement;if(!el||el.closest('script,style,template,[hidden]'))continue;const s=getComputedStyle(el);const r=el.getBoundingClientRect();if(s.display==='none'||s.visibility==='hidden'||r.width===0||r.height===0)continue;out.push(text.slice(0,80));}
 for(const el of document.querySelectorAll('[placeholder],[title],[aria-label]'))for(const attr of ['placeholder','title','aria-label']){const v=el.getAttribute(attr);if(v&&/[\u3400-\u9fff]/.test(v)&&el.getClientRects().length)out.push('@'+attr+': '+v.slice(0,80));}
 return [...new Set(out)];};
// 0.4.74: the Chinese interface shows no English labels (only names such as FFmpeg, M3U8, Kbps), and every label uses
// its own language's colon: 「分辨率：320×184」 in Chinese, "Resolution: 320×184" in English (no full-width colon, no
// "Resolution:320"). Values (addresses, file names, numbers) are not labels and are skipped.
const mixedText=lang=>{const out=[];const keep=/^(Ruxget|FFmpeg|ffmpeg|Aria2|aria2|MQTT|mqtt|RPC|MP4|MP3|M3U8|m3u8|MPD|mpd|URL|URLs|HLS|DASH|Kbps|kbps|KB|MB|GB|fps|MIME|Hex|Base64|Referer|BaseURL|Chrome|ID|JSON|TS|AES|IV|PSSH|WebRTC|HTTP|HTTPS|UA|User|Agent|VLC|vlc|PotPlayer|MPV|mpv|IINA|Firefox|Edge|QR|Ctrl|Shift|Alt|Fixture|Regex|regex|Blob|blob|catCatch|CatCatch|Kb|kb|Mb|ms|px|x|AAC|AVC|HEVC|Widevine|PlayReady|FairPlay|Cookie|Origin|N_m3u8DL|RE|GitHub|Star|CPU|CSS|QoS|IP|WebSocket|WSS|WS|GET|POST|PUT|CLI|MX|Player|Free|PotPlayerFix|Android|Cloudflare|m3u8DL|Content|Type|English|v\d+|B|P|K|p|BV|SRT|App|Pro|Mbps|Gbps|H|VP8|VP9|AV1|Opus|Vorbis|AC|E|media|fixture)$/; // 0.4.76: codec names, and the fixture host named in the DASH page
 // Example paths and JSON inside a hint ("例如 D:\downloads", {"header1":…}) are values too.
 const words=text=>(text.replace(/\S*[\\\/{}"]\S*/g,'').match(/[A-Za-z][A-Za-z0-9_]*/g)||[]).filter(w=>!keep.test(w));
 // Values: template variables, MIME types, a bare extension (with its size), addresses, file names, numbers.
 const value=text=>/\$\{|^[\w.+-]+\/[\w.+-]+(;.*)?$|^[\w-]+\.[a-z]{2,}\/|^[a-z0-9]{2,5}(\s*\/\s*[\d.]+\s*[KMG]?B)?$|:\/\/|^[\w.-]+\.(mp4|m3u8|ts|bin|json|m4s|mpd|mp3|png|svg)\b|^[\d\s.:×x\/|-]+$|^chrome-extension:|^blob:|^data:/.test(text);
 const colon=text=>lang==='zh'?(/[\u3400-\u9fff）)]\s*:(?!\/\/)/.test(text)?'ASCII colon in Chinese: ':/[㐀-鿿]\s*,\s*[㐀-鿿]/.test(text)?'ASCII comma in Chinese: ':''):(/：/.test(text)?'full-width colon in English: ':/[A-Za-z)]:(?=[A-Za-z0-9\u3400-\u9fff])/.test(text.replace(/[a-z-]+:\/\/|blob:|data:/g,''))?'no space after colon: ':'');
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){const text=node.textContent.trim();if(!text)continue;const el=node.parentElement;if(!el||el.closest('script,style,template,[hidden],textarea,a,option,.url,#m3u8_url,#mpd_url,.resource-url,#json-renderer'))continue;const st=getComputedStyle(el);const r=el.getBoundingClientRect();if(st.display==='none'||st.visibility==='hidden'||r.width===0||r.height===0)continue;
  const c=colon(text);if(c)out.push(c+text.slice(0,80));
  // The DASH track names (v1, a1, en) come from the manifest.
  if(lang==='zh'&&!value(text)&&!el.closest('#info,#mpdVideoLists,#mpdAudioLists')&&words(text).length)out.push('English in Chinese UI: '+text.slice(0,80)+' ['+words(text).slice(0,4).join(',')+']');}
 if(lang==='zh')for(const el of document.querySelectorAll('[placeholder],[title],[aria-label],option'))for(const attr of ['placeholder','title','aria-label','text']){const v=attr==='text'?(el.tagName==='OPTION'?el.textContent:''):el.getAttribute(attr);if(!v||value(v))continue;if(el.tagName==='OPTION'?!el.parentElement?.getClientRects().length||el.closest('#mpdVideoLists,#mpdAudioLists'):!el.getClientRects().length)continue;if(words(v).length)out.push('English in Chinese UI @'+attr+': '+v.slice(0,80)+' ['+words(v).slice(0,4).join(',')+']');}
 return [...new Set(out)];};
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const exe=process.env.SHIYING_CHROMIUM||undefined;
 const results={};const record=async(name,page)=>{await page.waitForTimeout(300);const found=(await page.evaluate(collect)).filter(t=>!fixtureText.test(t));results[name]=found;await page.screenshot({path:path.join(report,name+'.png')});console.log((found.length?'FOUND ':'clean ')+name+(found.length?'\n   '+found.join('\n   '):''));};
 // A. Extension popup and pages.
 const extension=path.join(report,'extension');fs.mkdirSync(extension);
 for(const dir of ['js','css','img','lib','catch-script','_locales'])fs.cpSync(path.join(root,dir),path.join(extension,dir),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name==='manifest.json')fs.copyFileSync(path.join(root,name),path.join(extension,name));
 const browser=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:exe,headless:true,locale:'en-US',viewport:{width:360,height:640},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--lang=en-US','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 try{
  await browser.route('**/*',route=>new URL(route.request().url()).protocol==='chrome-extension:'?route.continue():route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'}));
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetUiLanguage:'en'}));
  const site=await browser.newPage();await site.goto('https://www.bilibili.com/video/BV15z4y1U7HS/');
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('BV15z4y1U7HS')).id);
  const other=await browser.newPage();await other.goto('https://example.com/page');
  const otherId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('example.com')).id);
  await browser.addInitScript(()=>{
   if(location.protocol!=='chrome-extension:')return;
   chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;
   chrome.runtime.sendNativeMessage=async()=>{throw new Error('Specified native messaging host not found.');};
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   chrome.runtime.sendMessage=async message=>{
    if(message.Message==='shiyingPlatformRead'&&/BV1xxxxxxxxx/.test(message.url))return {ok:false,error:'没有找到这个视频，请检查链接'};
    if(message.Message==='shiyingPlatformRead')return {ok:true,id:'catalog',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',site:'bilibili',parts:2,duration:252,choices:[{height:1080,label:'1080p'},{height:720,label:'720p'}],audioAvailable:true};
    if(message.Message==='shiyingPlatformDesktop')return {ok:true,payload:{action:'add'}};
    if(message.Message==='shiyingCollectionRead'&&/slowlist/.test(message.url||''))await new Promise(r=>setTimeout(r,8000));
    if(message.Message==='shiyingCollectionRead')return {ok:true,id:'list',title:'公开视频列表测试',entries:[{url:'https://www.bilibili.com/video/BV15z4y1U7HS/?p=1',title:'第一集',duration:'4:12',available:true},{url:'https://www.bilibili.com/video/BV15z4y1U7HS/?p=2',title:'已失效的视频',duration:'',available:false}],hasMore:true};
    if(message.Message==='shiyingPlatformStart')return {ok:true,id:'job',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',status:'downloading',stage:'Downloading',progress:30};
    if(message.Message==='getData')return [];
    return send(message);
   };
  });
  const page=await browser.newPage();page.on('pageerror',e=>console.log('pageerror',e.message));
  await page.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await page.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);
  await record('popup-video',page);
  // 0.4.71: no ⋯ or ▾ menu; who downloads comes from settings → 交给桌面版.
  await page.locator('label[for=formatAudio]').click();await record('popup-mp3',page);await page.locator('label[for=formatVideo]').click();
  await page.locator('#collectionOpen').click();await page.locator('#collectionRead').click();await page.locator('#collectionList').waitFor({state:'visible'});await record('popup-playlist',page);await page.locator('#collectionClose').click();
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetDesktopMode:'all'}));await page.waitForFunction(()=>!document.querySelector('#platformUseBrowser').hidden);await record('popup-desktop-mode',page);
  await page.locator('#platformDownload').click();await page.locator('#desktopConnectPrompt').waitFor();await record('popup-desktop-missing-dialog',page);
  await page.locator('#desktopConnectPrompt').evaluate(d=>d.close());await page.waitForFunction(()=>document.querySelector('#platformNote').textContent.length>0);await record('popup-desktop-not-connected',page);
  await page.locator('#platformDownload').click();await page.locator('#desktopConnectPrompt').waitFor();await page.locator('[data-desktop-action=chrome]').click();await page.waitForTimeout(200);await record('popup-job',page);
  await worker.evaluate(()=>chrome.storage.local.set({ruxgetDesktopMode:'never'}));
  await page.goto(`chrome-extension://${id}/shiying.html?tabId=${otherId}`);await page.waitForTimeout(800);await record('popup-other-site',page);
  await page.locator('#platformURL').fill('https://example.com/file.zip');await page.locator('#platformRead').click();await page.locator('#linkDownload').waitFor({state:'visible'});await record('popup-link-dialog',page);
  // A2. 0.4.74: the language switched in the settings while the panel stays open. Every text of the panel follows at once,
  //     in both directions: the task area (stage, 打开, 删除文件), 分 P 勾选下载…, a read error, a paste note and the
  //     parts sheet. The task buttons keep one line each at 360 px. Screenshots: live-*.png.
  {
   const jobUrl=await worker.evaluate(u=>ShiyingPlatform.source(u).url,'https://www.bilibili.com/video/BV15z4y1U7HS/');
   const setJob=values=>worker.evaluate(v=>chrome.storage.local.set(v),{shiyingJobIds:['live'],'shiyingJob:live':{id:'live',url:jobUrl,title:'一段可以安心下载的视频',format:'mp4',height:720,label:'720p',progress:100,status:'complete',stage:'下载完成，文件和声音已检查',downloadId:7,...values}});
   const setLang=lang=>worker.evaluate(l=>chrome.storage.local.set({ruxgetUiLanguage:l}),lang);
   // Each task button on one line, inside the capsule.
   const buttonsFit=p=>p.evaluate(()=>{const box=document.querySelector('#platformJob').getBoundingClientRect(),bad=[];for(const b of document.querySelectorAll('#platformJob .job-actions button')){if(b.hidden||!b.getClientRects().length)continue;const r=b.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(b);if(new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size>1)bad.push('button on two lines: '+b.textContent);if(r.right>box.right+0.5||r.left<box.left-0.5)bad.push('button outside the task box: '+b.textContent);}return bad;});
   const live=async(name,prepare)=>{
    await setLang('zh_CN');await setJob(prepare.job||{});
    const p=await browser.newPage();await p.setViewportSize({width:360,height:640});p.on('pageerror',e=>console.log('pageerror',e.message));
    await p.goto(`chrome-extension://${id}/shiying.html?tabId=${tabId}`);await p.waitForFunction(()=>!document.querySelector('#platformDownload').disabled);await p.waitForTimeout(500);
    if(prepare.run)await prepare.run(p);
    const zhProblems=[...(await p.evaluate(mixedText,'zh')).filter(t=>!fixtureText.test(t)).map(t=>'[zh before] '+t),...(await buttonsFit(p)).map(t=>'[zh] '+t)];
    await p.screenshot({path:path.join(report,`live-${name}-zh.png`)});
    await setLang('en');await p.waitForTimeout(700);
    await record(`live-${name}-en`,p);
    const enProblems=[...(await p.evaluate(mixedText,'en')).map(t=>'[en] '+t),...(await buttonsFit(p)).map(t=>'[en] '+t)];
    await setLang('zh_CN');await p.waitForTimeout(700);
    await p.screenshot({path:path.join(report,`live-${name}-back-zh.png`)});
    const backProblems=[...(await p.evaluate(mixedText,'zh')).filter(t=>!fixtureText.test(t)).map(t=>'[back to zh] '+t),...(await buttonsFit(p)).map(t=>'[back to zh] '+t)];
    const problems=[...zhProblems,...enProblems,...backProblems];
    if(prepare.expect)problems.push(...await prepare.expect(p));
    if(problems.length){results[`live-${name} (switch)`]=problems;console.log(`FOUND live-${name} (switch)\n   `+problems.join('\n   '));}else console.log(`clean live-${name} (zh → en → zh)`);
    await p.close();
   };
   await live('done',{expect:async p=>{const stage=await p.locator('#platformStage').innerText();return /下载完成，文件和声音已检查/.test(stage)?[]:['stage after switching back: '+stage];}});
   await live('failed',{job:{status:'error',progress:97,stage:'正在检查成品',error:'成品时长或清晰度不符合选择，请重新下载',downloadId:undefined}});
   await live('running',{job:{status:'downloading',progress:42,stage:'正在下载视频画面',downloadId:undefined}});
   await live('armed-delete',{run:p=>p.locator('#platformDelete').click()});
   await live('bad-link',{run:async p=>{await p.locator('#platformURL').fill('https://www.bilibili.com/video/BV1xxxxxxxxx/');await p.locator('#platformRead').click();await p.locator('#platformError').waitFor({state:'visible'});}});
   await live('paste-note',{run:async p=>{await p.locator('#platformURL').fill('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567');await p.locator('#platformRead').click();await p.locator('#platformPasteNote').waitFor({state:'visible'});}});
   await live('parts-sheet',{run:async p=>{await p.locator('#collectionOpen').click();await p.locator('#collectionList').waitFor({state:'visible'});}});
   // 0.4.74 review: a button whose text the panel changed to show a state (「读取中…」 while the list loads) keeps that
   // state across the switch, in the new language; it never falls back to its static label 「读取列表」 / "Read list".
   await live('reading-list',{run:async p=>{await p.locator('#collectionOpen').click();await p.locator('#collectionList').waitFor({state:'visible'});await p.locator('#collectionURL').fill('https://www.bilibili.com/video/BV15z4y1U7HS/?slowlist=1');await p.locator('#collectionRead').click();await p.waitForFunction(()=>document.querySelector('#collectionRead').disabled);},
    expect:async p=>{const button=await p.evaluate(()=>({text:document.querySelector('#collectionRead').textContent,disabled:document.querySelector('#collectionRead').disabled}));return button.disabled&&button.text==='读取中…'?[]:['reading button after zh → en → zh: '+JSON.stringify(button)];}});
   await worker.evaluate(()=>chrome.storage.local.remove(['shiyingJobIds','shiyingJob:live']));await setLang('en');
  }
  // A3. 0.4.74 retest: pages left open while the language is changed somewhere else follow it at once, both ways:
  //     a second settings tab (its own choice ticked again, so clicking a language there still works), 高级选项 → 语言,
  //     the progress page of a finished download (also with 删除文件 armed), the desktop-app sheet
  //     (shiying-get-desktop.html) and the help page's site list. Screenshots: follow-*.png.
  {
   const setLang=lang=>worker.evaluate(l=>chrome.storage.local.set({ruxgetUiLanguage:l}),lang);
   const open=async(address,size)=>{const p=await browser.newPage();await p.setViewportSize(size||{width:900,height:900});p.on('pageerror',e=>console.log('pageerror',e.message));await p.goto(`chrome-extension://${id}/${address}`);await p.waitForTimeout(900);return p;};
   const text=(p,selector)=>p.evaluate(s=>{const el=document.querySelector(s);return el?el.textContent.trim():null;},selector);
   const chineseLeft=async p=>(await p.evaluate(collect)).filter(t=>!fixtureText.test(t));
   const htmlLang=p=>p.evaluate(()=>document.documentElement.lang);
   const conclude=(name,problems,note)=>{if(problems.length){results[name]=problems;console.log(`FOUND ${name}\n   `+problems.join('\n   '));}else console.log(`clean ${name} (${note})`);};
   // expect: {selector: [zh, en]} (a RegExp matches, a string must be equal).
   const follows=async(p,lang,step,expect)=>{
    const problems=[],want=lang==='en'?'en':'zh-CN',lang2=await htmlLang(p);
    if(lang2!==want)problems.push(`[${step}] html lang is ${lang2}, expected ${want}`);
    if(lang==='en')problems.push(...(await chineseLeft(p)).map(t=>`[${step}] Chinese left: `+t));
    for(const [selector,[zh,en]] of Object.entries(expect||{})){const wanted=lang==='en'?en:zh,shown=await text(p,selector);if(wanted instanceof RegExp?!wanted.test(shown||''):shown!==wanted)problems.push(`[${step}] ${selector} reads ${JSON.stringify(shown)}, expected ${wanted}`);}
    return problems;};
   await setLang('zh_CN');
   // Settings: tab A, tab B and 高级选项 open together.
   {
    const name='follow-settings',problems=[];
    const a=await open('ruxget-settings.html'),b=await open('ruxget-settings.html'),options=await open('options.html');
    const ticked=p=>p.evaluate(()=>document.querySelector('input[name=language]:checked')?.value||null);
    const labels={'#settingsSubtitle':['设置','Settings'],'#languageTitle':['语言','Language'],'#desktopTitle':['交给桌面版','Hand downloads to the desktop app'],'#versionText':[/^版本 /,/^Version /]};
    const step=async(label,lang,choice)=>{await b.waitForTimeout(900);for(const [tab,p] of Object.entries({A:a,B:b})){problems.push(...await follows(p,lang,`${label}, tab ${tab}`,labels));const value=await ticked(p);if(value!==choice)problems.push(`[${label}, tab ${tab}] ticked ${value}, expected ${choice}`);}};
    await a.locator('label:has(input[name=language][value=en])').click();await step('English chosen in tab A','en','en');
    await b.screenshot({path:path.join(report,'follow-settings-B-en.png')});
    await options.locator('#languageSelect').selectOption('zh_CN');await step('中文 chosen in 高级选项','zh_CN','zh_CN');
    await b.screenshot({path:path.join(report,'follow-settings-B-zh.png')});
    // The tester's case: tab B still had its old choice ticked, so clicking it did nothing.
    await b.locator('label:has(input[name=language][value=en])').click();await step('English clicked in tab B','en','en');
    await b.locator('label:has(input[name=language][value=zh_CN])').click();await step('中文 clicked in tab B','zh_CN','zh_CN');
    // 跟随浏览器 on this English Chromium: the text is English, 跟随浏览器 ticked.
    await options.locator('#languageSelect').selectOption('auto');await step('跟随浏览器 chosen in 高级选项','en','auto');
    await options.locator('#languageSelect').selectOption('zh_CN');await step('中文 chosen in 高级选项 again','zh_CN','zh_CN');
    await a.close();await b.close();await options.close();
    conclude(name,problems,'second tab and 高级选项 → both tabs follow, choice ticked');
   }
   // The progress page after the download has ended (it no longer refreshes itself).
   {
    const name='follow-task',problems=[];
    await worker.evaluate(v=>chrome.storage.local.set(v),{'shiyingJob:follow':{id:'follow',url:'https://www.bilibili.com/video/BV15z4y1U7HS/',title:'一段可以安心下载的视频',format:'mp4',height:720,label:'720p',progress:100,status:'complete',stage:'下载完成，文件和声音已检查',downloadId:7,file:'C:\\Users\\me\\Downloads\\Ruxget\\一段可以安心下载的视频.mp4',verification:{width:1280,height:720,audioActive:true,duration:252,fullDecode:true,bytes:3460000}}});
    const p=await open('shiying-task.html?id=follow',{width:720,height:900});
    await p.waitForFunction(()=>document.body.dataset.status==='complete');
    const labels={'#taskLabel':['下载完成','Download complete'],'#taskStage':['下载完成，文件和声音已检查',/^[^\u3400-\u9fff]+$/],'#taskNote':['已保存 3.3 MB。可以关闭这个页面。','Saved 3.3 MB. You can close this page.'],'#resultAudio':['已检测到声音','Audio detected'],'#resultIntegrity':['4 分 12 秒，完整检查通过','4 min 12 s · Full check passed'],'#taskMeta':['720p · MP4 · 含声音','720p · MP4 · with audio'],'#deleteTask':['删除文件','Delete file']};
    for(const lang of ['en','zh_CN','en']){await setLang(lang);await p.waitForTimeout(800);problems.push(...await follows(p,lang,'complete → '+lang,labels));}
    await p.screenshot({path:path.join(report,'follow-task-en.png')});
    await p.locator('#deleteTask').click();
    for(const lang of ['zh_CN','en']){await setLang(lang);await p.waitForTimeout(700);problems.push(...await follows(p,lang,'删除文件 armed → '+lang,{'#deleteTask':['再点一次确认删除','Click again to delete']}));}
    await p.screenshot({path:path.join(report,'follow-task-armed-en.png')});
    await setLang('zh_CN');await p.waitForTimeout(700);await p.screenshot({path:path.join(report,'follow-task-zh.png')});
    await p.close();await worker.evaluate(()=>chrome.storage.local.remove('shiyingJob:follow'));
    conclude(name,problems,'zh → en → zh → en, armed delete too');
   }
   // The desktop-app sheet (opened by the service worker when the desktop app is missing) and the help page's site list.
   for(const [name,address,labels] of [
    ['follow-get-desktop','shiying-get-desktop.html',{'#desktopConnectTitle':['尚未连接 Ruxget 桌面版',/^[^\u3400-\u9fff]+$/],'[data-desktop-action=install]':['下载安装',/^[^\u3400-\u9fff]+$/],'[data-desktop-action=chrome]':['继续用 Chrome',/^[^\u3400-\u9fff]+$/]}],
    ['follow-help','shiying-help.html#site-access',{'#grantedSites li':['尚未允许其他网站。','No other sites allowed yet.']}]]){
    await setLang('zh_CN');
    const p=await open(address,{width:720,height:900}),problems=[];
    problems.push(...await follows(p,'zh_CN','opened in Chinese',labels));
    for(const lang of ['en','zh_CN','en']){await setLang(lang);await p.waitForTimeout(900);problems.push(...await follows(p,lang,'→ '+lang,labels));}
    await p.screenshot({path:path.join(report,name+'-en.png')});
    await p.close();
    conclude(name,problems,'zh → en → zh → en');
   }
   await setLang('en');
  }
  for(const name of ['ruxget-settings.html','shiying-help.html','shiying-desktop.html','shiying-task.html']){const p=await browser.newPage();await p.setViewportSize({width:900,height:900});await p.goto(`chrome-extension://${id}/${name}`);await p.waitForTimeout(800);await record('page-'+name.replace('.html',''),p);await p.close();}
 }finally{await browser.close();}
 // C. Inherited tool pages follow ruxgetUiLanguage, not Chrome's language (0.4.73: a Chinese Chrome showed m3u8/mpd in Chinese
 //    with Ruxget set to English). Chrome runs in Chinese with Ruxget in English, then English Chrome with Ruxget in Chinese,
 //    and "auto" on a Chinese Chrome; each run also checks the one-time reload after a stale or missing localStorage mirror.
 //    Media and JSON come from stub responses; downloads are stubbed so nothing is saved.
 const fixture={
  // 0.4.74: a master playlist, so the variant list shows 「分辨率：320×184 | 码率：800 Kbps」.
  master:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=320x184\nindex.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=640x368\nindex.m3u8?hd=1\n',
  m3u8:'#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nseg0.ts\n#EXTINF:10.0,\nseg1.ts\n#EXT-X-ENDLIST\n',
  mpd:'<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"><Period><AdaptationSet mimeType="video/mp4" contentType="video"><Representation id="v1" bandwidth="800000" width="1280" height="720" codecs="avc1.64001f"><SegmentTemplate media="v1-$Number$.m4s" initialization="v1-init.mp4" duration="10" startNumber="1" timescale="1"/></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4" contentType="audio" lang="en"><Representation id="a1" bandwidth="128000" codecs="mp4a.40.2"><SegmentTemplate media="a1-$Number$.m4s" initialization="a1-init.mp4" duration="10" startNumber="1" timescale="1"/></Representation></AdaptationSet></Period></MPD>',
  json:JSON.stringify({title:'Fixture',items:[1,2,{kind:'sample'}]})};
 const media='https://media.fixture/video/';
 const toolPages=[
  ['m3u8-master',`m3u8.html?url=${encodeURIComponent(media+'master.m3u8')}`],
  ['m3u8',`m3u8.html?url=${encodeURIComponent(media+'index.m3u8')}&title=${encodeURIComponent('Fixture clip')}`],
  ['mpd',`mpd.html?url=${encodeURIComponent(media+'manifest.mpd')}`],
  ['json',`json.html?url=${encodeURIComponent('https://media.fixture/data.json')}`],
  ['downloader','downloader.html'],
  ['downloader-file',`downloader.html?JSON=${encodeURIComponent(JSON.stringify({url:media+'file.bin',requestId:'91003',name:'file.bin',ext:'bin'}))}`],
  ['dash',`dash-download.html?url=${encodeURIComponent(media+'manifest.mpd')}&title=Fixture`],
  ['file-form','file-download.html'],
  ['hls',`hls-download.html?url=${encodeURIComponent(media+'master.m3u8')}&title=Fixture`],
  ['file',`file-download.html?task=${encodeURIComponent(JSON.stringify({url:media+'file.bin',filename:'file.bin',title:'Fixture'}))}`],
  ['preview','preview.html?tabId=TAB'],['popup','popup.html?tabId=TAB'],['options','options.html']];
 const toolRun=async(chromeLang,pref,expect)=>{
  const context=await chromium.launchPersistentContext(path.join(report,`profile-tools-${chromeLang}-${pref}`),{executablePath:exe,headless:true,locale:chromeLang,viewport:{width:1000,height:900},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,`--lang=${chromeLang}`,'--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
  try{
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.protocol==='chrome-extension:')return route.continue();
    if(u.pathname.endsWith('.m3u8'))return route.fulfill({contentType:'application/vnd.apple.mpegurl',body:u.pathname.endsWith('master.m3u8')?fixture.master:fixture.m3u8});
    if(u.pathname.endsWith('.mpd'))return route.fulfill({contentType:'application/dash+xml',body:fixture.mpd});
    if(u.pathname.endsWith('.json'))return route.fulfill({contentType:'application/json',body:fixture.json});
    if(/\.(ts|m4s|mp4|bin)$/.test(u.pathname))return route.fulfill({contentType:'application/octet-stream',body:Buffer.alloc(4096)});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'});});
   await context.addInitScript(()=>{
    if(location.protocol!=='chrome-extension:')return;
    chrome.downloads.download=(options,callback)=>{callback&&setTimeout(()=>callback(4242));return callback?undefined:Promise.resolve(4242);};
    const items=[{url:'https://media.fixture/video/clip.mp4',name:'clip.mp4',ext:'mp4',type:'video/mp4',size:4096,title:'Fixture page',webUrl:'https://www.example.com/page',requestId:'91001',getTime:Date.now(),favIconUrl:'img/icon16.png',requestHeaders:{referer:'https://www.example.com/page'}},
     {url:'https://media.fixture/video/index.m3u8',name:'index.m3u8',ext:'m3u8',type:'application/vnd.apple.mpegurl',size:0,title:'Fixture page',webUrl:'https://www.example.com/page',requestId:'91002',getTime:Date.now(),favIconUrl:'img/icon16.png',requestHeaders:{referer:'https://www.example.com/page'}}];
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=(...args)=>{const message=typeof args[0]==='string'?args[1]:args[0],callback=typeof args.at(-1)==='function'?args.at(-1):null;
     if(message&&message.Message==='getData'&&message.tabId!=null){const data=items.map(item=>({...item,tabId:message.tabId}));if(callback){setTimeout(()=>callback(data));return;}return Promise.resolve(data);}
     return send(...args);};
   });
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
   await worker.evaluate(p=>chrome.storage.local.set({ruxgetUiLanguage:p}),pref);
   const site=await context.newPage();await site.goto('https://www.example.com/page');
   const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('example.com/page')).id);
   let first=true;
   for(const [label,address] of toolPages){
    const name=`tool-${label}-${chromeLang}-${pref}`,p=await context.newPage(),errors=[];
    p.on('pageerror',e=>errors.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,160)+(m.location()?.url?' ('+m.location().url.slice(0,120)+')':''));});
    await p.goto(`chrome-extension://${id}/${address.replace('TAB',tabId)}`);await p.waitForTimeout(1500);
    const state=await p.evaluate(()=>({title:document.title,lang:document.documentElement.lang,reloaded:performance.getEntriesByType('navigation')[0]?.type==='reload',mirror:localStorage.getItem('ruxgetUiLanguage')}));
    const problems=[...errors];
    // Only the very first page may need the reload (if no extension page has mirrored the setting yet).
    if(state.reloaded&&!first)problems.push('reloaded although the language mirror was already set');
    if(state.mirror!==pref)problems.push(`language mirror is ${state.mirror}, expected ${pref}`);
    first=false;
    if(expect==='en'){
     if(state.lang!=='en')problems.push('html lang is '+state.lang);
     await record(name,p);
     const advanced=p.locator('.shiying-tool-heading button');
     if(await advanced.count()){await advanced.click();await record(name+'-advanced',p);await advanced.click();}
     if(label==='m3u8'){await p.locator('#mergeTs').click();await p.waitForTimeout(1500);await record(name+'-merge',p);}
     if(/[\u3400-\u9fff]/.test(state.title))problems.push('title: '+state.title);
     problems.push(...await p.evaluate(mixedText,'en'));
    }else{
     await p.screenshot({path:path.join(report,name+'.png')});
     // popup.html is titled just "Ruxget"; the file download shows its progress ("1/1") as the title.
     if(state.lang!=='zh-CN'||!/[\u3400-\u9fff]/.test(state.title)&&!['popup','downloader-file'].includes(label))problems.push(`expected Chinese, got lang=${state.lang} title=${state.title}`);
     const chinese=await p.evaluate(()=>/[\u3400-\u9fff]/.test(document.body.innerText));if(!chinese)problems.push('no Chinese text on the page');
     problems.push(...(await p.evaluate(mixedText,'zh')).filter(t=>!fixtureText.test(t)));
     const advanced=p.locator('.shiying-tool-heading button');
     if(await advanced.count()){await advanced.click();problems.push(...(await p.evaluate(mixedText,'zh')).filter(t=>!fixtureText.test(t)).map(t=>'[advanced] '+t));await p.screenshot({path:path.join(report,name+'-advanced.png')});await advanced.click();}
     if(label==='m3u8'){await p.locator('#mergeTs').click();await p.waitForTimeout(1500);problems.push(...(await p.evaluate(mixedText,'zh')).filter(t=>!fixtureText.test(t)).map(t=>'[merge] '+t));await p.screenshot({path:path.join(report,name+'-merge.png')});}
    }
    if(problems.length){results[name+' (state)']=problems;console.log('FOUND '+name+' (state)\n   '+problems.join('\n   '));}
    else if(expect!=='en')console.log('clean '+name+' (Chinese as expected)');
    await p.close();
   }
   // A stale or missing mirror (setting changed while no extension page was open) paints the wrong language first;
   // the page must then reload exactly once and end in the right language.
   for(const mirror of [expect==='en'?'zh_CN':'en',null]){
    const name=`tool-json-${chromeLang}-${pref}-mirror-${mirror||'missing'}`,address=`chrome-extension://${id}/${toolPages.find(t=>t[0]==='json')[1]}`;
    const setup=await context.newPage();await setup.goto(address);await setup.waitForTimeout(500);
    await setup.evaluate(v=>v?localStorage.setItem('ruxgetUiLanguage',v):localStorage.removeItem('ruxgetUiLanguage'),mirror);await setup.close();
    const p=await context.newPage();let loads=0;p.on('load',()=>loads++);
    await p.goto(address);await p.waitForTimeout(2000);
    const state=await p.evaluate(()=>({title:document.title,lang:document.documentElement.lang,nav:performance.getEntriesByType('navigation')[0]?.type,mirror:localStorage.getItem('ruxgetUiLanguage')}));
    const wanted=expect==='en'?'en':'zh-CN',needsReload=(mirror||(chromeLang.startsWith('zh')?'zh_CN':'en'))!==(expect==='en'?'en':'zh_CN'),problems=[];
    if(state.lang!==wanted)problems.push(`html lang is ${state.lang}, expected ${wanted} (title ${state.title})`);
    if(state.mirror!==pref)problems.push(`language mirror is ${state.mirror}, expected ${pref}`);
    if(needsReload&&state.nav!=='reload')problems.push('expected one reload, navigation type '+state.nav);
    if(loads>2)problems.push(`loaded ${loads} times`);
    if(problems.length){results[name]=problems;console.log('FOUND '+name+'\n   '+problems.join('\n   '));}else console.log(`clean ${name} (${needsReload?'reloaded once':'no reload needed'})`);
    await p.close();
   }
  }finally{await context.close();}
 };
 await toolRun('zh-CN','en','en');
 await toolRun('en-US','zh_CN','zh');
 await toolRun('zh-CN','auto','zh');
 // D. 0.4.74: a tool page open while the language changes follows it, and never changes under the user:
 //    - a visible page switches in place (labels, heading, <html lang>) and is not reloaded while it stays visible;
 //    - an untouched idle page reloads once, quietly, when it is hidden (here: visibilityState forced to "hidden"), and
 //      then shows no Chinese at all; the reloaded page follows the next switch the same way;
 //    - a page the user touched (typed, ticked a checkbox, pressed play), a page with a download running or opened for
 //      one, and the page the change was made on (options.html → 语言) are never reloaded, visible or hidden;
 //    - text a page wrote to show a state stays that state, in the new language: m3u8's play button reads
 //      「关闭」/"Close" (never back to 「播放」/"Play"), the popup's paused button 「启用」/"Enable".
 const liveTools=async()=>{
  const context=await chromium.launchPersistentContext(path.join(report,'profile-tools-live'),{executablePath:exe,headless:true,locale:'zh-CN',viewport:{width:1000,height:900},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--lang=zh-CN','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
  try{
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.protocol==='chrome-extension:')return route.continue();
    if(u.pathname.endsWith('.m3u8'))return route.fulfill({contentType:'application/vnd.apple.mpegurl',body:u.pathname.endsWith('master.m3u8')?fixture.master:fixture.m3u8});
    if(u.pathname.endsWith('.mpd'))return route.fulfill({contentType:'application/dash+xml',body:fixture.mpd});
    if(u.pathname.endsWith('.json'))return route.fulfill({contentType:'application/json',body:fixture.json});
    // Slow segments, so a started download is still running when the language changes.
    if(/\.(ts|m4s|mp4|bin)$/.test(u.pathname))return new Promise(r=>setTimeout(r,4000)).then(()=>route.fulfill({contentType:'application/octet-stream',body:Buffer.alloc(4096)})).catch(()=>{});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title>'});});
   await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:')return;chrome.downloads.download=(options,callback)=>{callback&&setTimeout(()=>callback(4242));return callback?undefined:Promise.resolve(4242);};
    // One found file, so popup.html shows an item with its 复制 / 预览 / 下载 tooltips.
    const item={url:'https://media.fixture/video/clip.mp4',name:'clip.mp4',ext:'mp4',type:'video/mp4',size:4096,title:'Fixture page',webUrl:'https://www.example.com/page',requestId:'91001',getTime:Date.now(),favIconUrl:'img/icon16.png',requestHeaders:{referer:'https://www.example.com/page'}};
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage=(...args)=>{const message=typeof args[0]==='string'?args[1]:args[0],callback=typeof args.at(-1)==='function'?args.at(-1):null;
     if(message&&message.Message==='getData'&&message.tabId!=null){const data=[{...item,tabId:message.tabId}];if(callback){setTimeout(()=>callback(data));return;}return Promise.resolve(data);}
     return send(...args);};});
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
   const setLang=lang=>worker.evaluate(l=>chrome.storage.local.set({ruxgetUiLanguage:l}),lang);
   await setLang('zh_CN');
   const site=await context.newPage();await site.goto('https://www.example.com/page');
   const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url?.includes('example.com/page')).id);
   // Untrusted script, so it does not count as the user touching the page.
   const hide=p=>p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}).catch(()=>{});
   const mark=p=>p.evaluate(()=>{window.__sameDocument=true;}).catch(()=>{});
   const same=p=>p.evaluate(()=>window.__sameDocument===true).catch(()=>false);
   const m3u8=toolPages.find(t=>t[0]==='m3u8')[1],popup=toolPages.find(t=>t[0]==='popup')[1];
   const text=selector=>p=>p.evaluate(s=>document.querySelector(s)?.textContent.trim()??null,selector);
   // 0.4.74 retest: text these pages render once from code (list lines, summaries, tooltips) follows an in-place switch
   // too. [selector, attribute or null] → [Chinese, English]; a RegExp matches.
   const rendered={
    'm3u8-master':[['#next_m3u8 .more_text',null,/^分辨率：320×184 \| 码率：800 Kbps$/,/^Resolution: 320×184 \| Bitrate: 800 Kbps$/],['#next_m3u8 #parser',null,'解析','Parser'],['#next_m3u8 .sendFfmpeg',null,'发送到在线 FFmpeg','Send to FFmpeg']],
    'm3u8':[['#count',null,/^共 2 个文件，总时长 /,/^2 segments, .* in total$/]],
    'mpd':[['#count',null,/^共 2 个文件，总时长 /,/^2 segments, .* in total$/],['#tips span',null,'初始化分段：','Initialization segment: '],['#info',null,/^视频：v1 /,/^Video: v1 /]],
    'popup':[['img.copy','title','复制','Copy'],['img.play','title','预览','Preview'],['img.download','title','下载','Download']]};
   const cases=[...toolPages.map(([label,address])=>({label,address,reload:!['downloader-file','dash','file-form','file','hls'].includes(label) /* 0.4.76: Ruxget's own pages switch in place */,rendered:rendered[label]})),
    {label:'m3u8-downloading',address:m3u8,reload:false,run:async p=>{await p.locator('#mergeTs').click();await p.waitForTimeout(800);}},
    {label:'m3u8-ticked',address:m3u8,reload:false,run:async p=>{const box=p.locator('input[type=checkbox]:visible').first();await box.click();}},
    // The play button sits under 「查看切片」; the fixture segments are empty, so hls.js may hide it after a parsing error (shown again here).
    {label:'m3u8-playing',address:m3u8,reload:false,run:async p=>{await p.locator('#textarea summary').click();await p.evaluate(()=>{document.querySelector('#play').style.display='';});await p.locator('#play').click();await p.waitForTimeout(300);},state:text('#play'),states:{en:'Close',zh:'关闭'}},
    {label:'popup-paused',address:popup,reload:false,run:async p=>{await p.locator('#enable').click();await p.waitForFunction(()=>document.querySelector('#enable').textContent.trim()==='启用');},state:text('#enable'),states:{en:'Enable',zh:'启用'},after:p=>p.locator('#enable').click()},
    {label:'options-typed',address:'options.html',reload:false,run:async p=>{const field=p.locator('input[type=text]:visible').first();await field.click();await field.type('x');await field.press('Backspace');}},
    {label:'options-self',address:'options.html',reload:false,self:true}];
   for(const item of cases){
    const name=`tool-live-${item.label}`,p=await context.newPage(),errors=[];let loads=0;
    p.on('load',()=>loads++);p.on('pageerror',e=>errors.push('pageerror: '+e.message));
    await p.goto(`chrome-extension://${id}/${item.address.replace('TAB',tabId)}`);await p.waitForTimeout(1200);
    if(item.run)await item.run(p);
    const problems=[...errors];
    const change=async lang=>{if(item.self){await p.locator('#languageSelect').scrollIntoViewIfNeeded();await p.locator('#languageSelect').selectOption(lang);}else await setLang(lang);await p.waitForTimeout(1500);};
    const check=async(lang,step)=>{
     const want=lang==='en'?'en':'zh-CN';
     const state=await p.evaluate(()=>({lang:document.documentElement.lang,heading:document.querySelector('.shiying-tool-heading h1')?.textContent||''}));
     if(state.lang!==want)problems.push(`[${step}] html lang is ${state.lang}, expected ${want}`);
     if(lang==='en'&&/[㐀-鿿]/.test(state.heading))problems.push(`[${step}] heading still Chinese: ${state.heading}`);
     if(lang!=='en'&&state.heading&&!/[㐀-鿿]/.test(state.heading))problems.push(`[${step}] heading still English: ${state.heading}`);
     if(item.state){const shown=await item.state(p);if(shown!==item.states[lang==='en'?'en':'zh'])problems.push(`[${step}] state text is ${JSON.stringify(shown)}, expected ${JSON.stringify(item.states[lang==='en'?'en':'zh'])}`);}
     if(item.self&&lang==='en'){const left=(await p.evaluate(collect)).filter(t=>!fixtureText.test(t));if(left.length)problems.push(`[${step}] Chinese left after the in-place switch: `+left.slice(0,12).join(' / '));}
     for(const [selector,attr,zh,en] of item.rendered||[]){const wanted=lang==='en'?en:zh,shown=await p.evaluate(([s,a])=>{const el=document.querySelector(s);return el?(a?el.getAttribute(a):el.textContent):null;},[selector,attr]);if(wanted instanceof RegExp?!wanted.test(shown||''):shown!==wanted)problems.push(`[${step}] ${selector}${attr?' @'+attr:''} reads ${JSON.stringify(shown)}, expected ${wanted}`);}
    };
    for(const [lang,step] of [['en','to English'],['zh_CN','back to Chinese']]){
     await mark(p);const before=loads;
     await change(lang);
     // Visible: always in place.
     if(loads!==before||!(await same(p)))problems.push(`[${step}] reloaded while visible (${loads-before} loads)`);
     await check(lang,step+', visible');
     // Hidden: an untouched idle page reloads once; any other page stays.
     await hide(p);await p.waitForTimeout(1500);
     const reloaded=loads-before;
     if(item.reload){
      if(reloaded!==1)problems.push(`[${step}] expected one quiet reload once hidden, got ${reloaded}`);
      else{await check(lang,step+', reloaded');if(lang==='en'){const left=(await p.evaluate(collect)).filter(t=>!fixtureText.test(t));if(left.length)problems.push(`[${step}] Chinese left after the reload: `+left.join(' / '));}}
     }else{
      if(reloaded!==0||!(await same(p)))problems.push(`[${step}] reloaded ${reloaded} times although the page was touched or busy`);
      await check(lang,step+', hidden');
     }
     await p.screenshot({path:path.join(report,`${name}-${lang==='en'?'en':'back-zh'}.png`)});
    }
    if(item.after)await item.after(p).catch(()=>{});
    if(problems.length){results[name]=problems;console.log('FOUND '+name+'\n   '+problems.join('\n   '));}else console.log(`clean ${name} (${item.reload?'in place while visible, one reload each way once hidden':'in place, never reloaded'})`);
    await p.close();
   }
   // 0.4.74 retest (js/m3u8.js): hls.js reports non-fatal errors it recovers from itself, such as bufferStalledError
   // while the video plays on. They show no error box and stop nothing; a fatal error still shows 「设置请求头」, and
   // that box follows a language switch like the rest of the page.
   {
    const name='tool-m3u8-hls-errors',problems=[],p=await context.newPage();p.on('pageerror',e=>problems.push('pageerror: '+e.message));
    await p.goto(`chrome-extension://${id}/${m3u8}`);await p.waitForTimeout(1200);
    const state=()=>p.evaluate(()=>({box:getComputedStyle(document.querySelector('#loading')).display!=='none',button:!!document.querySelector('#setRequestHeadersError'),stops:window.__stops}));
    const fire=data=>p.evaluate(d=>{const handler=hls.listeners(Hls.Events.ERROR).find(h=>String(h).includes('setRequestHeadersError'));handler(Hls.Events.ERROR,{...d,error:new Error(d.message)});},data);
    await p.evaluate(()=>{$('#loading').hide();$('#loading .optionBox').empty();const stop=hls.stopLoad.bind(hls);window.__stops=0;hls.stopLoad=()=>{window.__stops++;return stop();};});
    await fire({type:'mediaError',details:'bufferStalledError',fatal:false,buffer:14.7,message:'Playback stalling at @0 due to low buffer'});await p.waitForTimeout(300);
    let now=await state();
    if(now.box||now.button)problems.push('non-fatal bufferStalledError showed the error box');
    if(now.stops)problems.push(`non-fatal bufferStalledError stopped loading (${now.stops}×)`);
    await fire({type:'mediaError',details:'bufferAppendError',fatal:true,message:'fixture'});await p.waitForTimeout(300);
    now=await state();
    if(!now.box||!now.button)problems.push('fatal bufferAppendError showed no error box');
    await setLang('en');await p.waitForTimeout(1500);
    const box=await p.evaluate(()=>document.querySelector('#loading .optionBox').textContent);
    if(/[\u3400-\u9fff]/.test(box)||!/Set request headers/.test(box))problems.push('error box after switching to English: '+box);
    await p.screenshot({path:path.join(report,name+'-en.png')});
    await setLang('zh_CN');await p.waitForTimeout(1500);
    await p.close();
    if(problems.length){results[name]=problems;console.log('FOUND '+name+'\n   '+problems.join('\n   '));}else console.log(`clean ${name} (non-fatal ignored, fatal shows the box, box follows the switch)`);
   }
   await setLang('zh_CN');
  }finally{await context.close();}
 };
 await liveTools();
 // B. Desktop app (embedded interface from the latest native report) in English.
 const native=path.join(root,'reports',fs.readdirSync(path.join(root,'reports')).filter(n=>n.startsWith('plugin-native-')).sort().at(-1));
 const desk=await chromium.launch({executablePath:exe,headless:true});
 try{
  const context=await desk.newContext({viewport:{width:1100,height:700},locale:'en-US'});
  await context.addInitScript(()=>{const handlers=[];window.hostCommands=[];window.chrome={webview:{postMessage:data=>window.hostCommands.push(data),addEventListener:(_,h)=>handlers.push(h)}};window.emitHost=data=>handlers.forEach(h=>h({data}));});
  const page=await context.newPage();await page.goto(pathToFileURL(path.join(native,'interface.html')).href);await page.waitForFunction(()=>hostCommands.some(c=>c.command==='ready'));
  const state=JSON.parse(fs.readFileSync(path.join(native,'initial-state.json'),'utf8').replace(/^\uFEFF/,''));state.settings.UiLanguage='en';
  await page.evaluate(s=>emitHost(s),state);await page.waitForTimeout(300);
  await record('desktop-main',page);
  const first=page.locator('[data-focus$="-details"]').first();if(await first.count()){await first.click();await record('desktop-details',page);}
  const more=page.locator('button[aria-label="More actions"]').first();if(await more.count()){await more.click();await record('desktop-task-menu',page);await page.keyboard.press('Escape');}
  const settings=page.locator('[data-command=settings]').first();if(await settings.count()){await settings.evaluate(b=>b.click());await record('desktop-settings',page);await page.keyboard.press('Escape');}
 }finally{await desk.close();}
 const total=Object.values(results).reduce((n,list)=>n+list.length,0);
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({total,results},null,2));console.log('TOTAL '+total+'\nREPORT '+report);process.exit(total?1:0);
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(2);});
