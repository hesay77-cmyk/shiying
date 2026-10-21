// Loopback protocol checks, plus an optional metadata-only public route check using a random hash.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ShiyingDesktop;
class DhtBootstrapCheck {
    static readonly List<string> checks=new List<string>();
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);Console.WriteLine("PASS "+name);}
    static byte[] Bytes(string text){return Encoding.ASCII.GetBytes(text);}
    static readonly byte[] NodeId=Enumerable.Repeat((byte)42,20).ToArray();
    sealed class Server:IDisposable {
        readonly UdpClient client=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));readonly Thread thread;public int Requests,DelayMs;public readonly string Mode;public Server Candidate;public Server[] Routes;public byte[][] Values;public byte[] LastHash;
        public string Address{get{return "127.0.0.1:"+((IPEndPoint)client.Client.LocalEndPoint).Port;}}
        public int Port{get{return ((IPEndPoint)client.Client.LocalEndPoint).Port;}}
        public Server(string mode){Mode=mode;thread=new Thread(Run){IsBackground=true};thread.Start();}
        void Run(){while(true)try{
            IPEndPoint sender=null;var request=TorrentInfo.DhtPacket(client.Receive(ref sender));Interlocked.Increment(ref Requests);var transaction=(byte[])request["t"];string query=Encoding.ASCII.GetString((byte[])request["q"]);byte[] data;
            if(query=="find_node"&&Candidate!=null){byte[] compact=NodeId.Concat(new byte[]{127,0,0,1,(byte)(Candidate.Port>>8),(byte)Candidate.Port}).ToArray();if(Mode=="malformed")compact=compact.Concat(new byte[]{1}).ToArray();data=Bytes("d2:id20:").Concat(NodeId).Concat(Bytes("5:nodes"+compact.Length+":")).Concat(compact).Concat(Bytes("e")).ToArray();}
            else if(query=="get_peers"){
                LastHash=(byte[])((Dictionary<string,object>)request["a"])["info_hash"];if(DelayMs>0)Thread.Sleep(DelayMs);var id=Mode=="wrong-id"?new byte[20]:NodeId;
                byte[] nodes=(Routes??new Server[0]).SelectMany(route=>NodeId.Concat(new byte[]{127,0,0,1,(byte)(route.Port>>8),(byte)route.Port})).ToArray();if(Mode=="bad-nodes")nodes=new byte[27];
                data=Bytes("d2:id20:").Concat(id).Concat(Bytes("5:nodes"+nodes.Length+":")).Concat(nodes).Concat(Bytes(Mode=="no-token"?"":"5:token4:test")).ToArray();
                if(Values!=null)data=data.Concat(Bytes("6:valuesl")).Concat(Values.SelectMany(value=>Bytes(value.Length+":").Concat(value))).Concat(Bytes("e")).ToArray();data=data.Concat(Bytes("e")).ToArray();
            }
            else continue;
            if(Mode=="wrong-transaction")transaction=new byte[]{0,0,0,0};byte[] response=Bytes("d1:r").Concat(data).Concat(Bytes("1:t4:")).Concat(transaction).Concat(Bytes("1:y1:re")).ToArray();client.Send(response,response.Length,sender);
        }catch(SocketException){return;}catch(ObjectDisposedException){return;}catch{}}
        public void Dispose(){client.Close();thread.Join(1000);}
    }
    static void Offline(string folder){
        using(var candidate=new Server("valid"))using(var router=new Server("valid")){router.Candidate=candidate;
            var selected=DhtBootstrap.Find(new[]{router.Address},1200,true);Check(selected!=null&&selected.Port==candidate.Port,"find_node route is accepted only after get_peers token and node identity validation");Check(router.Requests>0&&candidate.Requests>0,"bootstrap performs find_node and then verifies a routing node");
            int before=router.Requests;Check(DhtBootstrap.Find(new[]{router.Address},300)==null&&router.Requests==before,"public bootstrap rejects loopback destinations before sending packets");
            using(var bad=new Server("wrong-transaction")){bad.Candidate=candidate;Check(DhtBootstrap.Find(new[]{bad.Address},300,true)==null,"mismatched UDP transaction response is rejected");}
            using(var bad=new Server("malformed")){bad.Candidate=candidate;Check(DhtBootstrap.Find(new[]{bad.Address},300,true)==null,"malformed compact route data is rejected");}
            using(var silent=new Server("silent")){var clock=Stopwatch.StartNew();Check(DhtBootstrap.Find(new[]{silent.Address,router.Address},1000,true)!=null&&clock.ElapsedMilliseconds<1000,"unresponsive bootstrap does not block a working fallback");}
        }
        foreach(string mode in new[]{"no-token","wrong-id"})using(var candidate=new Server(mode))using(var router=new Server("valid")){router.Candidate=candidate;Check(DhtBootstrap.Find(new[]{router.Address},400,true)==null,"routing node with "+mode+" cannot become the engine entry point");}
        foreach(string address in new[]{"0.0.0.0","10.0.0.1","100.64.0.1","127.0.0.1","169.254.0.1","172.16.0.1","192.168.1.1","198.18.0.1","192.0.2.1","198.51.100.1","203.0.113.1","224.0.0.1","::1"})Check(!DhtBootstrap.PublicIPv4(IPAddress.Parse(address)),"non-public routing address is rejected: "+address);
        Check(new[]{"8.8.8.8","192.2.1.5","192.0.1.1"}.All(address=>DhtBootstrap.PublicIPv4(IPAddress.Parse(address))),"public IPv4 routing addresses are accepted without excluding ordinary 192.x addresses");
        string hash=new string('a',40);var token=CancellationToken.None;
        using(var leaf=new Server("valid"))using(var entry=new Server("valid")){
            entry.Routes=new[]{leaf};leaf.Values=new[]{new byte[]{127,0,0,1,191,101},new byte[]{127,0,0,1,191,101},new byte[]{127,0,0,1,0,0},new byte[]{10,0,0,1,191,101}};
            var found=DhtBootstrap.Peers(new IPEndPoint(IPAddress.Loopback,entry.Port),hash,1000,token,true);
            Check(found.Peers.Length==1&&found.Peers[0].Port==48997&&found.Queries==2&&found.Replies==2,"supplement follows XOR-ordered routes and deduplicates valid peer endpoints");
            Check(entry.LastHash.SequenceEqual(Enumerable.Repeat((byte)0xaa,20))&&leaf.LastHash.SequenceEqual(entry.LastHash),"resource lookup carries the requested hash rather than the random bootstrap target");
            int before=entry.Requests;Check(DhtBootstrap.Peers(new IPEndPoint(IPAddress.Loopback,entry.Port),hash,200,token).Queries==0&&entry.Requests==before,"production supplement rejects loopback entry without sending a packet");
            using(var cancel=new CancellationTokenSource()){cancel.Cancel();Check(DhtBootstrap.Peers(new IPEndPoint(IPAddress.Loopback,entry.Port),hash,200,cancel.Token,true).Queries==0,"cancelled lookup sends no packets");}
            foreach(string mode in new[]{"wrong-id","no-token","wrong-transaction","bad-nodes"})using(var bad=new Server(mode)){bad.Values=leaf.Values;entry.Routes=new[]{bad};var rejected=DhtBootstrap.Peers(new IPEndPoint(IPAddress.Loopback,entry.Port),hash,500,token,true);Check(rejected.Peers.Length==0,"supplement rejects forged or malformed route replies: "+mode);}
        }
        using(var slow=new Server("valid")){slow.DelayMs=900;var watch=Stopwatch.StartNew();var found=DhtBootstrap.Peers(new IPEndPoint(IPAddress.Loopback,slow.Port),hash,180,token,true);Check(found.Peers.Length==0&&watch.ElapsedMilliseconds<600,"slow supplement is bounded by the shared deadline");}
        var chain=Enumerable.Range(0,28).Select(n=>new Server("valid")).ToArray();try{
            for(int n=0;n<chain.Length-1;n++)chain[n].Routes=new[]{chain[n+1]};var found=DhtBootstrap.Peers(new IPEndPoint(IPAddress.Loopback,chain[0].Port),hash,3000,token,true);Check(found.Queries==24&&chain[24].Requests==0,"supplement stops at 24 UDP queries even when routes continue");
        }finally{foreach(var server in chain)server.Dispose();}
        using(var entry=new Server("valid"))using(var manager=new Manager(Path.Combine(folder,"manager-state"))){
            entry.Values=Enumerable.Range(0,64).Select(n=>new byte[]{127,0,0,1,(byte)((49000+n)>>8),(byte)(49000+n)}).ToArray();string torrent=Path.Combine(folder,"local-selection.torrent");File.WriteAllBytes(torrent,Bytes("d4:infod6:lengthi1e4:name8:test.bin12:piece lengthi16384e6:pieces20:").Concat(new byte[20]).Concat(Bytes("ee")).ToArray());
            manager.BtLocalOnly=true;manager.BtLocalDhtPort=entry.Port;typeof(Manager).GetField("btPeerEntry",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(manager,new IPEndPoint(IPAddress.Loopback,entry.Port));
            var prepare=typeof(Manager).GetMethod("PrepareBtPeers",BindingFlags.Instance|BindingFlags.NonPublic);var job=manager.ImportTorrent(torrent,Path.Combine(folder,"output"));manager.SelectBtFiles(job.Id,new[]{1});
            var watch=Stopwatch.StartNew();Check(!(bool)prepare.Invoke(manager,new object[]{job})&&watch.ElapsedMilliseconds<200,"manager starts supplemental discovery asynchronously without blocking its gate");
            while(!((Task)typeof(Manager).GetField("btPeerSearch",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(manager)).IsCompleted)Thread.Sleep(10);
            Check((bool)prepare.Invoke(manager,new object[]{job})&&manager.BtPeerSearches==1,"completed supplement lets the original start proceed");
            var hints=(System.Collections.IDictionary)typeof(Manager).GetField("btPeerHints",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(manager);Check(hints.Contains(job.Id),"discovered peers are fed into the existing per-task loopback cache");
            byte[] body=(byte[])hints[job.Id].GetType().GetField("Body").GetValue(hints[job.Id]);Check(((byte[])TorrentInfo.DhtPacket(body)["peers"]).Length==64*6,"all 64 fresh candidates fit the bounded cache when there are no recent peers");
            Check((bool)prepare.Invoke(manager,new object[]{job})&&manager.BtPeerSearches==1,"resume discovery is throttled for one minute");
            job.BtPrivate=true;job.BtLookupAt=DateTime.MinValue;Check((bool)prepare.Invoke(manager,new object[]{job})&&manager.BtPeerSearches==1,"known private torrents never start supplemental public discovery");job.BtPrivate=false;job.HasMetadata=false;
            Check((bool)prepare.Invoke(manager,new object[]{job})&&manager.BtPeerSearches==1,"unknown metadata never starts supplemental discovery before file confirmation");job.HasMetadata=true;
            entry.DelayMs=500;Check(!(bool)prepare.Invoke(manager,new object[]{job}),"queued lookup can be cancelled before transfer starts");manager.Pause(job.Id);
            var cancellation=(CancellationTokenSource)typeof(Manager).GetField("btPeerSearchCancel",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(manager);Check(cancellation.IsCancellationRequested&&job.Status=="已暂停","ordinary pause immediately cancels the pending optional lookup");
            while(!((Task)typeof(Manager).GetField("btPeerSearch",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(manager)).IsCompleted)Thread.Sleep(10);var previous=hints[job.Id];prepare.Invoke(manager,new object[]{job});Check(Object.ReferenceEquals(previous,hints[job.Id]),"late cancelled results cannot replace the paused task's peer cache");
        }
        Util.Atomic(Path.Combine(folder,"summary.json"),new{ok=true,version=Util.Version,checks,method="loopback UDP protocol fixtures; no public network, browser or download engine",mediaDownloaded=false,published=false});
    }
    static void PublicPeers(string folder,string torrent){
        var info=TorrentInfo.Read(TorrentInfo.Load(torrent));Check(!info.Private,"public resource metadata is verified before supplemental lookup");var entry=DhtBootstrap.Find(new[]{"dht.transmissionbt.com:6881","router.bt.ouinet.work:6881","dht.libtorrent.org:25401"},3000);Check(entry!=null,"public bootstrap supplies a verified routing entry");
        var watch=Stopwatch.StartNew();var result=DhtBootstrap.Peers(entry,info.Hash,3500,CancellationToken.None);Check(result.Queries<=24&&result.Replies>0&&watch.ElapsedMilliseconds<4500,"bounded production lookup obtains valid public DHT replies");
        Util.Atomic(Path.Combine(folder,"summary.json"),new{ok=true,version=Util.Version,queries=result.Queries,validReplies=result.Replies,potentialPeerAddresses=result.Peers.Length,elapsedMilliseconds=watch.ElapsedMilliseconds,peerConnectionsOpened=false,mediaDownloaded=false,currentUserTaskChanged=false,speedImprovementVerified=false,windowsShown=false,published=false,checks});
    }
    static void Public(string folder){
        using(var manager=new Manager(Path.Combine(folder,"state"))){
            var job=manager.Add("magnet:?xt=urn:btih:"+Guid.NewGuid().ToString("N")+"12345678","file");manager.Tick();
            bool verified=(bool)typeof(Manager).GetField("btBootstrapVerified",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(manager);Check(verified,"real Manager obtains a verified routing entry before launching the isolated BT engine");
            var until=DateTime.UtcNow.AddSeconds(28);while(DateTime.UtcNow<until){manager.Tick();Check(job.Transfer.Completed<=0&&!job.HasMetadata,"random-hash route check never receives payload or resource metadata");Thread.Sleep(700);}
        }
        string table=Path.Combine(folder,"state","bt-network","dht.dat");long bytes=new FileInfo(table).Length;Check(bytes>112,"actual production engine grows its DHT cache beyond a single bootstrap node");
        Util.Atomic(Path.Combine(folder,"summary.json"),new{ok=true,version=Util.Version,dhtCacheBytes=bytes,checks,method="actual production Manager and bundled aria2; new isolated state; random magnet with metadata-only engine option; no user hash or content; stops after 28 seconds",liveUserTaskChanged=false,mediaDownloaded=false,windowsShown=false,published=false});
    }
    static int Main(string[] args){try{string folder=Path.GetFullPath(args[0]);if(args.Length>2&&args[1]=="public-peers")PublicPeers(folder,args[2]);else if(args.Length>1&&args[1]=="public")Public(folder);else Offline(folder);return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
