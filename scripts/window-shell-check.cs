// Render the whole native window on a private desktop. Never switch the input desktop.
using System;using System.Text;using System.IO;using System.Drawing;using System.Drawing.Imaging;using System.Reflection;using System.Runtime.InteropServices;using System.Threading;using System.Threading.Tasks;using System.Windows.Forms;using ShiyingDesktop;
using System.Linq;
class WindowShellCheck {
 const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]class Startup {public int cb=Marshal.SizeOf(typeof(Startup));public string reserved,desktop,title;public int x,y,w,h,cx,cy,fill,flags;public short show,reservedCount;public IntPtr reservedData,input,output,error;}
 [StructLayout(LayoutKind.Sequential)]struct ProcessInfo {public IntPtr process,thread;public int pid,tid;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,int flags,uint access,IntPtr security);
 [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr value);
 [DllImport("user32.dll")]static extern IntPtr OpenInputDesktop(int flags,bool inherit,uint access);
 [DllImport("user32.dll")]static extern IntPtr GetThreadDesktop(int thread);
 [DllImport("kernel32.dll")]static extern int GetCurrentThreadId();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool GetUserObjectInformation(IntPtr value,int index,StringBuilder buffer,int size,out int needed);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,int flags,IntPtr environment,string directory,Startup startup,out ProcessInfo info);
 [DllImport("kernel32.dll")]static extern int WaitForSingleObject(IntPtr value,int timeout);
 [DllImport("kernel32.dll")]static extern bool GetExitCodeProcess(IntPtr value,out int code);
 [DllImport("kernel32.dll")]static extern bool TerminateProcess(IntPtr value,int code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr window,IntPtr dc,int flags);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")]static extern int Style(IntPtr window,int index);
 [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr window,int message,IntPtr wparam,IntPtr lparam);
 [DllImport("user32.dll")]static extern IntPtr ChildWindowFromPointEx(IntPtr parent,Point point,int flags);
 [DllImport("user32.dll")]static extern bool ScreenToClient(IntPtr window,ref Point point);
 static string Name(IntPtr value){var text=new StringBuilder(256);int needed;Require(value!=IntPtr.Zero&&GetUserObjectInformation(value,2,text,512,out needed),"Cannot verify desktop identity");return text.ToString();}
 static string Input(){IntPtr value=OpenInputDesktop(0,false,1);try{return Name(value);}finally{if(value!=IntPtr.Zero)CloseDesktop(value);}}
 static void Require(bool ok,string text){if(!ok)throw new Exception(text);}
 static object Field(object target,string name){return target.GetType().GetField(name,Private).GetValue(target);}
 static object Call(object target,string name,params object[] args){return target.GetType().GetMethod(name,Private).Invoke(target,args);}
 static void Pump(Func<bool> done,string text,int seconds=20){DateTime end=DateTime.UtcNow.AddSeconds(seconds);while(!done()&&DateTime.UtcNow<end){Application.DoEvents();Thread.Sleep(10);}Require(done(),text);}
 static void Await(Task task,string text){Pump(()=>task.IsCompleted,text);task.GetAwaiter().GetResult();}
 static string JS(MainWindow window,string script){object view=Field(window,"pluginView");var task=(Task<string>)view.GetType().GetMethod("Evaluate").Invoke(view,new object[]{script});Await(task,"WebView evaluation did not finish");return task.Result;}
 static void Capture(Form window,string file){Application.DoEvents();using(var image=new Bitmap(window.Width,window.Height,PixelFormat.Format32bppArgb))using(var graphics=Graphics.FromImage(image)){IntPtr dc=graphics.GetHdc();bool ok;try{ok=PrintWindow(window.Handle,dc,2);}finally{graphics.ReleaseHdc(dc);}Require(ok,"Whole-window PrintWindow failed");image.Save(file,ImageFormat.Png);}}
 static void CheckTransparentHost(string report,string library){
  var type=Assembly.LoadFrom(library).GetType("ShiyingInterface.PluginView",true);
  using(var sample=new Form{ClientSize=new Size(800,540),FormBorderStyle=FormBorderStyle.None,ShowInTaskbar=false,StartPosition=FormStartPosition.Manual,Location=new Point(20,20)})using(var view=(Control)Activator.CreateInstance(type)){
   Require(view.BackColor.A==0,"A solid WinForms host masks the system material");view.Dock=DockStyle.Fill;sample.Controls.Add(view);sample.BackColor=Color.FromArgb(45,105,190);sample.Show();Await((Task)type.GetMethod("Initialize").Invoke(view,new object[]{Path.Combine(report,"material-cache")}),"Material view did not initialize");
   Func<string,string> evaluate=script=>{var task=(Task<string>)type.GetMethod("Evaluate").Invoke(view,new object[]{script});Await(task,"Material evaluation failed");return task.Result;};
   Pump(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('.desktop-app')")=="true","Material document did not become ready");evaluate("document.body.replaceChildren();document.documentElement.style.height='100%';document.body.style.height='100%'");
   string blue=Path.Combine(report,"native-host-blue.png"),amber=Path.Combine(report,"native-host-amber.png");Capture(sample,blue);sample.BackColor=Color.FromArgb(210,146,52);sample.Invalidate(true);sample.Refresh();Application.DoEvents();Capture(sample,amber);
   using(var first=new Bitmap(blue))using(var second=new Bitmap(amber)){Color a=first.GetPixel(first.Width/2,first.Height/2),b=second.GetPixel(second.Width/2,second.Height/2);int delta=Math.Abs(a.R-b.R)+Math.Abs(a.G-b.G)+Math.Abs(a.B-b.B);Require(delta>40,"Native host color is masked by an opaque surface (delta="+delta+")");Util.Atomic(Path.Combine(report,"native-material.json"),new{ok=true,hostTransparent=true,parentColorChangeDelta=delta,desktopDwmCompositeVisuallyVerified=false});}
   sample.Close();
  }
 }
 static int Hit(MainWindow window,Point point){Point screen=window.PointToScreen(point);IntPtr current=window.Handle;for(int n=0;n<8;n++){Point local=screen;ScreenToClient(current,ref local);IntPtr next=ChildWindowFromPointEx(current,local,7);if(next==IntPtr.Zero||next==current)break;current=next;}long packed=((long)(screen.Y&65535)<<16)|(uint)(screen.X&65535);return SendMessage(current,0x84,IntPtr.Zero,new IntPtr(packed)).ToInt32();}
 static void CheckClose(MainWindow window,Manager manager,string report){
  string partial=Path.Combine(manager.DataDirectory,"preserved-partial.bin");File.WriteAllText(partial,"preserve partial data across asynchronous close");string hash=ComponentStore.Hash(partial);Size normal=window.ClientSize;
  using(var owned=new Form{Text="Private owned details fixture",ShowInTaskbar=false})using(var held=new ManualResetEventSlim()){
   owned.Show(window);typeof(MainWindow).GetField("preview",Private).SetValue(window,false); // Constructor stays in isolated review mode; exercise the production close event only.
   var worker=Task.Run(()=>{lock(Field(manager,"gate")){held.Set();Thread.Sleep(2100);}});Require(held.Wait(1000),"Slow shutdown fixture did not acquire the manager gate");
   var watch=System.Diagnostics.Stopwatch.StartNew();Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"close\"}");long requestMs=watch.ElapsedMilliseconds;
   bool immediatelyHidden=!window.Visible&&!owned.Visible,pending=!window.IsDisposed;window.RestoreFromTray();bool restoreSuppressed=!window.Visible;window.Close();
   Pump(()=>window.IsDisposed,"Production close never completed its asynchronous cleanup");worker.GetAwaiter().GetResult();long cleanupMs=watch.ElapsedMilliseconds;
   var saved=Util.Json().Deserialize<WindowLayout>(File.ReadAllText(Path.Combine(manager.DataDirectory,"window.json")));bool sizeSaved=saved.Width==normal.Width&&saved.Height==normal.Height;
   using(var restored=new Manager(manager.DataDirectory))Require(restored.Snapshot().Count==2&&restored.Snapshot().All(job=>job.Status=="已暂停"),"Close did not retain both paused tasks");
   Require(ComponentStore.Hash(partial)==hash&&sizeSaved,"Asynchronous close lost partial data or remembered dimensions");
   Util.Atomic(Path.Combine(report,"close-latency.json"),new{version=Util.Version,requestMs,immediatelyHidden,restoreSuppressed,cleanupMs,cleanupRemainedPending=pending,taskStatePreserved=true,partialFilePreserved=true,windowSizePreserved=sizeSaved,fixture="production close event with a deliberately busy Manager gate held for 2.1 seconds; private desktop only; no input or media"});
   Require(requestMs<300&&immediatelyHidden,"Window or owned details stays visible while background shutdown is pending");Require(restoreSuppressed,"A stale restore request reopens the closing window");Require(pending&&cleanupMs>=1800,"Close bypassed required safe cleanup");
  }
 }
 static void Child(string report,string library,string expected){
  Require(Name(GetThreadDesktop(GetCurrentThreadId()))==expected&&Input()!=expected,"Refuse to show test windows on the input desktop");
  Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS","--disable-gpu");Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
  using(var backgroundManager=new Manager(Path.Combine(report,"netdisk-background-state")))using(var backgroundWindow=new MainWindow(backgroundManager,true)){
   backgroundWindow.PrepareBackgroundStart();backgroundWindow.Show();Application.DoEvents();Require(!backgroundWindow.Visible&&backgroundWindow.Opacity==1,"Background startup exposes a desktop window");
   var payload=Util.Json().Deserialize<System.Collections.Generic.Dictionary<string,object>>("{\"action\":\"netdisk\",\"provider\":\"quark\",\"source\":\"https://pan.quark.cn/list\",\"requestId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"files\":[{\"index\":0,\"url\":\"https://dl.quark.cn/fixture.bin\",\"title\":\"fixture.bin\",\"size\":12345,\"headers\":{}}]}");
   backgroundWindow.AcceptNetdisk(payload);Require(!backgroundWindow.Visible&&backgroundManager.Snapshot().Count==1,"Receiving a netdisk task reopens the hidden window");
   Util.Atomic(Path.Combine(report,"netdisk-background.json"),new{ok=true,backgroundStartupHidden=true,queueDoesNotRestoreWindow=true,privateDesktopOnly=true,noDownloadWorkerStarted=true});backgroundWindow.Close();
  }
  CheckTransparentHost(report,library);
  using(var backdrop=new Form{FormBorderStyle=FormBorderStyle.None,BackColor=Color.FromArgb(101,112,40),Bounds=Screen.PrimaryScreen.Bounds,ShowInTaskbar=false})
  using(var manager=new Manager(Path.Combine(report,"state")))using(var window=new MainWindow(manager,true)){
   backdrop.Show();window.PreparePluginLayout();window.StartPosition=FormStartPosition.Manual;window.Location=new Point(90,80);window.Show();Call(window,"RestoreWindowMode");Await(window.InitializePlugin(Path.Combine(report,"cache"),library),"Private WebView did not start");Pump(()=>(bool)Field(window,"pluginReady"),"Private interface did not become ready");window.ClientSize=new Size(1470,1050);window.PerformLayout();
   Require((Style(window.Handle,-16)&0x00c00000)==0,"Duplicate native caption was not removed");Require(window.Size==window.ClientSize,"Window and client bounds must agree without a nested frame");
   Require((bool)Field(window,"NativeOutlineSuppressed"),"Windows did not accept border suppression");Require(window.Padding==Padding.Empty&&((Control)Field(window,"pluginView")).Bounds==window.ClientRectangle,"A visible resize gutter still surrounds the WebView");
   Require(JS(window,"document.querySelectorAll('#fullSurface [data-window]').length===3&&getComputedStyle(document.querySelector('.desktop-toolbar')).webkitAppRegion==='drag'&&getComputedStyle(document.getElementById('linkURL')).webkitAppRegion==='no-drag'")=="true","Integrated title controls or native drag regions missing");
   Capture(window,Path.Combine(report,"whole-window-empty.png"));
   using(var pixels=new Bitmap(Path.Combine(report,"whole-window-empty.png"))){int y=pixels.Height/2;Func<Color,Color,int> difference=(a,b)=>Math.Abs(a.R-b.R)+Math.Abs(a.G-b.G)+Math.Abs(a.B-b.B);Require(difference(pixels.GetPixel(2,y),pixels.GetPixel(24,y))<6&&difference(pixels.GetPixel(pixels.Width-3,y),pixels.GetPixel(pixels.Width-25,y))<6,"Side edges do not match the full-bleed surface");}
   var first=manager.Add("https://files.example.test/model.bin","file","Qwen3-32B.safetensors");first.Status="下载中";first.Stage="正在下载";first.Speed="81.9 MB/s";first.Progress=74.8;first.Transfer=new TransferInfo{Total=14606000000L,Completed=10921000000L,Speed=81890000,Eta=45,Resume=true,Connections=8,Pieces=16,PieceLength=912875000,Bitfield="ffff"};
   var second=manager.Add("https://files.example.test/video.mp4","file","沿着海岸线的旅行.mp4");second.Status="已暂停";second.Progress=26;second.Transfer=new TransferInfo{Total=320000000,Completed=83000000,Resume=true};Call(window,"RefreshJobs");JS(window,"document.querySelector('[data-id=\""+first.Id+"\"]').click()");
   Require(JS(window,"!document.getElementById('inspector').hidden&&document.getElementById('inspectorActions').getBoundingClientRect().bottom<=innerHeight")=="true","Detail actions are clipped below the window");Capture(window,Path.Combine(report,"whole-window-tasks.png"));
   double dpr=Double.Parse(JS(window,"devicePixelRatio"),System.Globalization.CultureInfo.InvariantCulture);var location=Util.Json().Deserialize<int[]>(JS(window,"(()=>{const r=document.querySelector('.brand h1').getBoundingClientRect();return [Math.round((r.x+r.width/2)*devicePixelRatio),Math.round((r.y+r.height/2)*devicePixelRatio)]})()"));int drag=Hit(window,new Point(window.Padding.Left+location[0],window.Padding.Top+location[1]));
   var adapter=Field(window,"pluginView");var browser=Field(adapter,"browser");var core=browser.GetType().GetProperty("CoreWebView2").GetValue(browser,null);var settings=core.GetType().GetProperty("Settings").GetValue(core,null);Require((bool)settings.GetType().GetProperty("IsNonClientRegionSupportEnabled").GetValue(settings,null),"Native WebView non-client region support is disabled");
   Size normal=window.Size;Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"maximize\"}");Pump(()=>window.WindowState==FormWindowState.Maximized,"Maximize command did not maximize");Rectangle client=window.RectangleToScreen(window.ClientRectangle),work=Screen.FromHandle(window.Handle).WorkingArea;Require(client==work,"Maximized content must fit the work area and not cover the taskbar (client="+client+", work="+work+", window="+window.Bounds+")");Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"maximize\"}");Pump(()=>window.WindowState==FormWindowState.Normal,"Restore command did not restore");Require(window.Size==normal,"Restore changed normal window dimensions (before="+normal+", after="+window.Size+")");
   JS(window,"document.getElementById('miniToggle').click()");Pump(()=>(bool)Field(window,"miniMode"),"Mini command failed");Require(JS(window,"document.getElementById('miniAction').getBoundingClientRect().bottom<=innerHeight")=="true","Mini action is clipped");Capture(window,Path.Combine(report,"whole-window-mini.png"));JS(window,"document.getElementById('expand').click()");Pump(()=>!(bool)Field(window,"miniMode"),"Mini expand failed");Require(window.Size==normal,"Mini expand changed the saved normal window size");
   Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"minimize\"}");Pump(()=>window.WindowState==FormWindowState.Minimized,"Minimize command failed");window.WindowState=FormWindowState.Normal;
   Util.Atomic(Path.Combine(report,"child.json"),new{ok=true,version=Util.Version,privateDesktop=expected,wholeWindowCaptured=true,nativeCaptionRemoved=true,dragHit=drag,maximizeFitsWorkArea=true,miniRestoresSize=true,normalWidth=normal.Width,normalHeight=normal.Height,dpr,mediaDownloaded=false});CheckClose(window,manager,report);backdrop.Close();
  }
 }
 [STAThread]static int Main(string[] args){string report=args.Length>1&&args[0]=="--private"?args[1]:args[0];try{Directory.CreateDirectory(report);if(args[0]=="--private"){Child(args[1],args[2],args[3]);return 0;}
  string initial=Input(),name="Shiying.Review."+Guid.NewGuid().ToString("N");IntPtr desktop=CreateDesktop(name,IntPtr.Zero,IntPtr.Zero,0,0xc7,IntPtr.Zero);Require(desktop!=IntPtr.Zero,"Private test desktop could not be created: "+Marshal.GetLastWin32Error());try{
   var startup=new Startup{desktop="WinSta0\\"+name};ProcessInfo child;string self=Assembly.GetExecutingAssembly().Location;Require(CreateProcess(self,new StringBuilder(Util.Quote(self)+" --private "+Util.Quote(report)+" "+Util.Quote(args[1])+" "+Util.Quote(name)),IntPtr.Zero,IntPtr.Zero,false,0x08000000,IntPtr.Zero,Path.GetDirectoryName(self),startup,out child),"Private test process could not start");try{int result=WaitForSingleObject(child.process,45000);if(result!=0){TerminateProcess(child.process,2);throw new Exception("Private desktop check timed out");}int code;GetExitCodeProcess(child.process,out code);Require(code==0,"Private desktop check failed; see child-error.txt");}finally{CloseHandle(child.thread);CloseHandle(child.process);}
   Require(Input()==initial,"The user input desktop changed");Util.Atomic(Path.Combine(report,"summary.json"),new{ok=true,version=Util.Version,privateDesktopOnly=true,inputDesktopUnchanged=true,personalScreenCaptured=false,mouseMoved=false,keyboardInputSent=false,checks=new[]{"whole native window: no duplicate caption or nested outer frame","native drag-region support and interactive no-drag partition enabled","maximized client equals monitor work area","native minimize/maximize/restore/close commands","fixed detail actions remain visible","mini controls fit and full size is restored"},mediaDownloaded=false,published=false});Console.WriteLine("WHOLE WINDOW CHECK PASSED "+report);return 0;
  }finally{CloseDesktop(desktop);}
 }catch(Exception ex){File.WriteAllText(Path.Combine(report,args[0]=="--private"?"child-error.txt":"error.txt"),ex.ToString());Console.Error.WriteLine(ex.Message);return 1;}}
}
