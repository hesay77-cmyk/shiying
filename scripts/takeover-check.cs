// Desktop side of download takeover: the link probe decides whether Chrome's paused copy may be cancelled.
// Local loopback fixture server only. Never opens a window or touches real tasks.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using ShiyingDesktop;
class TakeoverCheck {
    static readonly List<string> checks=new List<string>();
    static readonly List<string> seen=new List<string>();
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);Console.WriteLine("PASS "+name);}
    static string Refusal(Action action){try{action();return null;}catch(Exception ex){return ex.Message;}}
    // A tiny HTTP server: each path answers the way a real site would for that case.
    static void Serve(TcpListener listener){
        while(true){TcpClient client;try{client=listener.AcceptTcpClient();}catch{return;}
            using(client)using(var stream=client.GetStream()){
                var reader=new StreamReader(stream,Encoding.ASCII);string first=reader.ReadLine()??"",line;var headers=new StringBuilder();
                while(!String.IsNullOrEmpty(line=reader.ReadLine()))headers.Append(line).Append('\n');
                string path=first.Split(' ').Skip(1).FirstOrDefault()??"";lock(seen)seen.Add(path+"\n"+headers);
                string head,body="";
                if(path=="/file.bin")head="HTTP/1.1 206 Partial Content\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes 0-0/1000\r\nContent-Disposition: attachment; filename=\"server-name.bin\"\r\nContent-Length: 1\r\n";
                else if(path=="/login"){body="<!doctype html><title>Sign in</title>";head="HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+body.Length+"\r\n";}
                else if(path=="/forbidden")head="HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n";
                else if(path=="/empty.txt")head="HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */0\r\nContent-Length: 0\r\n";
                else head="HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n";
                byte[] bytes=Encoding.ASCII.GetBytes(head+"Connection: close\r\n\r\n"+(path=="/file.bin"?"x":body));stream.Write(bytes,0,bytes.Length);
            }}
    }
    static Dictionary<string,object> Input(string url,string name=""){return new Dictionary<string,object>{{"action","takeover"},{"url",url},{"referer","https://pages.example.test/list"},{"userAgent","Mozilla/5.0 Fixture"},{"name",name}};}
    static int Main(string[] args){try{
        string root=Path.GetFullPath(args[0]);if(root.IndexOf("\\reports\\takeover-",StringComparison.OrdinalIgnoreCase)<0)throw new Exception("Fixture root must be a takeover-check report");
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();int port=((IPEndPoint)listener.LocalEndpoint).Port;new Thread(()=>Serve(listener)){IsBackground=true}.Start();
        string server="http://127.0.0.1:"+port;
        using(var manager=new Manager(Path.Combine(root,"state"))){
            var job=manager.Takeover(Input(server+"/file.bin","Chrome 给的名字.bin"));
            Check(manager.Snapshot().Any(item=>item.Id==job.Id&&item.Kind=="file"&&item.Url==server+"/file.bin"),"a direct file link is added as a file task");
            Check(job.Title=="Chrome 给的名字.bin","Chrome's file name is kept");
            Check(job.Referer=="https://pages.example.test/list"&&job.UserAgent=="Mozilla/5.0 Fixture","source page and browser name travel with the task");
            string probe;lock(seen)probe=seen.First(entry=>entry.StartsWith("/file.bin"));
            Check(probe.Contains("Referer: https://pages.example.test/list")&&probe.Contains("User-Agent: Mozilla/5.0 Fixture")&&probe.Contains("Range: bytes=0-0"),"the probe asks for one byte with the page's Referer and User-Agent");
            var unnamed=manager.Takeover(Input(server+"/file.bin"));Check(unnamed.AutoName,"without Chrome's name the server's name is used later");
            Check(manager.Takeover(Input(server+"/empty.txt"))!=null,"an empty file (416 for a byte range) is still taken");
            int before=manager.Snapshot().Count;
            string login=Refusal(()=>manager.Takeover(Input(server+"/login")));Check(login!=null&&login.Contains("登录"),"a login page goes back to Chrome");
            string forbidden=Refusal(()=>manager.Takeover(Input(server+"/forbidden")));Check(forbidden!=null&&forbidden.Contains("Chrome"),"a refused link goes back to Chrome");
            listener.Stop();
            string offline=Refusal(()=>manager.Takeover(Input(server+"/file.bin")));Check(offline!=null&&offline.Contains("Chrome"),"an unreachable server goes back to Chrome");
            Check(Refusal(()=>manager.Takeover(Input("ftp://example.test/a.bin")))!=null&&Refusal(()=>manager.Takeover(Input("https://user:pass@example.test/a.bin")))!=null,"non-HTTP links and links with credentials are refused");
            var bad=Input(server+"/file.bin");bad["userAgent"]="Fixture\r\nX-Injected: 1";Check(Refusal(()=>manager.Takeover(bad))!=null,"a browser name with control characters is refused");
            Check(manager.Snapshot().Count==before,"refused links add no task");
        }
        // Save folder follows Chrome's download folder (<chrome>\Ruxget) until the user picks one.
        string chrome=Path.Combine(root,"chrome-downloads");Directory.CreateDirectory(chrome);
        using(var manager=new Manager(Path.Combine(root,"follow"))){
            Check(manager.Config.FollowBrowser,"a fresh install follows Chrome");
            Check(manager.FollowBrowserFolder(chrome)&&manager.Config.Folder==Path.Combine(chrome,"Ruxget"),"the folder becomes <Chrome's folder>\\Ruxget");
            Check(!manager.FollowBrowserFolder(chrome),"the same hint changes nothing");
            Check(!manager.FollowBrowserFolder("relative\\path")&&!manager.FollowBrowserFolder(Path.Combine(root,"missing"))&&!manager.FollowBrowserFolder("C:\\bad\npath")&&manager.Config.Folder==Path.Combine(chrome,"Ruxget"),"relative, missing or malformed folders are ignored");
            manager.Config.FollowBrowser=false;manager.Config.Folder=Path.Combine(root,"mine");manager.SaveSettings();
            Check(!manager.FollowBrowserFolder(chrome)&&manager.Config.Folder==Path.Combine(root,"mine"),"a folder the user picked is never overridden");
        }
        using(var manager=new Manager(Path.Combine(root,"follow")))Check(!manager.Config.FollowBrowser&&manager.Config.Folder==Path.Combine(root,"mine"),"the choice survives a restart");
        // Settings from before 0.4.52 have no FollowBrowser field.
        string old=Path.Combine(root,"old-custom");Directory.CreateDirectory(old);File.WriteAllText(Path.Combine(old,"settings.json"),"{\"Folder\":\""+Path.Combine(root,"custom").Replace("\\","\\\\")+"\"}");
        using(var manager=new Manager(old))Check(!manager.Config.FollowBrowser,"an existing custom folder stays the user's after upgrading");
        string plain=Path.Combine(root,"old-default");Directory.CreateDirectory(plain);File.WriteAllText(Path.Combine(plain,"settings.json"),"{\"Folder\":\""+new Settings().Folder.Replace("\\","\\\\")+"\"}");
        using(var manager=new Manager(plain))Check(manager.Config.FollowBrowser,"an untouched default folder starts following Chrome after upgrading");
        File.WriteAllText(Path.Combine(root,"summary.json"),"{\"ok\":true,\"checks\":"+checks.Count+"}");Console.WriteLine("TAKEOVER CHECKS PASSED");return 0;
    }catch(Exception ex){Console.Error.WriteLine("FAIL "+ex.Message);return 1;}}
}
