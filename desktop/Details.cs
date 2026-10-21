// Download detail data and window. Values come from engines; unknown stays unknown.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace ShiyingDesktop {
public class TransferInfo {
    public long Total=-1, Completed=-1, Speed=-1, Eta=-1, PieceLength;
    public int Pieces, Connections=-1, FragmentIndex=-1, FragmentCount=-1;
    public bool? Resume;
    public bool Estimated;
    public string Bitfield="", Scope="";
}
public class DownloadSegment {
    public int Number;
    public long Start, End, Completed;
    public long Length {get{return End-Start;}}
    public double Percent {get{return Length>0?100.0*Completed/Length:0;}}
}
public static class TransferData {
    static readonly CultureInfo Invariant=CultureInfo.InvariantCulture;
    public static long Number(IDictionary<string,object> data,string key){
        object value;decimal number;
        if(!data.TryGetValue(key,out value)||value==null||value is bool||!Decimal.TryParse(Convert.ToString(value,Invariant),NumberStyles.Float,Invariant,out number)||number<0||number>Int64.MaxValue)return -1;
        return (long)number;
    }
    public static void FileStatus(Download job,IDictionary<string,object> data){
        var t=job.Transfer??(job.Transfer=new TransferInfo());
        long total=Number(data,"totalLength");t.Completed=Number(data,"completedLength");t.Speed=Number(data,"downloadSpeed");
        t.Total=total>0?total:job.HasMetadata&&job.ExpectedSize>=0?job.ExpectedSize:Util.Str(data,"status")=="complete"&&t.Completed==0?0:-1;
        if(t.Total>=0&&t.Completed>t.Total)t.Total=-1;
        t.Estimated=false;t.Scope="";t.Connections=(int)Math.Min(Int32.MaxValue,Number(data,"connections"));
        t.PieceLength=Number(data,"pieceLength");t.Pieces=(int)Math.Min(Int32.MaxValue,Math.Max(0,Number(data,"numPieces")));
        t.Bitfield=Util.Str(data,"bitfield");t.Eta=Estimate(t.Total,t.Completed,t.Speed);
        job.Progress=t.Total>0&&t.Completed>=0?Math.Min(100,100.0*t.Completed/t.Total):Util.Str(data,"status")=="complete"?100:0;
        job.Speed=t.Speed>=0?Bytes(t.Speed)+"/s":"";
    }
    public static void VideoStatus(Download job,string json){
        Dictionary<string,object> data;try{data=Util.Json().Deserialize<Dictionary<string,object>>(json);}catch{return;}if(data==null)return;
        var t=job.Transfer??(job.Transfer=new TransferInfo());
        t.Scope=Util.Str(data,"vcodec")=="none"?"当前声音轨":Util.Str(data,"acodec")=="none"?"当前画面轨":"当前媒体";
        t.Completed=Number(data,"downloaded_bytes");t.Total=Number(data,"total_bytes");t.Estimated=false;
        if(t.Total<0){t.Total=Number(data,"total_bytes_estimate");t.Estimated=t.Total>=0;}
        if(t.Total>=0&&t.Completed>t.Total)t.Total=-1;
        t.Speed=Number(data,"speed");t.Eta=Number(data,"eta");
        t.FragmentIndex=(int)Math.Min(Int32.MaxValue,Number(data,"fragment_index"));t.FragmentCount=(int)Math.Min(Int32.MaxValue,Number(data,"fragment_count"));
        t.Bitfield="";t.Pieces=0;t.PieceLength=0;t.Connections=-1;t.Resume=null;
        job.Progress=t.Total>0&&t.Completed>=0?Math.Min(99,100.0*t.Completed/t.Total):0;
        job.Speed=t.Speed>=0?Bytes(t.Speed)+"/s":"";job.Stage=t.Scope=="当前声音轨"?"正在下载声音":t.Scope=="当前画面轨"?"正在下载画面":"正在下载内容";
    }
    public static void Complete(Download job){
        var t=job.Transfer??(job.Transfer=new TransferInfo());
        try{if(File.Exists(job.File)){t.Total=t.Completed=new FileInfo(job.File).Length;t.Estimated=false;}}catch(IOException){}
        t.Eta=0;t.Speed=0;t.Connections=0;t.Scope="";
    }
    public static long Estimate(long total,long done,long speed){if(total<0||done<0||done>total||speed<=0)return -1;double value=Math.Ceiling((total-done)/(double)speed);return value>=Int64.MaxValue?-1:(long)value;}
    public static string Bytes(long value){
        if(value<0)return "未知";string[] units={"B","KiB","MiB","GiB","TiB","PiB"};double size=value;int unit=0;while(size>=1024&&unit<units.Length-1){size/=1024;unit++;}return size.ToString(unit==0?"0":"0.##",Invariant)+" "+units[unit];
    }
    public static string Remaining(Download job){
        if(TorrentInfo.IsBt(job)&&(job.Stage??"").Contains("正在保存"))return "正在收尾";
        if(job.Status=="等待节点")return "等待节点重试";
        if(job.Status=="等待选文件")return "等待选择文件";
        if(job.Status=="已完成")return "已完成";if(job.Status=="已暂停"||job.Status=="正在暂停")return "已暂停";
        if(job.Status=="排队中"||job.Status=="等待下载")return "等待开始";if(job.Status=="准备组件")return "准备组件中";if(job.Status!="下载中")return "—";
        if((job.Stage??"").Contains("合并")||(job.Stage??"").Contains("转换")||(job.Stage??"").Contains("整理"))return "正在整理";
        var t=job.Transfer??new TransferInfo();long seconds=job.Kind=="file"||TorrentInfo.IsBt(job)?Estimate(t.Total,t.Completed,t.Speed):t.Eta;
        if(seconds<0||t.Speed<=0)return "计算中";if(seconds<60)return "约 "+seconds+" 秒";if(seconds<3600)return "约 "+(seconds/60)+" 分 "+(seconds%60)+" 秒";if(seconds<86400)return "约 "+(seconds/3600)+" 小时 "+(seconds%3600/60)+" 分";return "约 "+(seconds/86400)+" 天";
    }
    public static bool HasVersion(Download job){return !String.IsNullOrEmpty(job.ETag)&&!job.ETag.StartsWith("W/")||!String.IsNullOrEmpty(job.Modified);}
    public static string ResumeText(Download job){if(TorrentInfo.IsBt(job))return job.HasMetadata?"支持（分块校验）":"获取信息后确认";if(job.Kind!="file")return "取决于源站";var t=job.Transfer??new TransferInfo();return t.Resume==true?HasVersion(job)?"支持":"无法安全续传":t.Resume==false?"不支持":"尚未确认";}
    // aria2 schedules fixed-size pieces dynamically. These are file ranges, not invented thread slots.
    public static DownloadSegment[] Segments(Download job){
        var t=job.Transfer;long total=TorrentInfo.IsBt(job)?job.ExpectedSize:t==null?-1:t.Total;if(job.Kind!="file"&&!TorrentInfo.IsBt(job)||t==null||total<=0||t.PieceLength<=0||t.Pieces<=0||t.Pieces>4000000||(total-1)/t.PieceLength+1!=t.Pieces)return new DownloadSegment[0];
        bool complete=job.Status=="已完成"&&t.Completed==t.Total&&(!TorrentInfo.IsBt(job)||(job.BtFiles??new TorrentFileInfo[0]).All(f=>f.Selected));
        if(!complete&&(t.Bitfield==null||t.Bitfield.Length!=(t.Pieces+7)/8*2||t.Bitfield.Any(c=>!Uri.IsHexDigit(c))))return new DownloadSegment[0];
        int groups=Math.Min(16,t.Pieces);var result=new List<DownloadSegment>();
        for(int n=0;n<groups;n++){
            int first=(int)((long)n*t.Pieces/groups),last=(int)((long)(n+1)*t.Pieces/groups);
            var row=new DownloadSegment{Number=n+1,Start=first*t.PieceLength,End=last==t.Pieces?total:last*t.PieceLength};
            for(int piece=first;piece<last;piece++)if(complete||(Convert.ToInt32(t.Bitfield[piece/4].ToString(),16)&(8>>(piece%4)))!=0)row.Completed+=piece==t.Pieces-1?total-(long)piece*t.PieceLength:t.PieceLength;
            result.Add(row);
        }return result.ToArray();
    }
}

