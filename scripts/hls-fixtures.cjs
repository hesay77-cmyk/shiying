// Builds the local HLS test media for hls-download-check.cjs with ffmpeg (RUXGET_FFMPEG, or ffmpeg on PATH).
// Output: <dir>/<case>/… Generated, not committed.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function build(dir,ffmpeg=process.env.RUXGET_FFMPEG||'ffmpeg'){
 const run=(name,args,out='index.m3u8')=>{const folder=path.join(dir,name);fs.mkdirSync(folder,{recursive:true});
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args,out],{cwd:folder,stdio:'inherit'});return folder;};
 const fresh=name=>{fs.rmSync(path.join(dir,name),{recursive:true,force:true});};
 const src=(seconds,size='1280x720',tone=440)=>['-f','lavfi','-i',`testsrc=size=${size}:rate=25`,'-f','lavfi','-i',`sine=frequency=${tone}:sample_rate=48000`,'-t',String(seconds)];
 const h264=['-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-g','25','-keyint_min','25','-sc_threshold','0','-c:a','aac','-b:a','128k'];
 const hls=(seg=2)=>['-f','hls','-hls_time',String(seg),'-hls_playlist_type','vod'];
 // 1. Single TS playlist, 6 s.
 fresh('ts');run('ts',[...src(6),...h264,...hls()]);
 // 2. Master with 720p and 360p TS variants.
 fresh('master');run('master',[...src(6),'-map','0:v','-map','1:a','-map','0:v','-map','1:a',...h264,'-s:v:0','1280x720','-b:v:0','1500k','-s:v:1','640x360','-b:v:1','400k',...hls(),'-master_pl_name','master.m3u8','-var_stream_map','v:0,a:0 v:1,a:1','-hls_segment_filename','v%v_%03d.ts'],'v%v.m3u8');
 // 3. fMP4 picture plus two separate fMP4 sound tracks (zh, en) under one master.
 fresh('fmp4audio');run('fmp4audio',['-f','lavfi','-i','testsrc=size=960x540:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','6','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-g','25','-keyint_min','25','-sc_threshold','0','-b:v','800k','-c:a','aac','-b:a','128k','-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_type','fmp4','-master_pl_name','master.m3u8','-var_stream_map','v:0,agroup:aud a:0,agroup:aud,language:zho,name:中文,default:yes a:1,agroup:aud,language:eng,name:English','-hls_fmp4_init_filename','init_%v.mp4','-hls_segment_filename','s%v_%03d.m4s'],'p%v.m3u8');
 // 4. fMP4 single playlist.
 fresh('fmp4');run('fmp4',[...src(6,'960x540'),...h264,...hls(),'-hls_segment_type','fmp4']);
 // 5. AES-128 (key served by the test server under /key.bin; IV omitted so the sequence number is used).
 fresh('aes');const aes=path.join(dir,'aes');fs.mkdirSync(aes,{recursive:true});
 fs.writeFileSync(path.join(aes,'key.bin'),Buffer.from('00112233445566778899aabbccddeeff','hex'));
 fs.writeFileSync(path.join(aes,'keyinfo.txt'),`key.bin\n${path.join(aes,'key.bin')}\n`);
 run('aes',[...src(6),...h264,...hls(),'-hls_key_info_file','keyinfo.txt']);
 // 6. SAMPLE-AES: the TS playlist with its method marked as SAMPLE-AES (the page must refuse before downloading).
 fresh('sampleaes');const sa=path.join(dir,'sampleaes');fs.mkdirSync(sa,{recursive:true});
 for(const f of fs.readdirSync(path.join(dir,'ts')))fs.copyFileSync(path.join(dir,'ts',f),path.join(sa,f));
 fs.writeFileSync(path.join(sa,'index.m3u8'),fs.readFileSync(path.join(sa,'index.m3u8'),'utf8').replace('#EXT-X-TARGETDURATION','#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://key",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXT-X-TARGETDURATION'));
 // 7. Byte ranges: one TS file addressed by EXT-X-BYTERANGE.
 fresh('byterange');run('byterange',[...src(6),...h264,...hls(),'-hls_flags','single_file']);
 // 8. Live source: 30 s of 2 s TS segments; the test server slides a window over them.
 fresh('live');run('live',[...src(30),...h264,...hls()]);
 // 9. A ladder of 2160p, 1440p, 1080p and 720p TS variants (2 s, low bitrates) for the default-quality rule.
 fresh('ladder');const ladder=[[3840,2160,2500],[2560,1440,1800],[1920,1080,1200],[1280,720,600]];
 run('ladder',['-f','lavfi','-i','testsrc=size=640x360:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2',...ladder.flatMap(()=>['-map','0:v','-map','1:a']),...ladder.flatMap(([w,h,k],i)=>[`-s:v:${i}`,`${w}x${h}`,`-b:v:${i}`,`${k}k`]),'-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-g','25','-keyint_min','25','-sc_threshold','0','-c:a','aac','-b:a','96k',...hls(),'-master_pl_name','master.m3u8','-var_stream_map',ladder.map((_,i)=>`v:${i},a:${i}`).join(' '),'-hls_segment_filename','v%v_%03d.ts'],'v%v.m3u8');
 return dir;
}
module.exports={build};
if(require.main===module)console.log(build(process.argv[2]||path.join(process.env.RUXGET_TMP||'.','hls-fixtures')));
