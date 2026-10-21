// BitTorrent metadata validation and an on-demand, separate aria2 session. GPL-3.0.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
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
public class TorrentFileInfo {public int Index;public string Path;public long Length,Completed;public bool Selected;}
public class TorrentInfo {
    public string Name,Hash;
    public long Total;
    public TorrentFileInfo[] Files;
    public bool Private;
    public const int MaxBytes=4*1024*1024;
    internal static Dictionary<string,object> DhtPacket(byte[] bytes){if(bytes.Length<2||bytes.Length>8192)throw new Exception("DHT 数据长度无效");var reader=new Bencode(bytes);var value=reader.Read(0) as Dictionary<string,object>;if(value==null||reader.At!=bytes.Length)throw new Exception("DHT 数据格式无效");return value;}
    public static bool IsBt(Download job){return job.Kind=="magnet"||job.Kind=="torrent";}
    public static string Magnet(string text,out string hash,out string name){
        if(String.IsNullOrWhiteSpace(text)||text.Length>16384||text.Any(Char.IsControl)||!text.StartsWith("magnet:?",StringComparison.OrdinalIgnoreCase)||text.Contains('#'))throw new Exception("请输入完整的 magnet:? 磁力链接");
        var hashes=new List<string>();var trackers=new List<string>();name="";
        foreach(string item in text.Substring(8).Split('&')){var pair=item.Split(new[]{'='},2);if(pair.Length!=2)continue;string key=pair[0].ToLowerInvariant(),value=Uri.UnescapeDataString(pair[1].Replace("+"," "));
            if(key=="xt"&&value.StartsWith("urn:btih:",StringComparison.OrdinalIgnoreCase)){string h=value.Substring(9);if(Regex.IsMatch(h,@"^[a-fA-F0-9]{40}$"))hashes.Add(h.ToLowerInvariant());else if(Regex.IsMatch(h,@"^[a-zA-Z2-7]{32}$")){int bits=0,buffer=0;var bytes=new List<byte>();foreach(char c in h.ToUpperInvariant()){buffer=(buffer<<5)|"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".IndexOf(c);bits+=5;if(bits>=8){bits-=8;bytes.Add((byte)(buffer>>bits));buffer&=(1<<bits)-1;}}hashes.Add(Hex(bytes.ToArray()));}else throw new Exception("磁力链接的 BTv1 哈希无效");}
            if(key=="dn"&&name.Length==0)name=Util.Name(value);
            if(key=="tr"){Uri uri;if(value.Length>2048||value.Any(Char.IsControl)||!Uri.TryCreate(value,UriKind.Absolute,out uri)||!new[]{"http","https","udp"}.Contains(uri.Scheme)||String.IsNullOrEmpty(uri.Host)||uri.UserInfo.Length>0)throw new Exception("磁力链接的 Tracker 地址无效");if(!trackers.Contains(value))trackers.Add(value);}
        }
        if(hashes.Distinct().Count()!=1)throw new Exception("需要包含唯一 BTv1 哈希（urn:btih）的磁力链接；暂不支持纯 BTv2");if(trackers.Count>32)throw new Exception("磁力链接的 Tracker 数量过多");hash=hashes[0];if(name.Length==0)name="磁力任务 "+hash.Substring(0,12);
        return "magnet:?xt=urn:btih:"+hash+"&dn="+Uri.EscapeDataString(name)+String.Concat(trackers.Select(t=>"&tr="+Uri.EscapeDataString(t)));
    }
    static string Hex(byte[] bytes){return BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();}
    static string Text(object value){var bytes=value as byte[];if(bytes==null)throw new Exception("种子文字字段无效");try{return new UTF8Encoding(false,true).GetString(bytes);}catch{throw new Exception("种子文件名不是有效 UTF-8，请使用 UTF-8 种子");}}
    static string Part(object value){string text=Text(value);if(text.Length==0||text.Length>180||text=="."||text==".."||text.TrimEnd(' ','.')!=text||text.Any(c=>c<32||System.IO.Path.GetInvalidFileNameChars().Contains(c))||Regex.IsMatch(text,@"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)",RegexOptions.IgnoreCase))throw new Exception("种子包含不安全或不适用 Windows 的文件名");return text;}
    static object Get(Dictionary<string,object> dict,string key){object value;return dict.TryGetValue(key,out value)?value:null;}
    static long Length(object value){if(!(value is long)||(long)value<0)throw new Exception("种子文件大小无效");return (long)value;}
    public static byte[] Load(string path){using(var input=System.IO.File.OpenRead(path)){if(input.Length==0||input.Length>MaxBytes)throw new Exception("种子文件为空或超过 4 MiB");var bytes=new byte[(int)input.Length];int at=0;while(at<bytes.Length){int count=input.Read(bytes,at,bytes.Length-at);if(count==0)throw new Exception("种子文件读取中断");at+=count;}if(input.ReadByte()!=-1)throw new Exception("种子文件在读取时发生变化");return bytes;}}
    public static TorrentInfo Read(byte[] bytes){
        if(bytes.Length==0||bytes.Length>MaxBytes)throw new Exception("种子文件为空或超过 4 MiB");var reader=new Bencode(bytes);var root=reader.Read(0) as Dictionary<string,object>;if(root==null||reader.At!=bytes.Length)throw new Exception("种子文件格式无效");var info=Get(root,"info") as Dictionary<string,object>;if(info==null||reader.InfoEnd<=reader.InfoStart)throw new Exception("种子缺少文件信息");
        if(!(Get(info,"pieces") is byte[]))throw new Exception("暂不支持纯 BTv2 种子，请使用 BTv1 或混合种子");if(Get(info,"name")!=null)Part(Get(info,"name"));if(Get(info,"name.utf-8")!=null)Part(Get(info,"name.utf-8"));string name=Part(Get(info,"name.utf-8")??Get(info,"name"));var entries=new List<TorrentFileInfo>();var files=Get(info,"files") as List<object>;
        if(Get(info,"attr") is byte[]&&Text(Get(info,"attr")).Contains("l"))throw new Exception("不支持符号链接种子");
        if(files==null)entries.Add(new TorrentFileInfo{Index=1,Path=name,Length=Length(Get(info,"length"))});
        else{if(files.Count==0||files.Count>3000)throw new Exception("种子文件数量必须在 1–3000 之间");foreach(var item in files){var file=item as Dictionary<string,object>;if(file==null||Get(file,"attr") is byte[]&&Text(Get(file,"attr")).Contains("l"))throw new Exception("种子文件条目无效或包含符号链接");foreach(string key in new[]{"path","path.utf-8"})if(Get(file,key)!=null){var alternate=Get(file,key) as List<object>;if(alternate==null||alternate.Count==0||alternate.Count>24)throw new Exception("种子文件路径无效");foreach(var part in alternate)Part(part);}var path=(Get(file,"path.utf-8")??Get(file,"path")) as List<object>;if(path==null||path.Count==0||path.Count>24)throw new Exception("种子文件路径无效");entries.Add(new TorrentFileInfo{Index=entries.Count+1,Path=name+"/"+String.Join("/",path.Select(Part)),Length=Length(Get(file,"length"))});}}
        var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var file in entries){if(!paths.Add(file.Path))throw new Exception("种子包含重复文件名");}foreach(var file in entries){string path=file.Path;while(path.Contains('/')){path=path.Substring(0,path.LastIndexOf('/'));if(paths.Contains(path))throw new Exception("种子包含冲突的文件和文件夹");}}
        long total=0;try{foreach(var file in entries)total=checked(total+file.Length);}catch(OverflowException){throw new Exception("种子总大小超出支持范围");}long piece=Length(Get(info,"piece length"));var pieces=(byte[])Get(info,"pieces");if(total<=0||piece<=0||pieces.Length%20!=0||pieces.Length/20!=(total-1)/piece+1)throw new Exception("种子数据块信息与文件大小不一致");
        object privateFlag=Get(info,"private");if(privateFlag!=null&&(!(privateFlag is long)||(long)privateFlag<0||(long)privateFlag>1))throw new Exception("种子的私有标记无效");byte[] digest;using(var sha=SHA1.Create())digest=sha.ComputeHash(bytes,reader.InfoStart,reader.InfoEnd-reader.InfoStart);return new TorrentInfo{Name=name,Hash=Hex(digest),Files=entries.ToArray(),Total=total,Private=privateFlag!=null&&(long)privateFlag==1};
    }
    // Only tracker metadata changes. Preserve the raw info dictionary, including noncanonical key order.
    internal static byte[] WithPeerTracker(byte[] bytes,string tracker){
        var reader=new Bencode(bytes);var root=(Dictionary<string,object>)reader.Read(0);var tiers=new List<object>{new List<object>{Encoding.UTF8.GetBytes(tracker)}};
        var previous=Get(root,"announce-list") as List<object>;if(previous!=null)tiers.AddRange(previous);else if(Get(root,"announce") is byte[])tiers.Add(new List<object>{Get(root,"announce")});root["announce-list"]=tiers;
        using(var output=new MemoryStream()){output.WriteByte((byte)'d');foreach(var item in root.OrderBy(p=>p.Key,StringComparer.Ordinal)){Encode(output,Encoding.UTF8.GetBytes(item.Key));if(item.Key=="info")output.Write(bytes,reader.InfoStart,reader.InfoEnd-reader.InfoStart);else Encode(output,item.Value);}output.WriteByte((byte)'e');return output.ToArray();}
    }
    static void Encode(Stream output,object value){
        var bytes=value as byte[];if(bytes!=null){var length=Encoding.ASCII.GetBytes(bytes.Length+":");output.Write(length,0,length.Length);output.Write(bytes,0,bytes.Length);return;}
        if(value is long){var number=Encoding.ASCII.GetBytes("i"+((long)value).ToString(System.Globalization.CultureInfo.InvariantCulture)+"e");output.Write(number,0,number.Length);return;}
        var dict=value as Dictionary<string,object>;output.WriteByte((byte)(dict==null?'l':'d'));if(dict!=null)foreach(var item in dict.OrderBy(p=>p.Key,StringComparer.Ordinal)){Encode(output,Encoding.UTF8.GetBytes(item.Key));Encode(output,item.Value);}else foreach(var item in (List<object>)value)Encode(output,item);output.WriteByte((byte)'e');
    }
    class Bencode {
        readonly byte[] bytes;int nodes;public int At,InfoStart,InfoEnd;
        public Bencode(byte[] input){bytes=input;}
        public object Read(int depth){
            if(depth>32||++nodes>100000||At>=bytes.Length)throw new Exception("种子结构过深或格式损坏");byte c=bytes[At++];
            if(c=='i'){int start=At;while(At<bytes.Length&&bytes[At]!='e')At++;long number;string value=Encoding.ASCII.GetString(bytes,start,At-start);if(At>=bytes.Length||!Regex.IsMatch(value,@"^(0|-?[1-9][0-9]*)$")||!Int64.TryParse(value,out number))throw new Exception("种子整数无效");At++;return number;}
            if(c=='l'){var list=new List<object>();while(At<bytes.Length&&bytes[At]!='e')list.Add(Read(depth+1));if(At++>=bytes.Length)throw new Exception("种子列表损坏");return list;}
            if(c=='d'){var dict=new Dictionary<string,object>(StringComparer.Ordinal);while(At<bytes.Length&&bytes[At]!='e'){var keyBytes=Read(depth+1) as byte[];if(keyBytes==null||keyBytes.Length>256)throw new Exception("种子字段无效");string key=Text(keyBytes);if(dict.ContainsKey(key))throw new Exception("种子存在重复字段");int start=At;object value=Read(depth+1);if(depth==0&&key=="info"){InfoStart=start;InfoEnd=At;}dict.Add(key,value);}if(At++>=bytes.Length)throw new Exception("种子字典损坏");return dict;}
            if(c<'0'||c>'9')throw new Exception("种子编码无效");int length=c-'0',digits=1;while(At<bytes.Length&&bytes[At]!=':'){byte n=bytes[At++];if(n<'0'||n>'9'||++digits>8||length==0)throw new Exception("种子字符串长度无效");length=checked(length*10+n-'0');}if(At>=bytes.Length||bytes[At++]!=':'||length>bytes.Length-At)throw new Exception("种子字符串损坏");var data=new byte[length];Buffer.BlockCopy(bytes,At,data,0,length);At+=length;return data;
        }
    }
}

