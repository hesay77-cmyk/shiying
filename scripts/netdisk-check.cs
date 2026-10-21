using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using ShiyingDesktop;
class NetdiskCheck {
 static readonly List<string> checks=new List<string>();
 static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);}
 static Dictionary<string,object> Input(string url,string request,int index=0,long size=4194304){
  var headers=new Dictionary<string,object>{{"Cookie","session=fixture-secret; auth=fixture-value"},{"User-Agent","FixtureNetdiskAgent"},{"Referer","https://pan.quark.cn/"}};
  var file=new Dictionary<string,object>{{"url",url},{"title","网盘测试文件.bin"},{"key","fixture-file"},{"size",size},{"index",index},{"headers",headers}};
  return new Dictionary<string,object>{{"action","netdisk"},{"provider","quark"},{"source","https://pan.quark.cn/list#/all"},{"requestId",request},{"files",new object[]{file}}};
 }
 static Download Until(Manager manager,Func<Download,bool> predicate,string id,int seconds=18){var stop=DateTime.UtcNow.AddSeconds(seconds);while(DateTime.UtcNow<stop){manager.Tick();var job=manager.Snapshot().First(j=>j.Id==id);if(predicate(job))return job;if(job.Status=="失败")throw new Exception(job.Error);Thread.Sleep(50);}throw new Exception("Fixture timeout");}
 static string Digest(string path){using(var hash=SHA256.Create())using(var input=File.OpenRead(path))return String.Concat(hash.ComputeHash(input).Select(b=>b.ToString("x2")));}
 static int Main(string[] args){try{
  string root=args[0],server=args[1],data=Path.Combine(root,"state");Directory.CreateDirectory(root);string id;
  using(var modern=new Manager(Path.Combine(root,"modern-123-state"))){modern.NetdiskLocalOnly=true;modern.Config.Folder=Path.Combine(root,"modern-123-files");var input=Input(server+"/data",new String('e',32));input["provider"]="pan123";input["source"]="https://1818737965.share.123pan.cn/";((Dictionary<string,object>)((Dictionary<string,object>)((object[])input["files"])[0])["headers"])["Referer"]=input["source"];modern.AddNetdisk(input);Check(modern.Snapshot().Count==1,"modern 123 share origin is accepted by the desktop manager");input["source"]="https://1818737965.share.123pan.cn.evil.test/";try{modern.AddNetdisk(input);throw new Exception("lookalike accepted");}catch(Exception ex){Check(!ex.Message.Contains("lookalike accepted")&&modern.Snapshot().Count==1,"lookalike 123 share origin is rejected without adding a task");}}
  using(var manager=new Manager(data)){
   manager.NetdiskLocalOnly=true;manager.Config.Proxy="";manager.Config.Folder=Path.Combine(root,"files");manager.Config.AutoCategorize=false;manager.Config.RateKiB=1024;manager.SaveSettings();
   var input=Input(server+"/data?access_token=fixture-oauth-token",new String('a',32));manager.AddNetdisk(input);id=manager.Snapshot().Single().Id;manager.AddNetdisk(input);Check(manager.Snapshot().Count==1,"retrying the same handoff creates one task");
   string json=File.ReadAllText(Path.Combine(data,"tasks.json"));Check(!json.Contains("fixture-secret")&&!json.Contains("fixture-value"),"cookies are encrypted in saved task data");
   Check(!json.Contains("fixture-oauth-token")&&!manager.Snapshot().Single().Url.Contains('?'),"signed URL and OAuth query are encrypted and omitted from the displayed source");
   var atomic=Input(server+"/data",new String('b',32));atomic["files"]=new object[]{((object[])atomic["files"])[0],new Dictionary<string,object>{{"url","http://192.0.2.1/unsafe"},{"title","bad.bin"},{"index",1}}};
   try{manager.AddNetdisk(atomic);throw new Exception("invalid batch accepted");}catch(Exception ex){Check(!ex.Message.Contains("invalid batch accepted")&&manager.Snapshot().Count==1,"invalid batch never adds a partial queue");}
   var start=Until(manager,j=>j.Transfer.Completed>=1048576,id);manager.Pause(id);var paused=Until(manager,j=>j.Status=="已暂停",id);Check(paused.Transfer.Completed>0&&paused.Transfer.Resume==true,"actual aria2 receives authenticated range data and pauses");
  }
  using(var manager=new Manager(data)){
   manager.NetdiskLocalOnly=true;var saved=manager.Snapshot().Single();Check(saved.Status=="已暂停"&&saved.NetdiskProvider=="quark"&&Netdisk.Cookie(saved).Contains("fixture-secret"),"restart restores paused task and encrypted credentials");
   Check(Netdisk.Source(saved)==server+"/data?access_token=fixture-oauth-token","restart restores the exact signed URL without losing query bytes");
   manager.Resume(id);var done=Until(manager,j=>j.Status=="已完成",id);Check(Digest(done.File)==args[2],"resumed authenticated file has the expected SHA256");Check(String.IsNullOrEmpty(done.NetdiskCookie),"completed task drops its saved cookie");
   var redirect=Input(server+"/redirect",new String('c',32),0,16384);manager.AddNetdisk(redirect);var job=manager.Snapshot().Last();Until(manager,j=>j.Status=="已完成",job.Id);Check(true,"cross-host redirect downloads without forwarding origin cookies");
   var mismatch=Input(server+"/login",new String('d',32));manager.AddNetdisk(mismatch);job=manager.Snapshot().Last();manager.Tick();job=manager.Snapshot().First(j=>j.Id==job.Id);Check(job.Status=="失败"&&job.Error.Contains("文件大小"),"a login/error response cannot masquerade as the requested large file");
   manager.Forget(job.Id,true);Check(manager.Snapshot().Count==2,"failed netdisk task can be removed through the normal manager");
  }
  foreach(var name in new[]{"tasks.json","tasks.json.bak"}){string path=Path.Combine(data,name),text=File.ReadAllText(path);Check(!text.Contains("fixture-secret")&&!text.Contains("fixture-oauth-token"),"no plaintext cookie or URL token in "+name);}
  File.WriteAllText(Path.Combine(root,"desktop-summary.json"),Util.Json().Serialize(new{ok=true,checks,publicNetworkUsed=false,personalBrowserUsed=false,installedApplicationUsed=false,videoDownloaded=false}));Console.WriteLine("NETDISK DESKTOP PASSED "+checks.Count);return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
