// Ruxget 桌面版。GPL-3.0-or-later。仅使用 .NET Framework 和独立下载组件。
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyVersion(ShiyingDesktop.Util.Version)]
[assembly: System.Reflection.AssemblyFileVersion(ShiyingDesktop.Util.Version)]
[assembly: System.Reflection.AssemblyInformationalVersion(ShiyingDesktop.Util.Version)]

namespace ShiyingDesktop {
public class Download {
    public string Id, Url, Title, Kind, Folder, Status, Error, File, VideoUrl, AudioUrl, Referer, UserAgent, Stage;
    public bool ExtractAudio;
    public string NetdiskProvider,NetdiskFileKey,NetdiskCookie,NetdiskUrl;
    public long NetdiskSize=-1;
    public int Height;
    public TransferInfo Transfer=new TransferInfo();
    public double Progress;
    public string Speed;
    public string ETag, Modified, WorkName;
    public long ExpectedSize;
    public bool HasMetadata, AutoName, AutoCategorize;
    public string BtHash,BtFolder,BtPhase,BtReason,BtAdvice;
    public TorrentFileInfo[] BtFiles=new TorrentFileInfo[0];
    public int[] BtSelected;
    public bool BtPrivate;
    [ScriptIgnore] public DateTime BtProgressAt,BtRetryAt,BtHintSavedAt,BtDiagnosticAt,BtLookupAt;
    [ScriptIgnore] public object[] BtPeerStatus;
    [ScriptIgnore] public long BtDownloadLimit=-1;
    [ScriptIgnore] public long BtLastCompleted=-1;
    [ScriptIgnore] public bool BtAutoWaiting,BtFinishing;
    [ScriptIgnore] public long QueueOrder;
    [ScriptIgnore] public Process Child;
    [ScriptIgnore] public bool PauseRequested;
}
public class Settings {
    public string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "Ruxget");
    // "system" follows the Windows proxy (Internet Settings); "" is a direct connection; anything else is an explicit proxy URL.
    public string Proxy = Util.SystemProxyMode;
    public int Connections = 8;
    public int FileSlots = 2, VideoSlots = 1, RateKiB, BtUploadKiB=512;
    public bool AutoCategorize = true;
    public bool SaveSubtitles;
    public string UiLanguage = "auto";
    public int VideoHeight=1080;public string VideoKind="video";
    // On: Folder is kept as <Chrome's download folder>\Ruxget, so the extension and the app save side by side.
    // Picking a folder in the app turns it off.
    public bool FollowBrowser = true;
}
static class Util {
    public const string SystemProxyMode="system";
    // Windows proxy for HTTPS traffic, as http://host:port, or "" when the system proxy is off or uses only a PAC script.
    public static string SystemProxy(){try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings")){if(key==null||Convert.ToInt32(key.GetValue("ProxyEnable",0))!=1)return "";string server=Convert.ToString(key.GetValue("ProxyServer","")).Trim();if(server.Contains("=")){var parts=server.Split(';').Select(p=>p.Split(new[]{'='},2)).Where(p=>p.Length==2).ToDictionary(p=>p[0].Trim().ToLowerInvariant(),p=>p[1].Trim());server=parts.ContainsKey("https")?parts["https"]:parts.ContainsKey("http")?parts["http"]:"";}if(server.Length==0)return "";if(!server.Contains("://"))server="http://"+server;Uri uri;return Uri.TryCreate(server,UriKind.Absolute,out uri)&&(uri.Scheme=="http"||uri.Scheme=="https"||uri.Scheme.StartsWith("socks"))?server:"";}}catch{return "";}}
    public static void CheckProxy(string value){if(value.Length>0&&value!=SystemProxyMode)Url(value);}
    public const string Version="0.4.52";
    public static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    public static readonly string PipeName = "shiying.desktop.v1." + WindowsIdentity.GetCurrent().User.Value.Replace('-', '_');
    public static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 }; }
    public static string Str(IDictionary<string,object> value, string key, string fallback = "") { object v; return value.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : fallback; }
    public static string Url(string value) {
        Uri uri;
        if (String.IsNullOrWhiteSpace(value) || value.Length > 16384 || value.Any(Char.IsControl) || !Uri.TryCreate(value, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https") || uri.UserInfo.Length != 0) throw new Exception("请输入完整的 HTTP 或 HTTPS 链接");
        return uri.AbsoluteUri;
    }
    public static string Name(string value) {
        value = Regex.Replace(value ?? "下载文件", "[<>:\"/\\\\|?*\\x00-\\x1f]", "_").Trim().TrimEnd('.');
        if (value.Length > 140) {string extension=Path.GetExtension(value);if(extension.Length>16)extension="";value=value.Substring(0,140-extension.Length).TrimEnd(' ','.')+extension;}
        if (Regex.IsMatch(value, @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)", RegexOptions.IgnoreCase)) value = "_" + value;
        return String.IsNullOrEmpty(value) ? "下载文件" : value;
    }
    public static string Quote(string value) {
        // CommandLineToArgvW-compatible quoting; never pass arguments through a shell.
        var result=new StringBuilder("\""); int slashes=0;
        foreach(char c in value){if(c=='\\'){slashes++;continue;}result.Append('\\',c=='\"'?slashes*2+1:slashes);result.Append(c);slashes=0;}
        result.Append('\\',slashes*2);result.Append('"');return result.ToString();
    }
    public static Process Start(string exe, IEnumerable<string> args) {
        var info = new ProcessStartInfo(exe, String.Join(" ",args.Select(Quote))) { UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput=true, RedirectStandardError=true, StandardOutputEncoding=Encoding.UTF8, StandardErrorEncoding=Encoding.UTF8, WorkingDirectory=Root };
        // User proxy is explicit; do not inherit unrelated aria2/yt-dlp configuration.
        info.EnvironmentVariables.Remove("HTTP_PROXY"); info.EnvironmentVariables.Remove("HTTPS_PROXY"); info.EnvironmentVariables.Remove("ALL_PROXY");
        return new Process { StartInfo=info, EnableRaisingEvents=true };
    }
    public static void Atomic(string path, object value) {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        File.WriteAllText(path + ".tmp", Json().Serialize(value), new UTF8Encoding(false));
        if (System.IO.File.Exists(path)) System.IO.File.Replace(path+".tmp",path,path+".bak"); else System.IO.File.Move(path+".tmp",path);
    }
    public static string SafeError(string text) {
        text=Regex.Replace(text ?? "下载失败，请重试", @"https?://[^\s\""<>]+", "[下载地址]");
        if(Regex.IsMatch(text,"Resource not found|404|HTTP Error 410",RegexOptions.IgnoreCase))return "链接不存在或已过期，请重新获取下载地址";
        if(Regex.IsMatch(text,"403|Forbidden",RegexOptions.IgnoreCase))return "网站拒绝了下载请求，请在原网页重新读取并发送";
        if(Regex.IsMatch(text,"429|Too Many Requests",RegexOptions.IgnoreCase))return "网站暂时限制请求，请稍后再试";
        return text.Substring(0,Math.Min(500,text.Length));
    }
    public static void KillTree(Process p) {
        if (p == null) return;
        try { if (!p.HasExited) { using (var killer = Process.Start(new ProcessStartInfo("taskkill.exe", "/PID "+p.Id+" /T /F") { UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput=true, RedirectStandardError=true })) killer.WaitForExit(3000); } } catch (InvalidOperationException) { }
    }
    public static bool InDirectory(string file, string directory) { return Path.GetFullPath(file).StartsWith(Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase); }
    public static string Category(string kind,string name) {
        if(kind=="magnet"||kind=="torrent")return "BT下载";
        string ext=Path.GetExtension(name??"").ToLowerInvariant();
        if(kind=="audio"||new[]{".mp3",".m4a",".wav",".ogg",".aac",".flac",".opus"}.Contains(ext))return "音乐";
        if(kind=="video"||kind=="tracks"||new[]{".mp4",".mkv",".webm",".mov",".avi",".flv",".wmv"}.Contains(ext))return "视频";
        if(new[]{".gguf",".safetensors",".onnx",".pt",".pth",".ckpt"}.Contains(ext))return "模型";
        if(new[]{".zip",".7z",".rar",".tar",".gz",".bz2",".xz",".zst"}.Contains(ext))return "压缩包";
        if(new[]{".exe",".msi",".msix",".msixbundle"}.Contains(ext))return "程序";
        if(new[]{".jpg",".jpeg",".png",".webp",".gif",".svg",".avif",".bmp"}.Contains(ext))return "图片";
        if(new[]{".pdf",".doc",".docx",".xls",".xlsx",".csv",".ppt",".pptx",".txt",".md",".json"}.Contains(ext))return "文档";
        return "其他";
    }
    public static string OutputFolder(Download job,string name=null){if(TorrentInfo.IsBt(job)&&!String.IsNullOrEmpty(job.BtFolder))return job.BtFolder;return job.AutoCategorize?Path.Combine(job.Folder,Category(job.Kind,name??job.Title)):job.Folder;}
    public static string PlaceFile(string source, string folder, string outputName=null) {
        Directory.CreateDirectory(folder);
        string selected=Name(outputName??Path.GetFileName(source));
        string name = Name(Path.GetFileNameWithoutExtension(selected)), ext = Path.GetExtension(selected);
        for (int n=0; n<10000; n++) {
            string target=Path.Combine(folder,name+(n==0?"":" ("+n+")")+ext);
            try { System.IO.File.Move(source,target); return target; }
            catch (IOException) { if (!System.IO.File.Exists(target)) throw; }
        }
        throw new IOException("同名文件太多，请换一个保存文件夹");
    }
}

public partial class Manager : IDisposable {
    // ponytail: one worker serializes state; immutable snapshots keep UI reads independent of network probes.
    readonly object gate = new object();
    readonly string dataRoot;
    internal string DataDirectory { get { return dataRoot; } }
    public readonly Settings Config;
    public string ProxyUrl{get{return Config.Proxy==Util.SystemProxyMode?Util.SystemProxy():Config.Proxy;}}
    readonly List<Download> jobs = new List<Download>();
    Process aria;
    string rpcUrl, secret;
    volatile bool closing;
    bool disposed;
    long nextQueueOrder;
    volatile string snapshotJson="[]";
    volatile HttpWebRequest activeProbe;
    ComponentStore components;
    bool preparing;
    Task preparationTask;
    CancellationTokenSource preparationCancel;
    public ComponentStore Components {get{lock(gate){return components??(components=new ComponentStore(Util.Root));}}}
    public string RecoveryNotice="";
    T ReadSaved<T>(string path) where T:class {
        Func<string,T> load=source=>{var value=Util.Json().Deserialize<T>(System.IO.File.ReadAllText(source,Encoding.UTF8));if(value==null)throw new Exception("空记录");var records=value as List<Download>;if(records!=null)foreach(var job in records){if(job==null||!Regex.IsMatch(job.Id??"",@"^[a-f0-9]{16}$")||job.Title==null||job.Status==null||String.IsNullOrWhiteSpace(job.Folder))throw new Exception("任务记录不完整");SavedSource(job);Path.GetFullPath(job.Folder);if(!String.IsNullOrEmpty(job.WorkName)&&Path.GetFileName(job.WorkName)!=job.WorkName)throw new Exception("任务临时文件名无效");}return value;};
        try{return load(path);}
        catch(Exception primary){
            try{var value=load(path+".bak");System.IO.File.Copy(path,path+".damaged-"+DateTime.UtcNow.Ticks);RecoveryNotice="任务或设置记录损坏，已从上次备份恢复；损坏文件已另存保留。";return value;}
            catch{throw new Exception("无法读取 "+Path.GetFileName(path)+"，原文件已保留，请检查同目录备份。",primary);}
        }
    }
    public Manager(string directory) {
        dataRoot=directory; Directory.CreateDirectory(dataRoot);
        string config=Path.Combine(dataRoot,"settings.json"), state=Path.Combine(dataRoot,"tasks.json");
        Config = System.IO.File.Exists(config) ? ReadSaved<Settings>(config) : new Settings();
        // Settings saved before 0.4.52 have no FollowBrowser: a folder the user already chose stays theirs.
        if(System.IO.File.Exists(config)&&!System.IO.File.ReadAllText(config).Contains("\"FollowBrowser\""))Config.FollowBrowser=String.Equals(Path.GetFullPath(Config.Folder??""),Path.GetFullPath(new Settings().Folder),StringComparison.OrdinalIgnoreCase);
        NormalizeSettings();
        if (System.IO.File.Exists(state)) {
            jobs=ReadSaved<List<Download>>(state);
            foreach (var job in jobs){if(TorrentInfo.IsBt(job)){if(job.Status=="已完成"&&job.BtSelected==null)job.BtSelected=(job.BtFiles??new TorrentFileInfo[0]).Select(f=>f.Index).ToArray();SyncBtSelection(job);if(job.HasMetadata&&!HasBtSelection(job)&&job.Status!="已完成"){job.Status="等待选文件";job.Speed="";continue;}}if(job.Status!="已完成"&&job.Status!="失败"){job.Status="已暂停";job.Speed="";}else if(job.Status=="已完成"&&(job.Transfer==null||job.Transfer.Total<0))TransferData.Complete(job);}
        }
        foreach(var job in jobs){job.BtReason="";job.BtAdvice="";}
        PublishSnapshot();
    }
    // Chrome's download folder as the extension last saw it. Returns true when the save folder changed.
    public bool FollowBrowserFolder(string browserFolder){
        if(String.IsNullOrWhiteSpace(browserFolder)||browserFolder.Length>240||browserFolder.Any(Char.IsControl)||!Path.IsPathRooted(browserFolder))return false;
        string target;try{target=Path.GetFullPath(Path.Combine(browserFolder,"Ruxget"));}catch{return false;}
        if(!Directory.Exists(Path.GetDirectoryName(target)))return false;
        lock(gate){if(!Config.FollowBrowser||String.Equals(Config.Folder,target,StringComparison.OrdinalIgnoreCase))return false;Config.Folder=target;SaveSettings();return true;}
    }
    public void SaveSettings() {
        lock(gate) { NormalizeSettings();if(btAria!=null&&!btAria.HasExited)BtRpc("changeGlobalOption",new Dictionary<string,string>{{"max-overall-upload-limit",Config.BtUploadKiB+"K"}});Util.Atomic(Path.Combine(dataRoot,"settings.json"),Config); }
    }
    void NormalizeSettings(){Config.UiLanguage=(Config.UiLanguage=="en"||Config.UiLanguage=="zh_CN"||Config.UiLanguage=="auto")?Config.UiLanguage:"auto";Config.Proxy=Config.Proxy??"";Util.CheckProxy(Config.Proxy);Config.Connections=Math.Max(1,Math.Min(16,Config.Connections));Config.FileSlots=Math.Max(1,Math.Min(4,Config.FileSlots));Config.VideoSlots=Math.Max(1,Math.Min(2,Config.VideoSlots));Config.RateKiB=Math.Max(0,Math.Min(102400,Config.RateKiB));Config.BtUploadKiB=Math.Max(16,Math.Min(8192,Config.BtUploadKiB));Config.Folder=Path.GetFullPath(String.IsNullOrWhiteSpace(Config.Folder)?new Settings().Folder:Config.Folder);}
    void PublishSnapshot(){snapshotJson=Util.Json().Serialize(jobs);}
    void Save() { PublishSnapshot(); Util.Atomic(Path.Combine(dataRoot,"tasks.json"),jobs); }
    public List<Download> Snapshot() { return Util.Json().Deserialize<List<Download>>(snapshotJson); }
    public string Work(Download job) { return Path.Combine(dataRoot,"partial",job.Id); }
    void CanAdd(int count){if(closing)throw new Exception("正在关闭下载窗口，请稍后重新打开");if(jobs.Count+count>2000)throw new Exception("任务记录最多 2000 条，请先移除不需要的记录");}
    public Download Add(string url, string kind, string title="", int height=1080, string folder=null, IDictionary<string,object> input=null, bool? autoCategorize=null) {
        lock(gate) {
            CanAdd(1);var job=CreateDownload(url,kind,title,height,folder,input,autoCategorize);jobs.Add(job);try{Save();}catch{jobs.Remove(job);PublishSnapshot();throw;}return job;
        }
    }
    // A download the browser handed over. Chrome's paused copy is only cancelled when this returns, so the link is
    // probed first: a refusal, a login page or an unreachable server goes back to Chrome instead of failing here.
    public Download Takeover(IDictionary<string,object> input){
        string url=Util.Url(Util.Str(input,"url")),referer=Util.Str(input,"referer"),agent=Util.Str(input,"userAgent");
        if(referer.Length>0)referer=Util.Url(referer);if(agent.Length>512||agent.Any(Char.IsControl))throw new Exception("浏览器信息无效");
        var request=(HttpWebRequest)WebRequest.Create(url);request.Method="GET";request.AddRange(0,0);request.Timeout=8000;request.ReadWriteTimeout=8000;request.KeepAlive=false;request.AllowAutoRedirect=true;
        request.UserAgent=agent.Length>0?agent:"aria2/1.37.0";if(referer.Length>0)request.Referer=referer;
        request.Proxy=new Uri(url).IsLoopback||ProxyUrl.Length==0?null:new WebProxy(ProxyUrl);
        try{using(var response=(HttpWebResponse)request.GetResponse()){
            if(response.StatusCode!=HttpStatusCode.OK&&response.StatusCode!=HttpStatusCode.PartialContent)throw new Exception("服务器没有直接给出文件");
            if((response.ContentType??"").StartsWith("text/html",StringComparison.OrdinalIgnoreCase))throw new Exception("这个链接需要网页登录或验证，交回 Chrome 下载");
        }}catch(WebException ex){using(var response=ex.Response as HttpWebResponse){
            // An empty file answers a byte-range request with 416; that is still a real file.
            if(response==null||response.StatusCode!=HttpStatusCode.RequestedRangeNotSatisfiable)throw new Exception("桌面版无法直接访问这个链接，交回 Chrome 下载");
        }}finally{request.Abort();}
        string name=Util.Str(input,"name");if(name.Length>0)name=Util.Name(name);
        return Add(url,"file",name,1080,null,new Dictionary<string,object>{{"referer",referer},{"userAgent",agent}});
    }
    public int AddMany(string text,string kind,string folder,int height=1080,bool? autoCategorize=null){
        lock(gate){
            if(text==null||text.Length>2*1024*1024)throw new Exception("请每行粘贴一个下载地址，一次最多 100 条");
            var lines=text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).Select(s=>s.Trim()).Where(s=>s.Length>0).ToArray();
            if(lines.Length==0||lines.Length>100)throw new Exception("请每行粘贴一个下载地址，一次最多 100 条");
            var urls=new List<string>();for(int n=0;n<lines.Length;n++){try{string hash,name,url=lines[n].StartsWith("magnet:",StringComparison.OrdinalIgnoreCase)?TorrentInfo.Magnet(lines[n],out hash,out name):Util.Url(lines[n]);if(!urls.Contains(url))urls.Add(url);}catch{throw new Exception("第 "+(n+1)+" 条地址无效，请修正后再添加；本次尚未添加任何任务");}}
            CanAdd(urls.Count);var added=urls.Select(url=>CreateDownload(url,kind,"",height,folder,null,autoCategorize)).ToArray();if(added.Where(TorrentInfo.IsBt).GroupBy(j=>j.BtHash).Any(g=>g.Count()>1))throw new Exception("本批次包含指向同一种子的多个磁力链接，请保留一个");jobs.AddRange(added);try{Save();}catch{foreach(var job in added)jobs.Remove(job);PublishSnapshot();throw;}return added.Length;
        }
    }
    Download CreateDownload(string url,string kind,string title,int height,string folder,IDictionary<string,object> input,bool? autoCategorize){
            if((url??"").StartsWith("magnet:",StringComparison.OrdinalIgnoreCase)||kind=="magnet"){
                string hash,name,magnet=TorrentInfo.Magnet(url,out hash,out name);UniqueBt(hash);return new Download{Id=Guid.NewGuid().ToString("N").Substring(0,16),Url=magnet,Kind="magnet",Title=String.IsNullOrEmpty(title)?name:Util.Name(title),Folder=Path.GetFullPath(folder??Config.Folder),Status="排队中",QueueOrder=++nextQueueOrder,Speed="",Error="",BtHash=hash,AutoCategorize=autoCategorize??Config.AutoCategorize};
            }
            url=Util.Url(url); if(!new[]{"file","video","audio","tracks"}.Contains(kind))throw new Exception("下载类型无效");
            var job=new Download { Id=Guid.NewGuid().ToString("N").Substring(0,16), Url=url, Kind=kind, Title=Util.Name(title.Length==0 ? Uri.UnescapeDataString(new Uri(url).AbsolutePath.Split('/').Last()) : title), Folder=Path.GetFullPath(folder??Config.Folder), Height=Math.Max(144,Math.Min(4320,height)), Status="排队中",QueueOrder=++nextQueueOrder, Speed="", Error="" };
            job.AutoName=title.Length==0;job.WorkName="payload.download";job.AutoCategorize=autoCategorize??Config.AutoCategorize;
            if (kind=="tracks") {
                // 抖音、快手、小红书 send one combined file: no audio track, and MP3 is extracted from it.
                job.VideoUrl=TrackUrl(Util.Str(input,"videoUrl")); string audioInput=Util.Str(input,"audioUrl"); job.AudioUrl=audioInput.Length==0?"":TrackUrl(audioInput); job.ExtractAudio=Util.Str(input,"extractAudio")=="True";
                string sourceHost=new Uri(job.Url).Host, videoHost=new Uri(job.VideoUrl).Host, audioHost=job.AudioUrl.Length==0?"":new Uri(job.AudioUrl).Host;
                bool bili=sourceHost=="www.bilibili.com"||sourceHost=="bilibili.com";
                bool yt=sourceHost=="www.youtube.com"||sourceHost=="youtube.com"||sourceHost=="youtu.be";
                bool biliTracks=Regex.IsMatch(videoHost,@"(^|\.)bilivideo\.(com|cn)$")&&Regex.IsMatch(audioHost,@"(^|\.)bilivideo\.(com|cn)$");
                bool ytTracks=videoHost.EndsWith(".googlevideo.com")&&audioHost.EndsWith(".googlevideo.com");
                bool combined=job.AudioUrl.Length==0&&(
                    (sourceHost=="www.douyin.com"||sourceHost=="douyin.com")&&Regex.IsMatch(videoHost,@"(^|\.)(douyinvod|douyincdn)\.com$")||
                    (sourceHost=="www.kuaishou.com"||sourceHost=="kuaishou.com")&&Regex.IsMatch(videoHost,@"(^|\.)(kwaicdn|ndcimgs|yximgs|kwimgs)\.com$")||
                    (sourceHost=="www.xiaohongshu.com"||sourceHost=="xiaohongshu.com")&&Regex.IsMatch(videoHost,@"(^|\.)xhscdn\.com$"));
                if(!(bili&&biliTracks||yt&&ytTracks||combined))throw new Exception("音视频轨与来源网站不匹配");
            }
            if(input!=null) { job.Referer=Util.Str(input,"referer"); if(job.Referer.Length>0)job.Referer=Util.Url(job.Referer); job.UserAgent=Util.Str(input,"userAgent"); if(job.UserAgent.Length>512||job.UserAgent.Any(Char.IsControl))throw new Exception("浏览器信息无效"); }
            return job;
    }
    static string TrackUrl(string value) {
        string url=Util.Url(value); var u=new Uri(url);
        if(u.Scheme!="https"||!u.IsDefaultPort||!Regex.IsMatch(u.Host,@"(^|\.)(bilivideo\.(com|cn)|googlevideo\.com|douyinvod\.com|douyincdn\.com|kwaicdn\.com|ndcimgs\.com|yximgs\.com|kwimgs\.com|xhscdn\.com)$"))throw new Exception("视频轨地址不受支持");
        return url;
    }
    object Rpc(string method, params object[] parameters) {
        return RpcAt(rpcUrl,secret,method,parameters);
    }
    static object RpcAt(string endpoint,string token,string method,params object[] parameters){
        var args=new List<object>{"token:"+token}; args.AddRange(parameters);
        byte[] bytes=Encoding.UTF8.GetBytes(Util.Json().Serialize(new{jsonrpc="2.0",id="shiying",method="aria2."+method,@params=args}));
        var request=(HttpWebRequest)WebRequest.Create(endpoint); request.Proxy=null; request.Method="POST"; request.ContentType="application/json"; request.Timeout=2000; request.ContentLength=bytes.Length;
        using(var s=request.GetRequestStream())s.Write(bytes,0,bytes.Length);
        WebResponse reply;try{reply=request.GetResponse();}catch(WebException ex){if(ex.Response==null)throw;reply=ex.Response;}
        using(var response=reply)using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)) {
            var value=Util.Json().Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
            if(value.ContainsKey("error")) throw new AriaRpcError(Util.Str((IDictionary<string,object>)value["error"],"message"));
            return value["result"];
        }
    }
    void EnsureAria() {
        if(aria!=null && !aria.HasExited)return;
        if(!Components.Ready("aria2c.exe"))throw new Exception("核心下载组件缺失或损坏，请重新运行 Ruxget 安装器");
        string exe=Path.Combine(Util.Root,"bin","aria2c.exe"); if(!System.IO.File.Exists(exe))throw new Exception("缺少 aria2c.exe，请使用完整桌面版目录");
        var listener=new TcpListener(IPAddress.Loopback,0); listener.Start(); int port=((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        secret=Guid.NewGuid().ToString("N"); rpcUrl="http://127.0.0.1:"+port+"/jsonrpc";
        aria=Util.Start(exe,new[]{"--no-conf=true","--no-netrc=true","--enable-rpc=true","--rpc-listen-all=false","--rpc-listen-port="+port,"--rpc-secret="+secret,"--max-concurrent-downloads=4","--follow-torrent=false","--follow-metalink=false","--enable-dht=false","--enable-dht6=false","--enable-peer-exchange=false","--save-session-interval=0","--auto-save-interval=1","--check-certificate=true","--console-log-level=error","--download-result=hide","--enable-color=false"});
        aria.OutputDataReceived+=(s,e)=>{}; aria.ErrorDataReceived+=(s,e)=>{};
        try{aria.Start();}catch{aria.Dispose();aria=null;throw;} aria.BeginOutputReadLine(); aria.BeginErrorReadLine();
        for(int n=0;n<30;n++){try{Rpc("getVersion");return;}catch{if(aria.HasExited)break;Thread.Sleep(100);}}
        Util.KillTree(aria); throw new Exception("下载内核启动失败，请重试");
    }
    void StartFile(Download job) {
        EnsureAria(); Directory.CreateDirectory(Work(job));
        string name=String.IsNullOrEmpty(job.WorkName)?Util.Name(job.Title):job.WorkName;
        var metadata=Metadata(job);
        if(job.HasMetadata&&System.IO.File.Exists(Path.Combine(Work(job),name)+".aria2")) {
            if(metadata.Resume!=true)throw new Exception("服务器不支持或无法确认分段续传，原有未完成数据已保留；请新建任务重新下载");
            bool sameVersion=!String.IsNullOrEmpty(job.ETag)&&!job.ETag.StartsWith("W/") ? job.ETag==metadata.ETag : !String.IsNullOrEmpty(job.Modified)&&job.Modified==metadata.Modified;
            if(!sameVersion||job.ExpectedSize>=0&&metadata.Size>=0&&job.ExpectedSize!=metadata.Size)throw new Exception("源文件已变化或无法确认版本，请新建下载；原有未完成数据已保留");
        }
        job.ETag=metadata.ETag;job.Modified=metadata.Modified;job.ExpectedSize=metadata.Size;job.HasMetadata=true;
        job.Transfer=job.Transfer??new TransferInfo();job.Transfer.Total=metadata.Size;job.Transfer.Resume=metadata.Resume;job.Transfer.Speed=-1;job.Transfer.Eta=-1;
        if(job.AutoName&&!String.IsNullOrEmpty(metadata.Name))job.Title=Util.Name(metadata.Name);
        var options=new Dictionary<string,string>{{"gid",job.Id},{"dir",Work(job)},{"out",name},{"split",Config.Connections.ToString()},{"max-connection-per-server",Config.Connections.ToString()},{"min-split-size","1M"},{"continue","true"},{"allow-overwrite","false"},{"auto-file-renaming","false"},{"max-tries","3"},{"retry-wait","2"},{"connect-timeout","20"},{"timeout","30"},{"all-proxy",ProxyUrl},{"no-proxy","localhost,127.0.0.1,::1"}};
        if(Config.RateKiB>0)options["max-download-limit"]=Config.RateKiB+"K";
        if(!String.IsNullOrEmpty(job.Referer))options["referer"]=job.Referer;
        if(!String.IsNullOrEmpty(job.UserAgent))options["user-agent"]=job.UserAgent;
        Rpc("addUri",new[]{String.IsNullOrEmpty(job.NetdiskProvider)?job.Url:NetdiskRelayUrl(job)},options); job.Status="等待下载";
    }
    class RemoteMetadata {public string ETag, Modified, Name;public long Size;public bool? Resume;}
    static string ResponseName(string header){
        if(String.IsNullOrEmpty(header))return "";
        var encoded=Regex.Match(header,@"filename\*\s*=\s*UTF-8'[^']*'([^;]+)",RegexOptions.IgnoreCase);
        if(encoded.Success)return Util.Name(Uri.UnescapeDataString(encoded.Groups[1].Value.Trim().Trim('"')));
        try{string name=new System.Net.Mime.ContentDisposition(header).FileName;return String.IsNullOrWhiteSpace(name)?"":Util.Name(name);}catch{return "";}
    }
    RemoteMetadata Metadata(Download job) {
        if(!String.IsNullOrEmpty(job.NetdiskProvider))return NetdiskMetadata(job);
        if(closing)throw new OperationCanceledException();
        var request=(HttpWebRequest)WebRequest.Create(job.Url);request.Method="GET";request.AddRange(0,0);request.Timeout=10000;request.ReadWriteTimeout=10000;request.KeepAlive=false;request.UserAgent=String.IsNullOrEmpty(job.UserAgent)?"aria2/1.37.0":job.UserAgent;
        activeProbe=request;
        if(closing){request.Abort();throw new OperationCanceledException();}
        request.Proxy=new Uri(job.Url).IsLoopback||ProxyUrl.Length==0?null:new WebProxy(ProxyUrl);
        if(!String.IsNullOrEmpty(job.Referer))request.Referer=job.Referer;
        try{using(var response=(HttpWebResponse)request.GetResponse()){
            long size=response.ContentLength;bool? resume=null;
            if(response.StatusCode==HttpStatusCode.OK)resume=false;
            else if(response.StatusCode==HttpStatusCode.PartialContent){var range=Regex.Match(response.Headers[HttpResponseHeader.ContentRange]??"",@"^bytes 0-0/([0-9]+)$",RegexOptions.IgnoreCase);long total;if(range.Success&&Int64.TryParse(range.Groups[1].Value,out total)&&total>0){resume=true;size=total;}else size=-1;}
            return new RemoteMetadata{ETag=response.Headers[HttpResponseHeader.ETag],Modified=response.Headers[HttpResponseHeader.LastModified],Size=size,Resume=resume,Name=ResponseName(response.Headers["Content-Disposition"])};
        }}catch(WebException ex){using(var response=ex.Response as HttpWebResponse){if(response!=null&&response.StatusCode==HttpStatusCode.RequestedRangeNotSatisfiable&&Regex.IsMatch(response.Headers[HttpResponseHeader.ContentRange]??"",@"^bytes \*/0$",RegexOptions.IgnoreCase))return new RemoteMetadata{Size=0,Resume=false,ETag=response.Headers[HttpResponseHeader.ETag],Modified=response.Headers[HttpResponseHeader.LastModified],Name=ResponseName(response.Headers["Content-Disposition"])};}throw;}
        finally{request.Abort();activeProbe=null;}
    }
    // Move "<name>.<lang>.srt" files written by yt-dlp next to the placed video as "<placed name>.<lang>.srt". Best effort.
    void PlaceSubtitles(Download job,string final){
        if(!Config.SaveSubtitles||String.IsNullOrEmpty(job.File))return;
        string stem=Path.GetFileNameWithoutExtension(final);
        foreach(string subtitle in Directory.GetFiles(Work(job),"*.srt")){
            try{string name=Path.GetFileName(subtitle),suffix=name.StartsWith(stem,StringComparison.Ordinal)?name.Substring(stem.Length):"."+name;Util.PlaceFile(subtitle,Path.GetDirectoryName(job.File),Path.GetFileNameWithoutExtension(job.File)+suffix);}catch{}
        }
    }
    void StartVideo(Download job) {
        string exe=Path.Combine(Util.Root,"bin","yt-dlp.exe"), ffmpeg=Path.Combine(Util.Root,"bin","ffmpeg.exe"), node=Path.Combine(Util.Root,"bin","node.exe");
        if(!Components.Ready(job))throw new Exception("视频组件尚未准备好，请继续重试");
        Directory.CreateDirectory(Work(job)); job.PauseRequested=false;
        var args=new List<string>{"--ignore-config","--no-playlist","--no-cache-dir","--no-overwrites","--newline","--progress","--progress-delta","0.2","--socket-timeout","20","--retries","2","--fragment-retries","2","--concurrent-fragments","4","--ffmpeg-location",Path.Combine(Util.Root,"bin"),"--proxy",new Uri(job.Url).IsLoopback?"":ProxyUrl,"-o",Path.Combine(Work(job),"%(title).120B [%(id)s].%(ext)s"),"--progress-template","download:progress:{\"downloaded_bytes\":%(progress.downloaded_bytes|null)j,\"total_bytes\":%(progress.total_bytes|null)j,\"total_bytes_estimate\":%(progress.total_bytes_estimate|null)j,\"speed\":%(progress.speed|null)j,\"eta\":%(progress.eta|null)j,\"fragment_index\":%(progress.fragment_index|null)j,\"fragment_count\":%(progress.fragment_count|null)j,\"vcodec\":%(info.vcodec|null)j,\"acodec\":%(info.acodec|null)j}","--progress-template","postprocess:phase:%(progress.postprocessor)s","--print","after_move:final:%(filepath)s"};
        if(ComponentStore.NeedsNode(job))args.AddRange(new[]{"--js-runtimes","node:"+node});
        if(Config.RateKiB>0)args.AddRange(new[]{"--limit-rate",Config.RateKiB+"K"});
        if(job.Kind=="tracks") {
            var headers=new Dictionary<string,string>(); if(!String.IsNullOrEmpty(job.Referer))headers["Referer"]=job.Referer; if(!String.IsNullOrEmpty(job.UserAgent))headers["User-Agent"]=job.UserAgent;
            bool combined=String.IsNullOrEmpty(job.AudioUrl);
            object[] formats=combined?new object[]{new{format_id="video",url=job.VideoUrl,ext="mp4",vcodec="avc1",acodec="mp4a",height=job.Height,http_headers=headers}}:new object[]{new{format_id="video",url=job.VideoUrl,ext="mp4",vcodec="avc1",acodec="none",height=job.Height,http_headers=headers},(object)new{format_id="audio",url=job.AudioUrl,ext="m4a",vcodec="none",acodec="mp4a",http_headers=headers}};
            string info=Path.Combine(Work(job),"info.json"); Util.Atomic(info,new{id=job.Id,title=job.Title,extractor="shiying",webpage_url=job.Url,formats=formats});
            args.AddRange(combined?(job.ExtractAudio?new[]{"--load-info-json",info,"-f","video","-x","--audio-format","mp3","--embed-metadata"}:new[]{"--load-info-json",info,"-f","video"}):new[]{"--load-info-json",info,"-f","video+audio","--merge-output-format","mp4"});
        } else {
            if(!String.IsNullOrEmpty(job.Referer))args.AddRange(new[]{"--referer",job.Referer});
            if(!String.IsNullOrEmpty(job.UserAgent))args.AddRange(new[]{"--user-agent",job.UserAgent});
            args.AddRange(job.Kind=="audio" ? new[]{"-x","--audio-format","mp3","--embed-metadata","--embed-thumbnail"} : new[]{"-f","bv*[height<=?"+job.Height+"][format_note!*=AI-upscaled]+ba/b[height<=?"+job.Height+"]","--merge-output-format","mp4","--embed-metadata"});
            // Subtitles are separate .srt files; they are moved next to the video when it completes.
            if(job.Kind!="audio"&&Config.SaveSubtitles)args.AddRange(new[]{"--write-subs","--sub-langs","zh.*,en.*","--convert-subs","srt"});
            args.Add("--");args.Add(job.Url);
        }
        Process child=Util.Start(exe,args); job.Child=child; job.Status="下载中";job.Stage="正在下载内容";
        string final="", last="";
        DataReceivedEventHandler receive=(sender,e)=>{ if(e.Data==null)return; lock(gate){
            if(e.Data.StartsWith("final:"))final=e.Data.Substring(6).Trim();
            else if(e.Data.StartsWith("progress:"))TransferData.VideoStatus(job,e.Data.Substring(9));
            else if(e.Data.StartsWith("phase:")){job.Stage=e.Data.IndexOf("ExtractAudio",StringComparison.OrdinalIgnoreCase)>=0?"正在转换声音":e.Data.IndexOf("Merger",StringComparison.OrdinalIgnoreCase)>=0?"正在合并画面和声音":"正在整理文件";job.Speed="";job.Transfer.Speed=-1;job.Transfer.Eta=-1;}
            else if(e.Data.Length>0)last=Util.SafeError(e.Data);
        }};
        child.OutputDataReceived+=receive; child.ErrorDataReceived+=receive;
        try{child.Start();}catch{job.Child=null;child.Dispose();throw;}child.BeginOutputReadLine();child.BeginErrorReadLine();
        Task.Run(()=>{child.WaitForExit();lock(gate){
            job.Child=null; job.Speed="";
            if(job.PauseRequested||closing)job.Status="已暂停";
            else if(child.ExitCode==0&&Util.InDirectory(final,Work(job))&&System.IO.File.Exists(final)) { try{job.File=Util.PlaceFile(final,Util.OutputFolder(job,Path.GetFileName(final)));PlaceSubtitles(job,final);job.Status="已完成";job.Progress=100;job.Error="";TransferData.Complete(job);}catch(Exception ex){job.Status="失败";job.Error=Util.SafeError(ex.Message);} }
            else {job.Status="失败";job.Error=String.IsNullOrWhiteSpace(last)?"网站未返回完整文件，请重新读取视频链接":last;}
            child.Dispose();Save();
        }});
    }
    void PrepareComponents(Download job){
        preparing=true;job.PauseRequested=false;job.Status="准备组件";job.Stage="首次使用，正在准备视频组件";job.Progress=0;preparationCancel=new CancellationTokenSource();var cancel=preparationCancel;string proxy=ProxyUrl;
        preparationTask=Task.Run(()=>{
            string error="";try{Components.Ensure(Components.Needed(job),proxy,progress=>{lock(gate){job.Stage=progress.Message;job.Progress=progress.Percent;PublishSnapshot();}},cancel.Token);}catch(Exception ex){if(!cancel.IsCancellationRequested)error=Util.SafeError(ex.Message);}
            lock(gate){preparing=false;preparationCancel=null;job.Speed="";job.Progress=0;job.Stage="";job.Status=closing||job.PauseRequested?"已暂停":error.Length>0?"失败":"排队中";job.Error=error;Save();}cancel.Dispose();
        });
    }
    public void Tick() {
        lock(gate) {
            if(closing)return;
            TickBt();
            foreach(var job in jobs.Where(j=>j.Status=="等待节点"&&j.BtRetryAt<=DateTime.UtcNow)){job.Status="排队中";job.QueueOrder=++nextQueueOrder;}
            foreach(var job in jobs.Where(j=>j.Status=="排队中").OrderBy(j=>j.QueueOrder).ToArray()) {
                if(closing)break;
                if((job.Kind=="file"||TorrentInfo.IsBt(job))&&jobs.Count(j=>(j.Kind=="file"||TorrentInfo.IsBt(j))&&BtMetadataJob(j)==BtMetadataJob(job)&&(j.Status=="下载中"||j.Status=="等待下载"||j.Status=="正在暂停"))>=(BtMetadataJob(job)?2:Config.FileSlots))continue;
                if(job.Kind!="file"&&!TorrentInfo.IsBt(job)&&jobs.Count(j=>!TorrentInfo.IsBt(j)&&j.Kind!="file"&&(j.Child!=null||j.Status=="准备组件"))>=Config.VideoSlots)continue;
                try{if(TorrentInfo.IsBt(job))StartBt(job);else if(job.Kind=="file")StartFile(job);else if(!Components.Ready(job)){if(!preparing)PrepareComponents(job);}else StartVideo(job);}catch(Exception ex){job.Status=closing?"已暂停":"失败";job.Error=closing?"":Util.SafeError(ex.Message);} Save();
            }
            if(aria==null){PublishSnapshot();return;}
            foreach(var job in jobs.Where(j=>j.Kind=="file"&&(j.Status=="下载中"||j.Status=="等待下载"||j.Status=="正在暂停")).ToArray())try {
                var state=(IDictionary<string,object>)Rpc("tellStatus",job.Id);
                TransferData.FileStatus(job,state);
                string status=Util.Str(state,"status");
                if(status=="active"&&!job.PauseRequested)job.Status="下载中";
                if(status=="waiting"&&!job.PauseRequested)job.Status="等待下载";
                if(status=="complete") {
                    string file=Path.Combine(Work(job),String.IsNullOrEmpty(job.WorkName)?Util.Name(job.Title):job.WorkName); job.File=Util.PlaceFile(file,Util.OutputFolder(job),job.Title);job.Status="已完成";job.Progress=100;job.Speed="";job.NetdiskCookie="";lock(relayGate)relayJobs.Remove(job.Id);TransferData.Complete(job);Save();
                }else if(status=="error"||status=="removed") {job.Status="失败";job.Speed="";job.Error=Util.SafeError(Util.Str(state,"errorMessage","下载中断，请重试"));Save();}
                else if(status=="paused"){job.Status="已暂停";job.Speed="";Save();}
            }catch(Exception ex){job.Status="失败";job.Speed="";job.Error=Util.SafeError(ex.Message);Save();}
            PublishSnapshot();
        }
    }
    public void Pause(string id) {
        Process child=null;
        lock(gate){var job=jobs.First(j=>j.Id==id);if(job.BtFinishing)return;if(job.Status=="排队中"||job.Status=="等待节点"){CancelBtSearch(id);job.Status="已暂停";Save();return;}if(job.Status=="准备组件"){job.PauseRequested=true;job.Status="正在暂停";if(preparationCancel!=null)preparationCancel.Cancel();Save();return;}if(job.Status!="下载中"&&job.Status!="等待下载")return;
            job.PauseRequested=true;job.Status="正在暂停";
            if(TorrentInfo.IsBt(job)){CacheBtPeers(job);try{BtRpc("forcePause",job.Id);}catch{if(Util.Str((IDictionary<string,object>)BtRpc("tellStatus",job.Id),"status")!="complete")throw;}}else if(job.Kind=="file"){Rpc("pause",job.Id);}else child=job.Child;
            Save();
        }
        if(child!=null)Util.KillTree(child);
    }
    public void Resume(string id) {
        lock(gate){var job=jobs.First(j=>j.Id==id);if(!new[]{"已暂停","失败","等待节点"}.Contains(job.Status)||job.Child!=null)return;
            if(TorrentInfo.IsBt(job)&&job.HasMetadata&&!HasBtSelection(job)){job.Status="等待选文件";job.Error="";Save();return;}
            if(TorrentInfo.IsBt(job))ResetBt(job);
            if(job.Kind=="file"&&aria!=null&&!aria.HasExited)try {Rpc("remove",job.Id);}catch{}
            if(job.Kind=="file"&&aria!=null&&!aria.HasExited)try {Rpc("removeDownloadResult",job.Id);}catch{}
            job.Status="排队中";job.QueueOrder=++nextQueueOrder;job.Error="";job.PauseRequested=false;Save();
        }
    }
    static string DeletePath(string path,string root,bool allowRoot=false){
        path=Path.GetFullPath(path);root=Path.GetFullPath(root);
        if(!Util.InDirectory(path,root)&&!(allowRoot&&String.Equals(path.TrimEnd(Path.DirectorySeparatorChar),root.TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)))throw new IOException("文件位置超出任务目录，未删除；可取消勾选文件删除后重试");
        for(string at=path;!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at))try{if((System.IO.File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new IOException("任务目录包含链接或联接点，未删除；可保留文件后移除任务");}catch(FileNotFoundException){}catch(DirectoryNotFoundException){}
        return path;
    }
    void DeleteTaskFiles(Download job){
        if(!Regex.IsMatch(job.Id??"",@"^[a-f0-9]{16}$"))throw new IOException("任务编号无效，未删除文件");
        var files=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string work=DeletePath(Work(job),Path.Combine(dataRoot,"partial"));
        Action<string,string> addFile=(path,root)=>{path=DeletePath(path,root);if(Directory.Exists(path))throw new IOException("任务文件变成了文件夹，未删除");files.Add(path);};
        if(TorrentInfo.IsBt(job)&&!String.IsNullOrEmpty(job.BtFolder)&&Directory.Exists(job.BtFolder)){
            string folder=DeletePath(job.BtFolder,job.Folder);if(!Path.GetFileName(folder).EndsWith(" ["+job.Id.Substring(0,8)+"]",StringComparison.Ordinal))throw new IOException("BT 目录归属不明确，未删除；可保留文件后移除任务");
            var info=TorrentInfo.Read(TorrentInfo.Load(DeletePath(TorrentSource(job),work)));if(info.Hash!=job.BtHash)throw new IOException("种子记录不一致，未删除文件");
            foreach(var file in info.Files){string path=DeletePath(Path.Combine(folder,file.Path.Replace('/',Path.DirectorySeparatorChar)),folder);addFile(path,folder);for(string dir=Path.GetDirectoryName(path);Util.InDirectory(dir,folder);dir=Path.GetDirectoryName(dir))directories.Add(dir);}
            addFile(Path.Combine(folder,info.Name+".aria2"),folder);directories.Add(folder);
        }else if(!TorrentInfo.IsBt(job)&&!String.IsNullOrEmpty(job.File))addFile(job.File,job.Folder);
        // Only this task's private work directory is walked; user download directories are never recursively removed.
        var pending=new Stack<string>();if(Directory.Exists(work))pending.Push(work);
        while(pending.Count>0){string dir=DeletePath(pending.Pop(),work,true);directories.Add(dir);foreach(string item in Directory.GetFileSystemEntries(dir)){string path=DeletePath(item,work);if(Directory.Exists(path))pending.Push(path);else files.Add(path);}}
        foreach(var other in jobs.Where(item=>item.Id!=job.Id))foreach(string file in files){
            if(!String.IsNullOrEmpty(other.File)&&String.Equals(Path.GetFullPath(other.File),file,StringComparison.OrdinalIgnoreCase)||!String.IsNullOrEmpty(other.BtFolder)&&Util.InDirectory(file,other.BtFolder)||Util.InDirectory(file,Work(other)))throw new IOException("文件仍属于其他任务，已保留任务和文件");
        }
        // Recheck each path immediately before deletion, including its ancestors; never follow a junction.
        foreach(string file in files){DeletePath(file,Util.InDirectory(file,work)?work:job.Folder);try{System.IO.File.Delete(file);}catch(DirectoryNotFoundException){}}
        foreach(string dir in directories.OrderByDescending(path=>path.Length)){DeletePath(dir,Util.InDirectory(dir,work)||String.Equals(dir,work,StringComparison.OrdinalIgnoreCase)?work:job.Folder,true);if(Directory.Exists(dir)&&Directory.GetFileSystemEntries(dir).Length==0)Directory.Delete(dir,false);}
    }
    sealed class AriaRpcError:Exception{public AriaRpcError(string message):base(message){}}
    void DetachForDeletion(Download job){
        var process=TorrentInfo.IsBt(job)?btAria:job.Kind=="file"?aria:null;if(process==null||process.HasExited)return;
        Func<string,object[],object> rpc=(method,args)=>TorrentInfo.IsBt(job)?BtRpc(method,args):Rpc(method,args);
        Func<IDictionary<string,object>> read=()=>{try{return (IDictionary<string,object>)rpc("tellStatus",new object[]{job.Id});}catch(AriaRpcError ex){if(ex.Message.IndexOf("GID "+job.Id+" is not found",StringComparison.OrdinalIgnoreCase)>=0)return null;throw;}};
        IDictionary<string,object> state;try{state=read();}catch(Exception ex){throw new IOException("未能确认内核已停止，请稍后重试",ex);}if(state==null)return;
        string status=Util.Str(state,"status");if(status=="active"||status=="waiting")throw new IOException("任务仍在运行，请先暂停再删除");
        if(status=="paused"){rpc("forceRemove",new object[]{job.Id});for(int n=0;n<20;n++){state=read();if(state==null)return;status=Util.Str(state,"status");if(status=="removed"||status=="complete"||status=="error")break;Thread.Sleep(50);}}
        if(status!="removed"&&status!="complete"&&status!="error")throw new IOException("内核正在结束任务，请稍后再删除");rpc("removeDownloadResult",new object[]{job.Id});
    }
    public void Forget(string id,bool deleteFiles=false) {lock(gate){
        var job=jobs.First(j=>j.Id==id);if(!new[]{"已暂停","失败","已完成","等待选文件","等待节点"}.Contains(job.Status)||job.Child!=null)throw new Exception("请先暂停这个任务");
        if(deleteFiles){DetachForDeletion(job);try{DeleteTaskFiles(job);}catch(Exception ex){throw new IOException("文件未能全部删除，任务已保留。"+Util.SafeError(ex.Message),ex);}}
        if(TorrentInfo.IsBt(job)){ResetBt(job);DropBtPeers(job);}lock(relayGate)relayJobs.Remove(job.Id);int index=jobs.IndexOf(job);jobs.RemoveAt(index);try{Save();}catch{jobs.Insert(index,job);PublishSnapshot();throw;}
    }}
    public void Dispose() {
        closing=true;CloseNetdisk();var probe=activeProbe;if(probe!=null)try{probe.Abort();}catch{}
        var pending=preparationCancel;if(pending!=null)try{pending.Cancel();}catch(ObjectDisposedException){}
        Process[] children;
        lock(gate){if(disposed)return;disposed=true;children=jobs.Where(j=>j.Child!=null).Select(j=>{j.PauseRequested=true;return j.Child;}).ToArray();
            if(aria!=null&&!aria.HasExited)try{Rpc("pauseAll");Rpc("shutdown");}catch{}
            StopBt();
            foreach(var j in jobs)if(j.Status=="下载中"||j.Status=="排队中"||j.Status=="等待下载"||j.Status=="正在暂停"||j.Status=="准备组件"){j.Status="已暂停";j.Speed="";}Save();
        }
        foreach(var child in children)Util.KillTree(child);
        if(preparationTask!=null)try{preparationTask.Wait(5000);}catch(AggregateException){}
        if(aria!=null){if(!aria.WaitForExit(5000))Util.KillTree(aria);aria.Dispose();}
    }
}

static class BrowserBridge {
    public const string Host="org.shiying.desktop";
    public static string ManifestPath {get{return Path.Combine(Util.Root,"native-host.json");}}
    public static string[] Origins(IEnumerable<string> current,string id){
        if(!Regex.IsMatch(id,@"^[a-p]{32}$"))throw new Exception("请粘贴 Ruxget 插件显示的 32 位扩展 ID");
        return current.Where(value=>Regex.IsMatch(value,@"^chrome-extension://[a-p]{32}/$")).Concat(new[]{"chrome-extension://"+id+"/"}).Distinct().ToArray();
    }
    public static void Register(string id) {
        Installation.Register(Util.Root,id,Registry.CurrentUser);
    }
    public static void RegisterKnown(){Register(Installation.Identity(Util.Root));}
    public static byte[] ReadFrame(Stream stream) {
        byte[] header=new byte[4];ReadExact(stream,header);int length=BitConverter.ToInt32(header,0);
        if(length<2||length>65536)throw new Exception("浏览器消息过大");byte[] body=new byte[length];ReadExact(stream,body);return body;
    }
    static void ReadExact(Stream s,byte[] b){int n=0;while(n<b.Length){int count=s.Read(b,n,b.Length-n);if(count==0)throw new EndOfStreamException();n+=count;}}
    public static void WriteFrame(Stream stream,byte[] bytes){stream.Write(BitConverter.GetBytes(bytes.Length),0,4);stream.Write(bytes,0,bytes.Length);stream.Flush();}
    public static int Native(string origin) {
        object response;
        try{
            var host=Util.Json().Deserialize<Dictionary<string,object>>(System.IO.File.ReadAllText(ManifestPath));
            if(!((IEnumerable)host["allowed_origins"]).Cast<object>().Select(Convert.ToString).Contains(origin))throw new Exception("这个扩展尚未连接桌面版");
            byte[] frame=ReadFrame(Console.OpenStandardInput());
            var message=Util.Json().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(frame));
            if(Util.Str(message,"action")=="ping"){var saved=new Settings();try{string file=Path.Combine(Util.Root,"data","settings.json");if(System.IO.File.Exists(file))saved=Util.Json().Deserialize<Settings>(System.IO.File.ReadAllText(file))??saved;}catch{}WriteFrame(Console.OpenStandardOutput(),Encoding.UTF8.GetBytes(Util.Json().Serialize(new{ok=true,version=Util.Version,paired=true,netdisk=true,netdiskApi=2,folder=saved.Folder,followBrowser=saved.FollowBrowser})));return 0;}
            if(Util.Str(message,"action")=="netdiskSeal"||Util.Str(message,"action")=="netdiskOpen"){
                string value=Util.Str(message,"value");if(Util.Str(message,"provider")!="baidu"||value.Length<1||value.Length>16384||value.Any(Char.IsControl))throw new Exception("网盘授权信息无效");
                bool seal=Util.Str(message,"action")=="netdiskSeal";string result=seal?Netdisk.Protect(value):Netdisk.Cookie(new Download{NetdiskCookie=value});
                WriteFrame(Console.OpenStandardOutput(),Encoding.UTF8.GetBytes(Util.Json().Serialize(new{ok=true,value=result})));return 0;
            }
            string action=Util.Str(message,"action");if(!new[]{"add","takeover","netdisk","netdiskFolder","show"}.Contains(action))throw new Exception("不支持的浏览器操作");if(action=="add"||action=="takeover")Util.Url(Util.Str(message,"url"));
            using(var pipe=new NamedPipeClientStream(".",Util.PipeName,PipeDirection.InOut)){
                // Netdisk and taken-over downloads start the app in the tray instead of opening its window.
                try{pipe.Connect(300);}catch(TimeoutException){Process.Start(new ProcessStartInfo(Application.ExecutablePath,action=="netdisk"||action=="takeover"?"--background":""){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Util.Root});pipe.Connect(10000);}
                WriteFrame(pipe,frame);response=Util.Json().DeserializeObject(Encoding.UTF8.GetString(ReadFrame(pipe)));
            }
        }catch(Exception ex){response=new{ok=false,error=Util.SafeError(ex.Message)};}
        WriteFrame(Console.OpenStandardOutput(),Encoding.UTF8.GetBytes(Util.Json().Serialize(response)));return 0;
    }
    public static void Listen(MainWindow window) {
        Task.Run(()=>{while(!window.IsDisposed){try{
            var security=new PipeSecurity();security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,PipeAccessRights.FullControl,AccessControlType.Allow));
            using(var server=new NamedPipeServerStream(Util.PipeName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.None,65536,65536,security)){
                server.WaitForConnection();server.ReadMode=PipeTransmissionMode.Byte;
                var task=Task.Run(()=>ReadFrame(server));if(!task.Wait(5000))continue;
                var input=Util.Json().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(task.Result));
                try{window.FollowBrowserFolder(Util.Str(input,"chromeFolder"));}catch{/* A bad hint never blocks the request itself. */}
                if(Util.Str(input,"action")=="netdisk"){
                    object reply;try{reply=window.AcceptNetdisk(input);}catch(Exception ex){reply=new{ok=false,error=Util.SafeError(ex.Message)};}
                    WriteFrame(server,Encoding.UTF8.GetBytes(Util.Json().Serialize(reply)));continue;
                }
                if(Util.Str(input,"action")=="takeover"){
                    object reply;try{reply=window.AcceptTakeover(input);}catch(Exception ex){reply=new{ok=false,error=Util.SafeError(ex.Message)};}
                    WriteFrame(server,Encoding.UTF8.GetBytes(Util.Json().Serialize(reply)));continue;
                }
                if(Util.Str(input,"action")=="netdiskFolder"){window.BeginInvoke(new Action(window.PickNetdiskFolder));WriteFrame(server,Encoding.UTF8.GetBytes("{\"ok\":true,\"stage\":\"folder\"}"));continue;}
                // The desktop dialog is the final local confirmation before a task is started.
                window.BeginInvoke(new Action(()=>{window.RestoreFromTray();if(Util.Str(input,"action")!="show")window.NewDownload(input);}));
                WriteFrame(server,Encoding.UTF8.GetBytes("{\"ok\":true,\"stage\":\"confirm\"}"));
            }
        }catch{if(window.IsDisposed)return;Thread.Sleep(100);}}});
    }
}