public class TorrentSelectionWindow:Form {
    readonly Manager manager;readonly string jobId;
    readonly DataGridView files=new TaskGrid();readonly Label summary=new Label();readonly Button start=new QuietButton();bool updating,busy;
    public TorrentSelectionWindow(Manager owner,string id){
        manager=owner;jobId=id;var job=manager.Snapshot().First(j=>j.Id==id);if(!TorrentInfo.IsBt(job)||!job.HasMetadata)throw new Exception("种子文件列表尚未准备好");
        Text="选择 BT 下载文件 · Ruxget";Font=new Font("Microsoft YaHei UI",9.5f);BackColor=Color.Black;ForeColor=Color.FromArgb(255,255,255);ClientSize=new Size(820,570);MinimumSize=new Size(760,500);StartPosition=FormStartPosition.CenterParent;AutoScaleDimensions=new SizeF(96,96);AutoScaleMode=AutoScaleMode.Dpi;HandleCreated+=(sender,args)=>MainWindow.ApplyDarkFrame(this);Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var header=new Panel{Dock=DockStyle.Top,Height=110,Padding=new Padding(24,16,24,6)};header.Controls.Add(new Label{Text=job.Title,Dock=DockStyle.Top,Height=36,AutoEllipsis=true,Font=new Font(Font.FontFamily,13,FontStyle.Bold)});
        var tools=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=36,WrapContents=false};foreach(bool all in new[]{true,false}){bool value=all;var button=new QuietButton{Text=all?"全选":"清空选择",Width=100,Height=30,FlatStyle=FlatStyle.Flat,BackColor=Color.Black,Margin=new Padding(0,0,10,0)};button.Click+=(s,e)=>{updating=true;foreach(DataGridViewRow row in files.Rows)row.Cells[0].Value=value;updating=false;UpdateSummary();};tools.Controls.Add(button);}tools.Controls.Add(new Label{Text="新任务默认不勾选，确认后才开始下载",AutoSize=true,ForeColor=Color.FromArgb(196,214,235),Margin=new Padding(10,7,0,0)});header.Controls.Add(tools);
        files.Dock=DockStyle.Fill;files.BackgroundColor=Color.Black;files.BorderStyle=BorderStyle.None;files.AllowUserToAddRows=false;files.AllowUserToDeleteRows=false;files.AllowUserToResizeRows=false;files.RowHeadersVisible=false;files.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;files.ColumnHeadersHeight=36;files.RowTemplate.Height=32;files.SelectionMode=DataGridViewSelectionMode.FullRowSelect;files.EnableHeadersVisualStyles=false;files.GridColor=Color.FromArgb(59,83,111);files.CellBorderStyle=DataGridViewCellBorderStyle.SingleHorizontal;files.ColumnHeadersDefaultCellStyle.BackColor=Color.FromArgb(17,29,46);files.ColumnHeadersDefaultCellStyle.ForeColor=Color.FromArgb(196,214,235);files.DefaultCellStyle.BackColor=Color.Black;files.DefaultCellStyle.ForeColor=ForeColor;files.DefaultCellStyle.SelectionBackColor=Color.FromArgb(24,57,88);files.DefaultCellStyle.SelectionForeColor=ForeColor;
        files.Columns.Add(new DataGridViewCheckBoxColumn{HeaderText="下载",Name="Selected",FillWeight=9,MinimumWidth=54});foreach(var label in new[]{"文件","文件大小","已有数据"})files.Columns.Add(label,label);files.Columns[1].FillWeight=59;files.Columns[2].FillWeight=16;files.Columns[3].FillWeight=16;for(int c=0;c<files.Columns.Count;c++){files.Columns[c].SortMode=DataGridViewColumnSortMode.NotSortable;if(c>0)files.Columns[c].ReadOnly=true;}
        foreach(var file in job.BtFiles??new TorrentFileInfo[0]){int row=files.Rows.Add(file.Selected,file.Path,TransferData.Bytes(file.Length),TransferData.Bytes(file.Completed));files.Rows[row].Tag=file;files.Rows[row].Cells[1].ToolTipText=file.Path;}
        files.CurrentCellDirtyStateChanged+=(s,e)=>{if(files.IsCurrentCellDirty)files.CommitEdit(DataGridViewDataErrorContexts.Commit);};files.CellValueChanged+=(s,e)=>{if(!updating)UpdateSummary();};
        var list=new Panel{Dock=DockStyle.Fill,Padding=new Padding(24,0,24,0)};list.Controls.Add(files);var footer=new Panel{Dock=DockStyle.Bottom,Height=118,Padding=new Padding(24,10,24,12),BackColor=Color.FromArgb(17,29,46)};summary.Dock=DockStyle.Top;summary.Height=28;summary.Font=new Font(Font.FontFamily,11,FontStyle.Bold);footer.Controls.Add(summary);footer.Controls.Add(new Label{Dock=DockStyle.Top,Height=35,ForeColor=Color.FromArgb(196,214,235),Text="校验跨文件数据块时，可能留下少量未选文件的边界数据；已有文件不会自动删除。",AutoEllipsis=true});summary.BringToFront();
        var actions=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=36,FlowDirection=FlowDirection.RightToLeft,WrapContents=false};start.Text="下载所选文件";start.Width=150;start.Height=34;start.FlatStyle=FlatStyle.Flat;start.FlatAppearance.BorderSize=0;start.BackColor=Color.FromArgb(95,185,255);start.ForeColor=Color.Black;var cancel=new QuietButton{Text="稍后选择",Width=110,Height=34,FlatStyle=FlatStyle.Flat,BackColor=Color.Black,DialogResult=DialogResult.Cancel};actions.Controls.Add(start);actions.Controls.Add(cancel);footer.Controls.Add(actions);AcceptButton=start;CancelButton=cancel;
        start.Click+=async(s,e)=>{if(busy)return;int[] selected=Chosen();busy=true;files.Enabled=false;start.Enabled=false;try{await System.Threading.Tasks.Task.Run(()=>manager.SelectBtFiles(jobId,selected));DialogResult=DialogResult.OK;}catch(Exception error){MessageBox.Show(this,error.Message,"选择下载文件",MessageBoxButtons.OK,MessageBoxIcon.Information);}finally{busy=false;if(!IsDisposed){files.Enabled=true;UpdateSummary();}}};
        Controls.Add(list);Controls.Add(footer);Controls.Add(header);UpdateSummary();
    }
    int[] Chosen(){return files.Rows.Cast<DataGridViewRow>().Where(r=>r.Cells[0].Value is bool&&(bool)r.Cells[0].Value).Select(r=>((TorrentFileInfo)r.Tag).Index).ToArray();}
    void UpdateSummary(){var selected=new HashSet<int>(Chosen());var rows=files.Rows.Cast<DataGridViewRow>().Select(r=>(TorrentFileInfo)r.Tag).Where(f=>selected.Contains(f.Index)).ToArray();long bytes=rows.Sum(f=>f.Length);summary.Text="已选 "+rows.Length+" / "+files.Rows.Count+" 个文件，共 "+TransferData.Bytes(bytes);start.Enabled=!busy&&rows.Length>0&&bytes>0;}
}

