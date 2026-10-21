using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ShiyingDesktop {
public class SetupWindow:Form {
    readonly string target;
    readonly bool review;
    readonly Button install=new QuietButton();
    readonly Label message=new Label();
    readonly ProgressBar progress=new ProgressBar();
    readonly CheckBox shortcuts=new CheckBox(),launch=new CheckBox();
    bool busy;
    public SetupWindow(string directory,bool isReview=false){
        target=directory;review=isReview;Text="安装拾影 · "+Util.Version+" 本地预览";Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);Font=new Font("Microsoft YaHei UI",9.5f);BackColor=Color.Black;ForeColor=Color.FromArgb(255,255,255);ClientSize=new Size(620,440);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;StartPosition=FormStartPosition.CenterScreen;AutoScaleDimensions=new SizeF(96,96);AutoScaleMode=AutoScaleMode.Dpi;HandleCreated+=(sender,args)=>MainWindow.ApplyDarkFrame(this);
        Controls.Add(new Label{Text="装好拾影，直接开始下载",Font=new Font(Font.FontFamily,16,FontStyle.Bold),Left=30,Top=28,Width=560,Height=44});
        Controls.Add(new Label{Text="普通下载组件随安装器提供，视频组件首次需要时自动准备。",ForeColor=Color.FromArgb(196,214,235),Left=32,Top=87,Width=556,Height=48});
        Controls.Add(new Label{Text="安装到当前用户，无需管理员权限",Left=32,Top=147,Width=556,Height=26});
        Controls.Add(new TextBox{Text=target,ReadOnly=true,Left=32,Top=180,Width=556,BackColor=Color.FromArgb(17,29,46)});
        shortcuts.SetBounds(32,228,556,26);shortcuts.Text="创建桌面和开始菜单快捷方式";shortcuts.Checked=true;Controls.Add(shortcuts);
        launch.SetBounds(32,264,556,26);launch.Text="完成后打开拾影";launch.Checked=true;Controls.Add(launch);
        message.SetBounds(32,306,556,40);message.ForeColor=Color.FromArgb(196,214,235);message.Text="自动登记配套插件连接，现有下载数据保留。";Controls.Add(message);
        progress.SetBounds(32,355,556,5);progress.Visible=false;Controls.Add(progress);
        install.SetBounds(428,380,160,38);install.Text="安装并连接";install.FlatStyle=FlatStyle.Flat;install.FlatAppearance.BorderSize=0;install.BackColor=Color.FromArgb(95,185,255);install.ForeColor=Color.Black;Controls.Add(install);AcceptButton=install;
        Shown+=(s,e)=>ActiveControl=install;
        install.Click+=async(s,e)=>{
            if(review||busy)return;if(install.Text=="完成"){Close();return;}busy=true;install.Enabled=false;shortcuts.Enabled=false;launch.Enabled=false;progress.Visible=true;progress.Style=ProgressBarStyle.Marquee;message.Text="正在安装与连接…";
            bool makeShortcuts=shortcuts.Checked,start=launch.Checked;
            try{await Task.Run(()=>{using(var payload=Installation.Payload()){if(payload==null)throw new Exception("安装包不完整");Installation.Apply(target,Registry.CurrentUser,payload,Application.ExecutablePath,makeShortcuts);}});progress.Style=ProgressBarStyle.Continuous;progress.Value=100;message.Text="安装完成。回到拾影插件检查连接即可使用。";install.Text="完成";if(start)Process.Start(new ProcessStartInfo(Path.Combine(target,"拾影.exe")){UseShellExecute=false,WorkingDirectory=target});}
            catch(Exception ex){message.Text="安装未完成："+ex.Message;progress.Visible=false;shortcuts.Enabled=true;launch.Enabled=true;}
            finally{busy=false;install.Enabled=true;}
        };
        FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
    }
    public void Review(string folder){Directory.CreateDirectory(folder);Show();Application.DoEvents();CaptureSetup(folder,"setup-100.png");Scale(new SizeF(1.25f,1.25f));CaptureSetup(folder,"setup-125.png");Scale(new SizeF(1.2f,1.2f));CaptureSetup(folder,"setup-150.png");File.WriteAllText(Path.Combine(folder,"setup-ui-summary.json"),"{\"ok\":true,\"method\":\"real WinForms setup with explicit review path; simulated 100/125/150 percent scaling; no install, registration or downloads\"}");Close();}
    void CaptureSetup(string folder,string name){Application.DoEvents();foreach(Control c in Controls)if(c.Right>ClientSize.Width+2||c.Bottom>ClientSize.Height+2||c.Left<0||c.Top<0)throw new Exception("安装窗口控件越界："+c.Text);using(var image=new Bitmap(Width,Height)){DrawToBitmap(image,new Rectangle(Point.Empty,image.Size));image.Save(Path.Combine(folder,name));}}
}
public static class SetupProgram {
    [STAThread] public static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);try{
        if(args.Length>1&&args[0]=="--review"){using(var window=new SetupWindow(@"C:\Users\User\AppData\Local\Programs\Shiying",true))window.Review(args[1]);return 0;}
        if(args.Length>0&&args[0]=="--uninstall"){
            string path=Path.Combine(Installation.DefaultRoot,"installation.json");var receipt=Util.Json().Deserialize<InstallReceipt>(File.ReadAllText(path));
            if(Installation.Running(Installation.DefaultRoot))throw new Exception("请先关闭拾影，再卸载；任务和成品文件会保留。");
            if(MessageBox.Show("卸载拾影程序和组件？\n\n任务记录、未完成数据和已下载文件会保留。","卸载拾影",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;
            string helper=Path.Combine(Path.GetTempPath(),"Shiying-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");File.Copy(Application.ExecutablePath,helper);
            Process.Start(new ProcessStartInfo(helper,"--cleanup "+Util.Quote(receipt.Id)+" "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true});return 0;
        }
        if(args.Length==3&&args[0]=="--cleanup"){
            int parent;if(!Int32.TryParse(args[2],out parent)||!System.Text.RegularExpressions.Regex.IsMatch(args[1],@"^[a-f0-9]{32}$"))throw new Exception("卸载参数无效");
            try{using(var process=Process.GetProcessById(parent))if(!process.WaitForExit(15000))throw new Exception("请关闭原卸载窗口后重试");}catch(ArgumentException){}
            Installation.Uninstall(Installation.DefaultRoot,Registry.CurrentUser,args[1]);MessageBox.Show("已卸载拾影。下载记录和未完成数据保留在：\n"+Path.Combine(Installation.DefaultRoot,"data"),"拾影");return 0;
        }
        using(var window=new SetupWindow(Installation.DefaultRoot))Application.Run(window);return 0;
    }catch(Exception ex){MessageBox.Show(ex.Message,"拾影安装",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}}
}
}
