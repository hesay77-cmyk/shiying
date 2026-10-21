// Uses the shipped GUI assembly as a library. Never invokes Program.Main or any window.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using ShiyingDesktop;
class PublicBtCheck {
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=8*1024*1024};
    static readonly List<string> Checks=new List<string>();static readonly List<object> Samples=new List<object>();
    static string Folder,Stage,Metadata;static Stopwatch Clock=Stopwatch.StartNew();static double ReportAt,SampleAt;static long Peak;static int MaxPeers;static double ActiveSeconds;static long ActiveBytes;
    static void Write(string name,object value){File.WriteAllText(Path.Combine(Folder,name),Json.Serialize(value),new UTF8Encoding(false));}
    static void Check(bool value,string name){if(!value)throw new Exception(name);Checks.Add(name);Console.WriteLine("PASS "+name);}
    static object Field(object target,string name){return target.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(target);}
    static object Rpc(Manager manager,string method,string id){return typeof(Manager).GetMethod("BtRpc",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(manager,new object[]{method,new object[]{id}});}
    static Download Job(Manager manager,string id){return manager.Snapshot().Single(j=>j.Id==id);}
    static long Number(IDictionary<string,object> map,string key){object value;long n;return map.TryGetValue(key,out value)&&Int64.TryParse(Convert.ToString(value),out n)?n:-1;}
    static void Sample(Manager manager,string id,string phase,bool force=false){
        var job=Job(manager,id);if(!force&&Clock.Elapsed.TotalSeconds<SampleAt)return;SampleAt=Clock.Elapsed.TotalSeconds+.5;
        long peerSpeed=0,peerUpload=0,uploaded=-1;int peers=0;string engine="not-started";bool checking=false;long totalReported=-1,completedReported=-1;
        if(Field(manager,"btAria")!=null)try{var state=(IDictionary<string,object>)Rpc(manager,"tellStatus",id);engine=Convert.ToString(state["status"]);checking=state.ContainsKey("verifiedLength")||state.ContainsKey("verifyIntegrityPending");uploaded=Number(state,"uploadLength");totalReported=Number(state,"totalLength");completedReported=Number(state,"completedLength");foreach(IDictionary<string,object> peer in ((IEnumerable)Rpc(manager,"getPeers",id)).Cast<object>()){peers++;peerSpeed+=Math.Max(0,Number(peer,"downloadSpeed"));peerUpload+=Math.Max(0,Number(peer,"uploadSpeed"));}}catch{}
        Peak=Math.Max(Peak,job.Transfer.Speed);MaxPeers=Math.Max(MaxPeers,peers);
        Samples.Add(new{seconds=Clock.Elapsed.TotalSeconds,phase,status=job.Status,stage=job.Stage,reason=job.BtReason,advice=job.BtAdvice,engine,checking,completed=job.Transfer.Completed,total=job.Transfer.Total,speed=job.Transfer.Speed,peers,peerSpeed,peerUpload,uploaded,totalReported,completedReported});
        Write(Stage+"-samples.json",Samples);
        if(Clock.Elapsed.TotalSeconds>=ReportAt){Console.WriteLine("PROGRESS "+phase+" "+job.Status+" "+job.Progress.ToString("0.0")+"% "+TransferData.Bytes(job.Transfer.Completed)+" / "+TransferData.Bytes(job.Transfer.Total)+" speed="+TransferData.Bytes(job.Transfer.Speed)+"/s peers="+peers+" peerSpeed="+TransferData.Bytes(peerSpeed)+"/s");ReportAt=Clock.Elapsed.TotalSeconds+10;}
    }
    static void Until(Manager manager,string id,Func<Download,bool> done,string phase,int seconds){var end=DateTime.UtcNow.AddSeconds(seconds);while(!done(Job(manager,id))&&DateTime.UtcNow<end){manager.Tick();var job=Job(manager,id);Sample(manager,id,phase);if(job.Status=="失败")throw new Exception(job.Error);Thread.Sleep(200);}Check(done(Job(manager,id)),phase);Sample(manager,id,phase,true);}
    static long StablePause(Manager manager,string id,string phase){manager.Pause(id);Until(manager,id,j=>j.Status=="已暂停",phase+" settles",15);long before=Job(manager,id).Transfer.Completed;var end=DateTime.UtcNow.AddSeconds(4);while(DateTime.UtcNow<end){manager.Tick();Sample(manager,id,phase);Thread.Sleep(300);}Check(Job(manager,id).Transfer.Completed==before,phase+" does not keep downloading after it settles");return before;}
    static void PhaseOne(){
        using(var manager=new Manager(Path.Combine(Folder,"state"))){
            manager.Config.Folder=Path.Combine(Folder,"payload");manager.Config.Proxy="http://127.0.0.1:7897";manager.Config.RateKiB=2048;manager.SaveSettings();
            var added=manager.ImportTorrent(Metadata);string id=added.Id;var selected=added.BtFiles.Where(f=>f.Length>8*1024*1024).OrderByDescending(f=>f.Length).First();
            Check(added.BtSelected==null&&added.Status=="等待选文件","public torrent defaults to no selection");if(added.BtFiles.Length>1)Check(added.BtFiles.All(f=>!f.Selected),"public multifile torrent starts with every file unchecked");manager.Tick();Check(Field(manager,"btAria")==null&&String.IsNullOrEmpty(Job(manager,id).BtFolder),"no engine or payload starts before selection");
            manager.SelectBtFiles(id,new[]{selected.Index});Check(Job(manager,id).Transfer.Total==selected.Length,"selected total excludes all other public torrent files");
            Until(manager,id,j=>j.Transfer.Completed>=2*1024*1024&&j.Status=="下载中","public transfer begins at a temporary 2 MiB/s cap for pause testing",180);
            long pause1=StablePause(manager,id,"first pause");Check(pause1>0&&pause1<selected.Length,"first pause leaves genuine partial data");
            manager.Config.RateKiB=0;manager.SaveSettings();manager.Resume(id);long threshold=Math.Min(selected.Length/2,Math.Max(16*1024*1024,pause1+4*1024*1024));var timer=Stopwatch.StartNew();
            Until(manager,id,j=>j.Transfer.Completed>=threshold&&j.Status=="下载中","same-process resume advances beyond saved bytes without a download cap",300);
            long pause2=StablePause(manager,id,"pause before process exit");ActiveSeconds=timer.Elapsed.TotalSeconds-4;ActiveBytes=pause2-pause1;
            Check(pause2>pause1&&pause2<selected.Length,"same-session resume keeps prior selected data and can pause again");var job=Job(manager,id);
            Check(Directory.GetFiles(job.BtFolder,"*.aria2",SearchOption.AllDirectories).Length>0,"actual BT control file is retained for restart");
            bool savedPeerCache=File.Exists(Path.Combine(manager.Work(job),"recent-peers.json"));Write("checkpoint.json",new{id,selectedIndex=selected.Index,selectedPath=selected.Path,selectedBytes=selected.Length,pausedBytes=pause2,folder=job.BtFolder,files=job.BtFiles,savedPeerCache});
        }
    }
    static string Hash(string path){using(var input=File.OpenRead(path))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();}
    static void VerifyPieces(Download job,string output){
        byte[] torrent=TorrentInfo.Load(Metadata);var parsed=TorrentInfo.Read(torrent);var selected=job.BtFiles.Single(f=>f.Selected);long start=job.BtFiles.Where(f=>f.Index<selected.Index).Sum(f=>f.Length),length=job.Transfer.PieceLength;
        // Get the raw piece hashes with a small read-only bencode decoder.
        int at=0;var root=(Dictionary<string,object>)Decode(torrent,ref at);var info=(Dictionary<string,object>)root["info"];var hashes=(byte[])info["pieces"];int count=0;
        using(var file=File.OpenRead(output))using(var sha=SHA1.Create())for(long piece=(start+length-1)/length;(piece+1)*length<=start+selected.Length;piece++){var buffer=new byte[(int)length];file.Position=piece*length-start;int read=0,n;while(read<buffer.Length&&(n=file.Read(buffer,read,buffer.Length-read))>0)read+=n;if(read!=buffer.Length)throw new Exception("Verified piece is not fully readable");var actual=sha.ComputeHash(buffer);if(!actual.SequenceEqual(hashes.Skip((int)piece*20).Take(20)))throw new Exception("Selected payload piece hash mismatch");count++;}
        Check(count>0,"completed selected payload matches every wholly contained original torrent SHA1 piece");Write("integrity.json",new{ok=true,infoHash=parsed.Hash,path=selected.Path,bytes=selected.Length,sha256=Hash(output),verifiedInteriorPieces=count,boundaryPieces="engine verified; adjacent unselected bytes may be required"});
    }
    static object Decode(byte[] bytes,ref int at){char c=(char)bytes[at++];if(c=='i'){int first=at;while(bytes[at]!='e')at++;long n=Int64.Parse(Encoding.ASCII.GetString(bytes,first,at-first));at++;return n;}if(c=='l'){var list=new List<object>();while(bytes[at]!='e')list.Add(Decode(bytes,ref at));at++;return list;}if(c=='d'){var dict=new Dictionary<string,object>();while(bytes[at]!='e'){string key=Encoding.UTF8.GetString((byte[])Decode(bytes,ref at));dict.Add(key,Decode(bytes,ref at));}at++;return dict;}int size=c-'0';while(bytes[at]!=':')size=size*10+bytes[at++]-'0';at++;var data=new byte[size];Buffer.BlockCopy(bytes,at,data,0,size);at+=size;return data;}
    static void PhaseTwo(){
        var checkpoint=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(Folder,"checkpoint.json"),Encoding.UTF8));string id=Convert.ToString(checkpoint["id"]);long before=Convert.ToInt64(checkpoint["pausedBytes"]);int index=Convert.ToInt32(checkpoint["selectedIndex"]);
        using(var manager=new Manager(Path.Combine(Folder,"state"))){var job=Job(manager,id);Check(job.Status=="已暂停"&&job.Transfer.Completed==before&&job.BtSelected.SequenceEqual(new[]{index}),"a new process reloads selected indices and exact paused counters");manager.Resume(id);var timer=Stopwatch.StartNew();Until(manager,id,j=>j.Status=="已完成","process restart resumes and completes the selected public file",900);job=Job(manager,id);ActiveSeconds=timer.Elapsed.TotalSeconds;ActiveBytes=job.Transfer.Completed-before;Check(job.Transfer.Completed==job.Transfer.Total&&job.Transfer.Total==Convert.ToInt64(checkpoint["selectedBytes"]),"final total contains only selected bytes");
            string output=Path.Combine(job.File,job.BtFiles.Single(f=>f.Selected).Path.Replace('/',Path.DirectorySeparatorChar));Check(new FileInfo(output).Length==job.Transfer.Total,"completed selected file has its exact original size");
            object saved;if(checkpoint.TryGetValue("savedPeerCache",out saved)&&saved is bool&&(bool)saved){Check(Convert.ToInt32(Field(manager,"BtPeerHintRequests"))>0,"fresh process actually consumes the persisted recent-node cache");Check(!File.Exists(Path.Combine(manager.Work(job),"recent-peers.json")),"completed public task clears its short-lived node cache");}
            long unselected=job.BtFiles.Where(f=>!f.Selected).Sum(f=>f.Completed);Check(unselected<=job.Transfer.PieceLength*2,"unselected file data is limited to cross-piece boundaries");VerifyPieces(job,output);Write("final-files.json",job.BtFiles);
            string official=Path.Combine(Folder,"official-SHA256SUMS.txt");if(File.Exists(official)){string expected=File.ReadAllLines(official).Single(line=>line.TrimEnd().EndsWith(" "+Path.GetFileName(output))||line.TrimEnd().EndsWith("*"+Path.GetFileName(output))).Split(new[]{' ','\t'},StringSplitOptions.RemoveEmptyEntries)[0];Check(Hash(output)==expected.ToLowerInvariant(),"full download matches the publisher's official SHA256 checksum");}
        }
    }
    static void PeerProbe(){
        byte[] data=File.ReadAllBytes(Metadata);int at=0;var root=(Dictionary<string,object>)Decode(data,ref at);Check(!root.ContainsKey("url-list")&&!root.ContainsKey("httpseeds"),"peer-only probe contains no HTTP web seeds");
        using(var manager=new Manager(Path.Combine(Folder,"state"))){manager.Config.Folder=Path.Combine(Folder,"payload");manager.Config.Proxy="http://127.0.0.1:7897";manager.Config.RateKiB=0;manager.SaveSettings();var job=manager.ImportTorrent(Metadata);Check(job.BtFiles.Length==1,"peer probe uses the official single-file Debian torrent");string id=job.Id;manager.SelectBtFiles(id,new[]{1});var timer=Stopwatch.StartNew();Until(manager,id,j=>j.Transfer.Completed>=128*1024*1024,"uncapped peer-only public transfer reaches 128 MiB",300);ActiveSeconds=timer.Elapsed.TotalSeconds;ActiveBytes=Job(manager,id).Transfer.Completed;Check(MaxPeers>0,"peer-only transfer connects to real public BT peers");StablePause(manager,id,"peer-only probe pause");Write("probe-files.json",Job(manager,id).BtFiles);}
    }
    static void SmallSelection(){
        using(var manager=new Manager(Path.Combine(Folder,"state"))){manager.Config.Folder=Path.Combine(Folder,"payload");manager.Config.Proxy="http://127.0.0.1:7897";manager.Config.RateKiB=0;manager.SaveSettings();var job=manager.ImportTorrent(Metadata);string id=job.Id;var selected=job.BtFiles.Single(f=>f.Path.EndsWith("poster.jpg"));Check(selected.Length<64*1024&&job.BtFiles.Any(f=>f.Length>100*1024*1024),"public multifile probe selects only a tiny poster beside the large video");manager.SelectBtFiles(id,new[]{selected.Index});var timer=Stopwatch.StartNew();Until(manager,id,j=>j.Status=="已完成","poster-only public torrent completes",180);job=Job(manager,id);ActiveSeconds=timer.Elapsed.TotalSeconds;ActiveBytes=job.Transfer.Completed;Check(job.BtSelected.SequenceEqual(new[]{selected.Index})&&job.Transfer.Total==selected.Length&&job.Transfer.Completed==selected.Length,"poster selection completes without adding the video to selection");Check(job.BtFiles.Where(f=>!f.Selected).Sum(f=>f.Completed)<=2*job.Transfer.PieceLength,"unselected large video is not fully downloaded; only boundary pieces are fetched");string output=Path.Combine(job.File,selected.Path.Replace('/',Path.DirectorySeparatorChar));Check(new FileInfo(output).Length==selected.Length,"selected poster has its exact original size");Write("selection-files.json",job.BtFiles);Write("selected-integrity.json",new{path=selected.Path,bytes=selected.Length,sha256=Hash(output)});}
    }
    static int Main(string[] args){Folder=Path.GetFullPath(args[0]);Stage=args[1];Metadata=Path.Combine(Folder,File.Exists(Path.Combine(Folder,"metadata.torrent"))?"metadata.torrent":"sintel.torrent");Console.OutputEncoding=new UTF8Encoding(false);try{Check(typeof(Manager).Assembly.GetType("ShiyingDesktop.Util").GetField("Version",BindingFlags.Static|BindingFlags.Public).GetRawConstantValue().ToString()==(args.Length>2?args[2]:"0.4.7"),"exact shipped desktop assembly reports requested version");if(Stage=="pause-resume")PhaseOne();else if(Stage=="restart-finish")PhaseTwo();else if(Stage=="peer-probe")PeerProbe();else if(Stage=="small-selection")SmallSelection();else throw new Exception("Unknown test stage");Write(Stage+".json",new{ok=true,checks=Checks,peakSampleBytesPerSecond=Peak,maxConnectedPeers=MaxPeers,activeSeconds=ActiveSeconds,advancedBytes=ActiveBytes,averageAdvancedBytesPerSecond=ActiveSeconds>0?ActiveBytes/ActiveSeconds:0,method="exact shipped assembly, independent state, public torrent, hidden aria2, no GUI or personal browser access"});Console.WriteLine("PUBLIC BT STAGE PASSED "+Stage);return 0;}catch(Exception e){Write(Stage+".json",new{ok=false,error=e.Message,checks=Checks,peakSampleBytesPerSecond=Peak,maxConnectedPeers=MaxPeers,elapsedSeconds=Clock.Elapsed.TotalSeconds});Console.Error.WriteLine(e);return 1;}}
}