// Bootstrap routers need find_node; a successful ping alone does not make them usable get_peers nodes.
static class DhtBootstrap {
    internal static bool PublicIPv4(IPAddress address){
        if(address.AddressFamily!=AddressFamily.InterNetwork)return false;byte[] b=address.GetAddressBytes();
        return b[0]>0&&b[0]<224&&b[0]!=10&&b[0]!=127&&!(b[0]==100&&b[1]>=64&&b[1]<=127)&&!(b[0]==169&&b[1]==254)&&!(b[0]==172&&b[1]>=16&&b[1]<=31)&&!(b[0]==192&&(b[1]==168||b[1]==0&&(b[2]==0||b[2]==2)))&&!(b[0]==198&&(b[1]==18||b[1]==19||b[1]==51&&b[2]==100))&&!(b[0]==203&&b[1]==0&&b[2]==113);
    }
    static bool Allowed(IPAddress address,bool localOnly){return localOnly?IPAddress.IsLoopback(address):PublicIPv4(address);}
    static byte[] Random(int count){var bytes=new byte[count];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);return bytes;}
    static Dictionary<string,object> Query(IPEndPoint endpoint,string query,byte[] id,DateTime deadline,byte[] target=null,CancellationToken cancel=default(CancellationToken)){
        int remaining=(int)(deadline-DateTime.UtcNow).TotalMilliseconds;if(remaining<50||cancel.IsCancellationRequested)return null;byte[] transaction=Random(4);
        string field=query=="find_node"?"6:target20:":"9:info_hash20:";
        byte[] packet=Encoding.ASCII.GetBytes("d1:ad2:id20:").Concat(id).Concat(Encoding.ASCII.GetBytes(field)).Concat(target??id).Concat(Encoding.ASCII.GetBytes("e1:q9:"+query+"1:t4:")).Concat(transaction).Concat(Encoding.ASCII.GetBytes("1:y1:qe")).ToArray();
        try{using(var client=new UdpClient(AddressFamily.InterNetwork)){
            client.Client.ReceiveTimeout=Math.Min(650,remaining);client.Connect(endpoint);client.Send(packet,packet.Length);IPEndPoint sender=null;var value=TorrentInfo.DhtPacket(client.Receive(ref sender));object raw;
            if(!value.TryGetValue("t",out raw)||!(raw is byte[])||!((byte[])raw).SequenceEqual(transaction)||!value.TryGetValue("y",out raw)||!(raw is byte[])||Encoding.ASCII.GetString((byte[])raw)!="r"||!value.TryGetValue("r",out raw))return null;
            var reply=raw as Dictionary<string,object>;if(reply==null||!reply.TryGetValue("id",out raw)||!(raw is byte[])||((byte[])raw).Length!=20)return null;return reply;
        }}catch{return null;}
    }
    static IPEndPoint TryRouter(string router,DateTime deadline,bool localOnly){try{
        int split=router.LastIndexOf(':');int port=Int32.Parse(router.Substring(split+1));if(port<1||port>65535)return null;string host=router.Substring(0,split);byte[] id=Random(20);
        foreach(var address in Dns.GetHostAddresses(host).Where(ip=>Allowed(ip,localOnly)).Take(2)){
            if(DateTime.UtcNow>=deadline)return null;var reply=Query(new IPEndPoint(address,port),"find_node",id,deadline);object raw;
            if(reply==null||!reply.TryGetValue("nodes",out raw)||!(raw is byte[]))continue;byte[] nodes=(byte[])raw;if(nodes.Length==0||nodes.Length%26!=0||nodes.Length/26>64)continue;
            var seen=new HashSet<string>();int attempts=0;
            for(int at=0;at<nodes.Length&&attempts<4&&DateTime.UtcNow<deadline;at+=26){
                var candidate=new IPEndPoint(new IPAddress(nodes.Skip(at+20).Take(4).ToArray()),nodes[at+24]*256+nodes[at+25]);if(candidate.Port==0||!Allowed(candidate.Address,localOnly)||!seen.Add(candidate.ToString()))continue;attempts++;
                var verified=Query(candidate,"get_peers",id,deadline);if(verified==null||!verified.TryGetValue("token",out raw)||!(raw is byte[])||((byte[])raw).Length==0||((byte[])raw).Length>64)continue;
                if(!((byte[])verified["id"]).SequenceEqual(nodes.Skip(at).Take(20)))continue;return candidate;
            }
        }
    }catch{}return null;}
    internal static IPEndPoint Find(IEnumerable<string> routers,int budgetMs,bool localOnly=false){
        var deadline=DateTime.UtcNow.AddMilliseconds(Math.Max(100,Math.Min(3500,budgetMs)));
        var pending=routers.Take(3).Select(router=>Task.Run(()=>TryRouter(router,deadline,localOnly))).ToList();
        while(pending.Count>0){int remaining=(int)(deadline-DateTime.UtcNow).TotalMilliseconds;if(remaining<=0)return null;int completed=Task.WaitAny(pending.Cast<Task>().ToArray(),remaining);if(completed<0)return null;var result=pending[completed].Result;pending.RemoveAt(completed);if(result!=null)return result;}return null;
    }
    internal sealed class PeerResult {public IPEndPoint[] Peers=new IPEndPoint[0];public int Queries,Replies;}
    sealed class Route {public IPEndPoint Endpoint;public byte[] Id;public string Distance;}
    internal static PeerResult Peers(IPEndPoint entry,string hash,int budgetMs,CancellationToken cancel,bool localOnly=false){
        var result=new PeerResult();if(entry==null||entry.Port==0||!Allowed(entry.Address,localOnly)||!Regex.IsMatch(hash??"",@"^[0-9a-f]{40}$")||cancel.IsCancellationRequested)return result;
        byte[] target=Enumerable.Range(0,20).Select(n=>Convert.ToByte(hash.Substring(n*2,2),16)).ToArray(),id=Random(20);
        var deadline=DateTime.UtcNow.AddMilliseconds(Math.Max(100,Math.Min(4000,budgetMs)));var known=new Dictionary<string,Route>{{entry.ToString(),new Route{Endpoint=entry,Distance=""}}};var visited=new HashSet<string>();var peers=new Dictionary<string,IPEndPoint>();
        // Bounded supplement at start/resume; the original engine owns ongoing discovery and transfer.
        while(result.Queries<24&&!cancel.IsCancellationRequested&&DateTime.UtcNow<deadline){
            var batch=known.Values.Where(node=>!visited.Contains(node.Endpoint.ToString())).OrderBy(node=>node.Distance,StringComparer.Ordinal).Take(Math.Min(4,24-result.Queries)).ToArray();if(batch.Length==0)break;
            foreach(var node in batch)visited.Add(node.Endpoint.ToString());result.Queries+=batch.Length;
            var tasks=batch.Select(node=>Task.Run(()=>Query(node.Endpoint,"get_peers",id,deadline,target,cancel))).ToArray();Task.WaitAll(tasks);
            for(int index=0;index<batch.Length;index++){
                var reply=tasks[index].Result;object raw;if(reply==null||!reply.TryGetValue("token",out raw)||!(raw is byte[])||((byte[])raw).Length==0||((byte[])raw).Length>64||batch[index].Id!=null&&!batch[index].Id.SequenceEqual((byte[])reply["id"]))continue;
                byte[] nodes=new byte[0];if(reply.TryGetValue("nodes",out raw)){nodes=raw as byte[];if(nodes==null||nodes.Length%26!=0||nodes.Length/26>64)continue;}result.Replies++;
                if(reply.TryGetValue("values",out raw)&&raw is List<object>)foreach(var value in ((List<object>)raw).Take(128)){
                    var compact=value as byte[];if(compact==null||compact.Length!=6)continue;var peer=new IPEndPoint(new IPAddress(compact.Take(4).ToArray()),compact[4]*256+compact[5]);if(peer.Port>0&&Allowed(peer.Address,localOnly)&&peers.Count<64)peers[peer.ToString()]=peer;
                }
                for(int at=0;at<nodes.Length&&known.Count<256;at+=26){
                    var endpoint=new IPEndPoint(new IPAddress(nodes.Skip(at+20).Take(4).ToArray()),nodes[at+24]*256+nodes[at+25]);if(endpoint.Port==0||!Allowed(endpoint.Address,localOnly)||known.ContainsKey(endpoint.ToString()))continue;var nodeId=nodes.Skip(at).Take(20).ToArray();known[endpoint.ToString()]=new Route{Endpoint=endpoint,Id=nodeId,Distance=BitConverter.ToString(nodeId.Select((b,n)=>(byte)(b^target[n])).ToArray())};
                }
            }
            if(peers.Count>=64)break;
        }
        if(!cancel.IsCancellationRequested)result.Peers=peers.Values.ToArray();return result;
    }
    internal static bool GlobalIPv6(){try{return Socket.OSSupportsIPv6&&System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces().Where(adapter=>adapter.OperationalStatus==System.Net.NetworkInformation.OperationalStatus.Up).SelectMany(adapter=>adapter.GetIPProperties().UnicastAddresses).Any(item=>{var address=item.Address;if(address.AddressFamily!=AddressFamily.InterNetworkV6||address.IsIPv6LinkLocal||address.IsIPv6SiteLocal||IPAddress.IsLoopback(address)||address.Equals(IPAddress.IPv6Any))return false;var bytes=address.GetAddressBytes();return bytes[0]>=0x20&&bytes[0]<0x40&&!(bytes[0]==0x20&&bytes[1]==1&&bytes[2]==0x0d&&bytes[3]==0xb8);});}catch{return false;}}
}

