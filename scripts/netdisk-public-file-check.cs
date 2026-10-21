// One explicitly selected, public open-font file. Never use the installed program or its data.
using System;using System.IO;using System.Linq;using System.Threading;using System.Collections.Generic;using System.Security.Cryptography;using ShiyingDesktop;
class NetdiskPublicFileCheck {
 static Download Until(Manager manager,string id,Func<Download,bool> predicate,int seconds){var end=DateTime.UtcNow.AddSeconds(seconds);while(DateTime.UtcNow<end){manager.Tick();var job=manager.Snapshot().Single(j=>j.Id==id);if(job.Status=="失败")throw new Exception(job.Error);if(predicate(job))return job;Thread.Sleep(100);}throw new Exception("Public download check timed out");}
 static string Digest(string file,bool md5){using(HashAlgorithm algorithm=md5?(HashAlgorithm)MD5.Create():SHA256.Create())using(var input=File.OpenRead(file))return String.Concat(algorithm.ComputeHash(input).Select(b=>b.ToString("x2")));}
 static int Main(string[] args){Console.OutputEncoding=new System.Text.UTF8Encoding(false);string root=args[0];try{
  var payload=Util.Json().Deserialize<List<Dictionary<string,object>>>(File.ReadAllText(args[1])).Single();var record=((System.Collections.IEnumerable)payload["files"]).Cast<object>().Cast<Dictionary<string,object>>().Single();string title=Util.Str(record,"title");long size=TransferData.Number(record,"size");
  if(Util.Str(payload,"provider")!="pan123"||title!="QiushuiShotai.woff2"||size>10*1024*1024||size<1)throw new Exception("Only the bounded public font fixture is allowed");
  string id,state=Path.Combine(root,"state");long pausedBytes;var watch=System.Diagnostics.Stopwatch.StartNew();
  using(var manager=new Manager(state)){
   manager.Config.Proxy="http://127.0.0.1:7897";manager.Config.Folder=Path.Combine(root,"files");manager.Config.AutoCategorize=false;manager.Config.Connections=2;manager.Config.FileSlots=1;manager.Config.RateKiB=256;manager.SaveSettings();manager.AddNetdisk(payload);id=manager.Snapshot().Single().Id;
   var active=Until(manager,id,j=>j.Transfer.Completed>=524288,45);if(active.Transfer.Resume!=true)throw new Exception("Public source did not confirm resume support");manager.Pause(id);pausedBytes=Until(manager,id,j=>j.Status=="已暂停",10).Transfer.Completed;
  }
  using(var manager=new Manager(state)){
   if(manager.Snapshot().Single().Status!="已暂停")throw new Exception("Paused public task was not restored");manager.Resume(id);var done=Until(manager,id,j=>j.Status=="已完成",120);string hash=Digest(done.File,true);if(hash!=args[2]||new FileInfo(done.File).Length!=size)throw new Exception("Public font size or MD5 differs from source metadata");
   Util.Atomic(Path.Combine(root,"summary.json"),new{ok=true,version=Util.Version,file=title,bytes=size,md5=hash,sha256=Digest(done.File,false),pauseResumeAcrossRestart=true,pausedBytes,seconds=watch.Elapsed.TotalSeconds,testRateKiB=256,publicNetworkUsed=true,personalBrowserUsed=false,installedApplicationUsed=false,executedDownloadedFile=false,published=false});Console.WriteLine("PUBLIC FONT DOWNLOAD, RESTART RESUME AND HASH PASSED");
  }
  return 0;
 }catch(Exception error){Util.Atomic(Path.Combine(root,"summary.json"),new{ok=false,error=Util.SafeError(error.Message),publicNetworkUsed=true,personalBrowserUsed=false,installedApplicationUsed=false,executedDownloadedFile=false});Console.Error.WriteLine(Util.SafeError(error.Message));return 1;}}
}
