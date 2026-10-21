// Exactly one author-public 11 KiB SHX file; isolated state and actual desktop engine.
using System;using System.IO;using System.Linq;using System.Collections;using System.Collections.Generic;using System.Threading;using System.Security.Cryptography;using ShiyingDesktop;
class NetdiskPublicQuarkCheck {
 static int Main(string[] args){Console.OutputEncoding=new System.Text.UTF8Encoding(false);string root=args[0];try{
  var input=Util.Json().Deserialize<List<Dictionary<string,object>>>(File.ReadAllText(args[1])).Single();var file=((IEnumerable)input["files"]).Cast<Dictionary<string,object>>().Single();
  if(Util.Str(input,"provider")!="quark"||Util.Str(input,"source")!="https://pan.quark.cn/"||Util.Str(file,"title")!="bou1_4l.shx"||TransferData.Number(file,"size")!=11156||Util.Str(file,"key")!="a75f784611ba4674b99a6f0b60a12142")throw new Exception("Only the explicitly selected public SHX fixture is allowed");
  var watch=System.Diagnostics.Stopwatch.StartNew();using(var manager=new Manager(Path.Combine(root,"state"))){
   manager.Config.Proxy="http://127.0.0.1:7897";manager.Config.Folder=Path.Combine(root,"files");manager.Config.AutoCategorize=false;manager.Config.Connections=2;manager.Config.FileSlots=1;manager.Config.RateKiB=128;manager.SaveSettings();manager.AddNetdisk(input);manager.AddNetdisk(input);
   if(manager.Snapshot().Count!=1)throw new Exception("Repeated handoff duplicated the public task");var end=DateTime.UtcNow.AddSeconds(80);Download job=null;
   while(DateTime.UtcNow<end){manager.Tick();job=manager.Snapshot().Single();if(job.Status=="失败")throw new Exception(job.Error);if(job.Status=="已完成")break;Thread.Sleep(100);}
   if(job==null||job.Status!="已完成")throw new Exception("Public download check timed out");byte[] bytes=File.ReadAllBytes(job.File);if(bytes.Length!=11156||bytes[0]!=0||bytes[1]!=0||bytes[2]!=39||bytes[3]!=10||BitConverter.ToInt32(bytes,28)!=1000||((long)bytes[24]<<24|(long)bytes[25]<<16|(long)bytes[26]<<8|bytes[27])*2!=bytes.Length)throw new Exception("The public SHX file has an invalid length or index header");
   string hash;using(var sha=SHA256.Create())hash=String.Concat(sha.ComputeHash(bytes).Select(b=>b.ToString("x2")));
   Util.Atomic(Path.Combine(root,"summary.json"),new{ok=true,desktopVersion=Util.Version,provider="quark",file="bou1_4l.shx",bytes=bytes.Length,sha256=hash,shapefileIndexHeaderVerified=true,idempotentHandoff=true,seconds=watch.Elapsed.TotalSeconds,publicNetworkUsed=true,personalBrowserUsed=false,installedApplicationUsed=false,executedDownloadedFile=false,published=false});Console.WriteLine("PUBLIC QUARK HANDOFF, REAL DOWNLOAD AND FILE HEADER CHECK PASSED");
  }return 0;
 }catch(Exception error){Util.Atomic(Path.Combine(root,"summary.json"),new{ok=false,error=Util.SafeError(error.Message),publicNetworkUsed=true,installedApplicationUsed=false,published=false});Console.Error.WriteLine(Util.SafeError(error.Message));return 1;}}
}
