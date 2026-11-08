// Standalone regression: no network, no engine starts, no registry changes.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Text;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using ShiyingDesktop;
class ManagementCheck {
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static object Field(object obj,string name){return obj.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(obj);}
    static void Click(Button button){SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());typeof(Button).GetMethod("OnClick",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(button,new object[]{EventArgs.Empty});Application.DoEvents();}
    static void Wait(Func<bool> condition,string stage){var end=DateTime.UtcNow.AddSeconds(5);while(!condition()&&DateTime.UtcNow<end){Application.DoEvents();Thread.Sleep(10);}Check(condition(),"UI operation did not settle: "+stage);Console.WriteLine(stage+" passed");}
    // 0.4.73: task-list covers. Only a local fixture server answers; the real image servers are never asked.
    static byte[] Picture(int width,int height,ImageFormat format){using(var bitmap=new Bitmap(width,height))using(var g=Graphics.FromImage(bitmap))using(var stream=new MemoryStream()){g.Clear(Color.FromArgb(62,90,44));g.FillEllipse(Brushes.Khaki,width/4,height/4,width/2,height/2);bitmap.Save(stream,format);return stream.ToArray();}}
    static void ThumbnailChecks(string root){
        Check(Thumbs.CoverUrl("https://i0.hdslb.com/bfs/archive/a.jpg")=="https://i0.hdslb.com/bfs/archive/a.jpg"&&Thumbs.CoverUrl("https://p3-pc-sign.douyinpic.com/obj/x~tplv.jpeg?x-expires=1")!="","cover: the sites' image servers are accepted");
        foreach(string bad in new[]{"http://i0.hdslb.com/a.jpg","https://i0.hdslb.com:8443/a.jpg","https://user:pw@i0.hdslb.com/a.jpg","https://hdslb.com.evil.test/a.jpg","https://evilhdslb.com/a.jpg","https://127.0.0.1/a.jpg","https://images.example.test/a.jpg","file:///C:/a.jpg","javascript:alert(1)","https://i0.hdslb.com/"+new String('a',1100)+".jpg","https://i0.hdslb.com/a b.jpg","https://i0.hdslb.com/a.jpg\n",""," ",null})
            Check(Thumbs.CoverUrl(bad)=="","cover refused: "+(bad==null?"null":bad.Substring(0,Math.Min(48,bad.Length))));
        Check(Thumbs.YouTubeCover("https://www.youtube.com/watch?v=0lA-l-RHe1Q&t=3")=="https://i.ytimg.com/vi/0lA-l-RHe1Q/mqdefault.jpg"&&Thumbs.YouTubeCover("https://youtu.be/0lA-l-RHe1Q")!=""&&Thumbs.YouTubeCover("https://www.youtube.com/shorts/0lA-l-RHe1Q")!=""&&Thumbs.YouTubeCover("https://www.youtube.com/watch?v=bad")==""&&Thumbs.YouTubeCover("https://youtube.com.evil.test/watch?v=0lA-l-RHe1Q")==""&&Thumbs.YouTubeCover("https://www.youtube.com/playlist?list=PL1234567890")=="","cover: YouTube's still only from a real video id");
        var candidates=Thumbs.Candidates("https://i0.hdslb.com/bfs/archive/a.jpg");Check(candidates.Length==2&&candidates[0]=="https://i0.hdslb.com/bfs/archive/a.jpg@320w_180h_1c.jpg"&&candidates[1]=="https://i0.hdslb.com/bfs/archive/a.jpg"&&Thumbs.Candidates("https://i.ytimg.com/vi/0lA-l-RHe1Q/mqdefault.jpg").Length==1,"cover: B站 is asked for a small JPEG first");
        var xhs=Thumbs.Candidates("https://sns-webpic-qc.xhscdn.com/202611/abc/1040g2sg31!nd_dft_wlteh_webp_3");Check(xhs.Length==2&&xhs[0].EndsWith("!nd_dft_wlteh_jpg_3")&&xhs[1].EndsWith("_webp_3")&&Thumbs.Candidates("https://sns-webpic-qc.xhscdn.com/a/b.jpg").Length==1,"小红书: the JPEG variant of a WebP cover first");
        byte[] jpeg=Picture(640,360,ImageFormat.Jpeg),png=Picture(300,300,ImageFormat.Png),wide=Picture(5200,20,ImageFormat.Jpeg),fake=Encoding.UTF8.GetBytes("<html>not a picture</html>"),huge=Picture(4000,4000,ImageFormat.Png),big=new byte[3*1024*1024];big[0]=0xFF;big[1]=0xD8;big[2]=0xFF;
        int port;{var probe=new System.Net.Sockets.TcpListener(IPAddress.Loopback,0);probe.Start();port=((IPEndPoint)probe.LocalEndpoint).Port;probe.Stop();}
        var listener=new HttpListener();listener.Prefixes.Add("http://127.0.0.1:"+port+"/");listener.Start();var asked=new List<string>();
        new Thread(()=>{while(listener.IsListening){HttpListenerContext c;try{c=listener.GetContext();}catch{return;}
            try{string path=c.Request.RawUrl;lock(asked)asked.Add(path);byte[] body=null;
                if(path.StartsWith("/redirect")){c.Response.StatusCode=302;c.Response.RedirectLocation="/good.jpg";}
                else if(path.Contains("busy"))c.Response.StatusCode=503;else if(path.Contains("huge"))body=huge;else if(path.Contains("good"))body=jpeg;else if(path.Contains("png"))body=png;else if(path.Contains("wide"))body=wide;else if(path.Contains("fake"))body=fake;
                else if(path.Contains("chunked")){c.Response.SendChunked=true;body=big;}else if(path.Contains("big"))body=big;else c.Response.StatusCode=404;
                if(body!=null){c.Response.ContentType="image/jpeg";if(!c.Response.SendChunked)c.Response.ContentLength64=body.Length;c.Response.OutputStream.Write(body,0,body.Length);}
            }catch{}finally{try{c.Response.Close();}catch{}}}}){IsBackground=true}.Start();
        string local="http://127.0.0.1:"+port;
        Func<string,string> refusal=path=>{try{Thumbs.Shrink(Thumbs.Get(local+path,""));return "";}catch(Exception ex){return ex.GetType().Name+": "+ex.Message;}};
        try{
            byte[] small=Thumbs.Shrink(Thumbs.Get(local+"/good.jpg",""));using(var image=Image.FromStream(new MemoryStream(small)))Check(image.Width==84&&image.Height==96&&image.RawFormat.Equals(ImageFormat.Jpeg)&&small.Length<Thumbs.MaxStored,"cover: a JPEG is cropped to the icon box at 2x ("+small.Length+" bytes)");
            using(var image=Image.FromStream(new MemoryStream(Thumbs.Shrink(Thumbs.Get(local+"/cover.png","")))))Check(image.Width==84&&image.Height==96&&image.RawFormat.Equals(ImageFormat.Jpeg),"cover: a PNG is stored as the same small JPEG");
            Check(refusal("/fake.jpg").StartsWith("InvalidDataException"),"cover: text served as image/jpeg is refused by its first bytes");
            Check(refusal("/wide.jpg").StartsWith("InvalidDataException"),"cover: a picture wider than 5000 pixels is refused");
            // 0.4.73 review: a small file claiming a huge picture (4000×4000 = 16 million pixels) is refused from its header, before decoding.
            Check(huge.Length<Thumbs.MaxBytes&&refusal("/huge.png").Contains("odd picture size"),"cover: more than 12 million pixels is refused before decoding ("+huge.Length+" bytes)");
            Check(refusal("/big.jpg").Contains("too large"),"cover: over 2 MB is refused by its length");
            Check(refusal("/chunked-big.jpg").Contains("too large"),"cover: over 2 MB is refused while reading when no length is given");
            Check(refusal("/redirect").StartsWith("InvalidDataException"),"cover: a redirect is not followed");
            Check(refusal("/missing.jpg").StartsWith("WebException"),"cover: a missing picture is the server's refusal");
            lock(asked)asked.Clear();
            string state=Path.Combine(root,"thumbs-state"),files=Path.Combine(root,"thumbs-files"),prefix="https://i0.hdslb.com/";
            Thumbs.Fetch=(url,proxy)=>{if(!url.StartsWith(prefix))throw new InvalidDataException("checks stay local: "+url);return Thumbs.Get(local+"/"+url.Substring(prefix.Length),proxy);};
            Func<string,System.Collections.Generic.Dictionary<string,object>> handoff=cover=>new System.Collections.Generic.Dictionary<string,object>{{"videoUrl","https://upos-sz-mirror.bilivideo.com/v.m4s"},{"audioUrl","https://upos-sz-mirror.bilivideo.com/a.m4s"},{"referer","https://www.bilibili.com/video/BV1fixture/"},{"userAgent","Mozilla/5.0"},{"cover",cover}};
            string goodFile;
            using(var manager=new Manager(state)){
                manager.Config.Proxy="";
                var good=manager.Add("https://www.bilibili.com/video/BV1fixture/","tracks","有封面的视频",1080,files,handoff(prefix+"bfs/archive/good.jpg"),false);
                var bad=manager.Add("https://www.bilibili.com/video/BV2fixture/","tracks","封面不是图片",1080,files,handoff(prefix+"bfs/archive/fake.jpg"),false);
                var stranger=manager.Add("https://www.bilibili.com/video/BV3fixture/","tracks","别处的封面",1080,files,handoff("https://images.example.test/x.jpg"),false);
                var audio=manager.Add("https://www.bilibili.com/video/BV4fixture/","audio","只要声音",1080,files,new System.Collections.Generic.Dictionary<string,object>{{"cover",prefix+"bfs/archive/good.jpg"}},false);
                var busy=manager.Add("https://www.bilibili.com/video/BV5fixture/","tracks","图片服务器正忙",1080,files,handoff(prefix+"bfs/archive/busy.jpg"),false);
                foreach(var job in manager.Snapshot())manager.Pause(job.Id);
                goodFile=Path.Combine(state,"thumbs",good.Id+".jpg");
                Wait(()=>File.Exists(goodFile)&&manager.ThumbIds().Contains(good.Id),"cover saved in the background as data\\thumbs\\<id>.jpg");
                Wait(()=>manager.Snapshot().First(j=>j.Id==bad.Id).Cover=="","a refused cover is not asked for again");
                Wait(()=>{lock(asked)return asked.Any(p=>p.Contains("busy"));},"the busy image server was asked");Thread.Sleep(500);
                Check(manager.Snapshot().First(j=>j.Id==busy.Id).Cover!="","0.4.73 review: a 503 from the image server is the network (tried again at the next start), not a refusal");
                Check(!File.Exists(Path.Combine(state,"thumbs",bad.Id+".jpg"))&&String.IsNullOrEmpty(stranger.Cover)&&String.IsNullOrEmpty(audio.Cover)&&manager.ThumbIds().Length==1,"no picture for a refused cover, an unknown image server or an MP3");
                lock(asked)Check(asked.Contains("/bfs/archive/good.jpg@320w_180h_1c.jpg")&&!asked.Contains("/bfs/archive/good.jpg")&&asked.Count(p=>p.Contains("fake"))==2,"B站: the small size first, the plain address only as fallback");
                Check((manager.ThumbData(good.Id)??"").StartsWith("data:image/jpeg;base64,")&&manager.ThumbData(bad.Id)==null,"the page gets the picture as a data: address");
                // Host to page: each picture once, not in the state snapshot; again after the page reloads.
                using(var window=new MainWindow(manager,true)){
                    var sent=new List<string>();var flags=BindingFlags.Instance|BindingFlags.NonPublic;
                    typeof(MainWindow).GetField("sendPlugin",flags).SetValue(window,new Action<string>(json=>sent.Add(json)));typeof(MainWindow).GetField("pluginReady",flags).SetValue(window,true);
                    var push=typeof(MainWindow).GetMethod("PushPluginState",flags);
                    push.Invoke(window,null);push.Invoke(window,null);push.Invoke(window,null);
                    var thumbs=sent.Where(j=>j.Contains("\"type\":\"thumbs\"")).ToArray();
                    Check(thumbs.Length==1&&thumbs[0].Contains(good.Id)&&thumbs[0].Contains("data:image/jpeg;base64,")&&sent.Where(j=>j.Contains("\"type\":\"state\"")).All(j=>!j.Contains("base64")&&!j.Contains("hdslb")),"the picture goes to the page once, outside the snapshot");
                    sent.Clear();typeof(MainWindow).GetMethod("PluginMessage",flags).Invoke(window,new object[]{"{\"command\":\"ready\"}"});
                    Check(sent.Count(j=>j.Contains("\"type\":\"thumbs\"")&&j.Contains(good.Id))==1,"a reloaded page gets the picture again");
                    window.Close();
                }
            }
            string orphan=Path.Combine(state,"thumbs",new String('f',16)+".jpg");File.WriteAllBytes(orphan,new byte[]{0xFF,0xD8,0xFF});
            using(var manager=new Manager(state)){
                var good=manager.Snapshot().First(j=>j.Title=="有封面的视频");Check(manager.ThumbIds().Contains(good.Id)&&File.Exists(goodFile)&&!File.Exists(orphan),"after a restart the picture is kept and a stray one is removed");
                // 0.4.73 review: a cover the network couldn't fetch is tried again at the next start (behind new covers), at most 3 starts.
                var busy=manager.Snapshot().First(j=>j.Title=="图片服务器正忙");Wait(()=>manager.Snapshot().First(j=>j.Id==busy.Id).CoverTries==2,"a network failure is tried again at the next start and counted");
                Check(manager.Snapshot().First(j=>j.Id==busy.Id).Cover!="","still kept after 2 failed starts");
                // A picture deleted while running is fetched again when the page can't read it.
                File.Delete(goodFile);manager.ThumbMissing(good.Id);Wait(()=>File.Exists(goodFile)&&manager.ThumbIds().Contains(good.Id)&&manager.ThumbData(good.Id)!=null,"a picture deleted by hand is fetched again");
                File.WriteAllBytes(goodFile,new byte[0]);
            }
            using(var manager=new Manager(state)){
                var good=manager.Snapshot().First(j=>j.Title=="有封面的视频");var busy=manager.Snapshot().First(j=>j.Title=="图片服务器正忙");
                Wait(()=>manager.ThumbData(good.Id)!=null&&manager.ThumbIds().Contains(good.Id),"an emptied picture is replaced at the next start");
                Wait(()=>manager.Snapshot().First(j=>j.Id==busy.Id).Cover=="","after 3 starts without the image server the cover is given up, quietly");
                int version=manager.ThumbVersion;manager.Forget(good.Id);Check(!File.Exists(goodFile)&&!manager.ThumbIds().Contains(good.Id)&&manager.ThumbVersion!=version,"deleting the task deletes its picture");
            }
        }finally{Thumbs.Fetch=Thumbs.Get;listener.Stop();}
        Console.WriteLine("thumbnail checks passed");
    }
    [STAThread] static int Main(string[] args){try{
        string root=Path.GetFullPath(args[0]),state=Path.Combine(root,"state"),folder=Path.Combine(root,"files");Directory.CreateDirectory(root);
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        string signed="https://files.example.test/archive.zip?signature=a%2Fb%3D&token=A+B";
        using(var manager=new Manager(state)){
            manager.Config.Folder=folder;
            Check(manager.AddMany(signed+"\r\nhttps://files.example.test/model.gguf\n"+signed,"file",folder)==2,"batch deduplication");
            Check(manager.Snapshot()[0].Url==signed,"signed URL changed");
            foreach(string invalid in new[]{"https://files.example.test/ok\njavascript:bad",String.Join("\n",Enumerable.Repeat(signed,101))}){bool refused=false;try{manager.AddMany(invalid,"file",folder);}catch{refused=true;}Check(refused&&manager.Snapshot().Count==2,"invalid batch partially added");}
            Check(Util.Category("file","WEIGHTS.SAFETENSORS")=="模型"&&Util.Category("audio","x")=="音乐"&&Util.Category("tracks","x")=="视频","classification");
            var job=manager.Snapshot()[0];Check(Util.OutputFolder(job)==Path.Combine(folder,"压缩包"),"categorized destination");job.AutoCategorize=false;Check(Util.OutputFolder(job)==folder,"exact destination opt out");
            string original=Path.Combine(root,"one.tmp"),second=Path.Combine(root,"two.tmp");File.WriteAllText(original,"first");File.WriteAllText(second,"second");
            string placed=Util.PlaceFile(original,Path.Combine(folder,"压缩包"),"archive.zip"),deduped=Util.PlaceFile(second,Path.Combine(folder,"压缩包"),"archive.zip");Check(placed!=deduped&&File.ReadAllText(placed)=="first","overwrite protection");
            string partial=Path.Combine(manager.Work(manager.Snapshot()[0]),"keep.partial");Directory.CreateDirectory(Path.GetDirectoryName(partial));File.WriteAllText(partial,"unfinished data");
            using(var window=new MainWindow(manager,true)){
                var hiddenHandle=window.Handle;window.PerformLayout();SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());var grid=(DataGridView)Field(window,"grid");foreach(DataGridViewRow row in grid.Rows)row.Selected=true;
                manager.Add("https://files.example.test/third.bin","file");typeof(MainWindow).GetMethod("RefreshJobs",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(window,null);
                Check(grid.SelectedRows.Count==2,"refresh lost selected rows");
                Click((Button)Field(window,"pause"));Wait(()=>!((bool)Field(window,"batchBusy"))&&((Button)Field(window,"resume")).Enabled&&manager.Snapshot().Count(j=>j.Status=="已暂停")==2,"pause selected");
                Check(manager.Snapshot().Count(j=>j.Status=="排队中")==1,"batch pause touched unselected task");
                Click((Button)Field(window,"resume"));Wait(()=>!((bool)Field(window,"batchBusy"))&&((Button)Field(window,"pause")).Enabled&&manager.Snapshot().All(j=>j.Status=="排队中"),"resume selected");
                Click((Button)Field(window,"pause"));Wait(()=>!((bool)Field(window,"batchBusy"))&&((Button)Field(window,"forget")).Enabled&&manager.Snapshot().Count(j=>j.Status=="已暂停")==2,"pause again");
                Check(((Button)Field(window,"forget")).Enabled,"forget button did not refresh");
                Click((Button)Field(window,"forget"));Wait(()=>!((bool)Field(window,"batchBusy"))&&manager.Snapshot().Count==1,"forget selected");
                Check(File.ReadAllText(partial)=="unfinished data"&&File.ReadAllText(placed)=="first","record removal touched files");window.Close();
            }
            manager.Config.Connections=64;manager.Config.FileSlots=0;manager.Config.VideoSlots=99;manager.Config.RateKiB=-1;manager.SaveSettings();
            Check(manager.Config.Connections==16&&manager.Config.FileSlots==10&&manager.Config.VideoSlots==10&&manager.Config.RateKiB==0,"setting bounds (0.4.70: always 10 tasks at once)");
        }
        string tasks=Path.Combine(state,"tasks.json");File.Copy(tasks,tasks+".bak",true);File.WriteAllText(tasks,"[null]");
        using(var manager=new Manager(state)){Check(manager.Snapshot().Count==1&&manager.RecoveryNotice.Length>0,"backup recovery");Check(Directory.GetFiles(state,"tasks.json.damaged-*").Any(p=>File.ReadAllText(p)=="[null]"),"damaged data not preserved");}
        string broken=Path.Combine(root,"both-broken");Directory.CreateDirectory(broken);File.WriteAllText(Path.Combine(broken,"tasks.json"),"broken");File.WriteAllText(Path.Combine(broken,"tasks.json.bak"),"also broken");bool failed=false;try{new Manager(broken);}catch{failed=true;}Check(failed&&File.ReadAllText(Path.Combine(broken,"tasks.json"))=="broken","bad files silently replaced");
        string old=Path.Combine(root,"legacy");Directory.CreateDirectory(old);File.WriteAllText(Path.Combine(old,"settings.json"),"{\"Connections\":8,\"Proxy\":null}");
        Util.Atomic(Path.Combine(old,"tasks.json"),new[]{new{Id=new String('a',16),Url=signed,Title="archive.zip",Kind="file",Folder=folder,Status="已暂停"}});
        using(var manager=new Manager(old)){Check(manager.Config.FileSlots==10&&manager.Config.VideoSlots==10&&manager.Config.Proxy=="","legacy defaults (0.4.70: always the largest parallel counts)");Check(!manager.Snapshot()[0].AutoCategorize&&Util.OutputFolder(manager.Snapshot()[0])==folder,"old tasks were reclassified");}
        string blocked=Path.Combine(root,"blocked-save");Directory.CreateDirectory(Path.Combine(blocked,"tasks.json"));var unsaved=new Manager(blocked);bool saveFailed=false;try{unsaved.AddMany(signed,"file",folder);}catch{saveFailed=true;}Check(saveFailed&&unsaved.Snapshot().Count==0,"failed save retained queued tasks");try{unsaved.Dispose();}catch{}
        ThumbnailChecks(root);
        File.WriteAllText(Path.Combine(root,"summary.json"),"{\"ok\":true,\"method\":\"real manager and WinForms controls, queued fixtures only; no downloads or registry changes\",\"checks\":[\"batch validation and deduplication\",\"signed URL preservation\",\"classification and opt out\",\"no overwrite\",\"multi-selection across refresh\",\"batch pause/resume/remove via buttons\",\"unselected tasks untouched\",\"completed and partial files retained\",\"setting bounds and legacy defaults\",\"backup recovery and damaged-file retention\",\"unrecoverable data preserved\",\"failed-save rollback\",\"task-list covers from a local fixture: address rules, JPEG/PNG only, 2 MB cap, no redirects, sent once, deleted with the task\"]}");Console.WriteLine("MANAGEMENT CHECKS PASSED "+root);return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
