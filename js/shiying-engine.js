// 一个浏览器隐藏页完成下载、合并、MP3 和检查；无外部程序。GPL-3.0。
import {createFile,DataStream,Log} from '../lib/mp4box/mp4box.all.mjs';
Log.setLogLevel(Log.error);
const tasks=new Map();let queue=Promise.resolve();
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const send=async(Message,extra={})=>{const result=await chrome.runtime.sendMessage({Message,...extra});if(!result?.ok)throw new Error(result?.error||'下载状态暂时不可用');return result};
const filename=value=>String(value||'网页视频').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[.\s]+$/g,'').slice(0,90)||'网页视频';
function check(task){if(task.cancelled)throw new Error('已取消下载');if(task.timedOut)throw new Error('下载耗时过长，请检查网络后重试')}
async function update(task,values){check(task);return send('shiyingEngineUpdate',{id:task.job.id,values})}
function parse(buffer){const file=createFile(true);let error;file.onError=message=>{error=message};buffer.fileStart=0;file.appendBuffer(buffer);file.flush();if(error||!file.moov)throw new Error('媒体文件没有完整读取，请重新下载');return file}
function trackDuration(file,id){const track=file.getTrackById(id);return track.samples.reduce((sum,sample)=>sum+sample.duration,0)/track.mdia.mdhd.timescale}
function boxBytes(box){const stream=new DataStream();box.write(stream);return new Uint8Array(stream.buffer).subarray(8)}
async function downloadTrack(catalog,track,task,index,count){
 check(task);await update(task,{status:'downloading',stage:track.height?'正在下载视频画面':'正在下载声音',progress:Math.round(4+index/count*68)});
 // ponytail: 单个媒体轨上限 768 MB；长片大文件需要时再改成磁盘流式处理。
 const limit=768*1024*1024;
 if(track.bytes>limit)throw new Error('这个视频文件太大，请选择较低清晰度');
 let data,expected=track.bytes||0,received=0;
 const urls=[track.url,...track.backups];
 for(const source of urls){
  try{
   received=0;
   if(catalog.chunked){
    if(!expected)throw new Error('原站没有提供完整文件大小，请重新读取');
    data=new Uint8Array(expected);
    for(let start=0;start<expected;start+=8*1024*1024){
     check(task);const end=Math.min(start+8*1024*1024-1,expected-1),url=new URL(source);url.searchParams.set('range',`${start}-${end}`);
     const response=await fetch(url.href,{credentials:'omit',redirect:'error',signal:task.controller.signal});
     if(!response.ok)throw new Error(`原站返回 ${response.status}，请重新读取视频`);
     const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength!==end-start+1)throw new Error('音视频轨没有完整下载，请重新读取');
     data.set(bytes,start);received+=bytes.byteLength;
     await update(task,{progress:Math.round(4+(index+received/expected)/count*68)});
    }
   }else{
    const response=await fetch(source,{headers:{Range:'bytes=0-'},credentials:'omit',redirect:'error',signal:task.controller.signal});
    if(!response.ok)throw new Error(`原站返回 ${response.status}，请重新读取视频`);
    const range=response.headers.get('content-range')?.match(/bytes (\d+)-(\d+)\/(\d+)/);
    expected=Number(range?.[3]||response.headers.get('content-length'));
    if(!expected||expected>limit||range&&(Number(range[1])!==0||Number(range[2])+1!==expected))throw new Error('无法确认完整媒体文件，请重新读取');
    data=new Uint8Array(expected);const reader=response.body.getReader();
    try{for(;;){check(task);const {done,value}=await reader.read();if(done)break;if(received+value.byteLength>expected)throw new Error('原站媒体大小发生变化，请重新读取');data.set(value,received);received+=value.byteLength;if(Date.now()-task.progressAt>300){task.progressAt=Date.now();await update(task,{progress:Math.round(4+(index+received/expected)/count*68)})}}}finally{await reader.cancel()}
   }
   if(received!==expected)throw new Error('媒体轨下载不完整，请重试');
   return {buffer:data.buffer,bytes:received,expected};
  }catch(error){if(task.cancelled||source===urls.at(-1))throw error}
 }
}
async function decodeAudio(buffer,expected){
 const context=new OfflineAudioContext(2,1,44100);let audio;
 try{audio=await context.decodeAudioData(buffer.slice(0))}catch{throw new Error('声音没有完整解码，请重新下载')}
 if(Math.abs(audio.duration-expected)>Math.max(2,expected*0.005))throw new Error('声音时长不完整，请重新下载');
 let active=false;for(let channel=0;channel<audio.numberOfChannels;channel++){const values=audio.getChannelData(channel);for(let i=0;i<values.length;i+=100)if(Math.abs(values[i])>0.00001){active=true;break}}
 return {audio,active};
}
async function decodeVideo(file,track,task){
 const input=file.getTrackById(track.id),entry=input.mdia.minf.stbl.stsd.entries[0];
 const config={codec:track.codec,codedWidth:track.video.width,codedHeight:track.video.height,description:boxBytes(entry.avcC),hardwareAcceleration:'prefer-hardware'};
 if(!(await VideoDecoder.isConfigSupported(config)).supported)throw new Error('当前 Chrome 不能检查这个视频，请选择其他清晰度');
 let error,frames=0;const decoder=new VideoDecoder({output:frame=>{frames++;frame.close()},error:value=>{error=value}});decoder.configure(config);
 try{
  for(let i=0;i<input.samples.length;i++){
   check(task);if(error)throw error;
   const sample=file.getTrackSample(track.id,i);
   decoder.decode(new EncodedVideoChunk({type:sample.is_sync?'key':'delta',timestamp:Math.round(sample.cts/sample.timescale*1e6),duration:Math.round(sample.duration/sample.timescale*1e6),data:sample.data}));
   while(decoder.decodeQueueSize>24){await pause();check(task);if(error)throw error}
   if(i%600===0)await update(task,{progress:Math.min(87,77+Math.round(i/input.samples.length*10))});
  }
  await decoder.flush();if(error||frames!==input.samples.length)throw new Error('画面没有完整解码，请重新下载');return frames;
 }finally{if(decoder.state!=='closed')decoder.close()}
}
async function merge(videoFile,audioFile,task,duration){
 const output=createFile();const video=videoFile.getInfo().videoTracks[0],audio=audioFile.getInfo().audioTracks[0];
 for(const [file,track] of [[videoFile,video],[audioFile,audio]]){
  if(!track)throw new Error('文件缺少画面或声音');
  const entry=file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0];
  const id=output.addTrack({type:entry.type,hdlr:track.video?'vide':'soun',name:'Ruxget',timescale:track.timescale,duration:Math.round(duration*track.timescale),width:track.video?.width||0,height:track.video?.height||0,channel_count:track.audio?.channel_count,samplerate:track.audio?.sample_rate,description_boxes:entry.boxes});
  const samples=file.getTrackById(track.id).samples;
  for(let i=0;i<samples.length;i++){check(task);const sample=file.getTrackSample(track.id,i);output.addSample(id,sample.data,{duration:sample.duration,dts:sample.dts,cts:sample.cts,is_sync:sample.is_sync});if(i%1000===0)await pause()}
 }
 output.moov.mvhd.duration=Math.round(duration*output.moov.mvhd.timescale);
 for(const track of output.moov.traks)track.tkhd.duration=output.moov.mvhd.duration;
 return new Blob([output.getBuffer().buffer],{type:'video/mp4'});
}
// ID3v2.3 tag with title, artist and front cover. Text frames are UTF-16 so Chinese titles display everywhere.
function id3(meta){
 const frames=[],u16=text=>{const out=new Uint8Array(3+text.length*2+2);out[0]=1;out[1]=0xff;out[2]=0xfe;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);out[3+i*2]=c&255;out[4+i*2]=c>>8}return out};
 const frame=(id,body)=>{const head=new Uint8Array(10);for(let i=0;i<4;i++)head[i]=id.charCodeAt(i);const n=body.length;head[4]=n>>>24&255;head[5]=n>>>16&255;head[6]=n>>>8&255;head[7]=n&255;frames.push(head,body)};
 if(meta.title)frame('TIT2',u16(meta.title));if(meta.artist)frame('TPE1',u16(meta.artist));
 if(meta.cover){const mime=new TextEncoder().encode(meta.coverType),body=new Uint8Array(4+mime.length+meta.cover.length);body.set(mime,1);body[mime.length+2]=3;body.set(meta.cover,mime.length+4);frame('APIC',body)}
 const size=frames.reduce((n,f)=>n+f.length,0);
 return new Blob([new Uint8Array([0x49,0x44,0x33,3,0,0,size>>>21&127,size>>>14&127,size>>>7&127,size&127]),...frames]);
}
// Cover is optional: any failure just leaves it out.
async function coverArt(url,task){
 if(!url)return null;
 try{const response=await fetch(url,{credentials:'omit',redirect:'error',signal:task.controller.signal});const type=response.headers.get('content-type')||'';if(!response.ok||!/^image\/(jpeg|png)$/.test(type))return null;const bytes=new Uint8Array(await response.arrayBuffer());return bytes.length&&bytes.length<=4*1024*1024?{cover:bytes,coverType:type}:null}catch{return null}
}
async function mp3(audio,task){
 const channels=Math.min(audio.numberOfChannels,2),encoder=new lamejs.Mp3Encoder(channels,audio.sampleRate,192),parts=[];
 const data=Array.from({length:channels},(_,channel)=>audio.getChannelData(channel));
 for(let offset=0;offset<audio.length;offset+=1152){
  check(task);const end=Math.min(offset+1152,audio.length),pcm=data.map(values=>{const output=new Int16Array(end-offset);for(let i=0;i<output.length;i++){const value=Math.max(-1,Math.min(1,values[offset+i]));output[i]=Math.round(value*(value<0?32768:32767))}return output});
  const encoded=encoder.encodeBuffer(...pcm);if(encoded.length)parts.push(new Uint8Array(encoded));
  if(offset%(1152*128)===0){await update(task,{progress:Math.min(90,77+Math.round(offset/audio.length*13))});await pause()}
 }
 const tail=encoder.flush();if(tail.length)parts.push(new Uint8Array(tail));return new Blob(parts,{type:'audio/mpeg'});
}
async function outputInfo(url,format){
 const media=document.createElement(format==='mp3'?'audio':'video');media.preload='metadata';
 try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('没有读到完整成品，请重新下载')),15000);media.onloadedmetadata=()=>{clearTimeout(timer);resolve({duration:media.duration,width:media.videoWidth||0,height:media.videoHeight||0})};media.onerror=()=>{clearTimeout(timer);reject(new Error('成品文件未通过播放格式检查，请重新下载'))};media.src=url})}finally{media.removeAttribute('src');media.load()}
}
async function run(task){
 const {catalog,job}=task;
 const timer=setTimeout(()=>{task.timedOut=true;task.controller.abort()},900000);
 try{
  check(task);const audioOnly=job.format==='mp3',video=catalog.video.find(track=>track.height===job.height),audio=catalog.audio[0];
  // muxed: one file already holds picture and sound (抖音、快手、小红书); no separate audio track, no merge.
  const tracks=audioOnly?[audio]:catalog.muxed?[video]:[video,audio],downloads=[];
  for(let i=0;i<tracks.length;i++)downloads.push(await downloadTrack(catalog,tracks[i],task,i,tracks.length));
  await update(task,{status:'verifying',stage:'正在检查声音与完整时长',progress:75});
  const sound=await decodeAudio(downloads.at(-1).buffer,catalog.duration);check(task);
  let blob,videoFrames=0,width=0,height=0;
  if(audioOnly){await update(task,{stage:'正在生成 MP3',progress:77});blob=await mp3(sound.audio,task);blob=new Blob([id3({title:catalog.title,artist:catalog.artist,...await coverArt(catalog.cover,task)}),blob],{type:'audio/mpeg'});await update(task,{stage:'正在检查 MP3 文件',progress:93});await decodeAudio(await blob.arrayBuffer(),catalog.duration)}
  else if(catalog.muxed){
   const file=parse(downloads[0].buffer),track=file.getInfo().videoTracks[0];
   if(!track||job.height&&track.video.height!==job.height||Math.abs(trackDuration(file,track.id)-catalog.duration)>Math.max(2,catalog.duration*0.005))throw new Error('视频清晰度或时长不符合选择，请重新下载');
   width=track.video.width;height=track.video.height;
   await update(task,{stage:'正在检查完整画面',progress:77});videoFrames=await decodeVideo(file,track,task);
   blob=new Blob([downloads[0].buffer],{type:'video/mp4'});
  }
  else{
   const videoFile=parse(downloads[0].buffer),audioFile=parse(downloads[1].buffer),track=videoFile.getInfo().videoTracks[0];
   if(!track||track.video.height!==job.height||Math.abs(trackDuration(videoFile,track.id)-catalog.duration)>Math.max(2,catalog.duration*0.005))throw new Error('视频清晰度或时长不符合选择，请重新下载');
   width=track.video.width;height=track.video.height;
   await update(task,{stage:'正在检查完整画面',progress:77});videoFrames=await decodeVideo(videoFile,track,task);
   await update(task,{stage:'正在合并画面与声音',progress:90});blob=await merge(videoFile,audioFile,task,catalog.duration);
  }
  check(task);await update(task,{stage:'检查通过，正在保存',progress:97});
  task.blobURL=URL.createObjectURL(blob);
  const actual=await outputInfo(task.blobURL,job.format);
  if(!Number.isFinite(actual.duration)||Math.abs(actual.duration-catalog.duration)>Math.max(2,catalog.duration*0.005)||!audioOnly&&job.height&&actual.height!==job.height)throw new Error('成品时长或清晰度不符合选择，请重新下载');
  const verification={...actual,audio:audioOnly?'mp3':'aac',video:audioOnly?null:'h264',audioActive:sound.active,bytes:blob.size,fullDecode:true,expectedDuration:catalog.duration,videoFrames,trackBytes:downloads.map(({bytes,expected})=>({bytes,expected}))};
  await send('shiyingEngineSave',{id:job.id,url:task.blobURL,filename:`${filename(job.title)}-${audioOnly?'声音':Math.min(width,height)?Math.min(width,height)+'p':'原画'}.${job.format}`,verification});
 }catch(error){const message=task.timedOut?'下载耗时过长，请检查网络后重试':(error.message||String(error));await send('shiyingEngineUpdate',{id:job.id,values:{status:task.cancelled?'cancelled':'error',stage:task.cancelled?'已取消':'下载失败',error:task.cancelled?null:(/[\u4e00-\u9fff]/.test(message)?message:'文件未通过处理或完整性检查，请重新读取后再试')}}).catch(()=>{});if(task.blobURL)URL.revokeObjectURL(task.blobURL);tasks.delete(job.id)}finally{clearTimeout(timer)}
}
chrome.runtime.onMessage.addListener((event,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 if(event.Message==='shiyingEngineRun'){const task={catalog:event.catalog,job:event.job,controller:new AbortController(),cancelled:false,progressAt:0};tasks.set(task.job.id,task);queue=queue.then(()=>run(task));respond({ok:true});}
 else if(event.Message==='shiyingEngineCancel'){const task=tasks.get(event.id);if(task){task.cancelled=true;task.controller.abort()}respond({ok:true});}
 else if(event.Message==='shiyingEngineRelease'){const task=tasks.get(event.id);if(task?.blobURL)URL.revokeObjectURL(task.blobURL);tasks.delete(event.id);respond({ok:true});}
});
