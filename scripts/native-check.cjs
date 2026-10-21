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
const root=require('node:path').resolve(__dirname,'..'),background=fs.readFileSync(root+'/js/shiying-background.js','utf8'),engine=fs.readFileSync(root+'/js/shiying-engine.js','utf8');
assert(!/17863|SHIYING_HELPER|server\.cjs|node\.exe|yt-dlp|ffmpeg/i.test(background+engine));
assert(JSON.parse(fs.readFileSync(root+'/manifest.json','utf8')).permissions.includes('offscreen'));
console.log('原站地址边界、真实清晰度、放大格式排除与无助手依赖检查通过');
