// Pinned, hash-checked first-use components. No remote manifests or self-update. GPL-3.0.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace ShiyingDesktop {
public class ComponentSpec {
    public string name, version, sha256, sourceURL, url, downloadSha256, archiveEntry;
    public long bytes, downloadBytes;
    public bool bundled;
}
class ComponentManifest {public ComponentSpec[] components=new ComponentSpec[0];}
public class ComponentProgress {public string Name, Message;public double Percent;public long Received, Total;}
public class ComponentStore {
    readonly string root;
    public readonly ComponentSpec[] Specs;
    readonly Dictionary<string,string> checkedFiles=new Dictionary<string,string>();
    readonly object checkGate=new object();
    readonly SemaphoreSlim prepareGate=new SemaphoreSlim(1,1);
    public ComponentStore(string directory,ComponentSpec[] specs=null){
        root=Path.GetFullPath(directory);Specs=specs??Util.Json().Deserialize<ComponentManifest>(File.ReadAllText(Path.Combine(root,"components.json"),Encoding.UTF8)).components;
        if(Specs==null||Specs.Length==0||Specs.Select(s=>s.name).Distinct().Count()!=Specs.Length)throw new Exception("组件清单无效，请重新安装 Ruxget");
        foreach(var s in Specs){if(!new[]{"aria2c.exe","yt-dlp.exe","ffmpeg.exe","node.exe"}.Contains(s.name)||s.bytes<=0||!HashText(s.sha256))throw new Exception("组件清单无效");
            if(!s.bundled){Uri uri;if(!Uri.TryCreate(s.url,UriKind.Absolute,out uri)||(uri.Scheme!="https"&&!uri.IsLoopback)||s.downloadBytes<=0||!HashText(s.downloadSha256))throw new Exception("组件下载来源无效");}}
    }
    static bool HashText(string value){return value!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,@"^[a-f0-9]{64}$");}
    public static string Hash(string path){using(var sha=SHA256.Create())using(var stream=File.OpenRead(path))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
    public static bool NeedsNode(Download job){string path=new Uri(job.Url).AbsolutePath;return job.Kind!="tracks"&&!path.EndsWith(".m3u8",StringComparison.OrdinalIgnoreCase)&&!path.EndsWith(".mpd",StringComparison.OrdinalIgnoreCase);}
    public string[] Needed(Download job){return job.Kind=="file"?new[]{"aria2c.exe"}:NeedsNode(job)?new[]{"yt-dlp.exe","ffmpeg.exe","node.exe"}:new[]{"yt-dlp.exe","ffmpeg.exe"};}
    public bool Ready(string name){
        var spec=Specs.Single(s=>s.name==name);string file=Path.Combine(root,"bin",name);if(!File.Exists(file))return false;
        var info=new FileInfo(file);if(info.Length!=spec.bytes)return false;string stamp=info.Length+":"+info.LastWriteTimeUtc.Ticks;
        lock(checkGate){string previous;if(checkedFiles.TryGetValue(name,out previous)&&previous==stamp)return true;}
        bool valid=Hash(file)==spec.sha256;if(valid)lock(checkGate)checkedFiles[name]=stamp;return valid;
    }
    public bool Ready(Download job){return Needed(job).All(Ready);}
    public void Ensure(IEnumerable<string> names,string proxy,Action<ComponentProgress> report,CancellationToken cancel){
        prepareGate.Wait(cancel);try{EnsureCore(names,proxy,report,cancel);}finally{prepareGate.Release();}
    }
    void EnsureCore(IEnumerable<string> names,string proxy,Action<ComponentProgress> report,CancellationToken cancel){
        var needed=names.Distinct().Select(name=>Specs.Single(s=>s.name==name)).ToArray();
        for(int n=0;n<needed.Length;n++){
            cancel.ThrowIfCancellationRequested();var spec=needed[n];if(Ready(spec.name))continue;
            if(spec.bundled)throw new Exception("核心下载组件损坏，请重新运行 Ruxget 安装器");
            int index=n;Action<long,long,string> update=(done,total,stage)=>{if(report!=null)report(new ComponentProgress{Name=spec.name,Received=done,Total=total,Percent=100.0*(index+(total>0?(double)done/total:0))/needed.Length,Message=stage+"（"+(index+1)+"/"+needed.Length+"）："+spec.name+(total>0?" · "+Math.Min(100,(int)(100.0*done/total))+"%":"")});};
            string cache=Path.Combine(root,"data","components");Directory.CreateDirectory(cache);Directory.CreateDirectory(Path.Combine(root,"bin"));
            string download=Path.Combine(cache,spec.name+"-"+spec.version+".download"),prepared=Path.Combine(root,"bin",spec.name+".preparing");
            Fetch(spec,download,proxy,update,cancel);update(spec.downloadBytes,spec.downloadBytes,"正在校验组件");cancel.ThrowIfCancellationRequested();
            if(Hash(download)!=spec.downloadSha256){File.Move(download,download+".invalid-"+DateTime.UtcNow.Ticks);throw new Exception("组件校验失败，未安装或运行。请检查网络后重试");}
            try{
                if(String.IsNullOrEmpty(spec.archiveEntry)){using(var input=File.OpenRead(download))using(var output=new FileStream(prepared,FileMode.Create,FileAccess.Write))Copy(input,output,spec.bytes,cancel);}
                else using(var zip=ZipFile.OpenRead(download)){var entry=zip.GetEntry(spec.archiveEntry);if(entry==null||entry.Length!=spec.bytes)throw new Exception("组件压缩包内容不匹配");using(var input=entry.Open())using(var output=new FileStream(prepared,FileMode.Create,FileAccess.Write))Copy(input,output,spec.bytes,cancel);}
                if(new FileInfo(prepared).Length!=spec.bytes||Hash(prepared)!=spec.sha256)throw new Exception("组件文件校验失败，未安装或运行");cancel.ThrowIfCancellationRequested();
                string target=Path.Combine(root,"bin",spec.name);if(File.Exists(target))File.Replace(prepared,target,null);else File.Move(prepared,target);
                lock(checkGate)checkedFiles.Remove(spec.name);File.Delete(download);update(spec.downloadBytes,spec.downloadBytes,"组件已就绪");
            }finally{if(File.Exists(prepared))File.Delete(prepared);}
        }
    }
    static void Copy(Stream input,Stream output,long maximum,CancellationToken cancel){byte[] buffer=new byte[65536];long total=0;int count;while((count=input.Read(buffer,0,buffer.Length))>0){cancel.ThrowIfCancellationRequested();total+=count;if(total>maximum)throw new Exception("组件内容超过预期大小");output.Write(buffer,0,count);}if(total!=maximum)throw new Exception("组件尚未下载完整，请重试");}
    void Fetch(ComponentSpec spec,string file,string proxy,Action<long,long,string> report,CancellationToken cancel){
        for(int attempt=0;;attempt++)try{FetchOnce(spec,file,proxy,report,cancel);return;}
        catch(WebException error){
            cancel.ThrowIfCancellationRequested();var response=error.Response as HttpWebResponse;int code=response==null?0:(int)response.StatusCode;if(response!=null)response.Close();
            bool transient=code==408||code==429||code==500||code==502||code==503||code==504||code==0&&new[]{WebExceptionStatus.ConnectFailure,WebExceptionStatus.ConnectionClosed,WebExceptionStatus.KeepAliveFailure,WebExceptionStatus.NameResolutionFailure,WebExceptionStatus.ProxyNameResolutionFailure,WebExceptionStatus.ReceiveFailure,WebExceptionStatus.SendFailure,WebExceptionStatus.Timeout,WebExceptionStatus.PipelineFailure}.Contains(error.Status);
            if(!transient||attempt>=2)throw new Exception("视频组件未准备完成"+(code>0?"（HTTP "+code+"）":"")+"；已保留下载进度。请检查网络或代理后点击「继续 / 重试」",error);
            report(File.Exists(file)?new FileInfo(file).Length:0,spec.downloadBytes,"连接中断，正在自动重试（"+(attempt+1)+"/2）");
            if(cancel.WaitHandle.WaitOne(500*(attempt+1)))cancel.ThrowIfCancellationRequested();
        }
    }
    static int ReadNetwork(Stream input,byte[] buffer){try{return input.Read(buffer,0,buffer.Length);}catch(IOException error){throw new WebException("组件下载连接中断",error,WebExceptionStatus.ReceiveFailure,null);}}
    void FetchOnce(ComponentSpec spec,string file,string proxy,Action<long,long,string> report,CancellationToken cancel){
        long offset=File.Exists(file)?new FileInfo(file).Length:0;if(offset>spec.downloadBytes){File.Move(file,file+".invalid-"+DateTime.UtcNow.Ticks);offset=0;}if(offset==spec.downloadBytes)return;
        ServicePointManager.SecurityProtocol|=(SecurityProtocolType)3072;
        var request=(HttpWebRequest)WebRequest.Create(spec.url);request.UserAgent="Shiying/"+Util.Version;request.Timeout=30000;request.ReadWriteTimeout=30000;request.Proxy=new Uri(spec.url).IsLoopback||String.IsNullOrEmpty(proxy)?null:new WebProxy(proxy);if(offset>0)request.AddRange(offset);
        using(cancel.Register(()=>request.Abort())){
            cancel.ThrowIfCancellationRequested();using(var response=(HttpWebResponse)request.GetResponse()){
                if(response.ResponseUri.Scheme!="https"&&!response.ResponseUri.IsLoopback)throw new Exception("组件下载被重定向到不安全地址");
                bool resumed=offset>0&&response.StatusCode==HttpStatusCode.PartialContent;
                if(resumed){string expected="bytes "+offset+"-";if(!(response.Headers["Content-Range"]??"").StartsWith(expected))throw new Exception("组件续传范围不匹配，请重试");}else offset=0;
                if(response.ContentLength>=0&&response.ContentLength!=spec.downloadBytes-offset)throw new Exception("组件下载大小与固定版本不一致");
                using(var input=response.GetResponseStream())using(var output=new FileStream(file,resumed?FileMode.Append:FileMode.Create,FileAccess.Write,FileShare.Read)){
                    byte[] buffer=new byte[65536];int count;long received=offset,last=0;report(received,spec.downloadBytes,"正在准备组件");
                    while((count=ReadNetwork(input,buffer))>0){cancel.ThrowIfCancellationRequested();received+=count;if(received>spec.downloadBytes)throw new Exception("组件下载超过预期大小");output.Write(buffer,0,count);long now=DateTime.UtcNow.Ticks;if(now-last>TimeSpan.TicksPerMillisecond*150||received==spec.downloadBytes){last=now;report(received,spec.downloadBytes,"正在准备组件");}}
                    if(received!=spec.downloadBytes)throw new WebException("组件下载连接提前关闭",WebExceptionStatus.ReceiveFailure);
                }
            }
        }
    }
}
}
