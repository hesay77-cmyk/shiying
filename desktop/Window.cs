// Ruxget 桌面界面。标准 WinForms 控件保留键盘、缩放和辅助功能支持。GPL-3.0-or-later。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ShiyingDesktop {
class TaskGrid : DataGridView {
    public TaskGrid(){DoubleBuffered=true;}
    protected override void ScaleControl(SizeF factor,BoundsSpecified specified){
        int template=RowTemplate.Height;var heights=Rows.Cast<DataGridViewRow>().Select(row=>row.Height).ToArray();
        base.ScaleControl(factor,specified);
        RowTemplate.Height=Math.Max(2,(int)Math.Round(template*factor.Height));
        for(int n=0;n<Math.Min(heights.Length,Rows.Count);n++)Rows[n].Height=Math.Max(2,(int)Math.Round(heights[n]*factor.Height));
    }
}
class QuietButton : Button {
    bool hover;
    public QuietButton(){DoubleBuffered=true;Cursor=Cursors.Hand;MouseEnter+=(s,e)=>{hover=true;Invalidate();};MouseLeave+=(s,e)=>{hover=false;Invalidate();};}
    protected override void OnPaint(PaintEventArgs e){
        var bounds=new Rectangle(0,0,Math.Max(1,Width-1),Math.Max(1,Height-1));int d=Math.Min(18,Math.Min(bounds.Width,bounds.Height));
        using(var path=new GraphicsPath()){path.AddArc(0,0,d,d,180,90);path.AddArc(bounds.Right-d,0,d,d,270,90);path.AddArc(bounds.Right-d,bounds.Bottom-d,d,d,0,90);path.AddArc(0,bounds.Bottom-d,d,d,90,90);path.CloseFigure();e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            Color fill=!Enabled?Color.FromArgb(17,29,46):hover?(BackColor==Color.Black?Color.FromArgb(17,29,46):ControlPaint.Light(BackColor,.12f)):BackColor;using(var brush=new SolidBrush(fill))e.Graphics.FillPath(brush,path);
            if(Focused){using(var pen=new Pen(Color.FromArgb(128,160,224),1.5f))e.Graphics.DrawPath(pen,path);}
        }
        TextRenderer.DrawText(e.Graphics,Text,Font,bounds,Enabled?ForeColor:Color.FromArgb(153,177,203),TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine|TextFormatFlags.EndEllipsis);
    }
}
public class WindowLayout {
    public int Width=920,Height=640,Dpi;
    public bool Maximized,Mini;
}
public partial class MainWindow : Form {
    [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr handle,int attribute,ref int value,int size);
    internal static void ApplyDarkFrame(Form window){
        try{int dark=1,black=0,white=0xffffff,border=0x6f533b;DwmSetWindowAttribute(window.Handle,20,ref dark,4);DwmSetWindowAttribute(window.Handle,35,ref black,4);DwmSetWindowAttribute(window.Handle,36,ref white,4);DwmSetWindowAttribute(window.Handle,34,ref border,4);}catch(DllNotFoundException){}catch(EntryPointNotFoundException){}
    }
    [StructLayout(LayoutKind.Sequential)]struct GlassMargins{public int Left,Right,Top,Bottom;}
    [DllImport("dwmapi.dll")]static extern int DwmExtendFrameIntoClientArea(IntPtr handle,ref GlassMargins margins);
    [DllImport("user32.dll")]static extern bool IsZoomed(IntPtr handle);
    [DllImport("user32.dll")]static extern bool ReleaseCapture();
    [DllImport("user32.dll")]static extern bool PostMessage(IntPtr handle,int message,IntPtr wparam,IntPtr lparam);
    [StructLayout(LayoutKind.Sequential)]struct WindowLimits{public Point Reserved,MaxSize,MaxPosition,MinTrack,MaxTrack;}
    internal bool GlassBackdropEnabled,NativeOutlineSuppressed;
    void ApplyGlassBackdrop(){
        try{int acrylic=3;if(DwmSetWindowAttribute(Handle,38,ref acrylic,4)==0){var margins=new GlassMargins{Left=-1,Right=-1,Top=-1,Bottom=-1};GlassBackdropEnabled=DwmExtendFrameIntoClientArea(Handle,ref margins)==0;int automatic=-1;DwmSetWindowAttribute(Handle,35,ref automatic,4);}}catch(DllNotFoundException){}catch(EntryPointNotFoundException){}
    }
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);ApplyDarkFrame(this);if(resizeFrameEnabled){int noBorder=-2;NativeOutlineSuppressed=DwmSetWindowAttribute(Handle,34,ref noBorder,4)==0;}ApplyGlassBackdrop();}
    protected override void OnPaintBackground(PaintEventArgs e){
        if(!resizeFrameEnabled){base.OnPaintBackground(e);return;}
        e.Graphics.Clear(Color.Transparent);
    }
    bool resizeFrameEnabled;
    protected override CreateParams CreateParams{get{var value=base.CreateParams;if(resizeFrameEnabled)value.Style&=~0x00c00000;return value;}}
    protected override Size SizeFromClientSize(Size value){return resizeFrameEnabled?value:base.SizeFromClientSize(value);}
    protected override void SetClientSizeCore(int width,int height){
        if(!resizeFrameEnabled){base.SetClientSizeCore(width,height);return;}
        SetBoundsCore(Left,Top,width,height,BoundsSpecified.Size);
        UpdateBounds(Left,Top,Width,Height,Width,Height);
    }

    void UpdateResizeFrame(){
        if(!resizeFrameEnabled)return;
        if(Padding!=Padding.Empty)Padding=Padding.Empty;
    }
    Size lastNormalClient,restoredClientRequest;
    Rectangle normalFrame;
    bool lastNormalMaximized;
    WindowLayout rememberedLayout;
    protected override void OnResize(EventArgs e){
        base.OnResize(e);UpdateResizeFrame();
        if(resizeFrameEnabled&&!miniMode){
            if((IsHandleCreated&&IsZoomed(Handle))||WindowState==FormWindowState.Maximized)lastNormalMaximized=true;
            else if(WindowState==FormWindowState.Normal){normalFrame=Bounds;lastNormalClient=ClientSize;lastNormalMaximized=false;}
        }
    }
    void RestoreWindowSize(){
        rememberedLayout=new WindowLayout();string path=Path.Combine(manager.DataDirectory,"window.json");
        foreach(string file in new[]{path,path+".bak"})try{
            if(!File.Exists(file)||new FileInfo(file).Length>8192)continue;
            var saved=Util.Json().Deserialize<WindowLayout>(File.ReadAllText(file));
            if(saved!=null&&saved.Width>=200&&saved.Width<=20000&&saved.Height>=160&&saved.Height<=20000&&saved.Dpi>=48&&saved.Dpi<=768){rememberedLayout=saved;break;}
        }catch{}
        double scale=rememberedLayout.Dpi>0?CurrentAutoScaleDimensions.Width/rememberedLayout.Dpi:1;
        Size work=Screen.PrimaryScreen.WorkingArea.Size,frame=SizeFromClientSize(Size.Empty);
        ClientSize=new Size(Math.Min(Math.Max(1,work.Width-frame.Width),(int)Math.Round(rememberedLayout.Width*scale)),Math.Min(Math.Max(1,work.Height-frame.Height),(int)Math.Round(rememberedLayout.Height*scale)));
        if(rememberedLayout.Dpi>0)AutoScaleDimensions=CurrentAutoScaleDimensions;
        lastNormalClient=ClientSize;restoredClientRequest=ClientSize;lastNormalMaximized=rememberedLayout.Maximized;
    }
    void RestoreWindowMode(){
        var saved=rememberedLayout;rememberedLayout=null;if(saved==null)return;
        // WinForms finishes its legacy frame compensation during native handle creation.
        if(!restoredClientRequest.IsEmpty){ClientSize=restoredClientRequest;restoredClientRequest=Size.Empty;}
        if(saved.Maximized&&WindowState!=FormWindowState.Maximized)WindowState=FormWindowState.Maximized;
        if(saved.Mini)SetMini(true);
    }
    void SaveWindowLayout(){
        if(!resizeFrameEnabled)return;
        try{Size normal=lastNormalClient.IsEmpty?ClientSize:lastNormalClient;Util.Atomic(Path.Combine(manager.DataDirectory,"window.json"),new WindowLayout{Width=normal.Width,Height=normal.Height,Dpi=(int)Math.Round(CurrentAutoScaleDimensions.Width),Maximized=miniMode?fullState==FormWindowState.Maximized:lastNormalMaximized,Mini=miniMode});}
        catch(Exception ex){status.Text="窗口大小未能保存："+Util.SafeError(ex.Message);}
    }
    int ResizeHit(Point point){
        if(!ClientRectangle.Contains(point))return 0;
        int grip=Math.Max(6,Ui(6));
        bool left=point.X<grip,right=point.X>=ClientSize.Width-grip;
        bool top=point.Y<grip,bottom=point.Y>=ClientSize.Height-grip;
        if(left)return top?13:bottom?16:10;
        if(right)return top?14:bottom?17:11;
        return top?12:bottom?15:0;
    }
    protected override void WndProc(ref Message message){
        bool restoreCommand=message.Msg==0x112&&(message.WParam.ToInt64()&0xfff0)==0xf120;Rectangle restoreFrame=normalFrame;
        if(message.Msg==0x112&&(message.WParam.ToInt64()&0xfff0)==0xf030&&miniMode)SetMini(false);
        if(message.Msg==0x83&&resizeFrameEnabled){
            if(WindowState==FormWindowState.Maximized||IsZoomed(message.HWnd)){Rectangle work=Screen.FromHandle(message.HWnd).WorkingArea;Marshal.WriteInt32(message.LParam,0,work.Left);Marshal.WriteInt32(message.LParam,4,work.Top);Marshal.WriteInt32(message.LParam,8,work.Right);Marshal.WriteInt32(message.LParam,12,work.Bottom);}
            message.Result=IntPtr.Zero;return;
        }
        base.WndProc(ref message);
        if(restoreCommand&&resizeFrameEnabled&&WindowState==FormWindowState.Normal&&!restoreFrame.IsEmpty)Bounds=restoreFrame;
        if(message.Msg==0x24&&resizeFrameEnabled){var limit=(WindowLimits)Marshal.PtrToStructure(message.LParam,typeof(WindowLimits));var monitor=Screen.FromHandle(message.HWnd);Rectangle bounds=monitor.Bounds,work=monitor.WorkingArea;limit.MaxPosition=new Point(work.Left-bounds.Left,work.Top-bounds.Top);limit.MaxSize=new Point(work.Width,work.Height);Marshal.StructureToPtr(limit,message.LParam,false);message.Result=IntPtr.Zero;}
        if(message.Msg==0x31e)ApplyGlassBackdrop();
        if(message.Msg==0x84&&message.Result==new IntPtr(1)&&resizeFrameEnabled&&WindowState==FormWindowState.Normal){
            long packed=message.LParam.ToInt64();Point point=PointToClient(new Point((short)(packed&0xffff),(short)((packed>>16)&0xffff)));
            int hit=ResizeHit(point);if(hit!=0)message.Result=new IntPtr(hit);
        }
    }
    int lastNativeResizeHit;
    void BeginNativeResize(int hit){
        if(!resizeFrameEnabled||WindowState!=FormWindowState.Normal||hit<10||hit>17)return;
        lastNativeResizeHit=hit;
        if(preview)return; // Isolated review windows never start a system input loop.
        Point point=Cursor.Position;long packed=((long)(point.Y&65535)<<16)|(uint)(point.X&65535);
        ReleaseCapture();PostMessage(Handle,0xA1,new IntPtr(hit),new IntPtr(packed));
    }
    void RestoreNormalWindow(){Rectangle saved=normalFrame;WindowState=FormWindowState.Normal;if(!saved.IsEmpty)Bounds=saved;}
    void ToggleMaximize(){if(miniMode)SetMini(false);if(WindowState==FormWindowState.Maximized)RestoreNormalWindow();else{normalFrame=Bounds;WindowState=FormWindowState.Maximized;}}
    readonly Manager manager;
    readonly bool preview;
    readonly DataGridView grid=new TaskGrid();
    readonly Label empty=new Label(),status=new Label(),detailTitle=new Label(),detailError=new Label();
    readonly TextBox address=new TextBox(),destination=new TextBox();
    readonly Panel details=new Panel(),mainSurface=new Panel(),miniSurface=new Panel();
    readonly Label[] inlineValues=new Label[6];
    readonly Label segmentHint=new Label(),miniTitle=new Label(),miniMeta=new Label(),miniCount=new Label(),defaultFolder=new Label();
    readonly SegmentMap inlineMap=new SegmentMap();
    readonly DownloadProgress miniProgress=new DownloadProgress();
    readonly Button detailToggle,miniAction,miniNext;
    readonly FlowLayoutPanel selectionTools=new FlowLayoutPanel();
    readonly TableLayoutPanel detailLocations=new TableLayoutPanel();
    readonly ContextMenuStrip taskMenu=new ContextMenuStrip();
    bool locationsShown;
    readonly Panel quickEntry=new Panel();
    readonly TextBox quickLink=new TextBox();
    readonly NotifyIcon tray=new NotifyIcon();
    readonly ToolTip segmentTip=new ToolTip();
    Rectangle fullBounds;FormWindowState fullState;Size fullMinimum;
    string expandedId="",miniId="";
    bool miniMode,hiddenToTray;
    readonly Button pause,resume,show,forget;
    readonly Dictionary<string,Button> navigation=new Dictionary<string,Button>();
    readonly Dictionary<string,DownloadDetailsWindow> detailWindows=new Dictionary<string,DownloadDetailsWindow>();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    static readonly Color Blue=Color.FromArgb(95,185,255),Ink=Color.FromArgb(255,255,255),Muted=Color.FromArgb(196,214,235),Wash=Color.FromArgb(17,29,46),Line=Color.FromArgb(59,83,111);
    string filter="all";
    bool ticking,closeReady,closingWindow,refreshing,batchBusy;
    Action<Form> inspectDialog;

    public MainWindow(Manager engine,bool isPreview=false) {
        manager=engine;preview=isPreview;Text="Ruxget";Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Font=new Font("Microsoft YaHei UI",9.5f);BackColor=Color.Black;ForeColor=Ink;AutoScaleDimensions=new SizeF(96,96);AutoScaleMode=AutoScaleMode.Dpi;
        ClientSize=new Size(740,590);MinimumSize=new Size(696,562);StartPosition=FormStartPosition.CenterScreen;
        if(!preview)PreparePluginLayout();
        mainSurface.Dock=DockStyle.Fill;
        var header=new Panel{Dock=DockStyle.Top,Height=68,Padding=new Padding(22,17,22,12)};
        header.Controls.Add(new PictureBox{Image=Icon.ToBitmap(),SizeMode=PictureBoxSizeMode.Zoom,Bounds=new Rectangle(24,23,23,23)});
        header.Controls.Add(new Label{Text="Ruxget",Font=new Font(Font.FontFamily,12,FontStyle.Bold),AutoSize=true,Location=new Point(55,22)});
        header.Controls.Add(new Label{Text="下载",ForeColor=Muted,AutoSize=true,Location=new Point(103,26),Font=new Font(Font.FontFamily,8.5f)});
        var add=Button("＋ 新建下载",true);add.Width=104;add.Click+=(s,e)=>NewDownload(null);
        var mini=Button("迷你窗");mini.Width=64;mini.Click+=(s,e)=>SetMini(!miniMode);
        var more=Button("···");more.Width=36;more.AccessibleName="更多操作";
        var menu=new ContextMenuStrip{Font=Font,ShowImageMargin=false};
        menu.Items.Add("批量添加",null,(s,e)=>BatchDialog());menu.Items.Add("导入 BT 种子",null,(s,e)=>{using(var picker=TorrentPicker())if(picker.ShowDialog(this)==DialogResult.OK)NewDownload(new Dictionary<string,object>{{"url",picker.FileName},{"kind","torrent"}});});
        menu.Items.Add("完整任务详情 / BT 文件",null,(s,e)=>{var j=Selection();if(j!=null)OpenFullDetails(j.Id);});
        menu.Items.Add(new ToolStripSeparator());menu.Items.Add("桌面版设置",null,(s,e)=>SettingsDialog());menu.Items.Add("连接浏览器",null,(s,e)=>BrowserDialog());menu.Items.Add("视频组件",null,(s,e)=>ComponentDialog());
        menu.Items.Add(new ToolStripSeparator());menu.Items.Add("收起到托盘",null,(s,e)=>HideToTray());more.Click+=(s,e)=>menu.Show(more,new Point(0,more.Height));
        var actions=new FlowLayoutPanel{Dock=DockStyle.Right,Width=242,WrapContents=false,FlowDirection=FlowDirection.RightToLeft};actions.Controls.AddRange(new Control[]{more,add,mini});header.Controls.Add(actions);
        var nav=new FlowLayoutPanel{Dock=DockStyle.Top,Height=46,Padding=new Padding(24,2,20,10),WrapContents=false};
        foreach(var item in new[]{new[]{"all","全部"},new[]{"active","进行中"},new[]{"complete","已完成"},new[]{"unfinished","未完成"}}){string key=item[0];var button=Button(item[1]);button.Tag=item[1];button.Width=100;button.Height=30;button.Margin=new Padding(0,0,6,0);button.Click+=(s,e)=>{filter=key;RefreshJobs();};navigation.Add(key,button);nav.Controls.Add(button);}
        selectionTools.Dock=DockStyle.Top;selectionTools.Height=44;selectionTools.Padding=new Padding(24,0,20,8);selectionTools.WrapContents=false;
        pause=Button("暂停");resume=Button("继续 / 重试");show=Button("打开文件夹");forget=Button("移除记录");detailToggle=Button("展开详情");
        foreach(var b in new[]{pause,resume,detailToggle,show,forget}){b.Width=104;b.Height=29;b.Margin=new Padding(0,0,6,0);selectionTools.Controls.Add(b);}
        pause.Click+=(s,e)=>Selected(j=>manager.Pause(j.Id),CanPause);resume.Click+=(s,e)=>{var selected=SelectedJobs();if(selected.Length==1&&selected[0].Status=="等待选文件")ChooseBt(selected[0].Id);else Selected(j=>manager.Resume(j.Id),CanResume);};forget.Click+=(s,e)=>Selected(j=>manager.Forget(j.Id),CanForget);show.Click+=(s,e)=>OpenFolder();detailToggle.Click+=(s,e)=>{var j=Selection();if(j!=null)OpenDetails(j.Id);};
        grid.Dock=DockStyle.Fill;grid.BackgroundColor=Color.Black;grid.BorderStyle=BorderStyle.None;grid.AllowUserToAddRows=false;grid.AllowUserToDeleteRows=false;grid.AllowUserToResizeRows=false;grid.ReadOnly=true;grid.MultiSelect=true;grid.SelectionMode=DataGridViewSelectionMode.FullRowSelect;grid.RowHeadersVisible=false;grid.ColumnHeadersVisible=false;grid.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;grid.RowTemplate.Height=104;
        grid.DefaultCellStyle=new DataGridViewCellStyle{BackColor=Color.Black,ForeColor=Color.FromArgb(255,255,255),Padding=new Padding(12,0,0,0),SelectionBackColor=Color.FromArgb(24,57,88),SelectionForeColor=Ink};grid.CellBorderStyle=DataGridViewCellBorderStyle.None;
        foreach(string column in new[]{"文件 / 视频","状态","进度","速度"})grid.Columns.Add(column,column);
        for(int n=0;n<4;n++){grid.Columns[n].SortMode=DataGridViewColumnSortMode.NotSortable;if(n>0)grid.Columns[n].Visible=false;}
        grid.Columns[0].MinimumWidth=400;grid.AccessibleName="下载任务";grid.AccessibleDescription="上下键选择，空格暂停或继续，回车展开详情，Shift+F10 打开任务菜单。Ctrl 或 Shift 可多选。";
        grid.CellPainting+=PaintCell;grid.SelectionChanged+=(s,e)=>{if(!refreshing){UpdateButtons();UpdateDetails();grid.Invalidate();}};
        grid.CellMouseDoubleClick+=(s,e)=>{if(e.RowIndex>=0&&e.Button==MouseButtons.Left){var b=grid.GetCellDisplayRectangle(0,e.RowIndex,false);var point=new Point(b.Left+e.X,b.Top+e.Y);if(RowActionBounds(b).Contains(point)||RowMoreBounds(b).Contains(point))return;var j=grid.Rows[e.RowIndex].Tag as Download;if(j!=null)OpenDetails(j.Id);}};
        grid.CellMouseDown+=(s,e)=>{if(e.Button==MouseButtons.Right&&e.RowIndex>=0&&!grid.Rows[e.RowIndex].Selected)SelectTask(((Download)grid.Rows[e.RowIndex].Tag).Id);};
        grid.CellMouseClick+=(s,e)=>{if(e.RowIndex<0||e.Clicks!=1)return;var row=grid.Rows[e.RowIndex];var job=row.Tag as Download;if(job==null)return;var b=grid.GetCellDisplayRectangle(0,e.RowIndex,false);var point=new Point(b.Left+e.X,b.Top+e.Y);if(e.Button==MouseButtons.Left&&RowActionBounds(b).Contains(point))RowAction(job.Id);else if(e.Button==MouseButtons.Left&&RowMoreBounds(b).Contains(point))ShowTaskMenu(job.Id,new Point(point.X,b.Bottom-12));};
        grid.CellMouseMove+=(s,e)=>{if(e.RowIndex<0)return;var b=grid.GetCellDisplayRectangle(0,e.RowIndex,false);var point=new Point(b.Left+e.X,b.Top+e.Y);grid.Cursor=RowActionBounds(b).Contains(point)||RowMoreBounds(b).Contains(point)?Cursors.Hand:Cursors.Default;};grid.MouseLeave+=(s,e)=>grid.Cursor=Cursors.Default;
        taskMenu.Font=Font;taskMenu.ShowImageMargin=false;taskMenu.Opening+=(s,e)=>BuildTaskMenu();grid.ContextMenuStrip=taskMenu;
        grid.KeyDown+=(s,e)=>{var j=Selection();if(j==null)return;if(e.KeyCode==Keys.Enter){OpenDetails(j.Id);e.Handled=true;e.SuppressKeyPress=true;}else if(e.KeyCode==Keys.Space){RowAction(j.Id);e.Handled=true;e.SuppressKeyPress=true;}};
        var list=new Panel{Dock=DockStyle.Fill,Padding=new Padding(24,0,24,0)};empty.Dock=DockStyle.Fill;empty.TextAlign=ContentAlignment.MiddleCenter;empty.ForeColor=Muted;empty.Font=new Font(Font.FontFamily,10);
        quickEntry.Height=104;quickEntry.BackColor=Color.Black;quickEntry.Controls.Add(new Label{Text="从一个链接开始",AutoSize=true,Font=new Font(Font.FontFamily,16),Location=new Point(0,0)});
        quickLink.BorderStyle=BorderStyle.FixedSingle;quickLink.AccessibleName="粘贴下载链接";quickLink.SetBounds(0,44,390,29);quickEntry.Controls.Add(quickLink);
        var quickAdd=Button("添加链接",true);quickAdd.SetBounds(400,41,94,31);quickAdd.Click+=(s,e)=>{if(!String.IsNullOrWhiteSpace(quickLink.Text)){string link=quickLink.Text.Trim();NewDownload(new Dictionary<string,object>{{"url",link},{"kind",link.StartsWith("magnet:",StringComparison.OrdinalIgnoreCase)?"magnet":"file"}});}else quickLink.Focus();};quickEntry.Controls.Add(quickAdd);
        quickEntry.Controls.Add(new Label{Text="也可以从 Chrome 的 Ruxget 按钮发送视频",AutoSize=true,ForeColor=Muted,Location=new Point(0,82),Font=new Font(Font.FontFamily,8.5f)});
        Action layoutEntry=()=>{int width=Math.Min(494,Math.Max(240,list.ClientSize.Width-64));quickEntry.SetBounds((list.ClientSize.Width-width)/2,Math.Max(20,(list.ClientSize.Height-104)/2-12),width,104);quickLink.Width=Math.Max(80,width-104);quickAdd.Left=width-94;};list.SizeChanged+=(s,e)=>layoutEntry();
        list.Controls.Add(grid);list.Controls.Add(empty);list.Controls.Add(quickEntry);
        details.Dock=DockStyle.Bottom;details.Height=196;details.BackColor=Wash;details.Padding=new Padding(26,10,26,8);details.Visible=false;
        var detailHeader=new Panel{Dock=DockStyle.Top,Height=33};detailTitle.Dock=DockStyle.Fill;detailTitle.Font=new Font(Font.FontFamily,9.5f);detailTitle.AutoEllipsis=true;detailTitle.TextAlign=ContentAlignment.MiddleLeft;
        var collapse=Button("收起");collapse.Dock=DockStyle.Right;collapse.Width=52;collapse.Height=27;collapse.BackColor=Wash;collapse.Click+=(s,e)=>{expandedId="";UpdateDetails();};
        var locationToggle=Button("地址");locationToggle.Dock=DockStyle.Right;locationToggle.Width=52;locationToggle.Height=27;locationToggle.BackColor=Wash;locationToggle.AccessibleName="展开下载地址和保存路径";locationToggle.Click+=(s,e)=>{locationsShown=!locationsShown;UpdateDetails();};
        detailHeader.Controls.Add(detailTitle);detailHeader.Controls.Add(locationToggle);detailHeader.Controls.Add(collapse);
        var metrics=new TableLayoutPanel{Dock=DockStyle.Top,Height=88,ColumnCount=3,RowCount=2};for(int n=0;n<3;n++)metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100f/3));for(int n=0;n<2;n++)metrics.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        string[] captions={"文件大小","已下载","传输速度","预计剩余","能否续传","活动连接"};for(int n=0;n<6;n++){var cell=new Panel{Dock=DockStyle.Fill,Margin=Padding.Empty};cell.Controls.Add(new Label{Text=captions[n],Dock=DockStyle.Top,Height=18,ForeColor=Muted,Font=new Font(Font.FontFamily,8)});inlineValues[n]=new Label{Dock=DockStyle.Bottom,Height=25,Text="未知",AutoEllipsis=true,Font=new Font(Font.FontFamily,10)};cell.Controls.Add(inlineValues[n]);metrics.Controls.Add(cell,n%3,n/3);}
        var segments=new Panel{Dock=DockStyle.Top,Height=40};inlineMap.Dock=DockStyle.Top;inlineMap.Height=24;segmentHint.Dock=DockStyle.Bottom;segmentHint.Height=16;segmentHint.Font=new Font(Font.FontFamily,8);segmentHint.ForeColor=Muted;segmentHint.AutoEllipsis=true;segments.Controls.Add(inlineMap);segments.Controls.Add(segmentHint);
        inlineMap.MouseMove+=(s,e)=>{var rows=inlineMap.Segments;if(rows.Length==0)return;int n=Math.Min(rows.Length-1,Math.Max(0,e.X*rows.Length/Math.Max(1,inlineMap.Width)));var part=rows[n];segmentTip.SetToolTip(inlineMap,"区间 "+part.Number+" · "+TransferData.Bytes(part.Completed)+" / "+TransferData.Bytes(part.Length)+" · "+part.Percent.ToString("0.#")+"%");};
        var locations=detailLocations;locations.Dock=DockStyle.Top;locations.Height=56;locations.ColumnCount=3;locations.RowCount=2;locations.Visible=false;locations.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,68));locations.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));locations.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,0));locations.RowStyles.Add(new RowStyle(SizeType.Percent,50));locations.RowStyles.Add(new RowStyle(SizeType.Percent,50));AddDetail(locations,"下载地址",address,0);AddDetail(locations,"保存到",destination,1);
        detailError.Dock=DockStyle.Fill;detailError.Font=new Font(Font.FontFamily,8);detailError.ForeColor=Muted;detailError.AutoEllipsis=true;
        details.Controls.Add(detailError);details.Controls.Add(locations);details.Controls.Add(segments);details.Controls.Add(metrics);details.Controls.Add(detailHeader);
        status.Dock=DockStyle.Bottom;status.Height=28;status.Padding=new Padding(26,6,0,0);status.ForeColor=Muted;status.Font=new Font(Font.FontFamily,8);
        var saveLocation=new Panel{Dock=DockStyle.Bottom,Height=36,Padding=new Padding(26,2,26,2)};
        saveLocation.Controls.Add(new Label{Text="新任务保存到",Dock=DockStyle.Left,Width=94,ForeColor=Muted,TextAlign=ContentAlignment.MiddleLeft,Font=new Font(Font.FontFamily,8.5f)});
        defaultFolder.Dock=DockStyle.Fill;defaultFolder.AutoEllipsis=true;defaultFolder.TextAlign=ContentAlignment.MiddleLeft;defaultFolder.ForeColor=Muted;defaultFolder.Font=new Font(Font.FontFamily,8.5f);defaultFolder.AccessibleName="新任务默认保存文件夹";
        var changeFolder=Button("选择文件夹…");changeFolder.Dock=DockStyle.Right;changeFolder.Width=100;changeFolder.AccessibleName="选择新任务默认保存文件夹";changeFolder.Click+=(s,e)=>{string path=PickFolder(this,manager.Config.Folder);if(path!=null)try{SetDefaultFolder(path);}catch(Exception ex){Alert(ex.Message);}};
        saveLocation.Controls.Add(defaultFolder);saveLocation.Controls.Add(changeFolder);defaultFolder.BringToFront();
        mainSurface.Controls.Add(list);mainSurface.Controls.Add(details);mainSurface.Controls.Add(selectionTools);mainSurface.Controls.Add(nav);mainSurface.Controls.Add(header);mainSurface.Controls.Add(saveLocation);mainSurface.Controls.Add(status);
        miniSurface.Dock=DockStyle.Fill;miniSurface.Padding=new Padding(18,10,18,12);miniSurface.Visible=false;miniSurface.BackColor=Color.Black;
        var miniHeader=new Panel{Dock=DockStyle.Top,Height=30};miniCount.Text="Ruxget";miniCount.Dock=DockStyle.Fill;miniCount.ForeColor=Muted;miniCount.Font=new Font(Font.FontFamily,8);miniCount.TextAlign=ContentAlignment.MiddleLeft;var expand=Button("展开 ↗");expand.Dock=DockStyle.Right;expand.Width=70;expand.Height=26;expand.AccessibleName="展开完整窗口";expand.Click+=(s,e)=>SetMini(false);miniHeader.Controls.Add(miniCount);miniHeader.Controls.Add(expand);
        miniTitle.Dock=DockStyle.Top;miniTitle.Height=40;miniTitle.AutoEllipsis=true;miniTitle.Font=new Font(Font.FontFamily,10,FontStyle.Bold);miniTitle.TextAlign=ContentAlignment.MiddleLeft;
        miniProgress.Dock=DockStyle.Top;miniProgress.Height=22;miniMeta.Dock=DockStyle.Top;miniMeta.Height=30;miniMeta.AutoEllipsis=true;miniMeta.ForeColor=Muted;miniMeta.Font=new Font(Font.FontFamily,8.5f);
        var miniActions=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=33,FlowDirection=FlowDirection.RightToLeft,WrapContents=false};miniAction=Button("暂停",true);miniAction.Width=74;miniAction.Height=28;miniAction.Click+=async(s,e)=>await OperateMini();miniNext=Button("下一项");miniNext.Width=68;miniNext.Height=28;miniNext.Click+=(s,e)=>{var jobs=manager.Snapshot();if(jobs.Count>0){int n=jobs.FindIndex(j=>j.Id==miniId);miniId=jobs[(n+1)%jobs.Count].Id;UpdateMini();}};var hideMini=Button("收起");hideMini.Width=56;hideMini.Height=28;hideMini.AccessibleName="收起到托盘";hideMini.Click+=(s,e)=>HideToTray();miniActions.Controls.AddRange(new Control[]{miniAction,miniNext,hideMini});
        miniSurface.Controls.Add(miniMeta);miniSurface.Controls.Add(miniProgress);miniSurface.Controls.Add(miniTitle);miniSurface.Controls.Add(miniHeader);miniSurface.Controls.Add(miniActions);
        Controls.Add(mainSurface);Controls.Add(miniSurface);
        if(!preview){mainSurface.Visible=false;miniSurface.Visible=false;}
        tray.Icon=Icon;tray.Text="Ruxget · 后台下载";var trayMenu=new ContextMenuStrip();trayMenu.Items.Add("显示 Ruxget",null,(s,e)=>RestoreFromTray());trayMenu.Items.Add("退出并保存任务",null,(s,e)=>Close());tray.ContextMenuStrip=trayMenu;tray.DoubleClick+=(s,e)=>RestoreFromTray();
        FormClosed+=(s,e)=>{taskMenu.Dispose();timer.Dispose();tray.Dispose();segmentTip.Dispose();menu.Dispose();trayMenu.Dispose();};
        KeyPreview=true;KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape&&!String.IsNullOrEmpty(expandedId)&&!miniMode){expandedId="";UpdateDetails();e.Handled=true;}};
        timer.Interval=700;timer.Tick+=async(s,e)=>{if(ticking||closingWindow)return;ticking=true;try{await Task.Run(()=>manager.Tick());if(!IsDisposed&&!closingWindow)RefreshJobs();}catch(Exception ex){if(!IsDisposed)status.Text=ex.Message;}finally{ticking=false;}};
        if(!preview)timer.Start();RefreshJobs();
        FormClosing+=async(s,e)=>{timer.Stop();if(!closeReady&&!closingWindow)SaveWindowLayout();if(preview||closeReady)return;e.Cancel=true;if(closingWindow)return;closingWindow=true;tray.Visible=false;foreach(Form owned in OwnedForms)owned.Hide();Hide();status.Text="正在保存任务…";try{await Task.Run(()=>manager.Dispose());}catch(Exception ex){Alert(ex.Message);}closeReady=true;Close();};
        if(!preview)Shown+=(s,e)=>StartPlugin();
        if(!preview)Shown+=(s,e)=>RestoreWindowMode();
        if(!preview)Shown+=(s,e)=>BrowserBridge.Listen(this);
        if(!preview&&!String.IsNullOrEmpty(manager.RecoveryNotice))Shown+=(s,e)=>Alert(manager.RecoveryNotice);
    }
    void OpenDetails(string id){
        var job=manager.Snapshot().FirstOrDefault(j=>j.Id==id);if(job!=null&&TorrentInfo.IsBt(job)&&job.Status=="等待选文件"){ChooseBt(id);return;}
        expandedId=expandedId==id?"":id;UpdateDetails();
    }
    void OpenFullDetails(string id){
        var job=manager.Snapshot().FirstOrDefault(j=>j.Id==id);if(job!=null&&TorrentInfo.IsBt(job)&&job.Status=="等待选文件"){ChooseBt(id);return;}
        DownloadDetailsWindow open;if(detailWindows.TryGetValue(id,out open)&&!open.IsDisposed){open.Activate();return;}
        var window=new DownloadDetailsWindow(manager,id);detailWindows[id]=window;window.FormClosed+=(s,e)=>detailWindows.Remove(id);window.Show(this);
    }
    void ChooseBt(string id){using(var picker=new TorrentSelectionWindow(manager,id))picker.ShowDialog(this);RefreshJobs();}
    void AddDetail(TableLayoutPanel table,string label,TextBox box,int row){
        table.Controls.Add(new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Muted,Margin=new Padding(0,0,0,5)},0,row);
        box.ReadOnly=true;box.BorderStyle=BorderStyle.None;box.BackColor=Wash;box.ForeColor=Muted;box.Dock=DockStyle.Fill;box.Margin=new Padding(0,0,0,5);box.AccessibleName=label;table.Controls.Add(box,1,row);
    }
    Button Button(string text,bool primary=false){return new QuietButton{Text=text,AutoSize=false,Width=100,Height=34,Margin=new Padding(2,2,7,2),FlatStyle=FlatStyle.Flat,BackColor=primary?Blue:Color.Black,ForeColor=primary?Color.Black:Ink,FlatAppearance={BorderSize=primary?0:1,BorderColor=Color.FromArgb(218,225,235)}};}
    void Alert(string text){if(IsDisposed)return;if(preview){status.Text=text;return;}MessageBox.Show(this,text,"Ruxget",MessageBoxButtons.OK,MessageBoxIcon.Information);}
    Download Selection(){return grid.CurrentRow!=null&&grid.CurrentRow.Selected?grid.CurrentRow.Tag as Download:SelectedJobs().FirstOrDefault();}
    Download[] SelectedJobs(){return grid.SelectedRows.Cast<DataGridViewRow>().Select(row=>row.Tag as Download).Where(j=>j!=null).ToArray();}
    static bool CanPause(Download j){return new[]{"下载中","等待下载","排队中","准备组件","等待节点"}.Contains(j.Status);}
    static bool CanResume(Download j){return j.Status=="已暂停"||j.Status=="失败"||j.Status=="等待节点";}
    static bool CanForget(Download j){return j.Status=="已暂停"||j.Status=="失败"||j.Status=="已完成"||j.Status=="等待选文件"||j.Status=="等待节点";}
    async void Selected(Action<Download> action,Func<Download,bool> eligible){
        if(batchBusy)return;var selected=SelectedJobs().Where(eligible).ToArray();if(selected.Length==0)return;batchBusy=true;UpdateButtons();
        try{var failures=await Task.Run(()=>{var errors=new List<string>();foreach(var j in selected)try{action(j);}catch(Exception ex){errors.Add(j.Title+"："+ex.Message);}return errors;});if(!IsDisposed&&!closingWindow){RefreshJobs();if(failures.Count>0)Alert("部分任务未能处理：\n"+String.Join("\n",failures.Take(8)));}}
        finally{batchBusy=false;if(!IsDisposed)UpdateButtons();}
    }
    void OpenFolder(){var j=Selection();if(j==null)return;try{if(!String.IsNullOrEmpty(j.File)&&System.IO.File.Exists(j.File))Process.Start("explorer.exe","/select,"+Util.Quote(j.File));else{string folder=Util.OutputFolder(j);Directory.CreateDirectory(folder);Process.Start("explorer.exe",Util.Quote(folder));}}catch(Exception ex){Alert(ex.Message);}}
    static string PickFolder(IWin32Window owner,string current){using(var picker=new FolderBrowserDialog{Description="选择下载文件夹",SelectedPath=current,ShowNewFolderButton=true})return picker.ShowDialog(owner)==DialogResult.OK?picker.SelectedPath:null;}
    void SetDefaultFolder(string path){string previous=manager.Config.Folder;bool follow=manager.Config.FollowBrowser;try{manager.Config.Folder=Path.GetFullPath(path);manager.Config.FollowBrowser=false;manager.SaveSettings();UpdateDefaultFolder();}catch{manager.Config.Folder=previous;manager.Config.FollowBrowser=follow;throw;}}
    internal void FollowBrowserFolder(string browserFolder){if(manager.FollowBrowserFolder(browserFolder)&&!IsDisposed)BeginInvoke(new Action(()=>{if(IsDisposed)return;UpdateDefaultFolder();PushPluginState();}));}
    void UpdateDefaultFolder(){defaultFolder.Text=manager.Config.Folder;segmentTip.SetToolTip(defaultFolder,manager.Config.Folder+"\n用于新任务；开启按类型归档时会创建子文件夹。已有任务保留原位置。");}
    static bool Active(Download j){return new[]{"下载中","等待下载","排队中","正在暂停","准备组件","等待节点"}.Contains(j.Status);}
    bool Matches(Download j){return filter=="all"||filter=="active"&&Active(j)||filter=="complete"&&j.Status=="已完成"||filter=="unfinished"&&(j.Status=="已暂停"||j.Status=="失败"||j.Status=="等待选文件");}
    void UpdateButtons(){var selected=SelectedJobs();bool choice=selected.Length==1&&selected[0].Status=="等待选文件";pause.Enabled=!batchBusy&&selected.Any(CanPause);resume.Text=choice?"选择文件":"继续 / 重试";resume.Enabled=!batchBusy&&(choice||selected.Any(CanResume));forget.Enabled=!batchBusy&&selected.Any(CanForget);show.Enabled=selected.Length==1;detailToggle.Enabled=selected.Length==1;selectionTools.Visible=!miniMode&&selected.Length>1;grid.Invalidate();}
    void RefreshJobs(){
        UpdateDefaultFolder();
        string current=Selection()==null?null:Selection().Id;var selected=new HashSet<string>(SelectedJobs().Select(j=>j.Id));var all=manager.Snapshot();var items=all.Where(Matches).Reverse().ToList();refreshing=true;
        bool changed=grid.Rows.Count!=items.Count||grid.Rows.Cast<DataGridViewRow>().Where((row,i)=>i<items.Count&&(row.Tag as Download==null||((Download)row.Tag).Id!=items[i].Id)).Any();
        if(changed){grid.Rows.Clear();foreach(var j in items){int r=grid.Rows.Add(j.Title,j.Status,j.Progress,j.Speed);grid.Rows[r].Tag=j;if(j.Id==current)grid.CurrentCell=grid.Rows[r].Cells[0];}grid.ClearSelection();foreach(DataGridViewRow row in grid.Rows)row.Selected=selected.Contains(((Download)row.Tag).Id);if(grid.SelectedRows.Count==0&&grid.Rows.Count>0){grid.CurrentCell=grid.Rows[0].Cells[0];grid.Rows[0].Selected=true;}}
        bool descriptionsChanged=false;
        for(int i=0;i<items.Count;i++){var j=items[i];var row=grid.Rows[i];var previous=row.Tag as Download;descriptionsChanged|=previous==null||previous.Stage!=j.Stage||previous.Status!=j.Status;row.Tag=j;row.Cells[0].Value=j.Title;row.Cells[1].Value=j.Status;row.Cells[2].Value=j.Progress;row.Cells[3].Value=String.IsNullOrEmpty(j.Speed)?"—":j.Speed;row.Cells[0].ToolTipText=j.Title+"\n"+j.Status+" · "+TransferData.Remaining(j)+"\n双击展开详情 · 空格暂停或继续 · 右键更多操作";row.Cells[1].ToolTipText=j.Error;}
        if(descriptionsChanged)grid.Invalidate();
        empty.Visible=items.Count==0;quickEntry.Visible=all.Count==0;grid.Visible=!empty.Visible;empty.Text=all.Count==0?"":"这里暂时没有任务\n\n可切换上方分类查看其他下载。";
        foreach(var entry in navigation){int count=entry.Key=="all"?all.Count:entry.Key=="active"?all.Count(Active):entry.Key=="complete"?all.Count(j=>j.Status=="已完成"):all.Count(j=>j.Status=="已暂停"||j.Status=="失败"||j.Status=="等待选文件");entry.Value.Text=entry.Value.Tag+"   "+count;entry.Value.BackColor=entry.Key==filter?Color.FromArgb(239,244,254):Color.Black;entry.Value.ForeColor=entry.Key==filter?Blue:Muted;}
        refreshing=false;status.Text=String.Format("{0} 个任务 · {1} 个正在下载　　双击查看详情 · 右键更多操作",all.Count,all.Count(j=>j.Status=="下载中"));UpdateButtons();UpdateDetails();UpdateMini();PushPluginState();
    }
    void UpdateDetails(){
        var selected=SelectedJobs();var j=Selection();bool expanded=j!=null&&selected.Length==1&&expandedId==j.Id;details.Visible=expanded&&!miniMode;detailToggle.Text=expanded?"收起详情":"展开详情";
        if(!expanded){if(j==null)expandedId="";return;}details.Height=Ui(196)+(locationsShown?Ui(56):0);detailLocations.Visible=locationsShown;expandedId=j.Id;var t=j.Transfer??new TransferInfo();bool active=j.Status=="下载中",bt=TorrentInfo.IsBt(j);
        detailTitle.Text=j.Title;address.Text=j.Url;destination.Text=String.IsNullOrEmpty(j.File)?Util.OutputFolder(j):j.File;
        inlineValues[0].Text=(t.Estimated&&t.Total>=0?"约 ":"")+TransferData.Bytes(t.Total);inlineValues[1].Text=TransferData.Bytes(t.Completed);inlineValues[2].Text=active&&t.Speed>=0?TransferData.Bytes(t.Speed)+"/s":"—";inlineValues[3].Text=TransferData.Remaining(j);inlineValues[4].Text=TransferData.ResumeText(j);inlineValues[5].Text=active&&t.Connections>=0?t.Connections+" 个":"—";
        inlineMap.Segments=TransferData.Segments(j);inlineMap.Invalidate();segmentHint.Text=inlineMap.Segments.Length>0?"分段进度 · 按文件区间统计，悬停查看已完成量":j.Kind=="file"?"等待分段信息，未知数据不会推算成已完成":"当前媒体轨进度；内核暂不提供独立分片进度";
        detailError.Text=!String.IsNullOrEmpty(j.Error)?j.Error:bt?(j.BtReason??"")+" "+(j.BtAdvice??""):j.Kind!="file"&&j.Status!="已完成"?(t.Scope??"")+" · 音视频可能分轨下载，最终大小以完成文件为准":"";
        detailError.ForeColor=String.IsNullOrEmpty(j.Error)?Muted:Color.FromArgb(255,181,181);
    }
    void SetMini(bool value){
        if(value==miniMode)return;SuspendLayout();
        if(value){fullState=WindowState;fullMinimum=MinimumSize;fullBounds=WindowState==FormWindowState.Normal?Bounds:normalFrame.IsEmpty?RestoreBounds:normalFrame;var selected=Selection();miniId=selected==null?miniId:selected.Id;if(WindowState!=FormWindowState.Normal)RestoreNormalWindow();miniMode=true;mainSurface.Visible=false;miniSurface.Visible=true;MinimumSize=new Size(Ui(320),Ui(148));ClientSize=new Size(Ui(336),Ui(160));UpdateMini();}
        else{miniMode=false;miniSurface.Visible=false;mainSurface.Visible=true;MinimumSize=fullMinimum;Bounds=fullBounds;if(WindowState!=fullState)WindowState=fullState;UpdateButtons();UpdateDetails();}
        ResumeLayout(true);
        if(pluginView!=null||!preview){mainSurface.Visible=false;miniSurface.Visible=false;if(pluginView!=null)pluginView.BringToFront();PushPluginState();}
    }
    int Ui(int value){return (int)Math.Round(value*CurrentAutoScaleDimensions.Width/96f);}
    void UpdateMini(){var jobs=manager.Snapshot();var j=jobs.FirstOrDefault(item=>item.Id==miniId)??jobs.FirstOrDefault(Active)??jobs.LastOrDefault();if(j!=null)miniId=j.Id;miniCount.Text="Ruxget · "+jobs.Count+" 个任务";miniNext.Enabled=jobs.Count>1;
        miniTitle.Text=j==null?"下载安静发生":j.Title;miniAction.Enabled=!batchBusy&&j!=null&&(CanPause(j)||CanResume(j)||j.Status=="等待选文件");miniAction.Text=j==null?"暂停":j.Status=="等待选文件"?"选文件":CanResume(j)?"继续":"暂停";
        miniProgress.Value=j==null?0:j.Progress;miniProgress.Known=j!=null&&((j.Transfer??new TransferInfo()).Total>0||j.Status=="已完成"||j.Status=="准备组件");miniProgress.Complete=j!=null&&j.Status=="已完成";miniProgress.Invalidate();
        miniMeta.Text=j==null?"从浏览器发送，或展开窗口添加链接":j.Status+" · "+(miniProgress.Known?j.Progress.ToString("0.#")+"% · ":"")+(j.Status=="下载中"&&!String.IsNullOrEmpty(j.Speed)?j.Speed:TransferData.Remaining(j));
    }
    async Task OperateMini(){var j=manager.Snapshot().FirstOrDefault(item=>item.Id==miniId);if(j==null||batchBusy)return;if(j.Status=="等待选文件"){ChooseBt(j.Id);return;}bool start=CanResume(j);if(!start&&!CanPause(j))return;batchBusy=true;UpdateMini();try{await Task.Run(()=>{if(start)manager.Resume(j.Id);else manager.Pause(j.Id);});}catch(Exception ex){Alert(ex.Message);}finally{batchBusy=false;if(!IsDisposed)RefreshJobs();}}
    // Taken-over downloads start without opening the window; a hidden app shows its tray icon with a short note.
    internal object AcceptTakeover(IDictionary<string,object> input){
        if(closingWindow||IsDisposed)throw new Exception("Ruxget 正在退出，请稍后重试");
        var job=manager.Takeover(input);
        BeginInvoke(new Action(()=>{if(closingWindow||IsDisposed)return;if(!Visible&&!preview){hiddenToTray=true;tray.Visible=true;tray.ShowBalloonTip(3000,"Ruxget","已接管下载："+job.Title,ToolTipIcon.None);}RefreshJobs();}));
        return new{ok=true,id=job.Id,name=job.Title};
    }
    void HideToTray(){hiddenToTray=true;if(!preview){tray.Visible=true;Hide();}}
    public void RestoreFromTray(){if(closingWindow||IsDisposed)return;bool wasHidden=hiddenToTray;hiddenToTray=false;if(!preview){if(wasHidden||!Visible)Show();if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Activate();tray.Visible=false;}RefreshJobs();}
    static void Rounded(Graphics g,Color color,Rectangle bounds,int radius){using(var path=new GraphicsPath()){int d=radius*2;path.AddArc(bounds.Left,bounds.Top,d,d,180,90);path.AddArc(bounds.Right-d,bounds.Top,d,d,270,90);path.AddArc(bounds.Right-d,bounds.Bottom-d,d,d,0,90);path.AddArc(bounds.Left,bounds.Bottom-d,d,d,90,90);path.CloseFigure();using(var brush=new SolidBrush(color))g.FillPath(brush,path);}}
    Rectangle RowActionBounds(Rectangle row){return new Rectangle(row.Right-Ui(120),row.Top+Ui(16),Ui(64),Ui(29));}
    Rectangle RowMoreBounds(Rectangle row){return new Rectangle(row.Right-Ui(48),row.Top+Ui(16),Ui(32),Ui(29));}
    void SelectTask(string id){var row=grid.Rows.Cast<DataGridViewRow>().FirstOrDefault(r=>((Download)r.Tag).Id==id);if(row==null)return;grid.ClearSelection();grid.CurrentCell=row.Cells[0];row.Selected=true;}
    void RowAction(string id){
        if(batchBusy)return;SelectTask(id);var j=Selection();if(j==null)return;
        if(j.Status=="等待选文件")ChooseBt(id);else if(CanResume(j))Selected(item=>manager.Resume(item.Id),CanResume);else if(CanPause(j))Selected(item=>manager.Pause(item.Id),CanPause);else OpenDetails(id);
    }
    void ShowTaskMenu(string id,Point point){SelectTask(id);taskMenu.Show(grid,point);}
    void BuildTaskMenu(){
        taskMenu.Items.Clear();var selected=SelectedJobs();var j=Selection();if(j==null)return;
        if(selected.Length==1){taskMenu.Items.Add(expandedId==j.Id?"收起详情　Enter":"展开详情　Enter",null,(s,e)=>OpenDetails(j.Id));
            if(j.Status=="等待选文件")taskMenu.Items.Add("选择 BT 文件",null,(s,e)=>ChooseBt(j.Id));}
        if(selected.Any(CanPause)){var item=taskMenu.Items.Add("暂停　Space",null,(s,e)=>Selected(job=>manager.Pause(job.Id),CanPause));item.Enabled=!batchBusy;}
        if(selected.Any(CanResume)){var item=taskMenu.Items.Add("继续 / 重试　Space",null,(s,e)=>Selected(job=>manager.Resume(job.Id),CanResume));item.Enabled=!batchBusy;}
        if(selected.Length==1){taskMenu.Items.Add("打开文件夹",null,(s,e)=>OpenFolder());taskMenu.Items.Add("完整详情 / BT 文件",null,(s,e)=>OpenFullDetails(j.Id));}
        if(selected.Any(CanForget)){taskMenu.Items.Add(new ToolStripSeparator());var item=taskMenu.Items.Add("移除记录（保留文件）",null,(s,e)=>Selected(job=>manager.Forget(job.Id),CanForget));item.Enabled=!batchBusy;}
    }
    void PaintCell(object sender,DataGridViewCellPaintingEventArgs e){
        if(e.RowIndex<0||e.ColumnIndex!=0)return;var j=grid.Rows[e.RowIndex].Tag as Download;if(j==null)return;
        var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;var b=e.CellBounds;using(var white=new SolidBrush(Color.Black))g.FillRectangle(white,b);
        var card=new Rectangle(b.Left,b.Top+Ui(3),b.Width-1,b.Height-Ui(8));bool selected=grid.Rows[e.RowIndex].Selected;
        Rounded(g,selected?Color.FromArgb(245,248,254):Wash,card,Ui(12));
        if(selected){using(var pen=new Pen(Color.FromArgb(223,232,248)))using(var path=new GraphicsPath()){int d=Ui(24);path.AddArc(card.Left,card.Top,d,d,180,90);path.AddArc(card.Right-d,card.Top,d,d,270,90);path.AddArc(card.Right-d,card.Bottom-d,d,d,0,90);path.AddArc(card.Left,card.Bottom-d,d,d,90,90);path.CloseFigure();g.DrawPath(pen,path);}}
        bool audio=j.Kind=="audio",video=j.Kind=="video"||j.Kind=="tracks",bt=TorrentInfo.IsBt(j),complete=j.Status=="已完成";
        var icon=new Rectangle(b.Left+Ui(16),b.Top+Ui(18),Ui(34),Ui(34));Rounded(g,Color.FromArgb(233,240,253),icon,Ui(9));
        string type=bt?"BT":audio?"MP3":video?"视频":Path.GetExtension(j.Title).TrimStart('.').ToUpperInvariant();if(type.Length==0||type.Length>4)type="文件";
        using(var font=new Font(Font.FontFamily,7.5f,FontStyle.Bold))TextRenderer.DrawText(g,type,font,icon,Blue,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
        var action=RowActionBounds(b);var more=RowMoreBounds(b);int x=b.Left+Ui(62),width=Math.Max(1,action.Left-x-Ui(12));
        using(var titleFont=new Font(Font.FontFamily,10f))TextRenderer.DrawText(g,j.Title,titleFont,new Rectangle(x,b.Top+Ui(15),width,Ui(25)),Ink,TextFormatFlags.EndEllipsis|TextFormatFlags.SingleLine|TextFormatFlags.VerticalCenter);
        string host;try{host=new Uri(j.Url).Host;}catch{host="下载任务";}if(bt)host=j.Kind=="magnet"?"磁力链接":"BT 种子";
        var t=j.Transfer??new TransferInfo();bool known=t.Total>0||complete||j.Status=="准备组件";
        string amount=t.Completed>=0?TransferData.Bytes(t.Completed)+(t.Total>=0?" / "+(t.Estimated?"约 ":"")+TransferData.Bytes(t.Total):""):"大小待确认";
        string secondary=complete?(t.Total>=0?TransferData.Bytes(t.Total)+" · ":"")+host:amount+" · "+host;
        using(var small=new Font(Font.FontFamily,8f))TextRenderer.DrawText(g,secondary,small,new Rectangle(x,b.Top+Ui(42),Math.Max(1,b.Width-Ui(80)),Ui(18)),Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.SingleLine);
        Rounded(g,Color.Black,action,Ui(8));string verb=j.Status=="等待选文件"?"选文件":CanResume(j)?"继续":CanPause(j)?"暂停":"详情";
        TextRenderer.DrawText(g,verb,Font,action,batchBusy?Muted:Blue,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
        TextRenderer.DrawText(g,"···",Font,more,Muted,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
        string state=j.Status;if((j.Status=="下载中"||j.Status=="准备组件"||j.Status=="等待节点")&&!String.IsNullOrEmpty(j.Stage))state=j.Stage;
        if(j.Status=="下载中"&&!String.IsNullOrEmpty(j.Speed))state+=" · "+j.Speed;
        string percent=known?Math.Max(0,Math.Min(100,j.Progress)).ToString("0.#")+"%":"";
        using(var small=new Font(Font.FontFamily,8f)){
            TextRenderer.DrawText(g,state,small,new Rectangle(x,b.Top+Ui(66),Math.Max(1,b.Width-Ui(144)),Ui(18)),j.Status=="失败"?Color.FromArgb(255,181,181):Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.SingleLine);
            TextRenderer.DrawText(g,percent,small,new Rectangle(b.Right-Ui(70),b.Top+Ui(66),Ui(52),Ui(18)),Muted,TextFormatFlags.Right|TextFormatFlags.SingleLine);
        }
        var bar=new Rectangle(x,b.Top+Ui(87),Math.Max(1,b.Width-Ui(80)),Ui(4));Rounded(g,Color.FromArgb(59,83,111),bar,Math.Max(1,Ui(2)));
        if(known&&j.Progress>0){var fill=bar;fill.Width=Math.Max(Ui(4),(int)(bar.Width*Math.Min(100,j.Progress)/100));Rounded(g,j.Status=="已暂停"?Color.FromArgb(169,184,207):Color.FromArgb(95,185,255),fill,Math.Max(1,Ui(2)));}
        e.Handled=true;
    }
    Form Dialog(string title,int width,int height){return new Form{Text=title,Icon=Icon,Font=Font,ClientSize=new Size(width,height),BackColor=Color.Black,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,StartPosition=FormStartPosition.CenterParent,AutoScaleDimensions=new SizeF(96,96),AutoScaleMode=AutoScaleMode.Dpi};}
    void LabelAt(Form f,string text,int x,int y){f.Controls.Add(new Label{Text=text,Left=x,Top=y,Width=Math.Max(1,f.ClientSize.Width-x-24),Height=25,ForeColor=Muted,AutoEllipsis=true});}
    static OpenFileDialog TorrentPicker(){return new OpenFileDialog{Title="选择 BT 种子文件",Filter="BT 种子 (*.torrent)|*.torrent",CheckFileExists=true,Multiselect=false};}
    public void NewDownload(IDictionary<string,object> input){if(closingWindow||IsDisposed)return;if(pluginView!=null){PluginEditor(input);return;}using(var form=Dialog("新建下载",590,424)){
        LabelAt(form,"下载链接或种子文件",24,22);var url=new TextBox{Left=24,Top=48,Width=454,Text=input==null?"":Util.Str(input,"url")};form.Controls.Add(url);var pick=Button("选种子");pick.SetBounds(486,45,80,30);form.Controls.Add(pick);
        LabelAt(form,"下载类型",24,94);var kind=new ComboBox{Left=24,Top=122,Width=252,DropDownStyle=ComboBoxStyle.DropDownList};kind.Items.AddRange(new[]{"普通文件（分段下载）","网页视频 / HLS / DASH","仅声音 MP3","磁力链接（BT）","BT 种子文件"});kind.SelectedIndex=input==null?0:Util.Str(input,"kind")=="torrent"?4:Util.Str(input,"kind")=="magnet"?3:Util.Str(input,"kind")=="file"?0:1;form.Controls.Add(kind);pick.Click+=(s,e)=>{using(var picker=TorrentPicker()){if(picker.ShowDialog(form)==DialogResult.OK){url.Text=picker.FileName;kind.SelectedIndex=4;}}};url.TextChanged+=(s,e)=>{if(url.Text.TrimStart().StartsWith("magnet:",StringComparison.OrdinalIgnoreCase)&&kind.Enabled)kind.SelectedIndex=3;};
        LabelAt(form,"最高画质",304,94);var height=new ComboBox{Left=304,Top=122,Width=262,DropDownStyle=ComboBoxStyle.DropDownList};height.Items.AddRange(new[]{"720p","1080p","2160p","4320p"});height.SelectedIndex=1;form.Controls.Add(height);
        if(input!=null&&Util.Str(input,"kind")=="tracks"){height.Items.Clear();height.Items.Add(Util.Str(input,"height","1080")+"p");height.SelectedIndex=0;height.Enabled=false;url.ReadOnly=true;kind.Enabled=false;pick.Enabled=false;}else{height.Enabled=kind.SelectedIndex==1;kind.SelectedIndexChanged+=(s,e)=>height.Enabled=kind.SelectedIndex==1;}
        LabelAt(form,"本次保存到",24,168);var folder=new TextBox{Left=24,Top=196,Width=454,Text=manager.Config.Folder,AccessibleName="本次下载保存文件夹"};form.Controls.Add(folder);var browse=Button("选文件夹");browse.SetBounds(486,193,80,30);form.Controls.Add(browse);browse.Click+=(s,e)=>{string path=PickFolder(form,folder.Text);if(path!=null)folder.Text=path;};
        var categorize=new CheckBox{Left=24,Top=244,Width=542,Height=28,Text="按类型放入子文件夹（视频、音乐、压缩包等）",Checked=manager.Config.AutoCategorize};form.Controls.Add(categorize);
        var note=new Label{Left=24,Top=284,Width=542,Height=48,ForeColor=Muted,Font=new Font(Font.FontFamily,8.5f)};form.Controls.Add(note);Action explain=()=>note.Text=kind.SelectedIndex>=3?(kind.SelectedIndex==4?"添加后勾选需要的文件；未确认前不开始下载。":"先获取种子文件列表，再由你勾选；不会自动下载全部内容。")+"\nBT 节点直连，完成后停止做种。":input!=null&&Util.Str(input,"kind")=="tracks"?"将下载浏览器中选择的实际画质，画面和声音会自动合并。":"视频画质取决于原站；需要登录的视频请从浏览器里的 Ruxget 发送。";kind.SelectedIndexChanged+=(s,e)=>explain();explain();
        var start=Button("开始下载",true);start.SetBounds(426,362,140,38);form.Controls.Add(start);form.AcceptButton=start;
        Download created=null;
        start.Click+=async(s,e)=>{start.Enabled=false;try{string type=kind.SelectedIndex==4?"torrent":kind.SelectedIndex==3?"magnet":kind.SelectedIndex==0?"file":kind.SelectedIndex==2?"audio":"video";if(input!=null&&Util.Str(input,"kind")=="tracks"&&kind.SelectedIndex==1)type="tracks";int h=Int32.Parse(height.Text.TrimEnd('p'));if(type=="tracks")h=Int32.Parse(Util.Str(input,"height","1080"));string source=url.Text.Trim(),target=folder.Text;bool category=categorize.Checked;created=await Task.Run(()=>type=="torrent"?manager.ImportTorrent(source,target,category):manager.Add(source,type,input==null?"":Util.Str(input,"title"),h,target,input,category));if(!form.IsDisposed)form.DialogResult=DialogResult.OK;}catch(Exception ex){Alert(ex.Message);}finally{if(!start.IsDisposed)start.Enabled=true;}};
        if(inspectDialog!=null){inspectDialog(form);return;}if(form.ShowDialog(this)==DialogResult.OK){RefreshJobs();if(created!=null&&created.Status=="等待选文件")ChooseBt(created.Id);}
    }}
    void BatchDialog(){using(var f=Dialog("批量添加下载",640,548)){
        LabelAt(f,"每行一个文件链接或磁力链接，最多 100 条；重复地址只添加一次。",24,20);
        var urls=new TextBox{Left=24,Top=58,Width=592,Height=210,Multiline=true,AcceptsReturn=true,WordWrap=false,ScrollBars=ScrollBars.Both,MaxLength=2*1024*1024};f.Controls.Add(urls);
        LabelAt(f,"下载类型",24,282);var kind=new ComboBox{Left=24,Top=312,Width=350,DropDownStyle=ComboBoxStyle.DropDownList};kind.Items.AddRange(new[]{"普通文件 / 自动识别磁力","网页视频 / HLS / DASH","仅声音 MP3","磁力链接（BT）"});kind.SelectedIndex=0;f.Controls.Add(kind);
        var height=new ComboBox{Left=398,Top=312,Width=218,DropDownStyle=ComboBoxStyle.DropDownList,Enabled=false};height.Items.AddRange(new[]{"720p","1080p","2160p","4320p"});height.SelectedIndex=1;f.Controls.Add(height);kind.SelectedIndexChanged+=(s,e)=>height.Enabled=kind.SelectedIndex==1;
        LabelAt(f,"本次保存到",24,356);var folder=new TextBox{Left=24,Top=386,Width=498,Text=manager.Config.Folder,AccessibleName="本次批量下载保存文件夹"};f.Controls.Add(folder);var browse=Button("选文件夹");browse.SetBounds(532,383,84,30);f.Controls.Add(browse);browse.Click+=(s,e)=>{string path=PickFolder(f,folder.Text);if(path!=null)folder.Text=path;};
        var categorize=new CheckBox{Left=24,Top=430,Width=592,Height=28,Text="按类型放入子文件夹；已有完成文件不会覆盖",Checked=manager.Config.AutoCategorize};f.Controls.Add(categorize);
        var start=Button("添加到队列",true);start.SetBounds(476,488,140,36);f.Controls.Add(start);start.Click+=async(s,e)=>{start.Enabled=false;try{string text=urls.Text,type=kind.SelectedIndex==3?"magnet":kind.SelectedIndex==0?"file":kind.SelectedIndex==2?"audio":"video",target=folder.Text;int h=Int32.Parse(height.Text.TrimEnd('p'));bool category=categorize.Checked;await Task.Run(()=>manager.AddMany(text,type,target,h,category));if(!f.IsDisposed)f.DialogResult=DialogResult.OK;}catch(Exception ex){Alert(ex.Message);}finally{if(!start.IsDisposed)start.Enabled=true;}};
        if(inspectDialog!=null){inspectDialog(f);return;}if(f.ShowDialog(this)==DialogResult.OK)RefreshJobs();
    }}
    void SettingsDialog(){using(var f=Dialog("下载设置",570,560)){
        LabelAt(f,"默认保存文件夹",24,20);var folder=new TextBox{Left=24,Top=50,Width=424,Text=manager.Config.Folder,AccessibleName="新任务默认保存文件夹"};f.Controls.Add(folder);var browse=Button("选文件夹");browse.SetBounds(456,47,90,30);f.Controls.Add(browse);browse.Click+=(s,e)=>{string path=PickFolder(f,folder.Text);if(path!=null)folder.Text=path;};
        LabelAt(f,"网页 / HTTP Tracker 代理（填 system 跟随系统，留空直连）",24,92);var proxy=new TextBox{Left=24,Top=122,Width=522,Text=manager.Config.Proxy};f.Controls.Add(proxy);
        LabelAt(f,"每个文件的最大连接数",24,166);var connections=new NumericUpDown{Left=260,Top=164,Width=110,Minimum=1,Maximum=16,Value=manager.Config.Connections};f.Controls.Add(connections);
        LabelAt(f,"同时下载的文件 / BT 任务",24,210);var files=new NumericUpDown{Left=260,Top=210,Width=110,Minimum=1,Maximum=4,Value=manager.Config.FileSlots};f.Controls.Add(files);
        LabelAt(f,"同时下载的视频任务",24,254);var videos=new NumericUpDown{Left=260,Top=254,Width=110,Minimum=1,Maximum=2,Value=manager.Config.VideoSlots};f.Controls.Add(videos);
        LabelAt(f,"每任务限速 KiB/s（0 为不限）",24,298);var rate=new NumericUpDown{Left=310,Top=296,Width=120,Minimum=0,Maximum=102400,Value=manager.Config.RateKiB};f.Controls.Add(rate);
        LabelAt(f,"BT 上传上限 KiB/s",24,342);var upload=new NumericUpDown{Left=310,Top=340,Width=120,Minimum=16,Maximum=8192,Value=manager.Config.BtUploadKiB};f.Controls.Add(upload);
        var categorize=new CheckBox{Left=24,Top=390,Width=522,Height=28,Text="新任务默认按类型放入子文件夹",Checked=manager.Config.AutoCategorize};f.Controls.Add(categorize);
        f.Controls.Add(new Label{Left=24,Top=430,Width=522,Height=48,ForeColor=Muted,Text="BT 上传上限保存后生效；适当分享数据有助于节点互传。\n其他限速用于新开始或继续的任务，实际速度取决于资源与线路。"});
        var save=Button("保存",true);save.SetBounds(406,500,140,36);f.Controls.Add(save);save.Click+=async(s,e)=>{save.Enabled=false;try{string proxyValue=proxy.Text.Trim();Util.CheckProxy(proxyValue);string path=Path.GetFullPath(folder.Text);int count=(int)connections.Value,fileCount=(int)files.Value,videoCount=(int)videos.Value,limit=(int)rate.Value,btUpload=(int)upload.Value;bool category=categorize.Checked;await Task.Run(()=>{manager.Config.Folder=path;manager.Config.Proxy=proxyValue;manager.Config.Connections=count;manager.Config.FileSlots=fileCount;manager.Config.VideoSlots=videoCount;manager.Config.RateKiB=limit;manager.Config.BtUploadKiB=btUpload;manager.Config.AutoCategorize=category;manager.SaveSettings();});if(!f.IsDisposed)f.Close();}catch(Exception ex){Alert(ex.Message);}finally{if(!save.IsDisposed)save.Enabled=true;}};
        if(inspectDialog!=null){inspectDialog(f);return;}f.ShowDialog(this);
    }}
    void BrowserDialog(){using(var f=Dialog("连接 Ruxget 浏览器插件",610,270)){
        LabelAt(f,"安装版会自动连接配套的 Ruxget 插件，无需复制扩展 ID。",24,24);
        f.Controls.Add(new Label{Left=24,Top=76,Width=562,Height=100,ForeColor=Muted,Text="回到 Ruxget 插件的「桌面下载」页，点击「检查连接」。\n其他版本的扩展可点「一键重新配对」，在桌面确认连接。\n\n移动便携版后，可在这里修复本机连接。"});
        var connect=Button("修复连接",true);connect.SetBounds(446,208,140,36);f.Controls.Add(connect);connect.Click+=(s,e)=>{try{BrowserBridge.RegisterKnown();f.Close();Alert("已连接配套的 Ruxget 插件。回到浏览器检查连接即可。");}catch(Exception ex){Alert(ex.Message);}};
        if(inspectDialog!=null){inspectDialog(f);return;}f.ShowDialog(this);
    }}
    void ComponentDialog(){using(var f=Dialog("视频组件",620,380)){
        LabelAt(f,"普通下载组件随安装器提供，视频组件在首次需要时下载并校验。",24,22);
        var rows=new Label{Left=24,Top=68,Width=572,Height=180,ForeColor=Ink};f.Controls.Add(rows);
        try{rows.Text=String.Join("\n\n",manager.Components.Specs.Select(spec=>spec.name+"   "+spec.version+"   "+(manager.Components.Ready(spec.name)?"已就绪":spec.bundled?"需要修复安装":"首次使用时准备")));}catch(Exception ex){rows.Text=ex.Message;}
        f.Controls.Add(new Label{Left=24,Top=258,Width=572,Height=48,ForeColor=Muted,Text="准备过程可在任务列表暂停，继续时恢复组件下载。\n网络失败请检查代理设置；校验通过前不会运行下载到的组件。"});
        var settings=Button("网络设置");settings.SetBounds(24,324,120,34);f.Controls.Add(settings);settings.Click+=(s,e)=>{f.Close();SettingsDialog();};
        if(inspectDialog!=null){inspectDialog(f);return;}f.ShowDialog(this);
    }}
    static void CheckBounds(Control parent){foreach(Control child in parent.Controls){if(!child.Visible)continue;if(child.Right>parent.ClientSize.Width+2||child.Bottom>parent.ClientSize.Height+2||child.Left<-2||child.Top<-2)throw new Exception("Control outside parent: "+child.GetType().Name+" "+child.Text);CheckBounds(child);}}
    static void CaptureWindow(Form form,string file){Application.DoEvents();CheckBounds(form);using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(file);}}
    public void PrepareNativeReview(string folder){
        inspectDialog=form=>{form.Show(this);Application.DoEvents();var boxes=form.Controls.OfType<TextBox>().ToArray();var choices=form.Controls.OfType<ComboBox>().ToArray();
            CaptureWindow(form,Path.Combine(folder,"native-confirmation.png"));
            Util.Atomic(Path.Combine(folder,"confirmation.json"),new{ok=true,url=boxes[0].Text,urlReadOnly=boxes[0].ReadOnly,quality=choices[1].Text,qualityLocked=!choices[1].Enabled,kind=choices[0].Text,tasksBeforeConfirmation=manager.Snapshot().Count});
            form.Close();var finish=new System.Windows.Forms.Timer{Interval=1000};finish.Tick+=(s,e)=>{finish.Stop();finish.Dispose();Close();};finish.Start();
        };
        Shown+=(s,e)=>Util.Atomic(Path.Combine(folder,"ready.json"),new{pid=Process.GetCurrentProcess().Id});
    }
    public void Review(string folder){
        Directory.CreateDirectory(folder);Show();Application.DoEvents();CaptureWindow(this,Path.Combine(folder,"desktop-1120.png"));Width=960;CaptureWindow(this,Path.Combine(folder,"desktop-960.png"));
        navigation["complete"].PerformClick();CaptureWindow(this,Path.Combine(folder,"completed-filter.png"));navigation["all"].PerformClick();
        inspectDialog=form=>{form.Show(this);foreach(TextBox box in form.Controls.OfType<TextBox>())if(box.Text.Length==0)box.Text="https://example.test/"+new String('a',1600);CaptureWindow(form,Path.Combine(folder,form.Text+"-100.png"));form.Scale(new SizeF(1.25f,1.25f));CaptureWindow(form,Path.Combine(folder,form.Text+"-125.png"));form.Scale(new SizeF(1.2f,1.2f));CaptureWindow(form,Path.Combine(folder,form.Text+"-150.png"));form.Close();};
        NewDownload(null);BatchDialog();SettingsDialog();BrowserDialog();ComponentDialog();inspectDialog=null;foreach(DataGridViewRow row in grid.Rows)row.Selected=true;CaptureWindow(this,Path.Combine(folder,"batch-selection.png"));Scale(new SizeF(1.25f,1.25f));CaptureWindow(this,Path.Combine(folder,"desktop-125.png"));Scale(new SizeF(1.2f,1.2f));CaptureWindow(this,Path.Combine(folder,"desktop-150.png"));
        System.IO.File.WriteAllText(Path.Combine(folder,"ui-summary.json"),"{\"ok\":true,\"method\":\"real WinForms with explicit fixture tasks and simulated 100/125/150 percent layout scaling; no downloads, no registry writes\"}");Close();
    }
}
}
