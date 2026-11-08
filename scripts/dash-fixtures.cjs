// Builds the local DASH test media for dash-download-check.cjs with ffmpeg (RUXGET_FFMPEG, or ffmpeg on PATH).
// Output: <dir>/<case>/manifest.mpd plus its segments. Generated, not committed.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function build(dir,ffmpeg=process.env.RUXGET_FFMPEG||'ffmpeg'){
 const run=(name,args,edit)=>{const out=path.join(dir,name);fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args,'-f','dash','manifest.mpd'],{cwd:out,stdio:'inherit'});
  if(edit){const file=path.join(out,'manifest.mpd');fs.writeFileSync(file,edit(fs.readFileSync(file,'utf8')));}};
 const video=['-f','lavfi','-i','testsrc=size=1280x720:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','6'];
 const enc=['-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-g','25','-keyint_min','25','-sc_threshold','0','-c:a','aac','-b:a','128k','-seg_duration','2'];
 const two=['-map','0:v','-map','0:v','-map','1:a','-b:v:0','1500k','-s:v:0','1280x720','-b:v:1','400k','-s:v:1','640x360','-adaptation_sets','id=0,streams=v id=1,streams=a'];
 run('template',[...video,...two,...enc,'-use_template','1','-use_timeline','0']);
 run('timeline',[...video,...two,...enc,'-use_template','1','-use_timeline','1']);
 run('single',[...video,...two,...enc,'-single_file','1']);
 run('videoonly',[...video,'-map','0:v','-b:v','800k','-s','960x540',...enc,'-use_template','1','-use_timeline','0']);
 run('twoaudio',[...video,'-map','0:v','-map','1:a','-map','2:a','-b:v','800k','-s','960x540','-metadata:s:a:0','language=zho','-metadata:s:a:1','language=eng',...enc,'-use_template','1','-use_timeline','0','-adaptation_sets','id=0,streams=v id=1,streams=1 id=2,streams=2']);
 const protect=text=>text.replace(/(<AdaptationSet[^>]*contentType="video"[^>]*>)/,'$1\n<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"><cenc:pssh xmlns:cenc="urn:mpeg:cenc:2013">AAAAQ3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAACMIARIQ1o3Kj1Ykyle1Uh0tUMkQ0yIKcnV4Z2V0LXRlc3Q=</cenc:pssh></ContentProtection>');
 run('drm',[...video,...two,...enc,'-use_template','1','-use_timeline','0'],protect);
 run('live',[...video,...two,...enc,'-use_template','1','-use_timeline','0'],text=>text.replace('type="static"','type="dynamic" availabilityStartTime="2026-01-01T00:00:00Z"'));
 // Picture and sound in both MP4 and WebM; the WebM picture has the higher bitrate, and the types sit on the
 // AdaptationSet only (as on real sites), not on each Representation.
 const hoist=text=>text.replace(/(<AdaptationSet[^>]*?)>(\s*<Representation[^>]*?) mimeType="([^"]+)"/g,'$1 mimeType="$3">$2');
 // A ladder of 2160p, 1440p, 1080p and 720p (2 s, low bitrates) for the default-quality rule.
 const ladder=[[3840,2160,2500],[2560,1440,1800],[1920,1080,1200],[1280,720,600]];
 run('ladder',['-f','lavfi','-i','testsrc=size=640x360:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2',...ladder.flatMap(()=>['-map','0:v']),'-map','1:a',...ladder.flatMap(([w,h,k],i)=>[`-s:v:${i}`,`${w}x${h}`,`-b:v:${i}`,`${k}k`]),'-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-g','25','-keyint_min','25','-sc_threshold','0','-c:a','aac','-b:a','96k','-seg_duration','2','-use_template','1','-use_timeline','0','-adaptation_sets','id=0,streams=v id=1,streams=a']);
 run('mixed',['-f','lavfi','-i','testsrc=size=640x360:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-map','0:v','-map','0:v','-map','1:a','-map','1:a','-c:v:0','libx264','-pix_fmt','yuv420p','-b:v:0','600k','-c:v:1','libvpx-vp9','-b:v:1','900k','-deadline','realtime','-cpu-used','8','-g','25','-keyint_min','25','-c:a:0','aac','-b:a:0','96k','-c:a:1','libopus','-b:a:1','128k','-seg_duration','2','-dash_segment_type','auto','-use_template','1','-use_timeline','0','-adaptation_sets','id=0,streams=0 id=1,streams=1 id=2,streams=2 id=3,streams=3'],hoist);
 return dir;
}
module.exports={build};
if(require.main===module)console.log(build(process.argv[2]||path.join(process.env.RUXGET_TMP||'.','dash-fixtures')));
