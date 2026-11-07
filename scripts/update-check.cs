// 0.4.72 automatic updates: the signed list, the download, every way it must refuse, and a real quiet install by the
// setup's --update mode into a temporary folder with a temporary registry key (never the person's own Ruxget).
// A loopback server stands in for hidaydream.cloud; a throwaway RSA key stands in for the real signing key.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32;
using ShiyingDesktop;
class UpdateCheck {
    static void Check(bool value,string name){if(!value)throw new Exception(name);Console.WriteLine("PASS "+name);}
    static int requests;
    static string manifestJson="";
    static byte[] setupBytes=new byte[0];
    static void Serve(HttpListener listener){
        while(listener.IsListening){HttpListenerContext context;try{context=listener.GetContext();}catch{return;}
            ThreadPool.QueueUserWorkItem(_=>{try{Interlocked.Increment(ref requests);var path=context.Request.Url.AbsolutePath;
                byte[] body=path.StartsWith("/update/")?Encoding.UTF8.GetBytes(manifestJson):path.StartsWith("/download/")?setupBytes:null;
                if(body==null){context.Response.StatusCode=404;context.Response.Close();return;}
                context.Response.ContentLength64=body.Length;context.Response.OutputStream.Write(body,0,body.Length);context.Response.Close();}catch{}});}
    }
    static string Sha(byte[] data){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(data)).Replace("-","").ToLowerInvariant();}
    static string Manifest(RSACryptoServiceProvider key,string version,string url,long size,string sha,bool tamper=false){
        var m=new UpdateManifest{version=version,url=url,size=size,sha256=sha};
        m.signature=Convert.ToBase64String(key.SignData(Encoding.UTF8.GetBytes(Updater.Signed(m)),"SHA256"));
        if(tamper)m.size+=1;
        return Util.Json().Serialize(m);
    }
    static int Main(string[] args){try{
        string report=Path.GetFullPath(args[0]),setupFile=args.Length>1?args[1]:null;
        int port;{var probe=new System.Net.Sockets.TcpListener(IPAddress.Loopback,0);probe.Start();port=((IPEndPoint)probe.LocalEndpoint).Port;probe.Stop();}
        var listener=new HttpListener();listener.Prefixes.Add("http://127.0.0.1:"+port+"/");listener.Start();new Thread(()=>Serve(listener)){IsBackground=true}.Start();
        string origin="http://127.0.0.1:"+port;
        var key=new RSACryptoServiceProvider(2048){PersistKeyInCsp=false};
        Updater.PublicKey=key.ToXmlString(false);Updater.ManifestUrl=origin+"/update/ruxget.json";Updater.AllowedPrefix=origin+"/download/";Updater.CurrentVersion="0.4.72";
        setupBytes=Enumerable.Range(0,300000).Select(i=>(byte)(i*13)).ToArray();string good=Sha(setupBytes),url=origin+"/download/Ruxget-0.4.73-Windows-Setup.exe";
        Func<string,string> fresh=name=>{string d=Path.Combine(report,name);if(Directory.Exists(d))Directory.Delete(d,true);Directory.CreateDirectory(d);return d;};

        string data=fresh("off");manifestJson=Manifest(key,"0.4.73",url,setupBytes.Length,good);int before=requests;
        Check(Updater.Check(data,false,"")=="off"&&requests==before,"with 自动更新 off nothing is asked");

        data=fresh("good");string result=Updater.Check(data,true,"");
        var pending=Updater.Pending(data);
        Check(result=="downloaded"&&pending!=null&&pending.version=="0.4.73"&&File.ReadAllBytes(Path.Combine(data,"update",pending.file)).SequenceEqual(setupBytes),"a newer signed setup is downloaded and waits ("+result+")");
        before=requests;Check(Updater.Check(data,true,"")=="recent"&&requests==before,"it asks at most once a day");
        Check(Updater.Check(data,true,"",true)=="ready","an update already waiting is not downloaded again");
        Check(!Directory.GetFiles(Path.Combine(data,"update"),"*.partial").Any(),"no half-downloaded file is left");
        // Someone changes the waiting setup on disk: it is not used, and it is removed.
        File.WriteAllBytes(Path.Combine(data,"update",pending.file),new byte[]{1,2,3});
        Check(Updater.Pending(data)==null&&!File.Exists(Path.Combine(data,"update",pending.file)),"a waiting setup changed on disk is never installed");

        data=fresh("tampered");manifestJson=Manifest(key,"0.4.73",url,setupBytes.Length,good,true);
        Check(Updater.Check(data,true,"")=="invalid"&&Updater.Pending(data)==null,"a list whose signature doesn't match is refused");
        data=fresh("otherkey");var stranger=new RSACryptoServiceProvider(2048){PersistKeyInCsp=false};manifestJson=Manifest(stranger,"0.4.73",url,setupBytes.Length,good);
        Check(Updater.Check(data,true,"")=="invalid"&&Updater.Pending(data)==null,"a list signed with another key is refused");
        data=fresh("elsewhere");manifestJson=Manifest(key,"0.4.73","https://example.com/download/Ruxget-0.4.73-Windows-Setup.exe",setupBytes.Length,good);
        Check(Updater.Check(data,true,"")=="invalid","a setup outside hidaydream.cloud/download is refused even when signed");
        data=fresh("older");manifestJson=Manifest(key,"0.4.71",url,setupBytes.Length,good);
        Check(Updater.Check(data,true,"")=="current"&&Updater.Pending(data)==null,"an older or equal version is ignored");
        data=fresh("swapped");manifestJson=Manifest(key,"0.4.73",url,setupBytes.Length,Sha(new byte[]{9}));
        result=Updater.Check(data,true,"");
        Check(result.StartsWith("failed")&&Updater.Pending(data)==null&&!Directory.GetFiles(Path.Combine(data,"update"),"*Setup*").Any(),"a setup whose checksum differs from the signed one is thrown away ("+result+")");
        data=fresh("short");manifestJson=Manifest(key,"0.4.73",url,setupBytes.Length-10,Sha(setupBytes.Take(setupBytes.Length-10).ToArray()));
        Check(Updater.Check(data,true,"").StartsWith("failed")&&Updater.Pending(data)==null,"a setup larger than announced is cut off and thrown away");
        data=fresh("offline");Updater.ManifestUrl="http://127.0.0.1:1/update/ruxget.json";
        Check(Updater.Check(data,true,"").StartsWith("failed")&&Updater.Pending(data)==null,"no connection: nothing happens, nothing breaks");
        Check(Updater.Newer("0.4.100","0.4.72")&&!Updater.Newer("0.4.72","0.4.72")&&!Updater.Newer("bad","0.4.72"),"versions compare as numbers");

        // An install that failed is not tried again when Ruxget starts (only when it quits), and is given up after three tries.
        data=fresh("failing");manifestJson=Manifest(key,"0.4.73",url,setupBytes.Length,good);Updater.ManifestUrl=origin+"/update/ruxget.json";
        Check(Updater.Check(data,true,"")=="downloaded","the failing case starts with a waiting setup");
        Updater.RecordFailure(data,"0.4.73","locked");
        Check(Updater.Pending(data)!=null&&!Updater.Launch(data,true,new string[0]),"after a failed install Ruxget opens normally instead of trying again at once");
        Updater.RecordFailure(data,"0.4.73","locked");Updater.RecordFailure(data,"0.4.73","locked");
        Check(Updater.Pending(data)==null&&!Directory.GetFiles(Path.Combine(data,"update"),"*Setup*").Any(),"after three failed installs that version is given up and removed");
        data=fresh("killed");Check(Updater.Check(data,true,"")=="downloaded","the killed case starts with a waiting setup");
        File.WriteAllText(Path.Combine(data,"update","launched.json"),"{\"version\":\"0.4.73\"}");File.SetLastWriteTimeUtc(Path.Combine(data,"update","launched.json"),DateTime.UtcNow.AddMinutes(-2));
        Check(!Updater.Launch(data,true,new string[0])&&Updater.Failures(data,"0.4.73")==1&&!File.Exists(Path.Combine(data,"update","launched.json")),"a setup that was killed before finishing counts as a failed try, and Ruxget opens");
        data=fresh("off-at-quit");Check(Updater.Check(data,true,"")=="downloaded","the off-at-quit case starts with a waiting setup");
        File.WriteAllText(Path.Combine(data,"settings.json"),"{\"AutoUpdate\":false}");
        Check(!Updater.Launch(data,false,null)&&Updater.Pending(data)==null,"with 自动更新 turned off meanwhile, nothing is installed at quit");
        File.WriteAllText(Path.Combine(data,"update","start-requested"),"old");File.SetLastWriteTimeUtc(Path.Combine(data,"update","start-requested"),DateTime.UtcNow.AddHours(-1));
        Check(!Updater.TakeStartRequest(data)&&!File.Exists(Path.Combine(data,"update","start-requested")),"an old start request (from a killed setup) never opens Ruxget later");
        // Turning 自动更新 off removes a setup already waiting.
        data=fresh("discard");Check(Updater.Check(data,true,"")=="downloaded","the discard case starts with a waiting setup");
        Check(Updater.Check(data,false,"")=="off"&&Updater.Pending(data)==null&&!Directory.GetFiles(Path.Combine(data,"update"),"*Setup*").Any(),"turning 自动更新 off removes the waiting setup");
        // An install cut off halfway (Ruxget.exe already new, applying.json left) is installed again.
        data=fresh("cutoff");Check(Updater.Check(data,true,"")=="downloaded","the cut-off case starts with a waiting setup");
        Updater.CurrentVersion="0.4.73";File.WriteAllText(Path.Combine(data,"update","applying.json"),"{\"version\":\"0.4.73\"}");
        Check(Updater.Pending(data)!=null,"an install cut off halfway is done again");
        File.Delete(Path.Combine(data,"update","applying.json"));Check(Updater.Pending(data)==null,"a finished install is not done again");
        Updater.CurrentVersion="0.4.72";
        // While one quiet install runs, nothing else starts one, and Ruxget and the browser bridge stay out.
        data=fresh("busy");Check(Updater.Check(data,true,"")=="downloaded","the busy case starts with a waiting setup");
        using(var taken=new ManualResetEvent(false))using(var done=new ManualResetEvent(false)){
            var holder=new Thread(()=>{using(var gate=Updater.TakeLock()){taken.Set();done.WaitOne(60000);}}){IsBackground=true};holder.Start();taken.WaitOne(10000);
            try{
                Check(Updater.Busy()&&!Updater.Launch(data,false,null),"while an update is installed no second one starts");
                Check(Updater.Busy(),"asking whether an update runs never takes the lock itself");
                if(!String.IsNullOrEmpty(setupFile)){string busyRoot=fresh("busy-root");
                    var info=new ProcessStartInfo(setupFile,"--update 0 --root "+Util.Quote(busyRoot)+" --registry "+Util.Quote(@"Software\RuxgetUpdateCheck\busy")+" --start"){UseShellExecute=false,CreateNoWindow=true};
                    using(var second=Process.Start(info)){Check(second.WaitForExit(30000)&&second.ExitCode==0,"a second quiet setup leaves at once");}
                    Check(!File.Exists(Path.Combine(busyRoot,"Ruxget.exe"))&&File.Exists(Path.Combine(busyRoot,"data","update","start-requested")),"…installing nothing, and Ruxget opens after the first one");}
            }finally{done.Set();holder.Join(10000);}
        }
        Check(!Updater.Busy(),"the lock is free again afterwards");

        // A real quiet install by the setup into a temporary folder and registry key.
        if(!String.IsNullOrEmpty(setupFile)){
            string root=fresh("install-root"),subkey=@"Software\RuxgetUpdateCheck\"+Guid.NewGuid().ToString("N");
            try{
                var info=new ProcessStartInfo(setupFile,"--update 0 --root "+Util.Quote(root)+" --registry "+Util.Quote(subkey)){UseShellExecute=false,CreateNoWindow=true};
                var watch=Stopwatch.StartNew();using(var setup=Process.Start(info)){Check(setup.WaitForExit(120000),"the quiet update finishes");Check(setup.ExitCode==0,"the quiet update succeeds (exit "+setup.ExitCode+")");}
                Check(!File.Exists(Path.Combine(root,"data","update","applying.json"))&&!File.Exists(Path.Combine(root,"data","update","failed.json")),"no unfinished or failed mark is left");
                Check(File.Exists(Path.Combine(root,"Ruxget.exe"))&&FileVersionInfo.GetVersionInfo(Path.Combine(root,"Ruxget.exe")).FileVersion==Util.Version,"Ruxget "+Util.Version+" is installed, with no window ("+watch.ElapsedMilliseconds+" ms)");
                Updater.CurrentVersion=Util.Version;
                Check(Updater.TakeDoneNotice(Path.Combine(root,"data"))=="已更新到 "+Util.Version&&Updater.TakeDoneNotice(Path.Combine(root,"data"))==null,"the app shows 「已更新到 "+Util.Version+"」 once");
            }finally{try{Registry.CurrentUser.DeleteSubKeyTree(subkey,false);}catch{}}
        }else Console.WriteLine("SKIP quiet install: no setup file given");
        listener.Stop();Console.WriteLine("UPDATE CHECKS PASSED");return 0;
    }catch(Exception ex){Console.Error.WriteLine("FAIL "+ex.Message);Console.Error.WriteLine(ex);return 1;}}
}