static class Program {
    [STAThread] static int Main(string[] args) {
        if(args.Length>0&&args[0].StartsWith("chrome-extension://"))return BrowserBridge.Native(args[0]);
        if(args.Length>0&&args[0]=="--selftest")return SelfTest();
        if(args.Length>0&&args[0]=="--pipe-name"){Console.WriteLine(Util.PipeName);return 0;}
        if(args.Length>0&&args[0]=="--echo-args"){Console.WriteLine(Util.Json().Serialize(args.Skip(1).ToArray()));return 0;}
        if(args.Length>0&&args[0]=="--download-test"){Console.OutputEncoding=new UTF8Encoding(false);Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false)){AutoFlush=true});return DownloadTest(args);}
        if(args.Length>0&&args[0]=="--lifecycle-test")return LifecycleTest(args);
        if(args.Length>0&&args[0]=="--engine-failure-test")return EngineFailureTest(args);
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        if(args.Length>0&&(args[0]=="--pair"||args[0].StartsWith("shiying-desktop:",StringComparison.OrdinalIgnoreCase))){try{
            string id=Installation.PairId(args[0]=="--pair"&&args.Length>1?args[1]:args[0]);bool known=id==Installation.Identity(Util.Root)||Installation.ExistingOrigins(Util.Root,Registry.CurrentUser).Contains("chrome-extension://"+id+"/");
            if(!known&&MessageBox.Show("允许这个 Ruxget 扩展连接桌面版？\n\n扩展标识："+id+"\n仅在你刚才点击 Ruxget 的连接按钮时允许。","连接 Ruxget",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;
            BrowserBridge.Register(id);MessageBox.Show("已连接。回到浏览器，点击 Ruxget 的检查连接或发送下载即可。","Ruxget");return 0;
        }catch(Exception ex){MessageBox.Show(ex.Message,"Ruxget 连接");return 1;}}
        if(args.Length>2&&args[0]=="--gui-download-test")return GuiDownloadTest(args);
        if(args.Length>1&&args[0]=="--native-review-server"){
            using(var manager=new Manager(Path.Combine(args[1],"server-data"))){manager.Config.Folder="C:\\Downloads\\Ruxget";using(var window=new MainWindow(manager)){window.PrepareNativeReview(args[1]);Application.Run(window);}}return 0;
        }
        if(args.Length>1&&args[0]=="--ui-review"){
            try{string folder=Path.GetFullPath(args[1]);using(var manager=new Manager(Path.Combine(folder,"fixture-data"))){manager.Config.Folder="C:\\Downloads\\Ruxget";
                foreach(var data in new[]{new[]{"首次视频任务.mp4","video","准备组件","34.5",""},new[]{"网络工具安装包.zip","file","下载中","62.4","8.6 MB/s"},new[]{"界面样例 · 旅行视频.mp4","video","已完成","100",""},new[]{"界面样例 · 访谈声音.mp3","audio","已暂停","34.2",""},new[]{"资源链接已过期.pdf","file","失败","12.5",""},new[]{"很长的文件名_"+new String('A',180)+".zip","file","排队中","0",""}}){
                    var job=manager.Add("https://downloads.example.test/"+Uri.EscapeDataString(data[0])+"?token="+new String('a',1500),data[1],data[0]);job.Status=data[2];job.Progress=Double.Parse(data[3],System.Globalization.CultureInfo.InvariantCulture);job.Speed=data[4];if(job.Status=="准备组件")job.Stage="正在准备视频组件 · 34%";if(job.Status=="失败")job.Error="下载地址已过期，请回原网页重新获取。";
                }
                typeof(Manager).GetMethod("Save",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(manager,null);
                using(var window=new MainWindow(manager,true))window.Review(folder);
            }Console.WriteLine("UI REVIEW PASSED");return 0;}catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
        }
        if(args.Length>1&&args[0]=="--screenshot"){
            using(var manager=new Manager(Path.Combine(Path.GetDirectoryName(args[1]),"ui-data")))using(var window=new MainWindow(manager,true)){
                window.Show();Application.DoEvents();using(var bitmap=new Bitmap(window.Width,window.Height)){window.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height));bitmap.Save(args[1]);}window.Close();
            }return 0;
        }
        bool owned;using(var mutex=new Mutex(true,"Local\\"+Util.PipeName,out owned)){
            if(!owned){if(args.Contains("--background"))return 0;try{using(var pipe=new NamedPipeClientStream(".",Util.PipeName,PipeDirection.InOut)){pipe.Connect(500);BrowserBridge.WriteFrame(pipe,Encoding.UTF8.GetBytes("{\"action\":\"show\"}"));BrowserBridge.ReadFrame(pipe);}}catch{}return 0;}
            try{using(var manager=new Manager(Path.Combine(Util.Root,"data"))){var window=new MainWindow(manager);if(args.Contains("--background"))window.PrepareBackgroundStart();Application.Run(window);}}
            catch(Exception ex){MessageBox.Show("Ruxget 未能启动："+ex.Message+"\n任务文件已保留。","Ruxget");return 1;}
        }return 0;
    }
    static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
    static int SelfTest(){try{
        Check(Util.Name("../../CON:坏名字.mp4").IndexOf('/')<0,"filename path");Check(Util.Name("CON.txt")=="_CON.txt","reserved filename");
        Check(Util.Name(new String('a',200)+".zip").EndsWith(".zip"),"long filename extension");
        var origins=BrowserBridge.Origins(new[]{"chrome-extension://"+new String('a',32)+"/"},new String('b',32));Check(origins.Length==2&&BrowserBridge.Origins(origins,new String('a',32)).Length==2,"preserve browser connections");
        foreach(var url in new[]{"file:///C:/secret","javascript:alert(1)","https://user:pass@example.com","https://example.com/\r\nx"}){bool refused=false;try{Util.Url(url);}catch{refused=true;}Check(refused,"URL validation");}
        Check(Util.Url("https://example.com/a?x=1&y=2")=="https://example.com/a?x=1&y=2","signed URL");
        var bytes=Encoding.UTF8.GetBytes("{\"title\":\"拾影\"}");using(var stream=new MemoryStream()){BrowserBridge.WriteFrame(stream,bytes);stream.Position=0;Check(Encoding.UTF8.GetString(BrowserBridge.ReadFrame(stream))==Encoding.UTF8.GetString(bytes),"native frame");}
        using(var stream=new MemoryStream(BitConverter.GetBytes(65537))){bool refused=false;try{BrowserBridge.ReadFrame(stream);}catch{refused=true;}Check(refused,"frame limit");}
        Check(!Util.InDirectory("C:\\data2\\x","C:\\data"),"directory boundary");
        var arguments=new[]{"E:\\path with space\\", "a\"b", "https://example.test/a?x=1&y=$(literal)"};
        using(var child=Util.Start(Application.ExecutablePath,new[]{"--echo-args"}.Concat(arguments))){child.Start();string output=child.StandardOutput.ReadToEnd();child.WaitForExit();Check(child.ExitCode==0&&Util.Json().Deserialize<string[]>(output).SequenceEqual(arguments),"process argument quoting");}
        Console.WriteLine("PASS URL validation, filenames, native framing, directory boundary");return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
    static int DownloadTest(string[] args){Manager manager=null;try{
        string directory=Path.GetFullPath(args[2]);manager=new Manager(Path.Combine(directory,"state"));manager.Config.Proxy="";manager.Config.Folder=Path.Combine(directory,"files");manager.Config.Connections=8;string kind=args.Length>3?args[3]:"file";var j=manager.Add(args[1],kind=="tracks-fixture"?"video":kind);if(kind=="tracks-fixture"){Check(new Uri(args[1]).IsLoopback,"track fixture must be local");j.Kind="tracks";j.Height=180;j.VideoUrl=new Uri(new Uri(args[1]),"/video-only.mp4").AbsoluteUri;j.AudioUrl=new Uri(new Uri(args[1]),"/audio-only.m4a").AbsoluteUri;}
        var watch=Stopwatch.StartNew();bool paused=false,resumed=false,progressObserved=false;
            while(watch.Elapsed.TotalSeconds<90){manager.Tick();var state=manager.Snapshot().First(item=>item.Id==j.Id);
                if(state.Status=="下载中"&&state.Progress>0&&state.Progress<100)progressObserved=true;
                if(args.Length>4&&!paused&&watch.Elapsed.TotalSeconds>1){manager.Pause(j.Id);paused=true;}
                if(paused&&!resumed&&state.Status=="已暂停"){Thread.Sleep(1100);if(args[4]=="restart"){manager.Dispose();manager=new Manager(Path.Combine(directory,"state"));manager.Config.Proxy="";}manager.Resume(j.Id);resumed=true;}
                if(state.Status=="已完成"){Console.WriteLine(Util.Json().Serialize(new{ok=true,file=state.File,resumed=resumed,progress=state.Progress,progressObserved=progressObserved}));return 0;}
                if(state.Status=="失败")throw new Exception(state.Error);Thread.Sleep(200);
            }throw new Exception("test timeout");
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}finally{if(manager!=null)manager.Dispose();}}
    static int LifecycleTest(string[] args){try{
        using(var manager=new Manager(Path.Combine(args[2],"state"))){manager.Config.Proxy="";manager.Add(args[1],"file",folder:Path.Combine(args[2],"files"));var worker=Task.Run(()=>manager.Tick());var timer=Stopwatch.StartNew();
            var field=typeof(Manager).GetField("activeProbe",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
            while(timer.ElapsedMilliseconds<10000){var probe=field.GetValue(manager) as HttpWebRequest;if(probe!=null&&probe.Method=="GET")break;Thread.Sleep(20);}
            Thread.Sleep(200);Check(field.GetValue(manager)!=null,"slow probe was not active");timer.Restart();manager.Snapshot();long snapshot=timer.ElapsedMilliseconds;Check(snapshot<250,"UI snapshot blocked on network");timer.Restart();manager.Dispose();long close=timer.ElapsedMilliseconds;Check(close<6500,"close did not abort network probe");Check(worker.Wait(10000),"worker did not stop");Check(manager.Snapshot().First().Status=="已暂停","interrupted task lost its paused state");Console.WriteLine(Util.Json().Serialize(new{ok=true,snapshotMs=snapshot,closeMs=close}));return 0;
        }
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
    static int EngineFailureTest(string[] args){try{using(var manager=new Manager(Path.Combine(args[2],"state"))){var job=manager.Add(args[1],"video",folder:Path.Combine(args[2],"files"));manager.Tick();Check(job.Status=="失败"&&job.Child==null,"failed process retained child handle");manager.Resume(job.Id);Check(manager.Snapshot().First().Status=="排队中","failed process prevented retry");Console.WriteLine("ENGINE FAILURE RECOVERY PASSED");return 0;}}catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
    static int GuiDownloadTest(string[] args){Console.OutputEncoding=new UTF8Encoding(false);Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false)){AutoFlush=true});try{
        Check(new Uri(args[1]).IsLoopback,"GUI fixture must be local");string output=Path.GetFullPath(args[2]);
        using(var manager=new Manager(Path.Combine(output,"state")))using(var window=new MainWindow(manager))using(var timer=new System.Windows.Forms.Timer{Interval=200}){
            manager.Config.Proxy="";manager.Config.Folder=Path.Combine(output,"files");bool clicked=false,ok=false;string file="",error="";DateTime? completed=null;var watch=Stopwatch.StartNew();
            window.Shown+=(s,e)=>window.BeginInvoke(new Action(()=>window.NewDownload(new Dictionary<string,object>{{"url",args[1]},{"kind","file"},{"title","图形界面验收.bin"}})));
            timer.Tick+=(s,e)=>{
                var dialog=Application.OpenForms.Cast<Form>().FirstOrDefault(form=>form.Text=="新建下载");
                if(!clicked&&dialog!=null){clicked=true;dialog.Controls.OfType<Button>().First(button=>button.Text=="开始下载").PerformClick();}
                var job=manager.Snapshot().FirstOrDefault();
                if(job!=null&&job.Status=="已完成"){
                    if(completed==null)completed=DateTime.UtcNow;
                    if((DateTime.UtcNow-completed.Value).TotalMilliseconds>900){ok=true;file=job.File;using(var bitmap=new Bitmap(window.Width,window.Height)){window.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(Path.Combine(output,"gui-complete.png"));}timer.Stop();window.Close();}
                }else if(job!=null&&job.Status=="失败"||watch.Elapsed.TotalSeconds>40){error=job==null?"GUI download timeout":job.Error;timer.Stop();if(dialog!=null)dialog.Close();window.Close();}
            };
            timer.Start();Application.Run(window);Console.WriteLine(Util.Json().Serialize(new{ok=ok,file=file,clickedRealStartButton=clicked,error=error}));return ok?0:1;
        }
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
}

// Playlist preview and selected-item insertion. Metadata reads never create jobs.
namespace ShiyingDesktop {
public class PlaylistEntry {public string url,title,duration;public bool available;}
public class PlaylistCatalog {public string title;public PlaylistEntry[] entries;public bool hasMore;}
public static class Playlist {
    public static string Source(string value) {
        var u=new Uri(Util.Url(value));
        if(u.Scheme!="https"||!u.IsDefaultPort)throw new Exception("请使用完整的 HTTPS 播放列表网址");
        var match=Regex.Match(u.Query,@"(?:^|[?&])list=([\w-]{10,100})(?:&|$)");
        if(new[]{"youtube.com","www.youtube.com","m.youtube.com","youtu.be"}.Contains(u.Host)&&match.Success)return "https://www.youtube.com/playlist?list="+match.Groups[1].Value;
        match=Regex.Match(u.AbsolutePath,@"^/video/(BV\w+|av\d+)",RegexOptions.IgnoreCase);
        if(new[]{"bilibili.com","www.bilibili.com"}.Contains(u.Host)&&match.Success)return "https://www.bilibili.com/video/"+match.Groups[1].Value+"/";
        throw new Exception("支持 YouTube 播放列表和 B站多 P 视频");
    }
    public static PlaylistCatalog Parse(string json) {
        var data=Util.Json().Deserialize<Dictionary<string,object>>(json);object raw;
        if(data==null||!data.TryGetValue("entries",out raw)||!(raw is IEnumerable))throw new Exception("没有读到播放列表，尚未添加下载");
        var entries=new List<PlaylistEntry>();var seen=new HashSet<string>();bool more=false;
        foreach(var entry in (IEnumerable)raw) {
            var item=entry as Dictionary<string,object>;if(item==null)continue;
            string url=Util.Str(item,"webpage_url",Util.Str(item,"url")),id=Util.Str(item,"id");
            if(Regex.IsMatch(id,@"^[\w-]{11}$")&&!url.StartsWith("https://"))url="https://www.youtube.com/watch?v="+id;
            try{
                var u=new Uri(Util.Url(url));
                if(u.Scheme!="https"||!u.IsDefaultPort||!new[]{"youtube.com","www.youtube.com","m.youtube.com","youtu.be","bilibili.com","www.bilibili.com"}.Contains(u.Host))continue;
                if(!seen.Add(url))continue;if(entries.Count>=100){more=true;break;}
                string availability=Util.Str(item,"availability");
                entries.Add(new PlaylistEntry{url=url,title=Util.Str(item,"title",id),duration=Util.Str(item,"duration"),available=!new[]{"private","premium_only","subscriber_only","needs_auth","unavailable"}.Contains(availability)&&!new[]{"[Deleted video]","[Private video]"}.Contains(Util.Str(item,"title"))});
            }catch{continue;}
        }
        if(entries.Count==0)throw new Exception("列表为空或无法访问，尚未添加下载");
        return new PlaylistCatalog{title=Util.Str(data,"title","播放列表"),entries=entries.ToArray(),hasMore=more};
    }
    public static PlaylistCatalog Read(Manager manager,string value,Action<ComponentProgress> progress,CancellationToken cancel) {
        string url=Source(value);
        manager.Components.Ensure(new[]{"yt-dlp.exe"},manager.Config.Proxy,progress,cancel);
        using(var process=Util.Start(Path.Combine(Util.Root,"bin","yt-dlp.exe"),new[]{"--ignore-config","--skip-download","--flat-playlist","--dump-single-json","--playlist-end","101","--yes-playlist","--no-cache-dir","--socket-timeout","15","--retries","1","--proxy",manager.Config.Proxy,"--",url})) {
            var output=new StringBuilder();var errors=new StringBuilder();bool overflow=false;
            process.OutputDataReceived+=(s,e)=>{if(e.Data!=null){if(output.Length+e.Data.Length>4*1024*1024){overflow=true;Util.KillTree(process);}else output.AppendLine(e.Data);}};
            process.ErrorDataReceived+=(s,e)=>{if(e.Data!=null&&errors.Length<4000)errors.AppendLine(e.Data);};
            cancel.ThrowIfCancellationRequested();process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();
            using(cancel.Register(()=>System.Threading.Tasks.Task.Run(()=>Util.KillTree(process)))){if(!process.WaitForExit(60000)){Util.KillTree(process);throw new Exception("读取列表超时，请检查网络后重试；尚未添加下载");}process.WaitForExit();}
            cancel.ThrowIfCancellationRequested();if(overflow)throw new Exception("列表信息过大，请使用较小的播放列表");
            if(process.ExitCode!=0)throw new Exception("读取列表失败："+Util.SafeError(errors.ToString()));
            return Parse(output.ToString());
        }
    }
}
public partial class Manager {
    public int AddPlaylist(PlaylistEntry[] entries,string kind,string folder,int height,bool categorize) {
        if(entries==null||entries.Length<1||entries.Length>100||!new[]{"video","audio"}.Contains(kind)||entries.Any(e=>e==null||!e.available))throw new Exception("请勾选可下载的条目");
        lock(gate){CanAdd(entries.Length);var added=entries.GroupBy(e=>e.url).Select(g=>g.First()).Select(e=>CreateDownload(e.url,kind,e.title,height,folder,null,categorize)).ToArray();jobs.AddRange(added);try{Save();}catch{foreach(var job in added)jobs.Remove(job);PublishSnapshot();throw;}return added.Length;}
    }
}
}
