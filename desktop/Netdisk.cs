// Built-in netdisk handoff. GPL-3.0-or-later; browser adapters retain their AGPL notice.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ShiyingDesktop {
static class Netdisk {
    internal static readonly Dictionary<string,string[]> Pages=new Dictionary<string,string[]>{
        {"baidu",new[]{"pan.baidu.com","yun.baidu.com"}},{"aliyun",new[]{"www.alipan.com","www.aliyundrive.com"}},
        {"mcloud",new[]{"yun.139.com","caiyun.139.com"}},{"tcloud",new[]{"cloud.189.cn"}},{"xunlei",new[]{"pan.xunlei.com"}},
        {"quark",new[]{"pan.quark.cn"}},{"uc",new[]{"drive.uc.cn"}},
        {"pan123",new[]{"www.123pan.com","www.123pan.cn","www.123684.com","www.123865.com","www.123952.com","www.123912.com"}}};
    internal static readonly Dictionary<string,string[]> Domains=new Dictionary<string,string[]>{
        {"baidu",new[]{"baidu.com","baidupcs.com","baidupcs.cn"}},{"aliyun",new[]{"alipan.com","aliyundrive.com","aliyundrive.net","aliyuncs.com","alicdn.com"}},
        {"mcloud",new[]{"139.com","cmecloud.cn","139cloud.com","cmcc-cs.cn"}},{"tcloud",new[]{"189.cn","ctyun.cn","ctyunxs.cn","21cn.com","cloud189.cn"}},
        {"xunlei",new[]{"xunlei.com","xunlei.net","xycdn.com","sandai.net","onethingpcs.com"}},{"quark",new[]{"quark.cn","quarkcdn.com","aliyuncs.com"}},
        {"uc",new[]{"uc.cn","ucweb.com","yunpan.cn","aliyuncs.com"}},{"pan123",new[]{"123pan.com","123pan.cn","123684.com","123865.com","123952.com","123912.com","123panx.com","guest-share-free-download-cdn.123295.com","user-app-pay-download-cdn.123295.com","pd1.cjjd19.com"}}};
    internal static Uri Url(string provider,string value,bool localOnly=false){
        var uri=new Uri(Util.Url(value));string[] domains;
        if(!Domains.TryGetValue(provider,out domains)||!(localOnly?uri.IsLoopback:uri.Scheme=="https"&&uri.IsDefaultPort&&domains.Any(domain=>uri.Host==domain||uri.Host.EndsWith("."+domain,StringComparison.OrdinalIgnoreCase))))throw new Exception("网盘下载域名尚未适配："+uri.Host+"，请继续使用网盘原下载按钮");return uri;
    }
    internal static string Protect(string value){return String.IsNullOrEmpty(value)?"":Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value),Encoding.UTF8.GetBytes("Shiying.Netdisk.v1"),DataProtectionScope.CurrentUser));}
    internal static string Cookie(Download job){try{return String.IsNullOrEmpty(job.NetdiskCookie)?"":Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(job.NetdiskCookie),Encoding.UTF8.GetBytes("Shiying.Netdisk.v1"),DataProtectionScope.CurrentUser));}catch{throw new Exception("网盘登录信息无法恢复，请回到网盘重新点击 Ruxget 下载");}}
    internal static string Source(Download job){return String.IsNullOrEmpty(job.NetdiskUrl)?job.Url:Cookie(new Download{NetdiskCookie=job.NetdiskUrl});}
}
public partial class Manager {
    internal bool NetdiskLocalOnly=false;
    TcpListener netdiskRelay;
    readonly object relayGate=new object();
    readonly Dictionary<string,Download> relayJobs=new Dictionary<string,Download>();
    readonly HashSet<HttpWebRequest> relayRequests=new HashSet<HttpWebRequest>();
    readonly string relayKey=Guid.NewGuid().ToString("N");
    readonly SemaphoreSlim relaySlots=new SemaphoreSlim(64,64);
    public object AddNetdisk(IDictionary<string,object> input){lock(gate){
        if(closing)throw new Exception("Ruxget 正在退出，请稍后重试");
        string provider=Util.Str(input,"provider"),requestId=Util.Str(input,"requestId");string[] pages;
        var source=new Uri(Util.Url(Util.Str(input,"source")));
        if(!Netdisk.Pages.TryGetValue(provider,out pages)||source.Scheme!="https"||!source.IsDefaultPort||!(pages.Contains(source.Host)||provider=="pan123"&&Regex.IsMatch(source.Host,@"^[a-z0-9-]+\.share\.123pan\.cn$"))||!Regex.IsMatch(requestId,@"^[a-f0-9]{32}$"))throw new Exception("网盘来源无效");
        object raw;if(!input.TryGetValue("files",out raw)||!(raw is IEnumerable)||raw is string)throw new Exception("网盘文件列表无效");
        var records=((IEnumerable)raw).Cast<object>().ToArray();if(records.Length<1||records.Length>100)throw new Exception("一次请选择 1–100 个文件");
        var proposed=new List<Download>();var ids=new HashSet<string>();
        foreach(var record in records){
            var item=record as IDictionary<string,object>;if(item==null)throw new Exception("网盘文件无效");
            string url=Netdisk.Url(provider,Util.Str(item,"url"),NetdiskLocalOnly).AbsoluteUri,title=Util.Str(item,"title"),key=Util.Str(item,"key");int index;
            if(title.Length<1||title.Length>512||key.Length>256||key.Any(Char.IsControl)||!Int32.TryParse(Util.Str(item,"index"),out index)||index<0||index>99)throw new Exception("网盘文件名或标识无效");
            string id;using(var hash=SHA256.Create())id=String.Concat(hash.ComputeHash(Encoding.UTF8.GetBytes(provider+requestId+":"+index)).Take(8).Select(b=>b.ToString("x2")));
            if(!ids.Add(id))throw new Exception("网盘文件列表包含重复项");
            var existing=jobs.FirstOrDefault(j=>j.Id==id);if(existing!=null){if(Netdisk.Source(existing)!=url||existing.Title!=Util.Name(title))throw new Exception("重复请求的内容不一致");continue;}
            var headers=item.ContainsKey("headers")?item["headers"] as IDictionary<string,object>:null;
            string cookie="",agent="",referer=source.GetLeftPart(UriPartial.Authority)+"/";
            if(headers!=null)foreach(var entry in headers){string value=Convert.ToString(entry.Value);if(value.Length>16384||value.Any(c=>c=='\r'||c=='\n'||c=='\0'))throw new Exception("网盘请求头无效");switch(entry.Key){case "Cookie":cookie=value;break;case "User-Agent":if(value.Length>512)throw new Exception("网盘浏览器信息无效");agent=value;break;case "Referer":if(value!=referer)throw new Exception("网盘引用页面不匹配");break;default:throw new Exception("不支持的文件请求头");}}
            var job=CreateDownload(url,"file",title,1080,null,new Dictionary<string,object>{{"referer",referer},{"userAgent",agent}},null);
            long declared=TransferData.Number(item,"size");if(item.ContainsKey("size")&&item["size"]!=null&&declared<0)throw new Exception("网盘文件大小无效");
            job.Id=id;job.NetdiskProvider=provider;job.NetdiskFileKey=key;job.NetdiskCookie=Netdisk.Protect(cookie);job.NetdiskUrl=Netdisk.Protect(url);job.Url=new Uri(url).GetLeftPart(UriPartial.Path);job.NetdiskSize=declared;job.Transfer.Total=declared;proposed.Add(job);
        }
        if(proposed.Count>0)CanAdd(proposed.Count);jobs.AddRange(proposed);try{Save();}catch{foreach(var job in proposed)jobs.Remove(job);PublishSnapshot();throw;}
        return new{ok=true,count=records.Length,added=proposed.Count,stage="queued",folder=Config.Folder,version=Util.Version};
    }}
    sealed class NetdiskResponse:IDisposable {
        public HttpWebRequest Request;public HttpWebResponse Response;public Action Release;
        public void Dispose(){if(Response!=null)Response.Dispose();if(Request!=null)Request.Abort();if(Release!=null)Release();}
    }
    NetdiskResponse OpenNetdisk(Download job,string range,bool metadata){
        Uri original=Netdisk.Url(job.NetdiskProvider,Netdisk.Source(job),NetdiskLocalOnly),current=original;var jar=new CookieContainer(512,128,8192);
        bool cookieAllowed=NetdiskLocalOnly||job.NetdiskProvider=="quark"&&(original.Host=="quark.cn"||original.Host.EndsWith(".quark.cn"))||job.NetdiskProvider=="uc"&&(original.Host=="uc.cn"||original.Host.EndsWith(".uc.cn"));
        if(cookieAllowed)foreach(string pair in Netdisk.Cookie(job).Split(';')){int equal=pair.IndexOf('=');if(equal<1)continue;string name=pair.Substring(0,equal).Trim(),value=pair.Substring(equal+1).Trim();if(name.Length>0)jar.Add(original,new Cookie(name,value));}
        for(int hop=0;hop<8;hop++){
            if(closing)throw new OperationCanceledException();Netdisk.Url(job.NetdiskProvider,current.AbsoluteUri,NetdiskLocalOnly);
            var request=(HttpWebRequest)WebRequest.Create(current);request.Proxy=current.IsLoopback||ProxyUrl.Length==0?null:new WebProxy(ProxyUrl);request.Method="GET";request.AllowAutoRedirect=false;request.CookieContainer=jar;request.KeepAlive=false;request.Timeout=10000;request.ReadWriteTimeout=10000;request.UserAgent=job.UserAgent;request.Referer=job.Referer;request.Headers[HttpRequestHeader.AcceptEncoding]="identity";
            if(!String.IsNullOrEmpty(range)){var match=Regex.Match(range,@"^bytes=(\d+)-(\d*)$");long first,last;if(!match.Success||!Int64.TryParse(match.Groups[1].Value,out first)||match.Groups[2].Length>0&&!Int64.TryParse(match.Groups[2].Value,out last))throw new Exception("文件范围无效");if(match.Groups[2].Length==0)request.AddRange(first);else request.AddRange(first,Int64.Parse(match.Groups[2].Value));}
            lock(relayGate){if(closing){request.Abort();throw new OperationCanceledException();}relayRequests.Add(request);}if(metadata)activeProbe=request;
            HttpWebResponse response=null;
            try{
                try{response=(HttpWebResponse)request.GetResponse();}catch(WebException ex){response=ex.Response as HttpWebResponse;if(response==null)throw;}
                int code=(int)response.StatusCode;
                if(code>=300&&code<400){string location=response.Headers[HttpResponseHeader.Location];if(String.IsNullOrEmpty(location))throw new Exception("网盘返回了无效跳转");current=new Uri(current,location);response.Dispose();request.Abort();lock(relayGate)relayRequests.Remove(request);continue;}
                var result=new NetdiskResponse{Request=request,Response=response};result.Release=()=>{lock(relayGate)relayRequests.Remove(request);if(metadata&&activeProbe==request)activeProbe=null;};return result;
            }catch{if(response!=null)response.Dispose();request.Abort();lock(relayGate)relayRequests.Remove(request);if(metadata&&activeProbe==request)activeProbe=null;throw;}
        }
        throw new Exception("网盘下载地址跳转过多，请重新获取链接");
    }
    RemoteMetadata NetdiskMetadata(Download job){using(var opened=OpenNetdisk(job,"bytes=0-0",true)){
        var response=opened.Response;long size=response.ContentLength;bool? resume=null;
        if(response.StatusCode==HttpStatusCode.Unauthorized||response.StatusCode==HttpStatusCode.Forbidden)throw new Exception("网盘登录或下载链接已过期，请回到网盘重新获取");
        if(response.StatusCode==HttpStatusCode.OK)resume=false;
        else if(response.StatusCode==HttpStatusCode.PartialContent){var range=Regex.Match(response.Headers[HttpResponseHeader.ContentRange]??"",@"^bytes 0-0/(\d+)$");long total;if(range.Success&&Int64.TryParse(range.Groups[1].Value,out total)&&total>0){size=total;resume=true;}else size=-1;}
        else if(response.StatusCode==HttpStatusCode.RequestedRangeNotSatisfiable&&response.Headers[HttpResponseHeader.ContentRange]=="bytes */0"){size=0;resume=false;}
        else throw new Exception("网盘返回 HTTP "+(int)response.StatusCode+"，请刷新网盘后重试");
        if(job.NetdiskSize>=0&&size>=0&&job.NetdiskSize!=size)throw new Exception("网盘返回的文件大小不匹配，请回到网盘重新获取链接");
        return new RemoteMetadata{ETag=response.Headers[HttpResponseHeader.ETag],Modified=response.Headers[HttpResponseHeader.LastModified],Name=ResponseName(response.Headers["Content-Disposition"]),Size=size,Resume=resume};
    }}
    string NetdiskRelayUrl(Download job){lock(relayGate){
        if(netdiskRelay==null){netdiskRelay=new TcpListener(IPAddress.Loopback,0);netdiskRelay.Start(64);var listener=netdiskRelay;Task.Run(()=>{while(!closing)try{var client=listener.AcceptTcpClient();if(!relaySlots.Wait(0)){client.Close();continue;}Task.Run(()=>{try{ServeNetdisk(client);}finally{relaySlots.Release();}});}catch{if(closing)break;Thread.Sleep(50);}});}
        relayJobs[job.Id]=job;return "http://127.0.0.1:"+((IPEndPoint)netdiskRelay.LocalEndpoint).Port+"/"+relayKey+"/"+job.Id;
    }}
    void ServeNetdisk(TcpClient client){using(client){try{
        client.ReceiveTimeout=client.SendTimeout=10000;using(var stream=client.GetStream()){
            var head=new List<byte>();int next;while(head.Count<16384&&(next=stream.ReadByte())>=0){head.Add((byte)next);int n=head.Count;if(n>=4&&head[n-4]==13&&head[n-3]==10&&head[n-2]==13&&head[n-1]==10)break;}
            string[] lines=Encoding.ASCII.GetString(head.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.None),first=lines[0].Split(' ');Download job=null;
            if(first.Length==3&&first[0]=="GET"&&first[1].StartsWith("/"+relayKey+"/",StringComparison.Ordinal)){string id=first[1].Substring(relayKey.Length+2);lock(relayGate)relayJobs.TryGetValue(id,out job);}
            if(job==null||closing){byte[] denied=Encoding.ASCII.GetBytes("HTTP/1.0 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");stream.Write(denied,0,denied.Length);return;}
            string range=lines.FirstOrDefault(line=>line.StartsWith("Range:",StringComparison.OrdinalIgnoreCase));using(var opened=OpenNetdisk(job,range==null?null:range.Substring(6).Trim(),false)){
                var response=opened.Response;var responseHead=new StringBuilder("HTTP/1.0 "+(int)response.StatusCode+" Response\r\nConnection: close\r\n");
                if(response.ContentLength>=0)responseHead.Append("Content-Length: "+response.ContentLength+"\r\n");foreach(string key in new[]{"Content-Range","Accept-Ranges","ETag","Last-Modified","Content-Type"}){string value=response.Headers[key];if(!String.IsNullOrEmpty(value)&&!value.Contains("\r")&&!value.Contains("\n"))responseHead.Append(key+": "+value+"\r\n");}
                byte[] bytes=Encoding.UTF8.GetBytes(responseHead+"\r\n");stream.Write(bytes,0,bytes.Length);using(var input=response.GetResponseStream())input.CopyTo(stream,65536);
            }
        }
    }catch{}}}
    void CloseNetdisk(){lock(relayGate){if(netdiskRelay!=null)netdiskRelay.Stop();foreach(var request in relayRequests.ToArray())try{request.Abort();}catch{}relayJobs.Clear();}}
}
public partial class MainWindow {
    bool startingInBackground;
    protected override bool ShowWithoutActivation {get{return startingInBackground||base.ShowWithoutActivation;}}
    public void PrepareBackgroundStart(){startingInBackground=true;Opacity=0;ShowInTaskbar=false;Shown+=(s,e)=>{Hide();Opacity=1;ShowInTaskbar=true;startingInBackground=false;};}
    internal object AcceptNetdisk(IDictionary<string,object> input){if(closingWindow||IsDisposed)throw new Exception("Ruxget 正在退出，请稍后重试");return manager.AddNetdisk(input);}
    internal void PickNetdiskFolder(){if(closingWindow||IsDisposed)return;RestoreFromTray();string folder=PickFolder(this,manager.Config.Folder);if(folder!=null)SetDefaultFolder(folder);}
}
}