class DownloadProgress:Control {
    public double Value;
    public bool Complete,Known;
    public DownloadProgress(){DoubleBuffered=true;BackColor=Color.Black;AccessibleName="总下载进度";}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var bar=new Rectangle(0,8,Math.Max(1,Width),4);using(var back=new SolidBrush(Color.FromArgb(59,83,111)))e.Graphics.FillRectangle(back,bar);if(Known&&Value>0){bar.Width=Math.Max(1,(int)(bar.Width*Math.Min(100,Math.Max(0,Value))/100));using(var fill=new SolidBrush(Complete?Color.FromArgb(126,176,157):Color.FromArgb(95,185,255)))e.Graphics.FillRectangle(fill,bar);}}
}
class SegmentMap:Control {
    public DownloadSegment[] Segments=new DownloadSegment[0];
    public SegmentMap(){DoubleBuffered=true;AccessibleName="按文件位置排列的分段进度";}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);int count=Segments.Length;if(count==0)return;for(int n=0;n<count;n++){int x=n*Width/count,end=(n+1)*Width/count;var box=new Rectangle(x,7,Math.Max(1,end-x-3),8);using(var brush=new SolidBrush(Color.FromArgb(59,83,111)))e.Graphics.FillRectangle(brush,box);if(Segments[n].Percent>0){box.Width=Math.Max(1,(int)(box.Width*Segments[n].Percent/100));using(var brush=new SolidBrush(Segments[n].Percent>=100?Color.FromArgb(126,176,157):Color.FromArgb(95,185,255)))e.Graphics.FillRectangle(brush,box);}}}
}
public class DownloadDetailsWindow:Form {
    readonly Manager manager;
    readonly string jobId;
    readonly Label name=new Label(),state=new Label(),percent=new Label(),scope=new Label(),segmentNote=new Label(),notice=new Label(),empty=new Label();
    readonly TextBox source=new TextBox(),destination=new TextBox();
    readonly Label[] values=new Label[6];
    readonly DataGridView grid=new TaskGrid();
    readonly DownloadProgress progress=new DownloadProgress();
    readonly SegmentMap map=new SegmentMap();
    readonly Button pause,resume,choose;
    readonly Button fileView=new QuietButton();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    static readonly Color Blue=Color.FromArgb(95,185,255),Ink=Color.FromArgb(255,255,255),Muted=Color.FromArgb(196,214,235),Wash=Color.FromArgb(17,29,46),Line=Color.FromArgb(59,83,111);
    bool busy,showFiles=true;
    public DownloadDetailsWindow(Manager owner,string id){
        manager=owner;jobId=id;Text="下载详情 · Ruxget";Font=new Font("Microsoft YaHei UI",9.5f);BackColor=Color.Black;ForeColor=Ink;Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);ClientSize=new Size(900,760);MinimumSize=new Size(800,680);AutoScaleDimensions=new SizeF(96,96);AutoScaleMode=AutoScaleMode.Dpi;HandleCreated+=(sender,args)=>MainWindow.ApplyDarkFrame(this);StartPosition=FormStartPosition.CenterParent;
        var header=new Panel{Dock=DockStyle.Top,Height=88,Padding=new Padding(26,20,26,8)};
        name.Dock=DockStyle.Top;name.Height=34;name.Font=new Font(Font.FontFamily,13,FontStyle.Bold);name.AutoEllipsis=true;header.Controls.Add(name);
        state.Dock=DockStyle.Bottom;state.Height=25;state.ForeColor=Blue;state.AutoEllipsis=true;header.Controls.Add(state);
        var locations=new TableLayoutPanel{Dock=DockStyle.Top,Height=72,Padding=new Padding(26,2,26,6),ColumnCount=3,RowCount=2};locations.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,64));locations.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));locations.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,66));locations.RowStyles.Add(new RowStyle(SizeType.Percent,50));locations.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        foreach(var pair in new[]{new{Label="下载地址",Box=source},new{Label="保存到",Box=destination}}){int row=pair.Box==source?0:1;locations.Controls.Add(new Label{Text=pair.Label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Muted},0,row);pair.Box.ReadOnly=true;pair.Box.Dock=DockStyle.Fill;pair.Box.BackColor=Wash;pair.Box.BorderStyle=BorderStyle.None;pair.Box.AccessibleName=pair.Label;pair.Box.Margin=new Padding(0,3,0,4);locations.Controls.Add(pair.Box,1,row);}
        var copy=ActionButton("复制");copy.Dock=DockStyle.Fill;copy.Margin=new Padding(8,2,0,3);copy.Click+=(s,e)=>{try{Clipboard.SetText(source.Text);}catch(Exception ex){ShowError(ex);}};locations.Controls.Add(copy,2,0);
        var metrics=new TableLayoutPanel{Dock=DockStyle.Top,Height=132,ColumnCount=3,RowCount=2,Padding=new Padding(26,10,26,4)};for(int c=0;c<3;c++)metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100f/3));for(int r=0;r<2;r++)metrics.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        string[] captions={"文件大小","已经下载","传输速度","预计剩余","能否续传","活动连接"};for(int n=0;n<6;n++){var cell=new Panel{Dock=DockStyle.Fill,Margin=Padding.Empty};cell.Controls.Add(new Label{Text=captions[n],Dock=DockStyle.Top,Height=23,ForeColor=Muted,Font=new Font(Font.FontFamily,8.5f)});values[n]=new Label{Dock=DockStyle.Bottom,Height=36,Font=new Font(Font.FontFamily,12),AutoEllipsis=true,Text="未知"};cell.Controls.Add(values[n]);metrics.Controls.Add(cell,n%3,n/3);}
        var overall=new Panel{Dock=DockStyle.Top,Height=62,Padding=new Padding(26,3,26,0)};percent.Dock=DockStyle.Top;percent.Height=23;percent.ForeColor=Blue;percent.Font=new Font(Font.FontFamily,10,FontStyle.Bold);overall.Controls.Add(percent);progress.Dock=DockStyle.Bottom;progress.Height=28;overall.Controls.Add(progress);scope.Dock=DockStyle.Bottom;scope.Height=17;scope.ForeColor=Muted;scope.Font=new Font(Font.FontFamily,8);scope.AutoEllipsis=true;overall.Controls.Add(scope);
        var segmentHeader=new Panel{Dock=DockStyle.Top,Height=58,Padding=new Padding(26,6,26,0)};segmentHeader.Controls.Add(new Label{Text="分段进度",Font=new Font(Font.FontFamily,11,FontStyle.Bold),Dock=DockStyle.Top,Height=26});segmentNote.Dock=DockStyle.Bottom;segmentNote.Height=28;segmentNote.ForeColor=Muted;segmentNote.Font=new Font(Font.FontFamily,8.5f);segmentNote.AutoEllipsis=true;segmentHeader.Controls.Add(segmentNote);
        fileView.Text="查看分段";fileView.SetBounds(26,4,110,26);fileView.FlatStyle=FlatStyle.Flat;fileView.FlatAppearance.BorderColor=Line;segmentHeader.SizeChanged+=(s,e)=>fileView.Left=Math.Max(26,segmentHeader.ClientSize.Width-136);fileView.Click+=(s,e)=>{showFiles=!showFiles;RefreshInfo();};segmentHeader.Controls.Add(fileView);fileView.BringToFront();
        var mapPanel=new Panel{Dock=DockStyle.Top,Height=30,Padding=new Padding(26,0,26,0)};map.Dock=DockStyle.Fill;mapPanel.Controls.Add(map);
        var list=new Panel{Dock=DockStyle.Fill,Padding=new Padding(26,0,26,0)};grid.Dock=DockStyle.Fill;grid.ReadOnly=true;grid.AllowUserToAddRows=false;grid.AllowUserToDeleteRows=false;grid.AllowUserToResizeRows=false;grid.RowHeadersVisible=false;grid.MultiSelect=false;grid.SelectionMode=DataGridViewSelectionMode.FullRowSelect;grid.BorderStyle=BorderStyle.None;grid.BackgroundColor=Color.Black;grid.CellBorderStyle=DataGridViewCellBorderStyle.SingleHorizontal;grid.GridColor=Line;grid.EnableHeadersVisualStyles=false;grid.ColumnHeadersHeight=34;grid.ColumnHeadersHeightSizeMode=DataGridViewColumnHeadersHeightSizeMode.DisableResizing;grid.RowTemplate.Height=32;grid.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;grid.ColumnHeadersDefaultCellStyle=new DataGridViewCellStyle{BackColor=Wash,ForeColor=Muted,SelectionBackColor=Wash,Padding=new Padding(8,0,0,0)};grid.DefaultCellStyle=new DataGridViewCellStyle{BackColor=Color.Black,ForeColor=Color.FromArgb(255,255,255),Padding=new Padding(8,0,0,0),SelectionBackColor=Color.FromArgb(24,57,88),SelectionForeColor=Ink};
        foreach(string label in new[]{"分段","文件位置","已完成","分段大小","进度","状态"})grid.Columns.Add(label,label);float[] weights={7,26,17,17,13,20};for(int n=0;n<weights.Length;n++){grid.Columns[n].FillWeight=weights[n];grid.Columns[n].SortMode=DataGridViewColumnSortMode.NotSortable;}grid.Columns[0].MinimumWidth=46;
        empty.Dock=DockStyle.Fill;empty.TextAlign=ContentAlignment.MiddleCenter;empty.ForeColor=Muted;list.Controls.Add(grid);list.Controls.Add(empty);
        var footer=new Panel{Dock=DockStyle.Bottom,Height=90,Padding=new Padding(26,8,26,12),BackColor=Wash};notice.Dock=DockStyle.Top;notice.Height=34;notice.AutoEllipsis=true;notice.ForeColor=Muted;notice.Font=new Font(Font.FontFamily,8.5f);footer.Controls.Add(notice);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=38,FlowDirection=FlowDirection.RightToLeft,WrapContents=false};var close=ActionButton("关闭详情");pause=ActionButton("暂停");resume=ActionButton("继续 / 重试",true);choose=ActionButton("选择文件");choose.Click+=(s,e)=>{using(var picker=new TorrentSelectionWindow(manager,jobId))picker.ShowDialog(this);RefreshInfo();};close.Click+=(s,e)=>Close();pause.Click+=async(s,e)=>await Operate(false);resume.Click+=async(s,e)=>await Operate(true);actions.Controls.AddRange(new Control[]{close,resume,pause,choose});footer.Controls.Add(actions);CancelButton=close;
        Controls.Add(list);Controls.Add(footer);Controls.Add(mapPanel);Controls.Add(segmentHeader);Controls.Add(overall);Controls.Add(metrics);Controls.Add(locations);Controls.Add(header);
        timer.Interval=700;timer.Tick+=(s,e)=>RefreshInfo();FormClosed+=(s,e)=>timer.Dispose();RefreshInfo();timer.Start();
    }
    Button ActionButton(string text,bool primary=false){return new QuietButton{Text=text,Width=112,Height=34,Margin=new Padding(8,0,0,0),FlatStyle=FlatStyle.Flat,BackColor=primary?Blue:Color.Black,ForeColor=primary?Color.Black:Ink,FlatAppearance={BorderColor=Line,BorderSize=primary?0:1}};}
    void ShowError(Exception ex){if(!IsDisposed)MessageBox.Show(this,ex.Message,"Ruxget",MessageBoxButtons.OK,MessageBoxIcon.Information);}
    async System.Threading.Tasks.Task Operate(bool start){if(busy)return;busy=true;pause.Enabled=resume.Enabled=false;try{await System.Threading.Tasks.Task.Run(()=>{if(start)manager.Resume(jobId);else manager.Pause(jobId);});}catch(Exception ex){ShowError(ex);}finally{busy=false;if(!IsDisposed)RefreshInfo();}}
    public void RefreshInfo(){
        var job=manager.Snapshot().FirstOrDefault(j=>j.Id==jobId);if(job==null){pause.Enabled=resume.Enabled=choose.Enabled=false;notice.Text="任务记录已移除，窗口保留最后一次信息。";timer.Stop();return;}var t=job.Transfer??new TransferInfo();bool active=job.Status=="下载中",bt=TorrentInfo.IsBt(job);fileView.Visible=bt;fileView.Text=showFiles?"查看分段":"查看文件";choose.Visible=bt;choose.Enabled=!busy&&bt&&job.HasMetadata&&new[]{"等待选文件","已暂停","失败","已完成"}.Contains(job.Status);
        name.Text=job.Title;state.Text=job.Status+((active||job.Status=="准备组件")&&!String.IsNullOrEmpty(job.Stage)?" · "+job.Stage:"");state.ForeColor=job.Status=="失败"?Color.FromArgb(255,181,181):job.Status=="已完成"?Color.FromArgb(159,230,176):Blue;
        if(source.Text!=job.Url)source.Text=job.Url;string folder=String.IsNullOrEmpty(job.File)?Util.OutputFolder(job):job.File;if(destination.Text!=folder)destination.Text=folder;
        values[0].Text=(t.Estimated&&t.Total>=0?"约 ":"")+TransferData.Bytes(t.Total);values[1].Text=TransferData.Bytes(t.Completed);values[2].Text=active&&t.Speed>=0?TransferData.Bytes(t.Speed)+"/s":"—";values[3].Text=TransferData.Remaining(job);values[4].Text=TransferData.ResumeText(job);values[5].Text=(job.Kind=="file"||bt)&&active&&t.Connections>=0?t.Connections+" 个":"—";
        progress.Value=job.Progress;progress.Complete=job.Status=="已完成";progress.Known=t.Total>0||progress.Complete||job.Status=="准备组件";progress.Invalidate();percent.Text=progress.Known?job.Progress.ToString("0.#",CultureInfo.InvariantCulture)+"%"+(job.Status=="准备组件"?" · 组件准备":""):(t.Completed>=0?"正在接收，大小尚未确定":"等待下载信息");
        scope.Text=bt?"总进度只统计所选文件；下方分段图保留整个种子的物理位置。":job.Kind!="file"&&job.Status!="已完成"?((String.IsNullOrEmpty(t.Scope)?"视频大小由源站提供":t.Scope+"；大小和进度仅针对当前轨")+(t.Estimated?"（估计）":"")):"绿色：已完成　蓝色：部分完成　灰色：尚未完成";
        var segments=TransferData.Segments(job);map.Segments=segments;map.Invalidate();grid.Visible=segments.Length>0;empty.Visible=segments.Length==0;
        segmentNote.Text=segments.Length>0?"分为 "+segments.Length+" 个文件区间；按已完成的数据块统计，写入中的块暂不计入。":job.Kind!="file"?(t.FragmentCount>0?"当前分片 "+Math.Max(0,t.FragmentIndex)+" / "+t.FragmentCount+"；内核暂不提供各分片独立字节进度。":"视频内核暂不提供分片独立字节进度。"):"收到分段信息后显示；此图表示文件区间，不是固定线程。";
        empty.Text=job.Kind!="file"?"暂时无法显示独立分片进度\n总进度和当前媒体轨信息见上方。":"暂未收到可显示的数据块信息\n未知大小、尚未开始或旧任务可能没有分段记录。";
        if(!(bt&&showFiles)){
        if(grid.Rows.Count!=segments.Length){grid.Rows.Clear();foreach(var row in segments)grid.Rows.Add();}
        for(int n=0;n<segments.Length;n++){var row=segments[n];object[] cells={row.Number,TransferData.Bytes(row.Start)+" – "+TransferData.Bytes(row.End),TransferData.Bytes(row.Completed),TransferData.Bytes(row.Length),row.Percent.ToString("0.#",CultureInfo.InvariantCulture)+"%",row.Completed==row.Length?"已完成":job.Status=="已暂停"?"已暂停":row.Completed>0?"部分完成":"尚未完成"};for(int c=0;c<cells.Length;c++)if(!Object.Equals(grid.Rows[n].Cells[c].Value,cells[c]))grid.Rows[n].Cells[c].Value=cells[c];grid.Rows[n].Cells[1].ToolTipText=row.Start.ToString("N0")+" – "+(row.End-1).ToString("N0")+" 字节（包含端点）";}
        }
        if(bt&&showFiles){var files=job.BtFiles??new TorrentFileInfo[0];string[] columns={"序号","文件","已完成","文件大小","进度","状态"};for(int c=0;c<columns.Length;c++)grid.Columns[c].HeaderText=columns[c];if(grid.Rows.Count!=files.Length){grid.Rows.Clear();foreach(var file in files)grid.Rows.Add();}for(int row=0;row<files.Length;row++){var file=files[row];object[] cells={file.Index,file.Path,TransferData.Bytes(file.Completed),TransferData.Bytes(file.Length),file.Selected?(file.Length>0?(100.0*file.Completed/file.Length).ToString("0.#",CultureInfo.InvariantCulture)+"%":"100%"):"—",!file.Selected?"未选择":file.Completed==file.Length?"已完成":job.Status=="已暂停"?"已暂停":"未完成"};for(int c=0;c<cells.Length;c++)if(!Object.Equals(grid.Rows[row].Cells[c].Value,cells[c]))grid.Rows[row].Cells[c].Value=cells[c];grid.Rows[row].Cells[1].ToolTipText=file.Path;}grid.Visible=files.Length>0;empty.Visible=files.Length==0;empty.Text="等待从 BT 节点获取种子文件列表。\n无可用节点时可暂停，稍后继续。";segmentNote.Text="已选 "+files.Count(f=>f.Selected)+" / "+files.Length+" 个文件；可暂停后重新选择。";}
        else{string[] columns={"分段","文件位置","已完成","分段大小","进度","状态"};for(int c=0;c<columns.Length;c++)grid.Columns[c].HeaderText=columns[c];}
        notice.Text=!String.IsNullOrEmpty(job.Error)?job.Error:job.Status=="准备组件"?"这里显示组件准备进度；视频大小将在开始读取媒体后显示。":job.Kind=="file"?t.Resume==true?(TransferData.HasVersion(job)?"服务器已响应分段请求；续传前仍会核对源文件版本，无法核对时保留原数据。":"服务器支持分段，但缺少可核对的文件版本；不能安全续传，原数据会保留。"):t.Resume==false?"服务器未响应分段请求，暂停后重试可能需要重新下载。":"开始下载后确认服务器是否支持续传；无法确认的数据保持未知。":"视频可能分别下载画面与声音，随后合并；最终大小以完成文件为准。";
        if(bt&&String.IsNullOrEmpty(job.Error))notice.Text=job.Status=="等待选文件"?"文件列表已就绪，点击「选择文件」勾选后才会下载内容。":job.Status=="等待节点"?"正在等待可用节点，会自动重试；点击暂停可停止自动重试。":job.Status=="已暂停"||job.Status=="正在暂停"?"已暂停，已有数据会保留；继续后先核对已有文件。":job.Status=="排队中"?"正在等待下载名额，前面的任务完成或暂停后会自动开始。":job.Status=="已完成"?"所选文件已校验完成，已停止做种。":!String.IsNullOrEmpty(job.BtReason)?job.BtReason+"\r\n"+job.BtAdvice:"正在读取下载状态，稍后显示原因和处理建议。";
        notice.ForeColor=String.IsNullOrEmpty(job.Error)?Muted:Color.FromArgb(255,181,181);pause.Enabled=!busy&&new[]{"下载中","等待下载","排队中","准备组件","等待节点"}.Contains(job.Status);resume.Enabled=!busy&&(job.Status=="已暂停"||job.Status=="失败"||job.Status=="等待节点");
        pause.BackColor=pause.Enabled?Blue:Color.Black;pause.ForeColor=pause.Enabled?Color.Black:Muted;resume.BackColor=resume.Enabled?Blue:Color.Black;resume.ForeColor=resume.Enabled?Color.Black:Muted;
    }
}
}
