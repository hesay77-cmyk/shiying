// Test real native-message framing and local IPC without registering a browser host.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),vm=require('node:vm');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=path.join(root,'reports','desktop-bridge-'+Date.now());fs.mkdirSync(report,{recursive:true});
const original=path.join(root,'desktop','Ruxget.exe'),releaseExe=path.join(report,'Release.Check.exe'),exe=path.join(report,'Bridge.Check.exe'),id='a'.repeat(32),origin=`chrome-extension://${id}/`;
fs.copyFileSync(original,releaseExe);fs.writeFileSync(path.join(report,'native-host.json'),JSON.stringify({allowed_origins:[origin]}));
// Never bind the installed application's pipe. Compile the same source with only a unique review prefix.
const reviewSource=path.join(report,'Bridge.Core.cs'),source=fs.readFileSync(path.join(root,'desktop','Shiying.cs'),'utf8');assert.equal(source.split('"shiying.desktop.v1."').length,2);
fs.writeFileSync(reviewSource,source.replace('"shiying.desktop.v1."',JSON.stringify('shiying.review.'+require('node:crypto').randomUUID()+'.')));
const compile=spawnSync(path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:exe','/platform:x64','/main:ShiyingDesktop.Program','/out:'+exe,...['System','System.Core','System.Security','System.Drawing','System.Windows.Forms','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem','Microsoft.CSharp'].map(x=>'/r:'+x+'.dll'),reviewSource,...['Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs'].map(x=>path.join(root,'desktop',x))],{encoding:'utf8',windowsHide:true});assert.equal(compile.status,0,compile.stdout+compile.stderr);
const pipeName=spawnSync(exe,['--pipe-name'],{encoding:'utf8',windowsHide:true}).stdout.trim();assert(pipeName.startsWith('shiying.review.'));
const frame=value=>{const b=Buffer.from(JSON.stringify(value)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return Buffer.concat([h,b]);};
function native(caller,bytes,program=exe){return new Promise((resolve,reject)=>{const child=spawn(program,[caller],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out=[],errors=[];const timer=setTimeout(()=>{child.kill();reject(new Error('native bridge timed out'));},12000);child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>errors.push(b));child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);try{assert.equal(code,0,Buffer.concat(errors).toString());const all=Buffer.concat(out);assert(all.length>=4);assert.equal(all.length,all.readUInt32LE(0)+4);resolve(JSON.parse(all.subarray(4).toString()));}catch(e){reject(e);}});child.stdin.write(bytes.subarray(0,2));child.stdin.end(bytes.subarray(2));});}
(async()=>{
 const received=[],server=net.createServer(socket=>{let b=Buffer.alloc(0);socket.on('data',chunk=>{b=Buffer.concat([b,chunk]);if(b.length>=4&&b.length>=b.readUInt32LE(0)+4){received.push(JSON.parse(b.subarray(4).toString()));socket.end(frame({ok:true,stage:'confirm'}));}});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen('\\\\.\\pipe\\'+pipeName,resolve);});
 try{
  const ping=await native(origin,frame({action:'ping'}),releaseExe);assert.equal(ping.ok,true);assert.equal(ping.netdisk,true);assert.equal(ping.netdiskApi,2);assert.equal(ping.version,/public const string Version="([^"]+)"/.exec(source)[1]);assert.equal(received.length,0);
  const sealed=await native(origin,frame({action:'netdiskSeal',provider:'baidu',value:'fixture-oauth-token'}),releaseExe);assert(sealed.ok&&!sealed.value.includes('fixture-oauth-token'));const opened=await native(origin,frame({action:'netdiskOpen',provider:'baidu',value:sealed.value}),releaseExe);assert.equal(opened.value,'fixture-oauth-token');assert.equal(received.length,0);
  const delivery=await native(origin,frame({action:'add',kind:'file',url:'https://example.test/file.bin',title:'download'}));assert.equal(delivery.ok,true,JSON.stringify(delivery));
  assert.equal(received.length,1);assert.equal(received[0].url,'https://example.test/file.bin');
  assert.equal((await native('chrome-extension://'+'b'.repeat(32)+'/',frame({action:'add',url:'https://example.test/'}))).ok,false);
  assert.equal((await native(origin,frame({action:'add',url:'file:///C:/private.txt'}))).ok,false);
  const oversized=Buffer.alloc(4);oversized.writeUInt32LE(65537);assert.equal((await native(origin,oversized)).ok,false);
  assert.equal(received.length,1);
  const cloud=await native(origin,frame({action:'netdisk',provider:'quark',source:'https://pan.quark.cn/list',requestId:'a'.repeat(32),files:[{index:0,url:'https://dl.quark.cn/fixture.bin',title:'fixture.bin'}]}));assert.equal(cloud.ok,true);assert.equal(received.length,2);assert.equal(received[1].action,'netdisk');
 }finally{await new Promise(resolve=>server.close(resolve));}
 // Execute the real service-worker desktop route with an explicit catalog fixture.
 const listeners=[],catalog={id:'catalog',url:'https://www.youtube.com/watch?v=abcdefghijk',site:'youtube',title:'fixture',createdAt:Date.now(),video:[{height:720,url:'https://r1.googlevideo.com/video'}],audio:[{url:'https://r1.googlevideo.com/audio'}],cookie:'never-forward'};
 const context={console,Date,URL,crypto:require('node:crypto').webcrypto,importScripts(){},navigator:{userAgent:'fixture-agent'},chrome:{runtime:{id,getURL:file=>origin+file,onMessage:{addListener:fn=>listeners.push(fn)}},storage:{session:{get:async()=>({'shiyingCatalog:catalog':catalog})}},downloads:{onChanged:{addListener(){}}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/shiying-background.js'),'utf8'),context);
 const dispatch=(height,sender=origin+'shiying.html')=>new Promise(resolve=>listeners[0]({Message:'shiyingPlatformDesktop',id:'catalog',height},{id,url:sender},resolve));
 const actual=await dispatch(720);assert(actual.ok);assert.equal(actual.payload.videoUrl,catalog.video[0].url);assert.equal(actual.payload.height,720);assert(!('cookie' in actual.payload));
 assert.equal((await dispatch(1080)).ok,false);assert.equal((await dispatch(720,'https://evil.test/')).ok,false);
 catalog.createdAt=0;assert.equal((await dispatch(720)).ok,false);
 let nativeCalls=0,opened=[];const helperContext={chrome:{permissions:{request:async()=>false},runtime:{getURL:file=>file,sendNativeMessage:async()=>{nativeCalls++;throw new Error('Specified native messaging host not found.');}},tabs:{create:async tab=>opened.push(tab)}},document:{querySelector:()=>null}};
 vm.createContext(helperContext);vm.runInContext(fs.readFileSync(path.join(root,'js/shiying-native.js'),'utf8')+fs.readFileSync(path.join(root,'js/shiying-desktop.js'),'utf8')+'\nglobalThis.api=ShiyingDesktop;',helperContext);
 await assert.rejects(helperContext.api.send(()=>({action:'add',url:'https://example.test/'})),/未允许/);assert.equal(nativeCalls,0);
 helperContext.chrome.permissions.request=async()=>true;await assert.rejects(helperContext.api.send(()=>({action:'add',url:'https://example.test/'})),error=>error.cancelled&&error.connectionIssue==='missing');assert.equal(opened.length,1);assert(opened[0].url.includes('shiying-get-desktop.html?reason=missing'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),identity=JSON.parse(fs.readFileSync(path.join(root,'desktop','identity.json')));
 const stable=require('node:crypto').createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,x=>String.fromCharCode(97+parseInt(x,16)));assert.equal(stable,identity.extensionId);
 fs.writeFileSync(path.join(report,'summary.json'),JSON.stringify({ok:true,method:'final binary ping; identical native source with unique review pipe prefix for IPC; no contact with running desktop application',checks:['native ping returns version and netdisk capability without desktop IPC','stable public key matches installed allowed extension ID','real native framing and pipe delivery','origin allowlist','URL scheme rejection','message size bound','selected actual video and audio tracks','video route forwards no cookies','expired catalog rejection','panel sender validation','final binary seals and reopens OAuth data with Windows DPAPI without desktop IPC','netdisk batch passes framed native IPC'],registryChanged:false},null,2));
 console.log('NATIVE BRIDGE PASSED',report);
})().catch(e=>{console.error(e);process.exitCode=1});
