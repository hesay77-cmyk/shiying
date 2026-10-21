using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ShiyingDesktop {
// Installer window (0.4.47): borderless dark card, measured layout so high-DPI text never clips.
// Only the presentation changed; installation still goes through Installation.Apply exactly as before.
static class SetupText {
    // Chinese Windows gets Chinese; every other display language gets English. "--review <folder> en" forces English.
    public static bool Chinese=System.Globalization.CultureInfo.CurrentUICulture.Name.StartsWith("zh",StringComparison.OrdinalIgnoreCase);
    public static string L(string zh,string en){return Chinese?zh:en;}
}
class SetupToggle:CheckBox {
    public SetupToggle(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;Cursor=Cursors.Hand;AutoSize=false;}
    protected override void OnPaint(PaintEventArgs e){
        ButtonRenderer.DrawParentBackground(e.Graphics,ClientRectangle,this);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
        float s=g.DpiX/96f;int w=(int)(36*s),h=(int)(20*s),y=(Height-h)/2;var track=new Rectangle(0,y,w,h);
        int alpha=Enabled?255:110;
        using(var path=SetupWindow.Round(track,h))using(var fill=new SolidBrush(Checked?Color.FromArgb(alpha,102,188,255):Color.FromArgb(Enabled?60:30,255,255,255)))g.FillPath(fill,path);
        int knob=h-(int)(6*s),kx=Checked?track.Right-knob-(int)(3*s):track.Left+(int)(3*s);
        using(var brush=new SolidBrush(Color.FromArgb(alpha,Checked?0:235,Checked?25:242,Checked?45:250)))g.FillEllipse(brush,kx,y+(h-knob)/2,knob,knob);
        if(Focused&&ShowFocusCues)using(var pen=new Pen(Color.FromArgb(150,140,200,255),1.5f*s))using(var ring=SetupWindow.Round(Rectangle.Inflate(track,(int)(3*s),(int)(3*s)),h+(int)(6*s)))g.DrawPath(pen,ring);
        var text=new Rectangle(w+(int)(12*s),0,Width-w-(int)(12*s),Height);
        TextRenderer.DrawText(g,Text,Font,text,Enabled?Color.White:Color.FromArgb(150,176,196,218),TextFormatFlags.VerticalCenter|TextFormatFlags.Left|TextFormatFlags.EndEllipsis|TextFormatFlags.SingleLine);
    }
}
class SetupProgress:Control {
    readonly Timer timer=new Timer{Interval=16};float phase;ProgressBarStyle style=ProgressBarStyle.Continuous;int value;
    public SetupProgress(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;timer.Tick+=(s,e)=>{phase=(phase+0.012f)%1.4f;Invalidate();};}
    public ProgressBarStyle Style{get{return style;}set{style=value;timer.Enabled=Visible&&style==ProgressBarStyle.Marquee;Invalidate();}}
    public int Value{get{return value;}set{this.value=Math.Max(0,Math.Min(100,value));Invalidate();}}
    protected override void OnVisibleChanged(EventArgs e){base.OnVisibleChanged(e);timer.Enabled=Visible&&style==ProgressBarStyle.Marquee;}
    protected override void Dispose(bool disposing){if(disposing)timer.Dispose();base.Dispose(disposing);}
    protected override void OnPaint(PaintEventArgs e){
        var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;var all=new Rectangle(0,0,Width-1,Height-1);
        using(var path=SetupWindow.Round(all,Height))using(var track=new SolidBrush(Color.FromArgb(40,255,255,255)))g.FillPath(track,path);
        Rectangle bar=style==ProgressBarStyle.Marquee?new Rectangle((int)((phase-0.4f)*Width),0,(int)(Width*0.4f),Height-1):new Rectangle(0,0,(int)((Width-1)*value/100f),Height-1);
        bar.Intersect(all);if(bar.Width<2)return;
        using(var path=SetupWindow.Round(bar,Height))using(var fill=new LinearGradientBrush(new Rectangle(bar.X-1,0,bar.Width+2,Height),Color.FromArgb(102,188,255),Color.FromArgb(127,224,200),LinearGradientMode.Horizontal))g.FillPath(fill,path);
    }
}
class SetupButton:Button {
    bool hover,pressed;
    public SetupButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;Cursor=Cursors.Hand;FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;
        MouseEnter+=(s,e)=>{hover=true;Invalidate();};MouseLeave+=(s,e)=>{hover=false;pressed=false;Invalidate();};MouseDown+=(s,e)=>{pressed=true;Invalidate();};MouseUp+=(s,e)=>{pressed=false;Invalidate();};}
    protected override void OnPaint(PaintEventArgs e){
        ButtonRenderer.DrawParentBackground(e.Graphics,ClientRectangle,this);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;float s=g.DpiX/96f;
        var box=new Rectangle(0,0,Width-1,Height-1);
        Color top=!Enabled?Color.FromArgb(44,70,96):pressed?Color.FromArgb(80,166,236):hover?Color.FromArgb(140,206,255):Color.FromArgb(110,192,255),bottom=!Enabled?Color.FromArgb(38,60,84):pressed?Color.FromArgb(70,150,220):hover?Color.FromArgb(118,192,250):Color.FromArgb(86,172,245);
        using(var path=SetupWindow.Round(box,(int)(14*s)))using(var fill=new LinearGradientBrush(box,top,bottom,LinearGradientMode.Vertical))g.FillPath(fill,path);
        if(Focused&&ShowFocusCues)using(var pen=new Pen(Color.FromArgb(220,255,255,255),1.5f*s))using(var path=SetupWindow.Round(Rectangle.Inflate(box,-(int)(3*s),-(int)(3*s)),(int)(11*s)))g.DrawPath(pen,path);
        TextRenderer.DrawText(g,Text,Font,box,Enabled?Color.FromArgb(0,25,45):Color.FromArgb(160,190,214),TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine);
    }
}
class SetupCard:Panel {
    public SetupCard(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor|ControlStyles.ResizeRedraw,true);BackColor=Color.Transparent;}
    protected override void OnPaint(PaintEventArgs e){
        var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;float s=g.DpiX/96f;var box=new Rectangle(0,0,Width-1,Height-1);
        using(var path=SetupWindow.Round(box,(int)(14*s))){using(var fill=new SolidBrush(Color.FromArgb(22,200,225,255)))g.FillPath(fill,path);using(var pen=new Pen(Color.FromArgb(38,195,222,246)))g.DrawPath(pen,path);}
    }
}
public class SetupWindow:Form {
    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr handle,int attribute,ref int value,int size);
    [System.Runtime.InteropServices.DllImport("user32.dll")]static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr handle,int message,IntPtr wparam,IntPtr lparam);
    [System.Runtime.InteropServices.DllImport("user32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode)]static extern uint PrivateExtractIcons(string file,int index,int cx,int cy,IntPtr[] icons,int[] ids,uint count,uint flags);
    [System.Runtime.InteropServices.DllImport("user32.dll")]static extern bool DestroyIcon(IntPtr icon);
    static readonly Color Muted=Color.FromArgb(176,196,218),Warn=Color.FromArgb(255,196,128);
    readonly string target;
    readonly bool review;
    readonly SetupButton install=new SetupButton();
    readonly Label heading=new Label(),subtitle=new Label(),message=new Label(),caption=new Label(),path=new Label(),tag=new Label(),footer=new Label(),closeBox=new Label(),brand=new Label();
    readonly SetupCard location=new SetupCard();
    readonly SetupProgress progress=new SetupProgress();
    readonly SetupToggle shortcuts=new SetupToggle(),launch=new SetupToggle();
    readonly Bitmap logo;
    readonly float scale;
    bool busy,done;
    internal static GraphicsPath Round(Rectangle box,int diameter){
        var path=new GraphicsPath();int d=Math.Max(2,Math.Min(diameter,Math.Min(box.Width,box.Height)));
        path.AddArc(box.X,box.Y,d,d,180,90);path.AddArc(box.Right-d,box.Y,d,d,270,90);path.AddArc(box.Right-d,box.Bottom-d,d,d,0,90);path.AddArc(box.X,box.Bottom-d,d,d,90,90);path.CloseFigure();return path;
    }
    int P(float value){return (int)Math.Round(value*scale);}
    static Bitmap LoadLogo(int size){
        try{var handles=new IntPtr[1];var ids=new int[1];if(PrivateExtractIcons(Application.ExecutablePath,0,size,size,handles,ids,1,0)==1&&handles[0]!=IntPtr.Zero){try{using(var icon=Icon.FromHandle(handles[0]))return icon.ToBitmap();}finally{DestroyIcon(handles[0]);}}}catch{}
        using(var icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath))return icon.ToBitmap();
    }
    public SetupWindow(string directory,bool isReview=false){
        target=directory;review=isReview;
        Text=SetupText.L("安装 Ruxget","Install Ruxget");Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);Font=new Font("Microsoft YaHei UI",9.5f);ForeColor=Color.White;BackColor=Color.FromArgb(9,16,25);
        FormBorderStyle=FormBorderStyle.None;MaximizeBox=false;MinimizeBox=false;StartPosition=FormStartPosition.CenterScreen;AutoScaleMode=AutoScaleMode.None;KeyPreview=true;DoubleBuffered=true;
        using(var g=CreateGraphics())scale=g.DpiX/96f;
        logo=LoadLogo(P(64));
        brand.Text=SetupText.L("Ruxget 安装程序","Ruxget Setup");brand.ForeColor=Muted;brand.Font=new Font(Font.FontFamily,8.5f);
        closeBox.Text="✕";closeBox.ForeColor=Muted;closeBox.TextAlign=ContentAlignment.MiddleCenter;closeBox.Cursor=Cursors.Hand;closeBox.Font=new Font("Segoe UI",10f);
        closeBox.MouseEnter+=(s,e)=>closeBox.ForeColor=Color.White;closeBox.MouseLeave+=(s,e)=>closeBox.ForeColor=Muted;closeBox.Click+=(s,e)=>Close();
        heading.Text=SetupText.L("安装 Ruxget","Install Ruxget");heading.Font=new Font(Font.FontFamily,17f,FontStyle.Bold);heading.TextAlign=ContentAlignment.TopCenter;
        subtitle.Text=SetupText.L("免费、无广告的下载器。装好后自动连接 Chrome 插件。","A free downloader with no ads. Connects to the Chrome extension automatically.");subtitle.ForeColor=Muted;subtitle.TextAlign=ContentAlignment.TopCenter;
        caption.Text=SetupText.L("安装位置","Install location");caption.ForeColor=Muted;caption.Font=new Font(Font.FontFamily,8.5f);
        tag.Text=SetupText.L("无需管理员权限","No admin rights needed");tag.ForeColor=Color.FromArgb(127,224,168);tag.Font=new Font(Font.FontFamily,8.5f);tag.TextAlign=ContentAlignment.TopRight;
        path.Text=target;path.AutoEllipsis=true;
        location.Controls.AddRange(new Control[]{caption,tag,path});
        shortcuts.Text=SetupText.L("创建桌面和开始菜单快捷方式","Create desktop and Start menu shortcuts");shortcuts.Checked=true;
        launch.Text=SetupText.L("安装完成后打开 Ruxget","Open Ruxget when done");launch.Checked=true;
        message.Text=SetupText.L("已有的下载记录和组件会保留。","Your existing downloads and components are kept.");message.ForeColor=Muted;message.Font=new Font(Font.FontFamily,9f);message.TextAlign=ContentAlignment.TopCenter;
        progress.Visible=false;
        install.Text=SetupText.L("安装并连接","Install and connect");install.Font=new Font(Font.FontFamily,10.5f,FontStyle.Bold);
        footer.Text=SetupText.L("版本 ","Version ")+Util.Version+SetupText.L(" · 免费开源，无广告"," · Free and open source, no ads");footer.ForeColor=Color.FromArgb(120,140,162);footer.Font=new Font(Font.FontFamily,8.5f);footer.TextAlign=ContentAlignment.TopCenter;
        foreach(var label in new[]{brand,closeBox,heading,subtitle,message,caption,tag,path,footer})label.BackColor=Color.Transparent;
        Controls.AddRange(new Control[]{brand,closeBox,heading,subtitle,location,shortcuts,launch,message,progress,install,footer});
        AcceptButton=install;Arrange();
        Shown+=(s,e)=>ActiveControl=install;
        MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Left&&e.Y<P(48)){ReleaseCapture();SendMessage(Handle,0xA1,(IntPtr)2,IntPtr.Zero);}};
        KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape&&!busy)Close();};
        install.Click+=async(s,e)=>{
            if(review||busy)return;if(done){Close();return;}busy=true;install.Enabled=false;shortcuts.Enabled=false;launch.Enabled=false;progress.Visible=true;progress.Style=ProgressBarStyle.Marquee;message.ForeColor=Muted;message.Text=SetupText.L("正在安装并连接插件…","Installing and connecting the extension…");install.Text=SetupText.L("正在安装…","Installing…");
            bool makeShortcuts=shortcuts.Checked,start=launch.Checked;
            try{await Task.Run(()=>{using(var payload=Installation.Payload()){if(payload==null)throw new Exception(SetupText.L("安装包不完整","The installer is incomplete"));Installation.Apply(target,Registry.CurrentUser,payload,Application.ExecutablePath,makeShortcuts);}});progress.Style=ProgressBarStyle.Continuous;progress.Value=100;ShowDone();
                if(start)try{Process.Start(new ProcessStartInfo(Path.Combine(target,Installation.Program)){UseShellExecute=false,WorkingDirectory=target});}catch(Exception ex){message.ForeColor=Warn;message.Text=SetupText.L("已经装好，但没能自动打开：","Installed, but couldn’t open it automatically: ")+ex.Message;Arrange();}}
            catch(Exception ex){message.ForeColor=Warn;message.Text=SetupText.L("安装未完成：","Installation didn’t finish: ")+ex.Message;progress.Visible=false;shortcuts.Enabled=true;launch.Enabled=true;install.Text=SetupText.L("重试安装","Try again");Arrange();}
            finally{busy=false;install.Enabled=true;}
        };
        FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
    }
    int Place(Label label,int y,int margin){int width=ClientSize.Width-2*margin;var size=TextRenderer.MeasureText(label.Text,label.Font,new Size(width,0),TextFormatFlags.WordBreak);label.SetBounds(margin,y,width,size.Height+P(2));return label.Bottom;}
    void Arrange(){
        SuspendLayout();
        int width=P(460),pad=P(32);ClientSize=new Size(width,ClientSize.Height);
        brand.SetBounds(P(18),P(14),P(200),P(20));closeBox.SetBounds(width-P(46),P(6),P(38),P(32));
        int y=P(54)+P(64)+P(18);
        y=Place(heading,y,pad)+P(4);y=Place(subtitle,y,pad)+P(22);
        // Visible reads false until the window is shown, so lay out by state instead.
        if(!done){
            location.SetBounds(pad,y,width-2*pad,P(64));int inner=location.Width-P(28);
            caption.SetBounds(P(14),P(10),inner/2,P(20));tag.SetBounds(P(14)+inner/2,P(10),inner-inner/2,P(20));path.SetBounds(P(14),P(32),inner,P(22));
            y=location.Bottom+P(14);
        }
        foreach(var toggle in new[]{shortcuts,launch})if(!done){toggle.SetBounds(pad,y,width-2*pad,P(30));y=toggle.Bottom+P(4);}
        y=Place(message,y+P(8),pad)+P(10);
        progress.SetBounds(pad,y,width-2*pad,P(4));y=progress.Bottom+P(14);
        install.SetBounds(pad,y,width-2*pad,P(46));y=install.Bottom+P(16);
        y=Place(footer,y,pad)+P(16);
        ClientSize=new Size(width,y);
        ResumeLayout(false);Invalidate(true);
    }
    void ShowDone(){
        done=true;heading.Text=SetupText.L("安装完成","Installed");subtitle.Text=SetupText.L("回到 Chrome，点工具栏里的 Ruxget 图标就能开始下载。桌面版会自动接收任务。","Back in Chrome, click the Ruxget icon in the toolbar to start downloading. The desktop app picks up tasks automatically.");
        location.Visible=shortcuts.Visible=launch.Visible=false;progress.Visible=false;message.ForeColor=Muted;message.Text=SetupText.L("以后可以在开始菜单找到 Ruxget。","You can find Ruxget in the Start menu.");install.Text=SetupText.L("完成","Done");Arrange();
    }
    protected override CreateParams CreateParams{get{var value=base.CreateParams;value.ClassStyle|=0x20000;return value;}}
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);MainWindow.ApplyDarkFrame(this);try{int round=2;DwmSetWindowAttribute(Handle,33,ref round,4);}catch(DllNotFoundException){}catch(EntryPointNotFoundException){}}
    protected override void OnPaintBackground(PaintEventArgs e){
        var g=e.Graphics;var all=ClientRectangle;if(all.Width<1||all.Height<1)return;g.SmoothingMode=SmoothingMode.AntiAlias;
        using(var fill=new LinearGradientBrush(all,Color.FromArgb(16,29,45),Color.FromArgb(6,11,18),LinearGradientMode.Vertical))g.FillRectangle(fill,all);
        var glow=new Rectangle(all.Width/2-P(170),P(-40),P(340),P(260));
        using(var path=new GraphicsPath()){path.AddEllipse(glow);using(var brush=new PathGradientBrush(path){CenterColor=Color.FromArgb(done?46:56,done?95:102,done?211:188,done?154:255),SurroundColors=new[]{Color.FromArgb(0,9,16,25)}})g.FillPath(brush,path);}
        using(var pen=new Pen(Color.FromArgb(46,195,222,246)))g.DrawRectangle(pen,0,0,all.Width-1,all.Height-1);
    }
    protected override void OnPaint(PaintEventArgs e){
        base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.InterpolationMode=InterpolationMode.HighQualityBicubic;
        var spot=new Rectangle((ClientSize.Width-P(64))/2,P(54),P(64),P(64));
        if(!done){using(var clip=Round(spot,P(30)))g.SetClip(clip);g.DrawImage(logo,spot);g.ResetClip();return;}
        using(var path=Round(spot,P(22)))using(var fill=new LinearGradientBrush(spot,Color.FromArgb(70,95,211,154),Color.FromArgb(24,95,211,154),LinearGradientMode.ForwardDiagonal))g.FillPath(fill,path);
        using(var pen=new Pen(Color.FromArgb(127,224,168),P(4)){StartCap=LineCap.Round,EndCap=LineCap.Round,LineJoin=LineJoin.Round})g.DrawLines(pen,new[]{new Point(spot.X+P(20),spot.Y+P(33)),new Point(spot.X+P(29),spot.Y+P(42)),new Point(spot.X+P(45),spot.Y+P(24))});
    }
    protected override void Dispose(bool disposing){if(disposing&&logo!=null)logo.Dispose();base.Dispose(disposing);}
    public void Review(string folder){Directory.CreateDirectory(folder);Show();Application.DoEvents();CaptureSetup(folder,"setup-100.png");
        message.ForeColor=Warn;message.Text=SetupText.L("安装未完成：请先关闭正在运行的 Ruxget，再安装更新","Installation didn’t finish: close the running Ruxget, then install the update");install.Text=SetupText.L("重试安装","Try again");Arrange();CaptureSetup(folder,"setup-error.png");
        message.ForeColor=Muted;message.Text=SetupText.L("正在安装并连接插件…","Installing and connecting the extension…");install.Text=SetupText.L("正在安装…","Installing…");install.Enabled=shortcuts.Enabled=launch.Enabled=false;progress.Visible=true;progress.Style=ProgressBarStyle.Continuous;progress.Value=55;Arrange();CaptureSetup(folder,"setup-busy.png");
        install.Enabled=true;ShowDone();CaptureSetup(folder,"setup-done.png");
        File.WriteAllText(Path.Combine(folder,"setup-ui-summary.json"),"{\"ok\":true,\"method\":\"real WinForms setup with explicit review flag; installer actions disabled\",\"dpiScale\":"+scale.ToString(System.Globalization.CultureInfo.InvariantCulture)+"}");Close();}
    void CaptureSetup(string folder,string name){Application.DoEvents();foreach(Control c in Controls)if(c.Visible&&(c.Right>ClientSize.Width+2||c.Bottom>ClientSize.Height+2||c.Left<0||c.Top<0))throw new Exception("安装窗口控件越界："+c.Text);
        foreach(var label in new[]{heading,subtitle,message,footer})if(label.Visible&&TextRenderer.MeasureText(label.Text,label.Font,new Size(label.Width,0),TextFormatFlags.WordBreak).Height>label.Height)throw new Exception("安装窗口文字被截断："+label.Text);
        using(var image=new Bitmap(Width,Height)){DrawToBitmap(image,new Rectangle(Point.Empty,image.Size));image.Save(Path.Combine(folder,name));}}
}
public static class SetupProgram {
    [STAThread] public static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);try{
        if(args.Length>1&&args[0]=="--review"){if(args.Length>2)SetupText.Chinese=args[2]!="en";using(var window=new SetupWindow(@"C:\Users\User\AppData\Local\Programs\Shiying",true))window.Review(args[1]);return 0;}
        if(args.Length>0&&args[0]=="--uninstall"){
            string path=Path.Combine(Installation.DefaultRoot,"installation.json");var receipt=Util.Json().Deserialize<InstallReceipt>(File.ReadAllText(path));
            if(Installation.Running(Installation.DefaultRoot))throw new Exception(SetupText.L("请先关闭 Ruxget，再卸载；任务和成品文件会保留。","Close Ruxget before uninstalling. Your tasks and downloaded files are kept."));
            if(MessageBox.Show(SetupText.L("卸载 Ruxget 程序和组件？\n\n任务记录、未完成数据和已下载文件会保留。","Uninstall Ruxget and its components?\n\nTask history, unfinished data and downloaded files are kept."),SetupText.L("卸载 Ruxget","Uninstall Ruxget"),MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;
            string helper=Path.Combine(Path.GetTempPath(),"Shiying-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");File.Copy(Application.ExecutablePath,helper);
            Process.Start(new ProcessStartInfo(helper,"--cleanup "+Util.Quote(receipt.Id)+" "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true});return 0;
        }
        if(args.Length==3&&args[0]=="--cleanup"){
            int parent;if(!Int32.TryParse(args[2],out parent)||!System.Text.RegularExpressions.Regex.IsMatch(args[1],@"^[a-f0-9]{32}$"))throw new Exception(SetupText.L("卸载参数无效","Invalid uninstall arguments"));
            try{using(var process=Process.GetProcessById(parent))if(!process.WaitForExit(15000))throw new Exception(SetupText.L("请关闭原卸载窗口后重试","Close the other uninstall window and try again"));}catch(ArgumentException){}
            Installation.Uninstall(Installation.DefaultRoot,Registry.CurrentUser,args[1]);MessageBox.Show(SetupText.L("已卸载 Ruxget。下载记录和未完成数据保留在：\n","Ruxget was uninstalled. Download history and unfinished data are kept in:\n")+Path.Combine(Installation.DefaultRoot,"data"),"Ruxget");return 0;
        }
        using(var window=new SetupWindow(Installation.DefaultRoot))Application.Run(window);return 0;
    }catch(Exception ex){MessageBox.Show(ex.Message,SetupText.L("Ruxget 安装","Ruxget Setup"),MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}}
}
}
