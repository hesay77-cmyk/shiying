// 抖音、快手、小红书: link rules, catalog building and the in-page readers (against simulated page structures).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const platform=require('../js/shiying-platform.js');globalThis.ShiyingPlatform=platform;require('../js/shiying-shortvideo.js');
const checks=[];const check=name=>{checks.push(name);console.log('PASS '+name);};

// Links
const src=url=>platform.source(url);
assert.deepEqual(src('https://www.douyin.com/video/7412345678901234567'),{site:'douyin',id:'7412345678901234567',url:'https://www.douyin.com/video/7412345678901234567'});
assert.equal(src('https://www.douyin.com/jingxuan?modal_id=7412345678901234567').url,'https://www.douyin.com/video/7412345678901234567');
assert.equal(src('https://www.douyin.com/user/MS4wLj?modal_id=7412345678901234567').id,'7412345678901234567');
assert.throws(()=>src('https://www.douyin.com/'),/单个抖音视频/);
assert.equal(src('https://www.kuaishou.com/short-video/3xtimyyw94biyh4?authorId=x').url,'https://www.kuaishou.com/short-video/3xtimyyw94biyh4');
assert.throws(()=>src('https://www.kuaishou.com/new-reco'),/单个快手视频/);
assert.equal(src('https://www.xiaohongshu.com/explore/6411cf99000000001300b6d9?xsec_token=abc').id,'6411cf99000000001300b6d9');
assert.equal(src('https://www.xiaohongshu.com/discovery/item/6411cf99000000001300b6d9').site,'xiaohongshu');
assert.throws(()=>src('https://www.xiaohongshu.com/explore'),/小红书视频笔记/);
assert.throws(()=>src('https://douyin.com.evil.test/video/7412345678901234567'));
check('links: single videos, feed layers and notes resolve; lists and lookalike hosts do not');

// Catalogs
const douyin=platform.muxedCatalog({site:'douyin',id:'1',url:'https://www.douyin.com/video/1'},{title:'海边 #旅行',artist:'某作者',duration:12.34,cover:'http://p3-pc.douyinpic.com/c.jpg',formats:[
 {width:1080,height:1920,h265:true,bytes:9e6,urls:['https://v26-web.douyinvod.com/hevc.mp4']},
 {width:1080,height:1920,h265:false,bytes:6e6,urls:['https://v26-web.douyinvod.com/a.mp4','https://v11-weba.douyinvod.com/a.mp4','https://evil.example/a.mp4']},
 {width:1080,height:1920,h265:false,bytes:5e6,urls:['https://v26-web.douyinvod.com/a-low.mp4']},
 {width:720,height:1280,h265:false,bytes:3e6,urls:['https://v26-web.douyinvod.com/b.mp4']}],fallback:{urls:[]}});
assert.deepEqual(douyin.choices,[{height:1920,label:'1080p'},{height:1280,label:'720p'}]);
assert.equal(douyin.video[0].url,'https://v26-web.douyinvod.com/a.mp4');assert.deepEqual(douyin.video[0].backups,['https://v11-weba.douyinvod.com/a.mp4']);
assert.equal(douyin.audio[0].height,1280);assert.equal(douyin.muxed,true);assert.equal(douyin.siteName,'抖音');assert.equal(douyin.cover,'https://p3-pc.douyinpic.com/c.jpg');assert.equal(douyin.duration,12.34);
check('抖音 catalog: H.265 skipped, best file per quality, foreign hosts dropped, short-side labels');
const ks=platform.muxedCatalog({site:'kuaishou',id:'k',url:'https://www.kuaishou.com/short-video/k'},{title:'',duration:30.5,formats:[],fallback:{width:0,height:0,urls:['https://v23-3.kwaicdn.com/x.mp4']}});
assert.deepEqual(ks.choices,[{height:0,label:'原画'}]);assert.equal(ks.title,'快手视频');
check('快手 catalog: falls back to the page’s main file when no quality list exists');
assert.throws(()=>platform.muxedCatalog({site:'xiaohongshu',id:'x',url:'https://www.xiaohongshu.com/explore/x'},{duration:5,formats:[{width:720,height:1280,urls:['https://example.com/a.mp4']}],fallback:{urls:[]}}),/没有取得可下载的视频地址/);
assert.throws(()=>platform.muxedCatalog({site:'kuaishou',id:'k',url:'https://www.kuaishou.com/short-video/k'},{duration:0,formats:[{width:1,height:2,urls:['https://v1.kwaicdn.com/a.mp4']}]}),/时长/);
assert.deepEqual(platform.mediaOrigins,{douyin:['https://*.douyinvod.com/*','https://*.douyincdn.com/*'],kuaishou:[],xiaohongshu:['https://*.xhscdn.com/*']});
check('catalog refuses foreign hosts and missing durations; only 抖音/小红书 ask for server access');