public partial class Manager {
    static void SavedSource(Download job){
        if(!TorrentInfo.IsBt(job)){Util.Url(job.Url);return;}if(!Regex.IsMatch(job.BtHash??"",@"^[0-9a-f]{40}$"))throw new Exception("BT 记录的哈希无效");
        if(job.Kind=="magnet"){string hash,name;TorrentInfo.Magnet(job.Url,out hash,out name);if(hash!=job.BtHash)throw new Exception("磁力记录哈希不一致");}else if(!Path.IsPathRooted(job.Url??"")||!job.Url.EndsWith(".torrent",StringComparison.OrdinalIgnoreCase))throw new Exception("种子来源记录无效");
        if(!String.IsNullOrEmpty(job.BtFolder)&&!Util.InDirectory(job.BtFolder,job.Folder))throw new Exception("BT 保存目录超出用户选择的文件夹");
        if(job.HasMetadata&&job.BtSelected!=null&&(job.BtSelected.Distinct().Count()!=job.BtSelected.Length||job.BtSelected.Any(n=>!(job.BtFiles??new TorrentFileInfo[0]).Any(f=>f.Index==n))))throw new Exception("BT 文件选择记录无效");
    }
    static bool HasBtSelection(Download job){return job.BtSelected!=null&&job.BtSelected.Length>0;}
    static void SyncBtSelection(Download job){
        var selected=new HashSet<int>(job.BtSelected??new int[0]);foreach(var file in job.BtFiles??new TorrentFileInfo[0])file.Selected=selected.Contains(file.Index);var files=(job.BtFiles??new TorrentFileInfo[0]).Where(f=>f.Selected).ToArray();var t=job.Transfer??(job.Transfer=new TransferInfo());t.Total=files.Length==0?-1:files.Sum(f=>f.Length);t.Completed=files.Length==0?-1:files.Sum(f=>f.Completed);t.Resume=job.HasMetadata?true:(bool?)null;t.Eta=t.Speed>0&&t.Total>=t.Completed?(t.Total-t.Completed)/t.Speed:-1;job.Progress=t.Total>0?Math.Min(100,100.0*t.Completed/t.Total):0;
    }
    public void SelectBtFiles(string id,IEnumerable<int> indices){
        lock(gate){if(closing)throw new Exception("正在关闭 Ruxget，请稍后选择文件");var job=jobs.First(j=>j.Id==id);if(!TorrentInfo.IsBt(job)||!job.HasMetadata)throw new Exception("请先等待种子文件列表");if(!new[]{"等待选文件","已暂停","失败","已完成"}.Contains(job.Status))throw new Exception("请先暂停 BT 任务，再更改文件选择");
            var chosen=(indices??new int[0]).Take(3001).ToArray();var info=TorrentInfo.Read(TorrentInfo.Load(TorrentSource(job)));if(info.Hash!=job.BtHash)throw new Exception("种子哈希发生变化，已保留原数据");if(chosen.Length==0||chosen.Length>info.Files.Length||chosen.Distinct().Count()!=chosen.Length||chosen.Any(n=>!info.Files.Any(f=>f.Index==n)))throw new Exception("请至少勾选一个有效文件");if(info.Files.Where(f=>chosen.Contains(f.Index)).Sum(f=>f.Length)==0)throw new Exception("请至少选择一个非空文件");
            ResetBt(job);job.BtSelected=chosen.OrderBy(n=>n).ToArray();ApplyBtInfo(job,info);job.Transfer.Speed=-1;job.Transfer.Eta=-1;job.Status="排队中";job.QueueOrder=++nextQueueOrder;job.Stage="已选择 "+chosen.Length+" 个文件";job.Error="";job.Speed="";job.PauseRequested=false;job.File=null;Save();
        }
    }
    Process btAria;string btRpcUrl,btSecret,btBootstrapEntry;
    IPEndPoint btPeerEntry;
    Task<DhtBootstrap.PeerResult> btPeerSearch;CancellationTokenSource btPeerSearchCancel;string btPeerSearchId;
    internal int BtPeerSearches;
    bool btBootstrapVerified;
    sealed class PeerHint {public byte[] Body;public DateTime Expires;public bool Served;}
    readonly Dictionary<string,PeerHint> btPeerHints=new Dictionary<string,PeerHint>();
    TcpListener btPeerTracker;string btPeerToken;
    internal int BtPeerHintRequests;
    void CancelBtSearch(string id){if(btPeerSearchId==id&&btPeerSearchCancel!=null)btPeerSearchCancel.Cancel();}
    bool PrepareBtPeers(Download job){
        if(BtLocalOnly&&BtLocalDhtPort==0||job.BtPrivate||!job.HasMetadata)return true;
        if(btPeerSearch!=null){
            if(!btPeerSearch.IsCompleted)return false;
            try{var found=btPeerSearch.Result;var owner=jobs.FirstOrDefault(item=>item.Id==btPeerSearchId);if(owner!=null&&!owner.BtPrivate&&owner.HasMetadata&&owner.Status=="排队中"&&found.Peers.Length>0){
                LoadBtPeers(owner);byte[] previous=new byte[0],ipv6=new byte[0];lock(btPeerHints){PeerHint hint;if(btPeerHints.TryGetValue(owner.Id,out hint)&&hint.Expires>DateTime.UtcNow){var packet=TorrentInfo.DhtPacket(hint.Body);previous=(byte[])packet["peers"];ipv6=(byte[])packet["peers6"];}}
                ipv6=ipv6.Take(32*18).ToArray();using(var bytes=new MemoryStream()){int cached=Math.Min(previous.Length/6,Math.Max(0,32-ipv6.Length/18));bytes.Write(previous,0,cached*6);foreach(var endpoint in found.Peers.Take(64-cached-ipv6.Length/18)){var address=endpoint.Address.GetAddressBytes();bytes.Write(address,0,address.Length);bytes.WriteByte((byte)(endpoint.Port>>8));bytes.WriteByte((byte)endpoint.Port);}var hint=MakePeerHint(bytes.ToArray(),ipv6,DateTime.UtcNow.AddMinutes(10),BtLocalOnly);lock(btPeerHints)btPeerHints[owner.Id]=hint;}
            }}catch{}finally{btPeerSearch=null;btPeerSearchCancel.Dispose();btPeerSearchCancel=null;btPeerSearchId=null;}
        }
        if(job.BtLookupAt>DateTime.UtcNow||btPeerEntry==null)return true;
        job.BtLookupAt=DateTime.UtcNow.AddMinutes(1);btPeerSearchId=job.Id;btPeerSearchCancel=new CancellationTokenSource();var cancel=btPeerSearchCancel.Token;var entry=btPeerEntry;string hash=job.BtHash;
        bool localOnly=BtLocalOnly;job.Stage="正在补充查找可用节点";BtPeerSearches++;btPeerSearch=Task.Run(()=>DhtBootstrap.Peers(entry,hash,3500,cancel,localOnly));return false;
    }
    string PeerHintPath(Download job){return Path.Combine(Work(job),"recent-peers.json");}
    static PeerHint MakePeerHint(byte[] ipv4,byte[] ipv6,DateTime expires,bool localOnly){
        if(ipv4.Length%6!=0||ipv6.Length%18!=0||ipv4.Length/6+ipv6.Length/18<1||ipv4.Length/6+ipv6.Length/18>64)throw new Exception("节点缓存数量无效");
        foreach(var pair in new[]{new{Bytes=ipv4,Width=6},new{Bytes=ipv6,Width=18}})for(int at=0;at<pair.Bytes.Length;at+=pair.Width){var address=new IPAddress(pair.Bytes.Skip(at).Take(pair.Width-2).ToArray());int port=pair.Bytes[at+pair.Width-2]*256+pair.Bytes[at+pair.Width-1];if(port==0||address.Equals(IPAddress.Any)||address.Equals(IPAddress.IPv6Any)||address.Equals(IPAddress.Broadcast)||address.IsIPv6Multicast||pair.Width==6&&pair.Bytes[at]>=224||localOnly&&!IPAddress.IsLoopback(address))throw new Exception("节点缓存地址无效");}
        using(var body=new MemoryStream()){byte[] prefix=Encoding.ASCII.GetBytes("d8:intervali2e5:peers"+ipv4.Length+":");body.Write(prefix,0,prefix.Length);body.Write(ipv4,0,ipv4.Length);prefix=Encoding.ASCII.GetBytes("6:peers6"+ipv6.Length+":");body.Write(prefix,0,prefix.Length);body.Write(ipv6,0,ipv6.Length);body.WriteByte((byte)'e');return new PeerHint{Body=body.ToArray(),Expires=expires};}
    }
    void LoadBtPeers(Download job){
        try{string path=PeerHintPath(job);if(!System.IO.File.Exists(path)||new FileInfo(path).Length>8192)return;var saved=Util.Json().Deserialize<Dictionary<string,object>>(System.IO.File.ReadAllText(path,Encoding.UTF8));long ticks;if(Util.Str(saved,"hash")!=job.BtHash||!Int64.TryParse(Util.Str(saved,"expires"),out ticks)||ticks<=DateTime.UtcNow.Ticks||ticks>DateTime.UtcNow.AddMinutes(10).Ticks)return;byte[] ipv4=Convert.FromBase64String(Util.Str(saved,"ipv4")),ipv6=Convert.FromBase64String(Util.Str(saved,"ipv6"));var hint=MakePeerHint(ipv4,ipv6,new DateTime(ticks,DateTimeKind.Utc),BtLocalOnly);lock(btPeerHints)btPeerHints[job.Id]=hint;}
        catch{} // A missing, expired or damaged optional cache never blocks the original task.
    }
    void DropBtPeers(Download job){
        lock(btPeerHints)btPeerHints.Remove(job.Id);foreach(string suffix in new[]{"",".bak",".tmp"})try{System.IO.File.Delete(PeerHintPath(job)+suffix);}catch(IOException){}catch(UnauthorizedAccessException){}
    }
    void CacheBtPeers(Download job,object[] peers=null){
        if(btAria==null||btAria.HasExited)return;
        try{using(var ipv4=new MemoryStream())using(var ipv6=new MemoryStream()){
            if(peers==null)peers=((IEnumerable)BtRpc("getPeers",job.Id)).Cast<object>().ToArray();foreach(IDictionary<string,object> peer in peers.Cast<IDictionary<string,object>>().OrderByDescending(p=>TransferData.Number(p,"downloadSpeed")).Take(64)){IPAddress address;int port;if(!IPAddress.TryParse(Util.Str(peer,"ip"),out address)||!Int32.TryParse(Util.Str(peer,"port"),out port)||port<1||port>65535||BtLocalOnly&&!IPAddress.IsLoopback(address))continue;var bytes=address.GetAddressBytes();var output=bytes.Length==4?ipv4:ipv6;output.Write(bytes,0,bytes.Length);output.WriteByte((byte)(port>>8));output.WriteByte((byte)port);}
            if(ipv4.Length+ipv6.Length==0)return;DateTime expires=DateTime.UtcNow.AddMinutes(10);var hint=MakePeerHint(ipv4.ToArray(),ipv6.ToArray(),expires,BtLocalOnly);lock(btPeerHints)btPeerHints[job.Id]=hint;
            Util.Atomic(PeerHintPath(job),new{hash=job.BtHash,expires=expires.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture),ipv4=Convert.ToBase64String(ipv4.ToArray()),ipv6=Convert.ToBase64String(ipv6.ToArray())});job.BtHintSavedAt=DateTime.UtcNow;
        }}catch{} // Discovery is optional; ordinary trackers and DHT remain available.
    }
    string PeerTracker(Download job){
        bool missing;lock(btPeerHints)missing=!btPeerHints.ContainsKey(job.Id);if(missing)LoadBtPeers(job);
        lock(btPeerHints){PeerHint hint;if(!btPeerHints.TryGetValue(job.Id,out hint))return null;if(hint.Expires<=DateTime.UtcNow){btPeerHints.Remove(job.Id);return null;}hint.Served=false;}
        if(btPeerTracker==null){btPeerToken=Guid.NewGuid().ToString("N");btPeerTracker=new TcpListener(IPAddress.Loopback,0);btPeerTracker.Start();var listener=btPeerTracker;var worker=new Thread(()=>{
            while(true){TcpClient client;try{client=listener.AcceptTcpClient();}catch{break;}using(client)try{
                client.ReceiveTimeout=client.SendTimeout=1000;var stream=client.GetStream();var request=new StringBuilder();int value;while(request.Length<4096&&(value=stream.ReadByte())>=0&&value!='\n')request.Append((char)value);string[] line=request.ToString().TrimEnd('\r').Split(' ');byte[] body=null;int used=request.Length+1,empty=0;while(used++<8192&&(value=stream.ReadByte())>=0){if(value=='\n'){if(empty==0)break;empty=0;}else if(value!='\r')empty++;}
                if(line.Length==3&&line[0]=="GET"){string path=line[1].Split('?')[0],prefix="/"+btPeerToken+"/";if(path.StartsWith(prefix,StringComparison.Ordinal)){lock(btPeerHints){PeerHint hint;if(btPeerHints.TryGetValue(path.Substring(prefix.Length),out hint)&&hint.Expires>DateTime.UtcNow){body=hint.Served?Encoding.ASCII.GetBytes("d14:failure reason20:cached peers offerede"):hint.Body;hint.Served=true;}}}}
                var header=Encoding.ASCII.GetBytes("HTTP/1.1 "+(body==null?"404 Not Found":"200 OK")+"\r\nContent-Type: application/x-bittorrent\r\nContent-Length: "+(body==null?0:body.Length)+"\r\nConnection: close\r\n\r\n");stream.Write(header,0,header.Length);if(body!=null){stream.Write(body,0,body.Length);Interlocked.Increment(ref BtPeerHintRequests);}
            }catch{}}
        });worker.IsBackground=true;worker.Start();}
        return "http://127.0.0.1:"+((IPEndPoint)btPeerTracker.LocalEndpoint).Port+"/"+btPeerToken+"/"+job.Id;
    }
    internal bool BtLocalOnly=false; // Headless regression confines tracker, DHT and peer sockets to loopback.
    internal int BtLocalDhtPort=0; // A test bootstrap can only be used with loopback mode.
    static bool BtMetadataJob(Download job){return TorrentInfo.IsBt(job)&&(!job.HasMetadata||job.BtPhase=="metadata");}
    object BtRpc(string method,params object[] args){return RpcAt(btRpcUrl,btSecret,method,args);}
    internal static void ExplainBt(Download job,IDictionary<string,object> state,object[] peers,long limit){
        string reason,advice;long speed=TransferData.Number(state,"downloadSpeed"),connections=TransferData.Number(state,"connections");
        if(Util.Str(state,"verifyIntegrityPending")=="true"){reason="正在等待文件校验";advice="轮到此任务后会核对已有文件，不必重新下载。";}
        else if(state.ContainsKey("verifiedLength")){long verified=TransferData.Number(state,"verifiedLength");reason="正在校验已有文件"+(verified>=0&&job.ExpectedSize>0?"（"+Math.Min(100,100.0*verified/job.ExpectedSize).ToString("0",System.Globalization.CultureInfo.InvariantCulture)+"%）":"");advice="校验期间可能没有下载速度；完成后继续缺少的部分。";}
        else if(Util.Str(state,"status")=="waiting"){reason="正在等待下载名额";advice="当前下载完成或暂停后会自动开始，无需重复添加。";}
        else if(job.BtPhase=="metadata"){reason=connections>0?"已连接节点，正在获取种子信息":"正在寻找能提供种子信息的节点";advice="获取文件列表后先勾选，再开始下载内容。";}
        else if(speed>0&&limit>0&&speed>=limit*0.9){reason="已接近你设置的下载限速";advice="当前上限 "+TransferData.Bytes(limit)+"/s；调整后暂停再继续可生效。";}
        else if(speed>0){reason="正在接收数据";advice="已下载量按校验完成的分块更新，小块接收期间数字可能暂时不变。";}
        else if(speed<0||connections<0||peers==null){reason="暂时无法确认停顿原因";advice="正在等待完整的内核状态，暂不判断是网络或供源故障。";}
        else if(peers.Length>0&&peers.Cast<IDictionary<string,object>>().All(p=>Util.Str(p,"peerChoking")=="true")){reason="已连接节点，对方暂未开放传输";advice="会继续等待可用供源，已有下载数据会保留。";}
        else if(peers.Length>0){reason="已连接节点，暂未收到新数据";advice="当前供源是否有所选文件的缺块尚未确认，会继续寻找其他供源。";}
        else if(connections>0){reason="已建立连接，等待下载源响应";advice="可能正在等待补源或节点握手，目前尚未收到数据。";}
        else{reason="尚未发现可用节点或补源数据";advice="正在继续查找；暂不能确定是供源不足还是网络限制。";}
        job.BtReason=reason;job.BtAdvice=advice;job.Stage=reason;
    }
    void UpdateBtDiagnostic(Download job,IDictionary<string,object> state){
        var now=DateTime.UtcNow;if(now>=job.BtDiagnosticAt){job.BtDiagnosticAt=now.AddSeconds(3);try{job.BtPeerStatus=((IEnumerable)BtRpc("getPeers",job.Id)).Cast<object>().ToArray();}catch{job.BtPeerStatus=null;}
            try{job.BtDownloadLimit=TransferData.Number((IDictionary<string,object>)BtRpc("getOption",job.Id),"max-download-limit");}catch{job.BtDownloadLimit=-1;}
            if(job.BtPeerStatus!=null&&now-job.BtHintSavedAt>=TimeSpan.FromSeconds(15))CacheBtPeers(job,job.BtPeerStatus);
        }
        ExplainBt(job,state,job.BtPeerStatus,job.BtDownloadLimit);
        if(!BtLocalOnly&&!job.BtPrivate&&TransferData.Number(state,"connections")==0&&TransferData.Number(state,"downloadSpeed")==0&&DateTime.UtcNow-job.BtProgressAt>=TimeSpan.FromSeconds(60))job.BtAdvice=(btBootstrapVerified?"DHT 路由入口已验证；当前仍未找到这条资源的可连接供源。":"DHT 路由入口未能验证，节点发现可能受网络限制。")+"继续等待不保证有速度；不能仅凭 0 连接判断种子无源。";
    }
    static int FreePort(){var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();int port=((IPEndPoint)listener.LocalEndpoint).Port;listener.Stop();return port;}
    List<string> BtArguments(int port,int peerPort){
        var args=new List<string>{"--no-conf=true","--no-netrc=true","--enable-rpc=true","--rpc-listen-all=false","--rpc-listen-port="+port,"--rpc-secret="+btSecret,"--max-concurrent-downloads=6","--follow-torrent=false","--follow-metalink=false","--enable-dht="+(!BtLocalOnly||BtLocalDhtPort>0).ToString().ToLowerInvariant(),"--enable-dht6="+(!BtLocalOnly&&DhtBootstrap.GlobalIPv6()).ToString().ToLowerInvariant(),"--enable-peer-exchange="+(!BtLocalOnly).ToString().ToLowerInvariant(),"--bt-enable-lpd=false","--listen-port="+peerPort,"--dht-file-path="+Path.Combine(dataRoot,"bt-network","dht.dat"),"--dht-file-path6="+Path.Combine(dataRoot,"bt-network","dht6.dat"),"--seed-time=0","--max-overall-upload-limit="+Config.BtUploadKiB+"K","--disk-cache=64M","--auto-save-interval=5","--check-certificate=true","--console-log-level=error","--download-result=hide","--enable-color=false"};
        if(BtLocalOnly){args.AddRange(new[]{"--interface=127.0.0.1","--disable-ipv6=true","--bt-external-ip=127.0.0.1"});if(BtLocalDhtPort>0){if(BtLocalDhtPort<1024||BtLocalDhtPort>65535)throw new Exception("测试 DHT 端口无效");args.Add("--dht-entry-point=127.0.0.1:"+BtLocalDhtPort);args.Add("--dht-listen-port="+peerPort);}}
        else args.AddRange(new[]{"--dht-entry-point="+(btBootstrapEntry??"dht.transmissionbt.com:6881"),"--dht-entry-point6=dht.transmissionbt.com:6881"});return args;
    }
    void EnsureBt(){
        if(btAria!=null&&!btAria.HasExited)return;if(!Components.Ready("aria2c.exe"))throw new Exception("核心下载组件损坏，请重新安装 Ruxget");int port=FreePort();btSecret=Guid.NewGuid().ToString("N");btRpcUrl="http://127.0.0.1:"+port+"/jsonrpc";
        Directory.CreateDirectory(Path.Combine(dataRoot,"bt-network"));int peerPort;do{peerPort=FreePort();}while(peerPort==port);
        if(BtLocalOnly&&BtLocalDhtPort>0)btPeerEntry=new IPEndPoint(IPAddress.Loopback,BtLocalDhtPort);
        if(!BtLocalOnly&&jobs.Any(job=>TorrentInfo.IsBt(job)&&!job.BtPrivate&&new[]{"排队中","等待下载","下载中","等待节点"}.Contains(job.Status))){var entry=DhtBootstrap.Find(new[]{"dht.transmissionbt.com:6881","router.bt.ouinet.work:6881","dht.libtorrent.org:25401"},3000);btBootstrapVerified=entry!=null;btPeerEntry=entry;btBootstrapEntry=entry==null?null:entry.ToString();}
        btAria=Util.Start(Path.Combine(Util.Root,"bin","aria2c.exe"),BtArguments(port,peerPort));btAria.OutputDataReceived+=(s,e)=>{};btAria.ErrorDataReceived+=(s,e)=>{};try{btAria.Start();}catch{btAria.Dispose();btAria=null;throw;}btAria.BeginOutputReadLine();btAria.BeginErrorReadLine();for(int n=0;n<40;n++){try{BtRpc("getVersion");return;}catch{if(btAria.HasExited)break;Thread.Sleep(100);}}Util.KillTree(btAria);throw new Exception("BT 下载内核启动失败");
    }
    string TorrentSource(Download job){return Path.Combine(Work(job),"source.torrent");}
    void UniqueBt(string hash){if(jobs.Any(j=>TorrentInfo.IsBt(j)&&j.BtHash==hash))throw new Exception("已有相同 BT 任务，请继续原任务；需要另建时先删除旧任务，可选择保留文件");}
    public Download ImportTorrent(string path,string folder=null,bool? autoCategorize=null){
        path=Path.GetFullPath(path);if(!path.EndsWith(".torrent",StringComparison.OrdinalIgnoreCase)||!System.IO.File.Exists(path))throw new Exception("请选择不超过 4 MiB 的 .torrent 文件");byte[] bytes=TorrentInfo.Load(path);var info=TorrentInfo.Read(bytes);
        lock(gate){CanAdd(1);UniqueBt(info.Hash);var job=new Download{Id=Guid.NewGuid().ToString("N").Substring(0,16),Url=path,Title=info.Name,Kind="torrent",Folder=Path.GetFullPath(folder??Config.Folder),Status="等待选文件",Stage="双击任务，勾选需要下载的文件",Error="",Speed="",AutoCategorize=autoCategorize??Config.AutoCategorize,BtHash=info.Hash,BtPrivate=info.Private,BtFiles=info.Files,ExpectedSize=info.Total,HasMetadata=true};job.Transfer.Resume=true;Directory.CreateDirectory(Work(job));System.IO.File.WriteAllBytes(TorrentSource(job),bytes);jobs.Add(job);try{Save();}catch{jobs.Remove(job);PublishSnapshot();throw;}return job;}
    }
    void ApplyBtInfo(Download job,TorrentInfo info){if(job.BtHash!=info.Hash)throw new Exception("种子哈希与磁力链接不一致，未开始下载");var previous=(job.BtFiles??new TorrentFileInfo[0]).ToDictionary(f=>f.Index);foreach(var file in info.Files){TorrentFileInfo old;if(previous.TryGetValue(file.Index,out old))file.Completed=Math.Min(file.Length,old.Completed);}job.Title=info.Name;job.BtFiles=info.Files;job.BtPrivate=info.Private;job.HasMetadata=true;job.ExpectedSize=info.Total;SyncBtSelection(job);}
    Dictionary<string,string> BtOptions(Download job,string directory){var options=new Dictionary<string,string>{{"gid",job.Id},{"dir",directory},{"seed-time","0"},{"check-integrity","true"},{"allow-overwrite","false"},{"auto-file-renaming","false"},{"file-allocation","none"},{"bt-stop-timeout","0"},{"bt-max-peers","128"},{"bt-request-peer-speed-limit",(Config.RateKiB>0?Math.Min(5120,Config.RateKiB):5120)+"K"},{"bt-tracker-interval","0"},{"bt-tracker-connect-timeout","10"},{"bt-tracker-timeout","15"},{"all-proxy",ProxyUrl},{"no-proxy","localhost,127.0.0.1,::1"},{"rpc-save-upload-metadata","false"}};if(!BtLocalOnly&&job.HasMetadata&&!job.BtPrivate)options["bt-tracker"]="udp://tracker.opentrackr.org:1337/announce";if(Config.RateKiB>0)options["max-download-limit"]=Config.RateKiB+"K";return options;}
    void StartBt(Download job){
        job.BtProgressAt=DateTime.UtcNow;job.BtLastCompleted=-1;job.BtFinishing=false;job.BtReason=job.BtAdvice="";job.BtDiagnosticAt=DateTime.MinValue;job.BtPeerStatus=null;job.BtDownloadLimit=-1;
        if(job.BtAutoWaiting&&btAria!=null&&!btAria.HasExited){BtRpc("unpause",job.Id);job.BtAutoWaiting=false;job.Status="等待下载";return;}job.BtAutoWaiting=false;
        Directory.CreateDirectory(Work(job));string source=TorrentSource(job);byte[] sourceBytes=System.IO.File.Exists(source)?TorrentInfo.Load(source):null;var sourceInfo=sourceBytes==null?null:TorrentInfo.Read(sourceBytes);if(sourceInfo!=null){ApplyBtInfo(job,sourceInfo);if(!HasBtSelection(job)){job.Status="等待选文件";job.Stage="双击任务，勾选需要下载的文件";return;}}EnsureBt();if(sourceInfo!=null&&!PrepareBtPeers(job))return;
        if(!System.IO.File.Exists(source)){
            if(job.Kind!="magnet")throw new Exception("本机种子副本缺失，请重新导入种子；未完成文件保留");string meta=Path.Combine(Work(job),"metadata");Directory.CreateDirectory(meta);var options=BtOptions(job,meta);options["bt-metadata-only"]="true";options["bt-save-metadata"]="true";BtRpc("addUri",new[]{job.Url},options);job.BtPhase="metadata";job.Stage="正在获取种子信息，等待可用节点";job.Transfer=new TransferInfo();
        }else{
            byte[] bytes=sourceBytes;var info=sourceInfo;if(String.IsNullOrEmpty(job.BtFolder))job.BtFolder=Path.Combine(Util.OutputFolder(job),Util.Name(info.Name)+" ["+job.Id.Substring(0,8)+"]");
            foreach(var file in info.Files){string target=Path.GetFullPath(Path.Combine(job.BtFolder,file.Path.Replace('/',Path.DirectorySeparatorChar)));if(!Util.InDirectory(target,job.BtFolder)||target.Length>=248)throw new Exception("种子保存路径不安全或过长，请选择较短的保存目录");}
            if(job.BtSelected.Any(n=>!info.Files.Any(f=>f.Index==n)))throw new Exception("BT 文件选择无效，请重新选择");Directory.CreateDirectory(job.BtFolder);var options=BtOptions(job,job.BtFolder);options["select-file"]=String.Join(",",job.BtSelected);options["bt-remove-unselected-file"]="false";string tracker=PeerTracker(job);if(tracker!=null)bytes=TorrentInfo.WithPeerTracker(bytes,tracker);BtRpc("addTorrent",Convert.ToBase64String(bytes),new string[0],options);job.BtPhase="content";job.Stage=tracker==null?"正在连接 BT 节点":"正在优先重连最近可用节点";
        }job.Status="等待下载";
    }
    void TickBt(){
        if(btAria==null)return;foreach(var job in jobs.Where(j=>TorrentInfo.IsBt(j)&&new[]{"下载中","等待下载","正在暂停"}.Contains(j.Status)).ToArray())try{
            var state=(IDictionary<string,object>)BtRpc("tellStatus",job.Id);string status=Util.Str(state,"status");
            if(job.BtPhase=="metadata"){
                job.Transfer.Connections=(int)TransferData.Number(state,"connections");job.Stage="正在获取种子信息，等待可用节点";
                if(status=="complete"){string path=Path.Combine(Work(job),"metadata",job.BtHash+".torrent");byte[] bytes=TorrentInfo.Load(path);var info=TorrentInfo.Read(bytes);ApplyBtInfo(job,info);System.IO.File.WriteAllBytes(TorrentSource(job),bytes);BtRpc("removeDownloadResult",job.Id);job.Status="等待选文件";job.Stage="种子信息已获取，双击选择文件";job.BtPhase="";Save();continue;}
            }else{
                if(!String.Equals(Util.Str(state,"infoHash"),job.BtHash,StringComparison.OrdinalIgnoreCase))throw new Exception("BT 内核返回了不匹配的种子哈希");TransferData.FileStatus(job,state);job.Transfer.Resume=true;object list;if(state.TryGetValue("files",out list))foreach(IDictionary<string,object> file in ((IEnumerable)list).Cast<object>()){int index=(int)TransferData.Number(file,"index");var entry=(job.BtFiles??new TorrentFileInfo[0]).FirstOrDefault(f=>f.Index==index);if(entry!=null)entry.Completed=Math.Min(entry.Length,Math.Max(0,TransferData.Number(file,"completedLength")));}
                SyncBtSelection(job);long peers=TransferData.Number(state,"connections"),seeders=TransferData.Number(state,"numSeeders");job.Stage=peers>0?"已连接 "+peers+" 个节点"+(seeders>=0?"，其中 "+seeders+" 个做种":""):"等待可用节点";
                if(status=="complete"){job.Status="已完成";job.File=job.BtFolder;job.Progress=100;job.Speed="";job.Stage="所选文件下载完成，已停止做种";job.BtReason=job.BtAdvice="";DropBtPeers(job);foreach(var file in (job.BtFiles??new TorrentFileInfo[0]).Where(f=>f.Selected))file.Completed=file.Length;SyncBtSelection(job);Save();continue;}
                if(status=="active"&&BtPayloadVerified(job,state)&&!job.BtFinishing){
                    // seeder is aria2's verified selected-piece completion, not rounded UI progress.
                    // Force stopping only cancels tracker housekeeping. aria2 still flushes/closes files
                    // and publishes its terminal complete/error result before we report success.
                    try{BtRpc("forceRemove",job.Id);}catch{if(Util.Str((IDictionary<string,object>)BtRpc("tellStatus",job.Id),"status")!="complete")throw;}job.BtFinishing=true;
                }
                if(job.BtFinishing&&status=="active"){job.Stage=job.BtReason="文件已校验，正在保存并结束连接";job.BtAdvice="等待内核保存结果后再显示完成，无需重复下载。";job.Transfer.Speed=0;job.Speed="";continue;}
            }
            if(status=="active"&&!job.PauseRequested)job.Status="下载中";else if(status=="waiting"&&!job.PauseRequested)job.Status="等待下载";else if(status=="paused"){job.Status="已暂停";job.Speed="";Save();}else if(status=="error"||status=="removed")throw new Exception(Util.Str(state,"errorMessage","BT 下载中断，请继续重试"));
            if((status=="active"||status=="waiting")&&!job.PauseRequested)UpdateBtDiagnostic(job,state);
            if((status=="active"||status=="waiting")&&!job.PauseRequested){
                long done=TransferData.Number(state,"completedLength"),speed=TransferData.Number(state,"downloadSpeed");var now=DateTime.UtcNow;
                if(done>job.BtLastCompleted||speed>0||state.ContainsKey("verifiedLength")||Util.Str(state,"verifyIntegrityPending")=="true"){job.BtProgressAt=now;job.BtLastCompleted=done;}
                if(job.BtProgressAt!=DateTime.MinValue&&now-job.BtProgressAt>=TimeSpan.FromSeconds(60)&&jobs.Any(j=>j.Id!=job.Id&&j.Status=="排队中"&&(j.Kind=="file"||TorrentInfo.IsBt(j))&&BtMetadataJob(j)==BtMetadataJob(job))){
                    CacheBtPeers(job);BtRpc("forcePause",job.Id);job.BtAutoWaiting=true;job.BtRetryAt=now.AddSeconds(30);job.Status="等待节点";job.Stage="暂时让出下载名额，30 秒后重新排队";job.Speed="";Save();
                }
            }
        }catch(Exception ex){job.Status="失败";job.Speed="";job.Error=Util.SafeError(ex.Message);Save();}
    }
    static bool BtPayloadVerified(Download job,IDictionary<string,object> state){return Util.Str(state,"seeder")=="true"&&!state.ContainsKey("verifiedLength")&&Util.Str(state,"verifyIntegrityPending")!="true"&&HasBtSelection(job)&&job.Transfer.Total>0&&job.Transfer.Completed==job.Transfer.Total;}
    void ResetBt(Download job){CancelBtSearch(job.Id);job.BtAutoWaiting=false;job.BtFinishing=false;job.BtRetryAt=DateTime.MinValue;if(btAria==null||btAria.HasExited)return;try{BtRpc("forceRemove",job.Id);}catch{}try{BtRpc("removeDownloadResult",job.Id);}catch{}}
    void StopBt(){if(btPeerSearchCancel!=null){btPeerSearchCancel.Cancel();btPeerSearchCancel.Dispose();btPeerSearchCancel=null;btPeerSearch=null;btPeerSearchId=null;}if(btAria!=null&&!btAria.HasExited)foreach(var job in jobs.Where(j=>TorrentInfo.IsBt(j)&&new[]{"下载中","等待下载","正在暂停"}.Contains(j.Status)&&!j.BtFinishing))CacheBtPeers(job);if(btPeerTracker!=null){btPeerTracker.Stop();btPeerTracker=null;}lock(btPeerHints)btPeerHints.Clear();if(btAria==null)return;try{if(!btAria.HasExited){BtRpc("forcePauseAll");BtRpc("shutdown");}}catch{}if(!btAria.WaitForExit(5000))Util.KillTree(btAria);btAria.Dispose();btAria=null;}
}
}
