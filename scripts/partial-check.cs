// A server that serves only part of a file, like PikPak for shared files on free accounts: the first 55% and the
// last piece answer, everything in between is 416, and a plain GET is a 206 for the first part only (so Chrome calls
// its cut-off copy finished). The desktop must fail with a plain explanation instead of aria2's "No URI available".
// Real aria2 from the check folder, loopback server only. Never touches the installed app or its data.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using ShiyingDesktop;
class PartialCheck {
    const long Size=24L*1024*1024,Served=13L*1024*1024+12345,Tail=Size-512*1024;
    static readonly List<string> checks=new List<string>();
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);Console.WriteLine("PASS "+name);}
    static int requests;
    static void Serve(TcpListener listener){
        while(true){TcpClient client;try{client=listener.AcceptTcpClient();}catch{return;}
            new Thread(()=>{try{using(client)using(var stream=client.GetStream()){
                var reader=new StreamReader(stream,Encoding.ASCII);string line;string range=null;string first=reader.ReadLine()??"";
                while(!String.IsNullOrEmpty(line=reader.ReadLine()))if(line.StartsWith("Range:",StringComparison.OrdinalIgnoreCase))range=line.Substring(6).Trim();
                Interlocked.Increment(ref requests);
                if(first.Contains("/whole")){byte[] h=Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: 2000000000\r\nConnection: close\r\n\r\n");stream.Write(h,0,h.Length);var junk=new byte[65536];var stop=DateTime.UtcNow.AddSeconds(20);try{while(DateTime.UtcNow<stop){stream.Write(junk,0,junk.Length);Thread.Sleep(5);}}catch{}return;}
                long start=0,end=Served-1;
                if(range!=null){var parts=range.Replace("bytes=","").Split('-');start=Int64.Parse(parts[0]);end=parts[1].Length>0?Math.Min(Int64.Parse(parts[1]),Size-1):Size-1;}
                bool allowed=start<Served||start>=Tail;
                if(!allowed){byte[] refuse=Encoding.ASCII.GetBytes("HTTP/1.1 416 Requested Range Not Satisfiable\r\nContent-Range: bytes */"+Size+"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");stream.Write(refuse,0,refuse.Length);return;}
                if(start<Served)end=Math.Min(end,Served-1);
                byte[] head=Encoding.ASCII.GetBytes("HTTP/1.1 206 Partial Content\r\nContent-Type: video/mp4\r\nAccept-Ranges: bytes\r\nETag: \"partial-fixture\"\r\nContent-Range: bytes "+start+"-"+end+"/"+Size+"\r\nContent-Length: "+(end-start+1)+"\r\nConnection: close\r\n\r\n");
                stream.Write(head,0,head.Length);var chunk=new byte[65536];for(long left=end-start+1;left>0;){int n=(int)Math.Min(chunk.Length,left);stream.Write(chunk,0,n);left-=n;}
            }}catch{}}){IsBackground=true}.Start();
        }
    }
    static int Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);try{
        string root=Path.GetFullPath(args[0]);if(root.IndexOf("\\reports\\partial-",StringComparison.OrdinalIgnoreCase)<0)throw new Exception("Fixture root must be a partial-check report");
        // Pure parts first.
        Check(Util.SafeError("No URI available.").Contains("所有连接都失败"),"aria2's \"No URI available\" is explained in plain Chinese");
        Check(Util.SafeError("Invalid range header. Request: 1-9/20, Response: 1-4/20").Contains("只肯提供文件的一部分"),"aria2's \"Invalid range header\" is explained in plain Chinese");
        string ui=File.ReadAllText(Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(root)),"desktop","interface.js"),Encoding.UTF8);
        Check(ui.Contains("'"+Util.SafeError("No URI available.")+"':")&&ui.Contains("'"+Util.SafeError("Invalid range header.")+"':")&&ui.Contains("服务器只提供了这个文件的一部分：大约从 (\\d+)% 处开始"),"the new messages have English in the desktop window");
        var t=new TransferInfo{Total=10*1048576,PieceLength=1048576,Pieces=10,Bitfield="f8c0"};// pieces 0-4 and 8-9 done
        var starts=TransferData.MissingStarts(t,16);Check(starts.Length==3&&starts[0]==5*1048576&&starts[1]==6*1048576&&starts[2]==7*1048576,"missing places are found from aria2's piece map, in file order");
        Check(TransferData.MissingStarts(new TransferInfo{Total=10,PieceLength=1,Pieces=10,Bitfield="zz"},16).Length==0&&TransferData.MissingStarts(null,16).Length==0,"a bad or empty piece map finds nothing");
        Check(Manager.PartialMessage(Served,Size).Contains("54%")&&Manager.PartialMessage(1,Size).Contains(" 1%")&&Manager.PartialMessage(Size-1,Size).Contains("99%"),"the explanation names where the refused part starts");
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();int port=((IPEndPoint)listener.LocalEndpoint).Port;new Thread(()=>Serve(listener)){IsBackground=true}.Start();
        string url="http://127.0.0.1:"+port+"/download/?fid=fixture";
        Check(Manager.ProbeStatus(url,"",Util.BrowserAgent,"",0)==206&&Manager.ProbeStatus(url,"",Util.BrowserAgent,"",Served)==416&&Manager.ProbeStatus(url,"",Util.BrowserAgent,"",Size-1)==206,"the one-byte probe sees what the server allows");
        Check(Manager.ProbeStatus("http://127.0.0.1:1/x","",Util.BrowserAgent,"",0)==-1,"an unreachable server is -1, not a refusal");
        var sw=System.Diagnostics.Stopwatch.StartNew();int whole=Manager.ProbeStatus("http://127.0.0.1:"+port+"/whole","",Util.BrowserAgent,"",5);
        Check(whole==200&&sw.ElapsedMilliseconds<5000,"a server that ignores Range answers 200 and its body is not read");
        // The real engine against that server.
        using(var manager=new Manager(Path.Combine(root,"state"))){
            manager.Config.Proxy="";manager.Config.Folder=Path.Combine(root,"files");manager.Config.AutoCategorize=false;manager.SaveSettings();
            var job=manager.Takeover(new Dictionary<string,object>{{"action","takeover"},{"url",url},{"referer","https://share.example.test/s/1"},{"userAgent",Util.BrowserAgent},{"name","clip.mp4"}});
            var end=DateTime.UtcNow.AddSeconds(90);Download now=null;
            while(DateTime.UtcNow<end){manager.Tick();now=manager.Snapshot().Single(j=>j.Id==job.Id);if(now.Status=="失败"&&now.Error.Contains("只提供了"))break;if(now.Status=="已完成")break;Thread.Sleep(200);}
            Console.WriteLine("status="+now.Status+" error="+now.Error+" done="+(now.Transfer==null?-1:now.Transfer.Completed));
            Check(now.HasMetadata&&now.ExpectedSize==Size,"the desktop sees the real size from the one-byte probe, not the cut-off length");
            Check(now.Status!="已完成","a file the server only partly serves is never called finished");
            Check(now.Status=="失败"&&now.Error.Contains("HTTP 416")&&now.Error.Contains("只提供了这个文件的一部分")&&now.Error.Contains("从 54%"),"the failure says the server only serves part of the file, and from where");
            Check(now.Transfer!=null&&now.Transfer.Completed>=Served-2*1048576&&now.Transfer.Completed<Size,"what the server did serve is kept");
        }
        listener.Stop();
        File.WriteAllText(Path.Combine(root,"summary.json"),"{\"ok\":true,\"checks\":"+checks.Count+"}");Console.WriteLine("PARTIAL CHECKS PASSED");return 0;
    }catch(Exception ex){Console.Error.WriteLine("FAIL "+ex.Message);return 1;}}
}