// In-page readers against simulated page structures
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<div id="wrap"><div id="player"><video></video></div></div><div id="other"><video></video></div>');
  const run=(name,id)=>page.evaluate(([code,arg])=>new Function('return ('+code+')')()(arg),[platform.pageReaders[name].toString(),id]);
  // 抖音: React fiber on a container above the <video>, two players on the page.
  await page.evaluate(()=>{const aweme=(id,desc,nick)=>({awemeId:id,desc,authorInfo:{nickname:nick},video:{duration:15200,width:1080,height:1920,coverUrlList:['https://p3.douyinpic.com/c.jpg'],playAddr:[{src:'https://v26-web.douyinvod.com/main.mp4'}],bitRateList:[{width:1080,height:1920,isH265:false,dataSize:4e6,playAddr:[{src:'https://v26-web.douyinvod.com/1080.mp4'},{src:'https://v11-weba.douyinvod.com/1080.mp4'}]},{width:1080,height:1920,isH265:true,dataSize:3e6,playAddr:[{src:'https://v26-web.douyinvod.com/h265.mp4'}]}]}});
   document.getElementById('player').__reactFiber$abc={memoizedProps:{},return:{memoizedProps:{awemeInfo:aweme('111','第一条','作者甲')},return:null}};
   document.getElementById('other').__reactFiber$abc={memoizedProps:{awemeInfo:aweme('222','第二条','作者乙')},return:null};});
  let d=await run('douyin','222');assert.equal(d.title,'第二条');assert.equal(d.artist,'作者乙');assert.equal(d.duration,15.2);assert.equal(d.formats.length,2);assert.equal(d.formats[1].h265,true);assert.deepEqual(d.formats[0].urls,['https://v26-web.douyinvod.com/1080.mp4','https://v11-weba.douyinvod.com/1080.mp4']);
  d=await run('douyin','999');assert.equal(d.title,'第一条');
  check('抖音 reader: finds the matching video among several players, else the first');
  // 快手: Vue component chain with videoInfo.
  await page.evaluate(()=>{document.getElementById('player').__vueParentComponent={props:{},parent:{props:{author:{name:'快手作者'},videoInfo:{id:'3xabc',caption:'快手标题',duration:30500,coverUrl:'https://p2.a.yximgs.com/c.jpg',photoUrl:'https://v23-3.kwaicdn.com/main.mp4',manifest:{adaptationSet:[{representation:[{url:'https://v23-3.kwaicdn.com/720.mp4',backupUrl:['https://v1.kwaicdn.com/720.mp4'],width:720,height:1280}]}]}}},parent:null}};});
  d=await run('kuaishou','3xabc');assert.equal(d.title,'快手标题');assert.equal(d.artist,'快手作者');assert.equal(d.duration,30.5);assert.deepEqual(d.formats[0].urls,['https://v23-3.kwaicdn.com/720.mp4','https://v1.kwaicdn.com/720.mp4']);assert.deepEqual(d.fallback.urls,['https://v23-3.kwaicdn.com/main.mp4']);
  check('快手 reader: reads videoInfo through the Vue component chain');
  // 小红书: reactive refs ({_value}) around the note map.
  await page.evaluate(()=>{window.__INITIAL_STATE__={note:{noteDetailMap:{_value:{'6411cf99000000001300b6d9':{note:{title:'小红书标题',user:{nickname:'红薯'},imageList:[{urlDefault:'https://sns-webpic.xhscdn.com/c.jpg'}],video:{media:{stream:{h264:[{width:720,height:1280,size:2e6,duration:8000,masterUrl:'https://sns-video-bd.xhscdn.com/a.mp4',backupUrls:['https://sns-video-hw.xhscdn.com/a.mp4']}],h265:[]}}}}}}}}};});
  d=await run('xiaohongshu','6411cf99000000001300b6d9');assert.equal(d.title,'小红书标题');assert.equal(d.artist,'红薯');assert.equal(d.duration,8);assert.equal(d.formats[0].urls.length,2);
  await page.evaluate(()=>{window.__INITIAL_STATE__.note.noteDetailMap._value['6411cf99000000001300b6d9'].note.video={media:{stream:{h264:[],h265:[]}}};});
  d=await run('xiaohongshu','6411cf99000000001300b6d9');assert.match(d.error,/没有视频/);
  d=await run('xiaohongshu','000000000000000000000000');assert.match(d.error,/没有读到这条笔记/);
  check('小红书 reader: unwraps reactive state, reports picture-only and missing notes');
  console.log('SHORT VIDEO CHECKS PASSED');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
