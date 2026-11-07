// 0.4.70 desktop structure: unfinished data next to the destination (other drive), the server check outside the
// lock, pausing during that check, the 260-character path guard. Real aria2 downloads from a loopback server only.
// Never opens a window or touches the person's own tasks: everything lives in the report folder and a temp folder.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using ShiyingDesktop;
class StructureCheck {
    static readonly List<string> checks=new List<string>();
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);Console.WriteLine("PASS "+name);}
    static byte[] body=Enumerable.Range(0,3*1048576).Select(i=>(byte)(i*7)).ToArray();
    static int slowMs=0;
    // trickle: the body comes slowly, so a download can be paused part-way.
    static volatile bool trickle=false;
    static void Serve(HttpListener listener){
        while(listener.IsListening){HttpListenerContext context;try{context=listener.GetContext();}catch{return;}
            ThreadPool.QueueUserWorkItem(_=>{try{
                var request=context.Request;var response=context.Response;
                if(request.Url.AbsolutePath.StartsWith("/slow"))Thread.Sleep(slowMs);
                response.Headers["ETag"]="\"fixed-1\"";response.Headers["Last-Modified"]="Sat, 07 Nov 2026 00:00:00 GMT";response.Headers["Accept-Ranges"]="bytes";
                long start=0,end=body.Length-1;string range=request.Headers["Range"];
                if(!String.IsNullOrEmpty(range)&&range.StartsWith("bytes=")){var parts=range.Substring(6).Split('-');start=Int64.Parse(parts[0]);if(parts[1].Length>0)end=Math.Min(end,Int64.Parse(parts[1]));response.StatusCode=206;response.Headers["Content-Range"]="bytes "+start+"-"+end+"/"+body.Length;}
                response.ContentType="application/octet-stream";response.ContentLength64=end-start+1;
                if(request.HttpMethod!="HEAD"){
                    if(request.Url.AbsolutePath.StartsWith("/trickle")&&trickle&&end-start>1){for(long at=start;at<=end;at+=65536){if(!trickle){response.OutputStream.Write(body,(int)at,(int)(end-at+1));break;}response.OutputStream.Write(body,(int)at,(int)Math.Min(65536,end-at+1));Thread.Sleep(150);}}
                    else response.OutputStream.Write(body,(int)start,(int)(end-start+1));
                }
                response.Close();
            }catch{}});
        }
    }
    static Download Job(Manager manager,string id){return manager.Snapshot().First(j=>j.Id==id);}
    static void Wait(Manager manager,Func<bool> done,string name,int seconds=60){var watch=Stopwatch.StartNew();while(!done()){if(watch.Elapsed.TotalSeconds>seconds)throw new Exception("timed out: "+name);manager.Tick();Thread.Sleep(200);}}
    static int Main(string[] args){try{
        string report=Path.GetFullPath(args[0]);
        // Destination on another drive than the app's data (the case that used to copy the whole file).
        string other=Path.Combine(Path.GetTempPath(),"ruxget-structure-"+Guid.NewGuid().ToString("N").Substring(0,8));
        bool otherDrive=!String.Equals(Path.GetPathRoot(other),Path.GetPathRoot(report),StringComparison.OrdinalIgnoreCase);
        int port;{var probe=new System.Net.Sockets.TcpListener(IPAddress.Loopback,0);probe.Start();port=((IPEndPoint)probe.LocalEndpoint).Port;probe.Stop();}
        var listener=new HttpListener();listener.Prefixes.Add("http://127.0.0.1:"+port+"/");listener.Start();new Thread(()=>Serve(listener)){IsBackground=true}.Start();
        string url="http://127.0.0.1:"+port+"/file.bin";
        try{
            using(var manager=new Manager(Path.Combine(report,"state"))){
                manager.Config.Proxy="";manager.Config.Folder=other;manager.Config.FollowBrowser=false;
                var job=manager.Add(url,"file","file.bin",1080,other,null,false);
                bool sawHidden=false;string workDir=null;
                Wait(manager,()=>{var j=Job(manager,job.Id);if(!String.IsNullOrEmpty(j.WorkDir)){workDir=j.WorkDir;string parent=Path.GetDirectoryName(j.WorkDir);if(Directory.Exists(parent)&&(new DirectoryInfo(parent).Attributes&FileAttributes.Hidden)!=0)sawHidden=true;}return j.Status=="已完成"||j.Status=="失败";},"download to the other drive");
                var done=Job(manager,job.Id);
                Check(done.Status=="已完成"&&File.Exists(done.File)&&new FileInfo(done.File).Length==body.Length,"the download finishes on the destination drive ("+done.Status+" "+done.Error+")");
                if(otherDrive){
                    Check(workDir!=null&&String.Equals(Path.GetPathRoot(workDir),Path.GetPathRoot(other),StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(Path.GetDirectoryName(workDir))==".ruxget-partial","unfinished data sat next to the destination, not on the app's drive ("+workDir+")");
                    Check(sawHidden,"its .ruxget-partial folder was hidden");
                    Check(!Directory.Exists(Path.Combine(other,".ruxget-partial")),"the empty .ruxget-partial folder is removed once the file is in place");
                    Check(!Directory.Exists(Path.Combine(report,"state","partial",job.Id))||Directory.GetFileSystemEntries(Path.Combine(report,"state","partial",job.Id)).Length==0,"nothing of it was written to the app's own drive");
                }else Console.WriteLine("SKIP other-drive checks: temp folder is on the same drive as the report");
                // Same drive as the app: the old place is kept (no extra folder in the person's downloads).
                var same=manager.Add(url,"file","same.bin",1080,Path.Combine(report,"same-drive"),null,false);
                Wait(manager,()=>{var j=Job(manager,same.Id);return j.Status=="已完成"||j.Status=="失败";},"download on the app's drive");
                Check(String.IsNullOrEmpty(Job(manager,same.Id).WorkDir)&&!Directory.Exists(Path.Combine(report,"same-drive",".ruxget-partial")),"on the app's own drive the download keeps using the app's folder");
                // A slow server: the check runs outside the lock, so the app keeps answering meanwhile.
                slowMs=4000;
                var slow=manager.Add("http://127.0.0.1:"+port+"/slow.bin","file","slow.bin",1080,other,null,false);
                var tick=Stopwatch.StartNew();manager.Tick();long first=tick.ElapsedMilliseconds;
                Thread.Sleep(300);tick.Restart();manager.Tick();long second=tick.ElapsedMilliseconds;
                Check(first<1500&&second<1500&&Job(manager,slow.Id).Status=="等待下载","a slow server no longer blocks the app ("+first+" ms, "+second+" ms)");
                manager.Pause(slow.Id);
                Check(Job(manager,slow.Id).Status=="已暂停","pausing while the server is being checked pauses at once");
                Thread.Sleep(slowMs+1500);manager.Tick();
                Check(Job(manager,slow.Id).Status=="已暂停","…and the late server answer doesn't start it");
                slowMs=0;manager.Resume(slow.Id);
                Wait(manager,()=>{var j=Job(manager,slow.Id);return j.Status=="已完成"||j.Status=="失败";},"resume after pausing during the check");
                Check(Job(manager,slow.Id).Status=="已完成","resuming it then downloads normally");
                // A data file whose .aria2 control file was deleted (a cleaner, or someone showing hidden files) is not
                // trusted: aria2 would take the preallocated file as finished. It downloads again and the bytes are right.
                trickle=true;
                var cleaned=manager.Add("http://127.0.0.1:"+port+"/trickle.bin","file","cleaned.bin",1080,other,null,false);
                Wait(manager,()=>{var j=Job(manager,cleaned.Id);return j.Transfer!=null&&j.Transfer.Completed>262144;},"partial data before pausing",30);
                manager.Pause(cleaned.Id);Wait(manager,()=>Job(manager,cleaned.Id).Status=="已暂停","pause",30);
                string control=Directory.GetFiles(manager.Work(Job(manager,cleaned.Id)),"*.aria2").FirstOrDefault();
                Check(control!=null,"the paused download has its control file");File.Delete(control);
                trickle=false;manager.Resume(cleaned.Id);
                Wait(manager,()=>{var j=Job(manager,cleaned.Id);return j.Status=="已完成"||j.Status=="失败";},"resume without the control file");
                var cleanedDone=Job(manager,cleaned.Id);
                Check(cleanedDone.Status=="已完成"&&File.ReadAllBytes(cleanedDone.File).SequenceEqual(body),"without its control file a download starts over and ends byte-for-byte right");
                // A destination that can't be written is said before downloading, not after.
                var nowhere=manager.Add(url,"file","nowhere.bin",1080,@"Q:\ruxget-nowhere\folder",null,false);
                Wait(manager,()=>{var j=Job(manager,nowhere.Id);return j.Status=="失败"||j.Status=="已完成";},"unwritable destination",30);
                var refusedJob=Job(manager,nowhere.Id);
                Check(refusedJob.Status=="失败"&&refusedJob.Error.Contains("不能写入")&&(refusedJob.Transfer==null||refusedJob.Transfer.Completed<=0),"an unwritable download folder is explained before anything is downloaded ("+refusedJob.Error+")");
                // A YouTube video sent by the extension as page addresses is read by yt-dlp itself (page addresses crawl).
                var input=new Dictionary<string,object>{{"videoUrl","https://rr1---sn-abc.googlevideo.com/videoplayback?itag=137"},{"audioUrl","https://rr1---sn-abc.googlevideo.com/videoplayback?itag=140"},{"referer","https://www.youtube.com/watch?v=0lA-l-RHe1Q"},{"userAgent","Mozilla/5.0"}};
                var yt=manager.Add("https://www.youtube.com/watch?v=0lA-l-RHe1Q","tracks","A video",720,other,input,false);
                Check(yt.Kind=="video"&&String.IsNullOrEmpty(yt.VideoUrl)&&yt.Height==720,"a YouTube video from the extension is downloaded by yt-dlp itself, at the chosen quality");
                manager.Pause(yt.Id);manager.Forget(yt.Id,true);
                // One limit for everything: 11 downloads at once run 10 and queue the eleventh, saying why.
                slowMs=6000;
                var many=Enumerable.Range(0,11).Select(n=>manager.Add("http://127.0.0.1:"+port+"/slow-"+n+".bin","file","many-"+n+".bin",1080,other,null,false)).ToList();
                manager.Tick();manager.Tick();
                var states=many.Select(j=>Job(manager,j.Id)).ToList();
                Check(states.Count(j=>j.Status=="等待下载"||j.Status=="下载中")==10&&states.Count(j=>j.Status=="排队中"&&(j.Stage??"").Contains("同时最多下 10 个"))==1,"ten tasks run at once and the eleventh waits, saying why");
                var waiting=states.First(j=>j.Status=="排队中");manager.Pause(many.First(j=>Job(manager,j.Id).Status!="排队中").Id);manager.Tick();manager.Tick();
                var moved=Job(manager,waiting.Id);Check(moved.Status!="排队中"&&!(moved.Stage??"").Contains("同时最多下"),"once a place frees up the waiting task starts and stops saying it waits");
                foreach(var j in many)manager.Pause(j.Id);slowMs=0;
            }
            // 0.4.70: no parallel-count setting; whatever was saved, 6 videos and 10 files run at once.
            {string old=Path.Combine(report,"old-settings");Directory.CreateDirectory(old);File.WriteAllText(Path.Combine(old,"settings.json"),"{\"VideoSlots\":1,\"FileSlots\":2,\"FollowBrowser\":false}");
             using(var again=new Manager(old))Check(again.Config.VideoSlots==10&&again.Config.FileSlots==10,"saved parallel counts are replaced by the largest ones");}
            // The 260-character limit: long names are shortened to fit; a folder that is itself too long is explained.
            string deep=other;while(deep.Length<200)deep=Path.Combine(deep,"folder-with-a-fairly-long-name");Directory.CreateDirectory(deep);
            string source=Path.Combine(other,"source.bin");File.WriteAllText(source,"x");
            string placed=Util.PlaceFile(source,deep,new string('长',120)+".mp4");
            Check(placed.Length<=259&&File.Exists(placed)&&placed.EndsWith(".mp4"),"a long name is shortened so the whole path fits ("+placed.Length+")");
            string tooDeep=deep;while(tooDeep.Length<252)tooDeep=Path.Combine(tooDeep,"x");
            bool refused=false;try{File.WriteAllText(source,"y");Util.PlaceFile(source,tooDeep,"a.bin");}catch(IOException ex){refused=ex.Message.Contains("路径太长");}
            Check(refused,"a folder that is itself too long is explained");
        }finally{listener.Stop();try{Directory.Delete(other,true);}catch{}}
        Util.Atomic(Path.Combine(report,"summary.json"),new{ok=true,version=Util.Version,checks,fixtureOnly=true,windowsShown=false});
        Console.WriteLine("STRUCTURE CHECKS PASSED ("+checks.Count+")");return 0;
    }catch(Exception ex){Console.Error.WriteLine("FAIL "+ex);return 1;}}
}
