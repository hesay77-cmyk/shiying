// Isolated first-use checks. Never touches actual browser registration or downloads media.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using ShiyingDesktop;

class FixtureServer:IDisposable {
    readonly TcpListener listener=new TcpListener(IPAddress.Loopback,0);
    readonly Thread thread;
    public byte[] Bytes;
    public volatile bool IgnoreRange,BadRange;
    public int Requests,Resumed,DropRequests,FailResponses,FailStatus;
    public string Url;
    public FixtureServer(byte[] bytes){Bytes=bytes;listener.Start();Url="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port+"/component";thread=new Thread(Run){IsBackground=true};thread.Start();}
    void Run(){while(true){TcpClient client;try{client=listener.AcceptTcpClient();}catch{return;}using(client)try{
        using(var stream=client.GetStream()){
            var line=new StringBuilder();int c;while((c=stream.ReadByte())>=0){line.Append((char)c);if(line.ToString().EndsWith("\r\n\r\n"))break;if(line.Length>16000)throw new Exception("header");}
            Interlocked.Increment(ref Requests);long offset=0;foreach(string row in line.ToString().Split('\n'))if(row.StartsWith("Range:",StringComparison.OrdinalIgnoreCase)){offset=Int64.Parse(row.Trim().Split('=')[1].TrimEnd('-'));Interlocked.Increment(ref Resumed);}
            if(FailResponses>0){FailResponses--;byte[] failed=Encoding.ASCII.GetBytes("HTTP/1.1 "+FailStatus+" Fixture Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");stream.Write(failed,0,failed.Length);continue;}
            bool partial=offset>0&&!IgnoreRange;if(!partial)offset=0;byte[] bytes=Bytes;
            string head="HTTP/1.1 "+(partial?"206 Partial Content":"200 OK")+"\r\nContent-Length: "+(bytes.Length-offset)+"\r\nConnection: close\r\n"+(partial?"Content-Range: bytes "+(BadRange?offset+1:offset)+"-"+(bytes.Length-1)+"/"+bytes.Length+"\r\n":"")+"\r\n";
            byte[] header=Encoding.ASCII.GetBytes(head);stream.Write(header,0,header.Length);
            int limit=DropRequests>0?(int)Math.Min(bytes.Length,offset+bytes.Length/4):bytes.Length;if(DropRequests>0)DropRequests--;
            for(int at=(int)offset;at<limit;at+=16384){stream.Write(bytes,at,Math.Min(16384,limit-at));Thread.Sleep(2);}
        }
    }catch{} }}
    public void Dispose(){listener.Stop();thread.Join(3000);}
}
class StartupCheck {
    static readonly List<string> checks=new List<string>();
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);Console.WriteLine("PASS "+name);}
    static bool Reject(Action action){try{action();return false;}catch{return true;}}
    static string Hash(byte[] bytes){using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    static ComponentSpec Spec(string name,FixtureServer server,byte[] bytes){return new ComponentSpec{name=name,version="fixture",url=server.Url,sha256=Hash(bytes),downloadSha256=Hash(bytes),bytes=bytes.Length,downloadBytes=bytes.Length};}
    static MemoryStream Package(string path,byte[] bytes,string digest){var output=new MemoryStream();using(var zip=new ZipArchive(output,ZipArchiveMode.Create,true)){using(var writer=new StreamWriter(zip.CreateEntry("payload-manifest.json").Open(),new UTF8Encoding(false)))writer.Write(Util.Json().Serialize(new{files=new[]{new InstalledFile{Path=path,Sha256=digest}}}));using(var stream=zip.CreateEntry(path).Open())stream.Write(bytes,0,bytes.Length);}output.Position=0;return output;}
    static string Value(RegistryKey registry,string path,string name=""){using(var key=registry.OpenSubKey(path))return key==null?null:Convert.ToString(key.GetValue(name));}
    static void InstallChecks(string folder,string payload){
        string root=Path.Combine(folder,"隔离 安装"),old=Path.Combine(folder,"旧版本"),keyName="Software\\Shiying.Review\\"+Guid.NewGuid().ToString("N");Directory.CreateDirectory(old);
        string native="Software\\Google\\Chrome\\NativeMessagingHosts\\org.shiying.desktop",edge="Software\\Microsoft\\Edge\\NativeMessagingHosts\\org.shiying.desktop",uninstall="Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShiyingDesktop";
        string oldManifest=Path.Combine(old,"native-host.json");File.WriteAllText(oldManifest,"{\"allowed_origins\":[\"chrome-extension://"+new string('a',32)+"/\"]}");
        try{using(var registry=Registry.CurrentUser.CreateSubKey(keyName)){
            using(var key=registry.CreateSubKey(native))key.SetValue("",oldManifest);
            using(var key=registry.CreateSubKey(edge))key.SetValue("",oldManifest);
            using(var key=registry.CreateSubKey(uninstall))key.SetValue("NoModify","old-value",RegistryValueKind.String);
            InstallReceipt first;using(var stream=File.OpenRead(payload))first=Installation.Apply(root,registry,stream,Assembly.GetExecutingAssembly().Location,false);
            Check(Value(registry,native)==Path.Combine(root,"native-host.json")&&Value(registry,edge)==Path.Combine(root,"native-host.json"),"installer registers Chrome and Edge in scoped test key");
            string id=Installation.Identity(root);Check(Installation.ExistingOrigins(root,registry).Contains("chrome-extension://"+id+"/")&&Installation.ExistingOrigins(root,registry).Contains("chrome-extension://"+new string('a',32)+"/"),"automatic pairing keeps previous extension IDs");
            var ping=new ProcessStartInfo(Path.Combine(root,"拾影.exe"),"chrome-extension://"+id+"/"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
            using(var process=Process.Start(ping)){BrowserBridge.WriteFrame(process.StandardInput.BaseStream,Encoding.UTF8.GetBytes("{\"action\":\"ping\"}"));process.StandardInput.Close();var reply=Util.Json().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(BrowserBridge.ReadFrame(process.StandardOutput.BaseStream)));Check(process.WaitForExit(5000)&&process.ExitCode==0&&Util.Str(reply,"version")==Util.Version&&Util.Str(reply,"ok")=="True","actual installed payload binary returns current version through ping only");}
            Check(Value(registry,"Software\\Classes\\shiying-desktop\\shell\\open\\command")==Installation.PairCommand(root),"protocol command quotes executable and URL");
            Check(File.Exists(Path.Combine(root,"bin","aria2c.exe"))&&!File.Exists(Path.Combine(root,"bin","yt-dlp.exe"))&&!File.Exists(Path.Combine(root,"bin","ffmpeg.exe"))&&!File.Exists(Path.Combine(root,"bin","node.exe")),"small installer bundles only aria2 core");
            string data=Path.Combine(root,"data","partial","keep.part");Directory.CreateDirectory(Path.GetDirectoryName(data));File.WriteAllText(data,"keep partial");File.WriteAllText(Path.Combine(root,"unknown.txt"),"keep unknown");
            using(var stream=File.OpenRead(payload)){var repeated=Installation.Apply(root,registry,stream,Assembly.GetExecutingAssembly().Location,false);Check(repeated.Id==first.Id&&File.ReadAllText(data)=="keep partial","reinstall preserves identity and partial data");}
            string before=ComponentStore.Hash(Path.Combine(root,"拾影.exe")),nativeBefore=File.ReadAllText(Path.Combine(root,"native-host.json"));byte[] replacement=Encoding.UTF8.GetBytes("never executable");
            using(var bad=Package("拾影.exe",replacement,new string('0',64)))Check(Reject(()=>Installation.Apply(root,registry,bad,Assembly.GetExecutingAssembly().Location,false))&&ComponentStore.Hash(Path.Combine(root,"拾影.exe"))==before,"invalid payload hash rejected without changing program");
            using(var bad=Package("../escape.txt",replacement,Hash(replacement)))Check(Reject(()=>Installation.Apply(root,registry,bad,Assembly.GetExecutingAssembly().Location,false))&&!File.Exists(Path.Combine(folder,"escape.txt")),"payload traversal refused");
            // Trigger a real post-replacement failure; verify both disk and registry rollback.
            using(var bad=Package("identity.json",replacement,Hash(replacement)))Check(Reject(()=>Installation.Apply(root,registry,bad,Assembly.GetExecutingAssembly().Location,false))&&Installation.Identity(root)==id&&File.ReadAllText(Path.Combine(root,"native-host.json"))==nativeBefore&&Value(registry,native)==Path.Combine(root,"native-host.json"),"post-replacement failure rolls back files and registration");
            using(var key=registry.CreateSubKey(edge))key.SetValue("","another-installation.json");
            Installation.Uninstall(root,registry,first.Id);
            Check(Value(registry,native)==oldManifest&&Value(registry,edge)=="another-installation.json"&&Value(registry,uninstall,"NoModify")=="old-value","uninstall restores previous values and respects another installation");
            Check(File.Exists(data)&&File.Exists(Path.Combine(root,"unknown.txt"))&&!File.Exists(Path.Combine(root,"拾影.exe"))&&!File.Exists(Path.Combine(root,"bin","aria2c.exe")),"uninstall removes owned program and keeps user data");
        }}finally{Registry.CurrentUser.DeleteSubKeyTree(keyName,false);}
        Check(Installation.PairId("shiying-desktop://pair/"+new string('b',32))==new string('b',32)&&Reject(()=>Installation.PairId("shiying-desktop://pair/"+new string('b',32)+"?run=1"))&&Reject(()=>Installation.PairId("shiying-desktop://pair/invalid")),"pairing URL accepts only an exact extension ID");
    }
    static void ComponentsChecks(string folder){
        byte[] bytes=new byte[2*1024*1024];new Random(438).NextBytes(bytes);
        using(var server=new FixtureServer(bytes)){
            string root=Path.Combine(folder,"components");var spec=Spec("yt-dlp.exe",server,bytes);var store=new ComponentStore(root,new[]{spec});
            using(var cancel=new CancellationTokenSource()){Check(Reject(()=>store.Ensure(new[]{spec.name},"",p=>{if(p.Received>0)cancel.Cancel();},cancel.Token)),"component preparation can be cancelled");}
            string partial=Path.Combine(root,"data","components",spec.name+"-fixture.download");Check(File.Exists(partial)&&new FileInfo(partial).Length>0&&new FileInfo(partial).Length<bytes.Length&&!File.Exists(Path.Combine(root,"bin",spec.name)),"cancel keeps partial component without installing");
            store=new ComponentStore(root,new[]{spec});store.Ensure(new[]{spec.name},"",null,CancellationToken.None);Check(store.Ready(spec.name)&&server.Resumed>0&&!File.Exists(partial),"component resumes after a fresh store and passes SHA256");
            int requests=server.Requests;store.Ensure(new[]{spec.name},"",null,CancellationToken.None);Check(server.Requests==requests,"ready component is reused without network");
            root=Path.Combine(folder,"range-ignored");store=new ComponentStore(root,new[]{spec});using(var cancel=new CancellationTokenSource()){Reject(()=>store.Ensure(new[]{spec.name},"",p=>{if(p.Received>0)cancel.Cancel();},cancel.Token));}
            server.IgnoreRange=true;store.Ensure(new[]{spec.name},"",null,CancellationToken.None);Check(store.Ready(spec.name),"server ignoring Range restarts cleanly");server.IgnoreRange=false;
            root=Path.Combine(folder,"bad-hash");Directory.CreateDirectory(Path.Combine(root,"bin"));string original=Path.Combine(root,"bin",spec.name);File.WriteAllText(original,"keep existing");var bad=Spec(spec.name,server,bytes);bad.downloadSha256=new string('0',64);store=new ComponentStore(root,new[]{bad});Check(Reject(()=>store.Ensure(new[]{spec.name},"",null,CancellationToken.None))&&File.ReadAllText(original)=="keep existing"&&Directory.GetFiles(Path.Combine(root,"data","components"),"*.invalid-*").Length==1,"bad download hash quarantined; existing component retained");
            root=Path.Combine(folder,"bad-range");store=new ComponentStore(root,new[]{spec});using(var cancel=new CancellationTokenSource()){Reject(()=>store.Ensure(new[]{spec.name},"",p=>{if(p.Received>0)cancel.Cancel();},cancel.Token));}server.BadRange=true;Check(Reject(()=>store.Ensure(new[]{spec.name},"",null,CancellationToken.None))&&!File.Exists(Path.Combine(root,"bin",spec.name)),"incorrect Content-Range is rejected");server.BadRange=false;
            // Only the exact known ZIP entry is extracted, never archive paths.
            byte[] zipped;using(var memory=new MemoryStream()){using(var zip=new ZipArchive(memory,ZipArchiveMode.Create,true)){using(var output=zip.CreateEntry("release/bin/ffmpeg.exe").Open())output.Write(bytes,0,bytes.Length);using(var writer=new StreamWriter(zip.CreateEntry("../escape.txt").Open()))writer.Write("escape");}zipped=memory.ToArray();}
            server.Bytes=zipped;var zipSpec=Spec("ffmpeg.exe",server,bytes);zipSpec.downloadBytes=zipped.Length;zipSpec.downloadSha256=Hash(zipped);zipSpec.archiveEntry="release/bin/ffmpeg.exe";root=Path.Combine(folder,"zip");store=new ComponentStore(root,new[]{zipSpec});store.Ensure(new[]{zipSpec.name},"",null,CancellationToken.None);Check(store.Ready(zipSpec.name)&&!File.Exists(Path.Combine(root,"escape.txt")),"ZIP extracts only the expected executable and verifies it");
            zipSpec.sha256=new string('1',64);root=Path.Combine(folder,"bad-extracted");store=new ComponentStore(root,new[]{zipSpec});Check(Reject(()=>store.Ensure(new[]{zipSpec.name},"",null,CancellationToken.None))&&!File.Exists(Path.Combine(root,"bin",zipSpec.name)),"extracted executable hash mismatch prevents install");
            server.Bytes=bytes;root=Path.Combine(folder,"manager");var ff=Spec("ffmpeg.exe",server,bytes);Directory.CreateDirectory(Path.Combine(root,"bin"));File.WriteAllBytes(Path.Combine(root,"bin","ffmpeg.exe"),bytes);store=new ComponentStore(root,new[]{spec,ff});
            using(var manager=new Manager(Path.Combine(root,"state"))){typeof(Manager).GetField("components",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(manager,store);manager.Config.Proxy="";manager.Config.Folder=Path.Combine(root,"files");var job=manager.Add("https://example.test/fixture.m3u8","video","fixture");manager.Tick();Check(job.Status=="准备组件","queued video automatically enters component preparation");var end=DateTime.UtcNow.AddSeconds(4);while(!File.Exists(Path.Combine(root,"data","components",spec.name+"-fixture.download"))&&DateTime.UtcNow<end)Thread.Sleep(5);manager.Pause(job.Id);while(job.Status=="正在暂停"&&DateTime.UtcNow<end)Thread.Sleep(5);Check(job.Status=="已暂停"&&job.Child==null,"pausing preparation never launches video engine");manager.Resume(job.Id);manager.Tick();end=DateTime.UtcNow.AddSeconds(6);while(job.Status=="准备组件"&&DateTime.UtcNow<end)Thread.Sleep(5);Check(job.Status=="排队中"&&store.Ready(spec.name)&&job.Child==null,"preparation resumes and returns to queue without test media requests");}
        }
    }
    static void RecoveryChecks(string folder){
        byte[] bytes=new byte[512*1024];new Random(951).NextBytes(bytes);
        using(var server=new FixtureServer(bytes)){
            var spec=Spec("yt-dlp.exe",server,bytes);var store=new ComponentStore(Path.Combine(folder,"transient-eof"),new[]{spec});server.DropRequests=2;
            store.Ensure(new[]{spec.name},"",null,CancellationToken.None);Check(store.Ready(spec.name)&&server.Requests==3&&server.Resumed==2,"two truncated responses recover automatically using retained Range bytes");
            store=new ComponentStore(Path.Combine(folder,"retry-limit"),new[]{spec});int before=server.Requests;server.DropRequests=5;Exception failure=null;
            try{store.Ensure(new[]{spec.name},"",null,CancellationToken.None);}catch(Exception ex){failure=ex;}
            Check(failure!=null&&failure.Message.Contains("保留")&&server.Requests-before==3&&!store.Ready(spec.name),"network retries are bounded and report retained progress");
            store=new ComponentStore(Path.Combine(folder,"cancel-retry"),new[]{spec});before=server.Requests;
            using(var cancel=new CancellationTokenSource()){failure=null;try{store.Ensure(new[]{spec.name},"",p=>{if(p.Message.Contains("自动重试"))cancel.Cancel();},cancel.Token);}catch(Exception ex){failure=ex;}Check(failure is OperationCanceledException&&server.Requests-before==1,"pause cancels automatic retry before another request");}
            server.DropRequests=0;server.FailResponses=1;server.FailStatus=503;before=server.Requests;store=new ComponentStore(Path.Combine(folder,"retry-503"),new[]{spec});store.Ensure(new[]{spec.name},"",null,CancellationToken.None);Check(store.Ready(spec.name)&&server.Requests-before==2,"temporary HTTP service failure retries automatically");
            server.FailResponses=1;server.FailStatus=404;before=server.Requests;store=new ComponentStore(Path.Combine(folder,"no-retry-404"),new[]{spec});Check(Reject(()=>store.Ensure(new[]{spec.name},"",null,CancellationToken.None))&&server.Requests-before==1,"permanent HTTP failure is not retried");
        }
    }
    static void HiddenRefreshCheck(string folder){
        using(var manager=new Manager(Path.Combine(folder,"hidden-ui"))){
            var job=manager.Add("http://127.0.0.1/fixture","video","unchanged title");job.Status="准备组件";job.Stage="yt-dlp.exe 18%";
            var publish=typeof(Manager).GetMethod("PublishSnapshot",BindingFlags.Instance|BindingFlags.NonPublic);publish.Invoke(manager,null);
            using(var window=new MainWindow(manager,true)){
                var grid=(DataGridView)typeof(MainWindow).GetField("grid",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(window);var parentHandle=window.Handle;window.PerformLayout();var handle=grid.Handle;grid.PerformLayout();grid.FirstDisplayedScrollingRowIndex=0;
                Check(grid.ClientSize.Width>0&&!window.Visible,"UI refresh test uses hidden controls without showing a window");int redraws=0;grid.Invalidated+=(s,e)=>{if(e.InvalidRect==grid.ClientRectangle)redraws++;};
                job.Stage="ffmpeg.exe 97%";publish.Invoke(manager,null);typeof(MainWindow).GetMethod("RefreshJobs",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(window,null);
                Check(redraws>0&&((Download)grid.Rows[0].Tag).Stage==job.Stage,"component stage alone invalidates the task description cell");
                redraws=0;job.Status="已暂停";job.Stage="";publish.Invoke(manager,null);typeof(MainWindow).GetMethod("RefreshJobs",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(window,null);Check(redraws>0&&!window.Visible,"paused task description repaints without showing or activating a window");
            }
        }
    }
    [STAThread] static int Main(string[] args){try{
        if(args[0]=="--official-components"){
            string root=Path.GetFullPath(args[1]);Directory.CreateDirectory(Path.Combine(root,"bin"));Directory.CreateDirectory(Path.Combine(root,"data","components"));File.Copy(Path.Combine(args[2],"components.json"),Path.Combine(root,"components.json"));
            File.Copy(Path.Combine(args[2],"bin","node.exe"),Path.Combine(root,"bin","node.exe"));var store=new ComponentStore(root);var ff=store.Specs.Single(s=>s.name=="ffmpeg.exe");File.Copy(args[3],Path.Combine(root,"data","components",ff.name+"-"+ff.version+".download"));
            string stage="";store.Ensure(new[]{"yt-dlp.exe","ffmpeg.exe","node.exe"},"http://127.0.0.1:7897",p=>{if(stage!=p.Message){stage=p.Message;Console.WriteLine(stage);}},CancellationToken.None);
            Check(store.Ready("yt-dlp.exe")&&store.Ready("ffmpeg.exe")&&store.Ready("node.exe"),"pinned production components pass binary SHA256");
            var start=new ProcessStartInfo(Path.Combine(root,"bin","yt-dlp.exe"),"--version"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true};using(var process=Process.Start(start)){string version=process.StandardOutput.ReadToEnd().Trim();process.WaitForExit();Check(process.ExitCode==0&&version==store.Specs.Single(s=>s.name=="yt-dlp.exe").version,"downloaded verified yt-dlp reports pinned version");}
            Util.Atomic(Path.Combine(root,"summary.json"),new{ok=true,method="production component code: yt-dlp downloaded from official HTTPS through explicit proxy; FFmpeg verified and extracted from previously downloaded official ZIP; Node reused from local pinned binary; no media requests",checks=checks.ToArray()});return 0;
        }
        bool recoveryOnly=args[0]=="--recovery-only";string folder=Path.GetFullPath(args[recoveryOnly?1:0]);Directory.CreateDirectory(folder);if(!recoveryOnly){InstallChecks(folder,args[1]);ComponentsChecks(folder);}RecoveryChecks(folder);HiddenRefreshCheck(folder);Util.Atomic(Path.Combine(folder,"summary.json"),new{ok=true,method=recoveryOnly?"localhost raw bytes and hidden UI controls only; no windows shown, real browser, registry, engine or media requests":"isolated installer API and GUID scoped test registry; localhost raw bytes; hidden UI controls never shown; no real browser keys, shortcuts, engine or media requests",checks=checks.ToArray()});Console.WriteLine("STARTUP CHECKS PASSED "+folder);return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
