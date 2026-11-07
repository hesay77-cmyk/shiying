const assert=require('node:assert/strict'),fs=require('node:fs');
const platform=require('../js/shiying-platform.js');
// YouTube lives in the full-edition module; load it onto the same platform object to keep testing it.
globalThis.ShiyingPlatform=platform;require('../js/shiying-youtube.js');
const store=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','manifest.json'),'utf8'));assert(!JSON.stringify(store).match(/youtube|googlevideo/i),'store manifest must not reference YouTube');
assert.throws(()=>platform.mediaURL('https://googlevideo.com.evil.example/file','youtube'));
assert.throws(()=>platform.mediaURL('https://127.0.0.1/private','bilibili'));
assert.throws(()=>platform.mediaURL('https://x.bilivideo.com:7897/file','bilibili'));
const base='https://rr1.googlevideo.com/videoplayback';
const data={playabilityStatus:{status:'OK'},videoDetails:{title:'真实画质检查',lengthSeconds:'60'},streamingData:{adaptiveFormats:[{itag:1,url:base+'?itag=1',height:720,mimeType:'video/mp4; codecs="avc1.4D401F"',contentLength:'10'},{itag:2,url:base+'?itag=2&xtags=sr%3D1',height:1080,mimeType:'video/mp4; codecs="avc1.640028"',contentLength:'20'},{itag:140,url:base+'?itag=140',mimeType:'audio/mp4; codecs="mp4a.40.2"',contentLength:'5'}]}};
assert.deepEqual(platform.youtubeCatalog({site:'youtube'},data).choices.map(choice=>choice.height),[720]);
assert.throws(()=>platform.youtubeCatalog({site:'youtube'},{playabilityStatus:{status:'LOGIN_REQUIRED'}}));
assert.throws(()=>platform.bilibiliCatalog({site:'bilibili'},{video:Array(101),audio:[]}));
// 0.4.69: the address shapes B站 returned on 2026-11-07 (PCDN first, own mirrors as backups) still give a video.
{const path='/upgcxcode/42/60/42868346042/42868346042-1-30032.m4s?e=x';
 const v={id:32,height:480,width:852,bandwidth:900000,codecs:'avc1.64001F',base_url:'https://b-baai9mp17colbv29i62q4f4fh65e.edge.mountaintoys.cn:4483'+path,backup_url:['https://upos-sz-mirrorcoso1.bilivideo.com'+path,'https://upos-sz-mirrorcos.bilivideo.com'+path]};
 const a={id:30216,bandwidth:67000,codecs:'mp4a.40.2',base_url:'https://xy175x12x94x20xy.mcdn.bilivideo.cn:8082'+path,backup_url:['https://b-baai9mp17colbv29i62q4f4fh65e.edge.mountaintoys.cn:4483'+path,'https://upos-sz-mirrorcoso1.bilivideo.com'+path]};
 const c=platform.bilibiliCatalog({site:'bilibili'},{title:'百万支票',video:[v],audio:[a],duration:60});
 assert.equal(new URL(c.video[0].url).hostname,'upos-sz-mirrorcoso1.bilivideo.com');assert.deepEqual(c.video[0].backups.map(u=>new URL(u).hostname),['upos-sz-mirrorcos.bilivideo.com']);
 assert.equal(new URL(c.audio[0].url).hostname,'upos-sz-mirrorcoso1.bilivideo.com');assert.equal(c.audio[0].backups.length,0);
 assert(![...c.video,...c.audio].some(t=>[t.url,...t.backups].some(u=>/mountaintoys|:\d+\//.test(u))),'PCDN and port addresses are never used');
 assert.throws(()=>platform.bilibiliCatalog({site:'bilibili'},{title:'x',video:[{...v,backup_url:[]}],audio:[a],duration:60}),/没有取得可合并的画面与声音/);}
const root=require('node:path').resolve(__dirname,'..'),background=fs.readFileSync(root+'/js/shiying-background.js','utf8'),engine=fs.readFileSync(root+'/js/shiying-engine.js','utf8');
assert(!/17863|SHIYING_HELPER|server\.cjs|node\.exe|yt-dlp|ffmpeg/i.test(background+engine));
assert(JSON.parse(fs.readFileSync(root+'/manifest.json','utf8')).permissions.includes('offscreen'));
console.log('原站地址边界、真实清晰度、放大格式排除与无助手依赖检查通过');
