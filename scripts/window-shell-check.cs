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
   using(var first=new Bitmap(blue))using(var second=new Bitmap(amber)){Color a=first.GetPixel(first.Width/2,first.Height/2),b=second.GetPixel(second.Width/2,second.Height/2);int delta=Math.Abs(a.R-b.R)+Math.Abs(a.G-b.G)+Math.Abs(a.B-b.B);
   // 0.4.71: the desktop page is an opaque light cream surface (#F4F0E4), so the host colour must not show through.
   Func<Color,bool> cream=c=>Math.Abs(c.R-244)<=6&&Math.Abs(c.G-240)<=6&&Math.Abs(c.B-228)<=6;
   Require(delta<=6&&cream(a)&&cream(b),"Desktop page is not the opaque light surface (delta="+delta+", centre="+a+")");Util.Atomic(Path.Combine(report,"native-material.json"),new{ok=true,hostTransparent=false,opaqueLightSurface=true,parentColorChangeDelta=delta});}
   sample.Close();
  }
 }
 static int Hit(MainWindow window,Point point){Point screen=window.PointToScreen(point);IntPtr current=window.Handle;for(int n=0;n<8;n++){Point local=screen;ScreenToClient(current,ref local);IntPtr next=ChildWindowFromPointEx(current,local,7);if(next==IntPtr.Zero||next==current)break;current=next;}long packed=((long)(screen.Y&65535)<<16)|(uint)(screen.X&65535);return SendMessage(current,0x84,IntPtr.Zero,new IntPtr(packed)).ToInt32();}
 static void CheckClose(MainWindow window,Manager manager,string report){
  string partial=Path.Combine(manager.DataDirectory,"preserved-partial.bin");File.WriteAllText(partial,"preserve partial data across asynchronous close");string hash=ComponentStore.Hash(partial);Size normal=window.ClientSize;
  using(var owned=new Form{Text="Private owned details fixture",ShowInTaskbar=false})using(var held=new ManualResetEventSlim()){
   owned.Show(window);typeof(MainWindow).GetField("preview",Private).SetValue(window,false); // Constructor stays in isolated review mode; exercise the production close event only.
   // 0.4.72: the first X asks (quit, or keep running in the tray) instead of hiding at once; "remember" makes the
   // answer the setting, and from then on the X just does it.
   manager.Config.CloseAction="";
   Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"close\"}");var askWatch=System.Diagnostics.Stopwatch.StartNew();while(askWatch.ElapsedMilliseconds<600){Application.DoEvents();Thread.Sleep(30);}
   Require(window.Visible&&!window.IsDisposed,"The first X should ask (quit or keep in the tray), not hide or quit at once");
   Call(window,"PluginMessage","{\"command\":\"closeChoice\",\"action\":\"tray\",\"remember\":true}");Pump(()=>!window.Visible,"Choosing 收到右下角 did not hide the window");
   Require(manager.Config.CloseAction=="tray"&&!window.IsDisposed,"The remembered answer did not become the setting");window.Show();
   var worker=Task.Run(()=>{lock(Field(manager,"gate")){held.Set();Thread.Sleep(2100);}});Require(held.Wait(1000),"Slow shutdown fixture did not acquire the manager gate");
   // With 「收到右下角」 chosen, the X hides to the tray and keeps running; quitting is the tray's 「退出 Ruxget」.
   Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"close\"}");Pump(()=>!window.Visible,"The X did not hide the window");Require(!window.IsDisposed,"The X closed the app instead of hiding it to the tray");window.Show();
   var watch=System.Diagnostics.Stopwatch.StartNew();Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"quit\"}");long requestMs=watch.ElapsedMilliseconds;
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
  // 0.4.70: a file or video handed over from the extension's panel starts at once and quietly (hidden window stays hidden);
  // BT and magnet links still go to the window for their choices. No download can reach anything: port 9 on 127.0.0.1.
  using(var addManager=new Manager(Path.Combine(report,"add-background-state")))using(var addWindow=new MainWindow(addManager,true)){
   addWindow.PrepareBackgroundStart();addWindow.Show();Application.DoEvents();
   // The 0.4.71 extension marks its hand-offs quiet:true (it shows them in 已下载); without it the window still confirms.
   Func<string,System.Collections.Generic.Dictionary<string,object>> input=json=>{var d=Util.Json().Deserialize<System.Collections.Generic.Dictionary<string,object>>(json);if(!d.ContainsKey("quiet"))d["quiet"]=true;return d;};
   Func<object,string,object> prop=(value,name)=>value==null?null:value.GetType().GetProperty(name).GetValue(value,null);
   object file=addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"http://127.0.0.1:9/fixture.bin\",\"title\":\"fixture.bin\"}"));
   string fileId=(string)prop(file,"id");
   Require(file!=null&&(bool)prop(file,"ok")&&(string)prop(file,"stage")=="started"&&!String.IsNullOrEmpty(fileId)&&(string)prop(file,"name")=="fixture.bin","A file from the panel did not start at once with its id and name");
   Require(addManager.Snapshot().Any(job=>job.Id==fileId&&job.Kind=="file"),"The started file is not in the task list");
   object again=addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"http://127.0.0.1:9/fixture.bin\",\"title\":\"fixture.bin\"}"));
   Require((string)prop(again,"id")==fileId&&addManager.Snapshot().Count(job=>job.Url=="http://127.0.0.1:9/fixture.bin")==1,"Sending the same link twice made a second task");
   Require(addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"quiet\":false,\"url\":\"http://127.0.0.1:9/old.bin\"}"))==null&&addWindow.AcceptAdd(Util.Json().Deserialize<System.Collections.Generic.Dictionary<string,object>>("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"http://127.0.0.1:9/old.bin\"}"))==null,"An older extension (which says to confirm in the window) got a quiet start");
   Require(addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"video\",\"url\":\"https://www.example.test/playlist?list=PL1\"}"))==null,"A whole playlist started without the window's list choice");
   object stream=addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"http://127.0.0.1:9/live/index.m3u8\",\"title\":\"live\"}"));
   string streamId=(string)prop(stream,"id");
   Require(stream!=null&&addManager.Snapshot().Any(job=>job.Id==streamId&&job.Kind=="video"),"A pasted stream link was not treated as a video");
   object video=addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"video\",\"url\":\"http://127.0.0.1:9/watch/1.mpd\",\"title\":\"clip\",\"height\":\"720\"}"));
   Require(video!=null&&addManager.Snapshot().Any(job=>job.Id==(string)prop(video,"id")&&job.Kind=="video"),"A video from the panel did not start at once");
   int before=addManager.Snapshot().Count;
   Require(addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"magnet\",\"url\":\"magnet:?xt=urn:btih:"+new string('a',40)+"\"}"))==null&&addManager.Snapshot().Count==before,"A magnet link was started without the window's file choice");
   Require(addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"magnet:?xt=urn:btih:"+new string('c',40)+"\"}"))==null&&addManager.Snapshot().Count==before,"A magnet link sent as a file started without the window");
   object lookalike=addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"http://notyoutube.com.invalid/a.zip\",\"title\":\"a.zip\"}"));
   object upper=addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"file\",\"url\":\"http://127.0.0.1:9/LIVE/INDEX.M3U8\",\"title\":\"live\"}"));
   Require(addManager.Snapshot().First(job=>job.Id==(string)prop(lookalike,"id")).Kind=="file"&&addManager.Snapshot().First(job=>job.Id==(string)prop(upper,"id")).Kind=="video","A look-alike host became a video, or an upper-case playlist did not");
   Require(addWindow.AcceptAdd(input("{\"action\":\"add\",\"kind\":\"torrent\",\"url\":\"C:\\\\fixture.torrent\"}"))==null,"A torrent was started without the window's file choice");
   Application.DoEvents();Require(!addWindow.Visible,"A quiet hand-off reopened the hidden window");
   foreach(var job in addManager.Snapshot())addManager.Pause(job.Id);
   // 新建下载 fills in a single copied link only (read from the clipboard on that click; the rule is tested without it).
   Func<string,string> link=MainWindow.LinkFromText;
   Require(link("  https://example.test/a.zip \r\n")=="https://example.test/a.zip"&&link("http://example.test/")=="http://example.test/"&&link("magnet:?xt=urn:btih:"+new string('b',40))=="magnet:?xt=urn:btih:"+new string('b',40),"A single copied web or magnet link is not filled in");
   Require(link("")==""&&link(null)==""&&link("看看这个 https://example.test/a.zip")==""&&link("https://a.test/1\nhttps://a.test/2")==""&&link("ftp://example.test/a.zip")==""&&link("file:///C:/Windows/win.ini")==""&&link("javascript:alert(1)")==""&&link("C:\\Users\\a.zip")==""&&link("https://example.test/"+new string('x',16400))=="","Copied text that is not one web or magnet link is filled in");
   Require(link("https://example.test/a.zip。")=="https://example.test/a.zip"&&link("\u200Bhttps://example.test/a.zip\uFEFF")=="https://example.test/a.zip"&&link("（https://example.test/b.zip）")==""&&link("https://example.test/c.zip，")=="https://example.test/c.zip","Punctuation or invisible spaces around a copied link are kept");
   Require(link("magnet:?")==""&&link("magnet:")==""&&link("magnet:?dn=x")==""&&link("https://user:pass@example.test/a.zip")=="","A bare magnet or a link with a password is filled in");
   Util.Atomic(Path.Combine(report,"quiet-add.json"),new{ok=true,startedAtOnce=true,hiddenWindowStaysHidden=true,btNeedsWindow=true,clipboardRuleChecked=true,realClipboardTouched=false,privateDesktopOnly=true});
   addWindow.Close();
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
   Size normal=window.Size;Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"maximize\"}");Pump(()=>window.WindowState==FormWindowState.Maximized,"Maximize command did not maximize");Rectangle client=window.RectangleToScreen(window.ClientRectangle),work=Screen.FromHandle(window.Handle).WorkingArea;Require(client==work,"Maximized content must fit the work area and not cover the taskbar (client="+client+", work="+work+", window="+window.Bounds+")");Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"maximize\"}");Pump(()=>window.WindowState==FormWindowState.Normal,"Restore command did not restore");Require(window.Size==normal,"Restore changed normal window dimensions (before="+normal+", after="+window.Size+")");var filled=(Control)Field(window,"pluginView");Application.DoEvents();Require(filled.Size==window.ClientSize,"After restoring from maximized the interface does not fill the window ("+filled.Size+" vs "+window.ClientSize+")");
   JS(window,"document.getElementById('miniToggle').click()");Pump(()=>(bool)Field(window,"miniMode"),"Mini command failed");Require(JS(window,"document.getElementById('miniAction').getBoundingClientRect().bottom<=innerHeight")=="true","Mini action is clipped");Capture(window,Path.Combine(report,"whole-window-mini.png"));JS(window,"document.getElementById('expand').click()");Pump(()=>!(bool)Field(window,"miniMode"),"Mini expand failed");Require(window.Size==normal,"Mini expand changed the saved normal window size");
   // 0.4.74 review: from a maximized window the mini window really becomes small (the restore guard must not keep the full size).
   Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"maximize\"}");Pump(()=>window.WindowState==FormWindowState.Maximized,"Maximize before mini failed");
   JS(window,"document.getElementById('miniToggle').click()");Pump(()=>(bool)Field(window,"miniMode"),"Mini from maximized failed");Application.DoEvents();
   Require(window.Width<normal.Width/2&&window.Height<normal.Height/2,"Mini from maximized kept a large window ("+window.Size+")");
   JS(window,"document.getElementById('expand').click()");Pump(()=>!(bool)Field(window,"miniMode"),"Mini expand after maximized failed");Application.DoEvents();
   if(window.WindowState==FormWindowState.Maximized){Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"maximize\"}");Pump(()=>window.WindowState==FormWindowState.Normal,"Restore after mini failed");}
   Require(window.Size==normal,"Mini from maximized changed the normal window size ("+window.Size+" vs "+normal+")");Application.DoEvents();Require(filled.Size==window.ClientSize,"After mini from maximized the interface does not fill the window ("+filled.Size+" vs "+window.ClientSize+")");
   Call(window,"PluginMessage","{\"command\":\"window\",\"action\":\"minimize\"}");Pump(()=>window.WindowState==FormWindowState.Minimized,"Minimize command failed");
   // 0.4.74: minimized, the interface keeps its size (it used to become 0×0 and restoring showed grey before it was redrawn).
   var shown=(Control)Field(window,"pluginView");Require(shown.Width>100&&shown.Height>100,"The interface was laid out at "+shown.Size+" while minimized");Size kept=shown.Size;
   window.WindowState=FormWindowState.Normal;Pump(()=>shown.Dock==DockStyle.Fill&&shown.Size==window.ClientSize,"The restored interface does not fill the window ("+shown.Size+" vs "+window.ClientSize+")");Require(shown.Size==kept,"Restoring resized the interface ("+kept+" to "+shown.Size+")");
   // 0.4.74: the taskbar's own minimize/restore (WM_SYSCOMMAND): during the restore the window is never larger than
   // before (it used to grow by the system frame and shrink back), a moved window comes back where it was, and the
   // mini window stays mini.
   Func<Size> restoreNative=()=>{int maxW=0,maxH=0;EventHandler grow=(o,a)=>{if(window.WindowState==FormWindowState.Normal){maxW=Math.Max(maxW,window.Width);maxH=Math.Max(maxH,window.Height);}};window.SizeChanged+=grow;
    SendMessage(window.Handle,0x112,(IntPtr)0xF020,IntPtr.Zero);Pump(()=>window.WindowState==FormWindowState.Minimized,"Native minimize failed");
    SendMessage(window.Handle,0x112,(IntPtr)0xF120,IntPtr.Zero);Pump(()=>window.WindowState==FormWindowState.Normal,"Native restore failed");Application.DoEvents();window.SizeChanged-=grow;return new Size(maxW,maxH);};
   Size before=window.Size;Size largest=restoreNative();Require(largest.Width<=before.Width&&largest.Height<=before.Height,"Restoring from the taskbar grew the window to "+largest+" (was "+before+")");Require(window.Size==before&&shown.Size==window.ClientSize,"Restoring from the taskbar changed the window ("+window.Size+", interface "+shown.Size+")");
   Point moved=new Point(window.Left+37,window.Top+23);window.Location=moved;Application.DoEvents();restoreNative();Require(window.Location==moved&&window.Size==before,"A moved window came back at "+window.Bounds+" instead of "+moved);
   JS(window,"document.getElementById('miniToggle').click()");Pump(()=>(bool)Field(window,"miniMode"),"Mini before taskbar restore failed");Size mini=window.Size;restoreNative();Require((bool)Field(window,"miniMode")&&window.Size==mini,"The mini window came back at "+window.Size+" instead of "+mini);
   JS(window,"document.getElementById('expand').click()");Pump(()=>!(bool)Field(window,"miniMode"),"Mini expand after taskbar restore failed");Application.DoEvents();Require(window.Size==before,"Leaving mini after a taskbar restore changed the window size ("+window.Size+" vs "+before+")");
   // 0.4.75: hidden in the tray, the interface (WebView2) is released and its processes end; opening the window builds
   // it again at the window's size, ready for the host's messages.
   Func<int> webviews=()=>{int n=0;using(var q=new System.Management.ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name='msedgewebview2.exe'"))foreach(System.Management.ManagementObject p in q.Get()){string c=(p["CommandLine"] as string)??"";if(c.IndexOf(report,StringComparison.OrdinalIgnoreCase)>=0)n++;}return n;};
   Func<double> privateMB=()=>{double bytes=0;using(var q=new System.Management.ManagementObjectSearcher("SELECT ProcessId,CommandLine,PrivatePageCount FROM Win32_Process WHERE Name='msedgewebview2.exe' OR ProcessId="+System.Diagnostics.Process.GetCurrentProcess().Id))foreach(System.Management.ManagementObject p in q.Get()){string c=(p["CommandLine"] as string)??"";if(Convert.ToInt32(p["ProcessId"])==System.Diagnostics.Process.GetCurrentProcess().Id||c.IndexOf(report,StringComparison.OrdinalIgnoreCase)>=0)bytes+=Convert.ToDouble(p["PrivatePageCount"]);}return Math.Round(bytes/1048576,1);};
   GC.Collect();Thread.Sleep(1500);double memoryWithInterface=privateMB();
   int webviewsBefore=webviews();Require(webviewsBefore>0,"no WebView2 process found for this window");
   Call(window,"ReleaseInterface");Require(Field(window,"pluginView")==null&&!(bool)Field(window,"pluginReady"),"the interface was not released");
   Pump(()=>webviews()==0,"WebView2 processes did not end after the interface was released ("+webviews()+" left of "+webviewsBefore+")",30);
   GC.Collect();GC.WaitForPendingFinalizers();Thread.Sleep(3000);double memoryReleased=privateMB();Util.Atomic(Path.Combine(report,"interface-memory.json"),new{withInterfaceMB=memoryWithInterface,releasedMB=memoryReleased});
   window.RestoreFromTray();Pump(()=>(bool)Field(window,"pluginReady")&&Field(window,"pluginView")!=null,"the interface did not come back when the window was opened",30);Application.DoEvents();
   var back=(Control)Field(window,"pluginView");Require(back.Dock==DockStyle.Fill&&back.Size==window.ClientSize,"the rebuilt interface does not fill the window ("+back.Size+" vs "+window.ClientSize+")");
   Require(JS(window,"document.readyState==='complete'&&!!document.querySelector('.desktop-app')")=="true","the rebuilt interface did not load its page");
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
