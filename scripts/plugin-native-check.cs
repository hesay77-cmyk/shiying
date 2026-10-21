// The real embedded WebView and Manager, with the native top-level handle hidden.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using ShiyingDesktop;
class PluginNativeCheck {
    const BindingFlags Private=BindingFlags.NonPublic|BindingFlags.Instance;
    [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll",EntryPoint="GetWindowLongW")]static extern int GetWindowStyle(IntPtr handle,int index);
    [DllImport("shcore.dll")]static extern int GetProcessDpiAwareness(IntPtr process,out int awareness);
    [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr window,int message,IntPtr wparam,IntPtr lparam);
    static readonly List<string> checks=new List<string>();
    static object Field(object target,string name){return target.GetType().GetField(name,Private).GetValue(target);}
    static object Call(object target,string name,params object[] args){return target.GetType().GetMethod(name,Private).Invoke(target,args);}
    static void Check(bool value,string text){if(!value)throw new Exception(text);checks.Add(text);Console.WriteLine("PASS "+text);}
    static void ResizeEdges(MainWindow window,string mode){
        int w=window.ClientSize.Width,h=window.ClientSize.Height;
        var points=new[]{new Point(2,h/2),new Point(w-3,h/2),new Point(w/2,2),new Point(w/2,h-3),new Point(2,2),new Point(w-3,2),new Point(2,h-3),new Point(w-3,h-3)};
        int[] expected={10,11,12,15,13,14,16,17};string[] names={"left","right","top","bottom","top-left","top-right","bottom-left","bottom-right"};
        for(int i=0;i<points.Length;i++){
            Point client=points[i],screen=window.PointToScreen(client);bool covered=window.Controls.Cast<Control>().Any(control=>control.Visible&&control.Bounds.Contains(client));
            long packed=((long)(screen.Y&0xffff)<<16)|(uint)(screen.X&0xffff);int hit=SendMessage(window.Handle,0x84,IntPtr.Zero,new IntPtr(packed)).ToInt32();
            Check(covered&&hit==expected[i],mode+" "+names[i]+" resize hit is preserved beneath edge-to-edge content (hit="+hit+")");
            Call(window,"PluginMessage","{\"command\":\"resize\",\"hit\":"+expected[i]+"}");Check((int)Field(window,"lastNativeResizeHit")==expected[i],mode+" "+names[i]+" shared edge command reaches the native resize handler without starting input in review mode");
        }
        Point center=new Point(w/2,h/2);Check(window.Controls.Cast<Control>().Any(control=>control.Visible&&control.Bounds.Contains(center)),mode+" content center remains available to the interface");
        Check(window.Padding==Padding.Empty&&((Control)Field(window,"pluginView")).Bounds==window.ClientRectangle,mode+" content fills the entire client area with no reserved border strip");
        int previous=(int)Field(window,"lastNativeResizeHit");Call(window,"PluginMessage","{\"command\":\"resize\",\"hit\":2}");Check((int)Field(window,"lastNativeResizeHit")==previous,"invalid native resize targets are ignored");
    }
    static void Pump(Func<bool> done,string stage,int seconds=30){var until=DateTime.UtcNow.AddSeconds(seconds);while(!done()&&DateTime.UtcNow<until){Application.DoEvents();Thread.Sleep(10);}Check(done(),stage);}
    static void Await(Task task,string stage){Pump(()=>task.IsCompleted,stage);task.GetAwaiter().GetResult();}
    static string JS(MainWindow window,string script){var view=Field(window,"pluginView");var task=(Task<string>)view.GetType().GetMethod("Evaluate").Invoke(view,new object[]{script});Await(task,"embedded script completes");return task.Result;}
    static void Drop(MainWindow window,object data){var point=Util.Json().Deserialize<int[]>(JS(window,"[Math.min(innerWidth-15,150),Math.max(15,innerHeight-44)]"));var view=Field(window,"pluginView");var browser=Field(view,"browser");var core=browser.GetType().GetProperty("CoreWebView2").GetValue(browser,null);foreach(string kind in new[]{"dragEnter","dragOver","drop"}){var task=(Task<string>)core.GetType().GetMethod("CallDevToolsProtocolMethodAsync").Invoke(core,new object[]{"Input.dispatchDragEvent",Util.Json().Serialize(new{type=kind,x=point[0],y=point[1],data})});Await(task,"trusted drag event reaches the hidden WebView");}}
    static void DropChecks(MainWindow window,Manager manager,string report){
        int count=manager.Snapshot().Count;string url="https://files.example.test/archive.zip?signature=a%2Bb&token=original";
        Drop(window,new{items=new[]{new{mimeType="text/uri-list",data=url}},dragOperationsMask=1});Pump(()=>JS(window,"document.getElementById('editor').open")=="true","dropping a real URI opens download confirmation");Check(JS(window,"document.getElementById('editorURL').value==="+Util.Json().Serialize(url))=="true","dropped signed URL is preserved exactly");Check(manager.Snapshot().Count==count,"dropped link does not start a download before confirmation");JS(window,"document.querySelector('#editor [data-close]').click()");Pump(()=>String.IsNullOrEmpty((string)Field(window,"editorToken")),"drop confirmation can be cancelled");
        string torrent=Torrent(report);Drop(window,new{items=new object[0],files=new[]{torrent},dragOperationsMask=1});Pump(()=>JS(window,"document.getElementById('editor').open&&document.getElementById('editorKind').value==='torrent'")=="true","local .torrent drop passes a real DOM File through WebView AdditionalObjects");Check(JS(window,"document.getElementById('editorURL').value==="+Util.Json().Serialize(torrent))=="true","native torrent path comes from the actual dropped file");Check(manager.Snapshot().Count==count,"torrent drop does not queue or select every file automatically");JS(window,"document.querySelector('#editor [data-close]').click()");Pump(()=>String.IsNullOrEmpty((string)Field(window,"editorToken")),"torrent drop confirmation can be cancelled");
        string magnet="magnet:?xt=urn:btih:"+new string('a',40);Call(window,"SetMini",true);Drop(window,new{items=new[]{new{mimeType="text/plain",data=magnet}},dragOperationsMask=1});Pump(()=>JS(window,"document.getElementById('editor').open&&document.getElementById('editorKind').value==='magnet'")=="true","magnet dropped into mini window opens full confirmation");Check(!(bool)Field(window,"miniMode"),"mini expands only after a valid drop");JS(window,"document.querySelector('#editor [data-close]').click()");Pump(()=>String.IsNullOrEmpty((string)Field(window,"editorToken")),"magnet drop can be cancelled");
    }
    static string Torrent(string root){
        byte[] pieces;using(var sha=System.Security.Cryptography.SHA1.Create())pieces=sha.ComputeHash(new byte[2048]);
        Func<string,byte[]> text=System.Text.Encoding.UTF8.GetBytes;
        var info=new Dictionary<string,object>{{"name",text("local-files")},{"piece length",16384L},{"pieces",pieces},{"files",new List<object>{new Dictionary<string,object>{{"length",1024L},{"path",new List<object>{text("first.bin")}}},new Dictionary<string,object>{{"length",1024L},{"path",new List<object>{text("second.bin")}}}}}};
        string path=Path.Combine(root,"local-fixture.torrent");using(var stream=File.Create(path))typeof(TorrentInfo).GetMethod("Encode",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{stream,new Dictionary<string,object>{{"info",info}}});return path;
    }
    static void WindowMemory(string report){
        string folder=Path.Combine(report,"window-memory"),file=Path.Combine(folder,"window.json");Size chosen=new Size(1030,690);
        using(var manager=new Manager(folder)){
            using(var window=new MainWindow(manager,true)){window.PreparePluginLayout();IntPtr handle=window.Handle;window.ClientSize=chosen;window.Close();Check(!IsWindowVisible(handle)&&File.Exists(file),"closing the hidden window saves its size without showing it");}
            var saved=Util.Json().Deserialize<WindowLayout>(File.ReadAllText(file));Check(saved.Width==chosen.Width&&saved.Height==chosen.Height&&!saved.Mini,"normal window dimensions are written to its own settings file");
            using(var window=new MainWindow(manager,true)){window.PreparePluginLayout();Check(window.ClientSize==chosen,"reopening restores the previously adjusted normal window size");IntPtr handle=window.Handle;Call(window,"RestoreWindowMode");Call(window,"SetMini",true);window.Close();Check(!IsWindowVisible(handle),"closing mini mode never shows a test window");}
            saved=Util.Json().Deserialize<WindowLayout>(File.ReadAllText(file));Check(saved.Mini&&saved.Width==chosen.Width&&saved.Height==chosen.Height,"closing mini mode preserves the full window dimensions");
            using(var window=new MainWindow(manager,true)){window.PreparePluginLayout();IntPtr handle=window.Handle;Call(window,"RestoreWindowMode");Check((bool)Field(window,"miniMode"),"reopening restores saved mini mode");Call(window,"SetMini",false);Check(window.ClientSize==chosen,"expanding a reopened mini window restores its saved normal size");Check(!IsWindowVisible(handle),"window memory checks kept every native window hidden");}
        }
    }
    [STAThread]static int Main(string[] args){try{
        string report=Path.GetFullPath(args[0]),library=Path.GetFullPath(args[1]);Directory.CreateDirectory(report);Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        using(var emptyManager=new Manager(Path.Combine(report,"startup-state")))using(var startup=new MainWindow(emptyManager)){
            ((System.Windows.Forms.Timer)Field(startup,"timer")).Stop();bool oldSurface=(bool)typeof(Control).GetMethod("GetState",Private).Invoke(Field(startup,"mainSurface"),new object[]{2});Check(startup.ClientSize.Width>=920&&startup.MaximizeBox&&!oldSurface,"production startup prepares the large resizable window before any old controls");Check(!IsWindowVisible(startup.Handle),"production constructor never shows a window by itself");
        }
        using(var manager=new Manager(Path.Combine(report,"state"))){
            manager.Config.Folder=Path.Combine(report,"files");var file=manager.Add("https://files.example.test/archive.zip?signature=a%2Fb%3D&token=A+B","file","归档文件.zip");
            using(var window=new MainWindow(manager,true)){
                window.PreparePluginLayout();var handle=window.Handle;typeof(Control).GetMethod("SetState",Private).Invoke(window,new object[]{2,true});window.PerformLayout();
                Await(window.InitializePlugin(Path.Combine(report,"webview-cache"),library),"actual embedded WebView initializes while the window is hidden");
                Pump(()=>(bool)Field(window,"pluginReady"),"shared plugin document sends its ready message");
                Check(window.Handle==handle&&!IsWindowVisible(window.Handle),"native window remains hidden without recreating its handle");
                Check(window.Text=="Ruxget","title bar contains only the app name without preview/version text");
                Check((GetWindowStyle(window.Handle,-16)&0x00c00000)==0,"integrated window has no second native caption");ResizeEdges(window,"normal");
                Check(window.ClientSize.Width>=920&&window.MaximizeBox&&JS(window,"document.querySelector('.brand h1').textContent")=="\"Ruxget\"","desktop opens the full-size shared plugin interface");
                Check((GetWindowStyle(window.Handle,-16)&0x10000)!=0&&window.FormBorderStyle==FormBorderStyle.Sizable,"native maximize button and resizable border are enabled");int awareness;Check(GetProcessDpiAwareness(IntPtr.Zero,out awareness)==0&&awareness==1,"test process uses the production system-DPI manifest");
                Check(JS(window,"getComputedStyle(document.body).backgroundColor==='rgba(10, 19, 30, 0.56)'&&getComputedStyle(document.body).color==='rgb(255, 255, 255)'")=="true","actual embedded WebView uses frosted dark surfaces and clear white text");
                Check(JS(window,"document.querySelectorAll('.brand img').length===1")=="true","content toolbar preserves one compact app icon");
                Check(JS(window,"innerWidth>=320&&document.documentElement.scrollWidth<=innerWidth")=="true","actual embedded viewport fits the desktop at the current Windows scale");
                var view=Field(window,"pluginView");if(Environment.OSVersion.Version.Build>=22621)Check(window.GlassBackdropEnabled,"Windows accepts the system acrylic backdrop without replacing the resizable frame");var capture=(Task)view.GetType().GetMethod("CapturePreview").Invoke(view,new object[]{Path.Combine(report,"actual-webview.png")});Pump(()=>capture.IsCompleted,"actual hidden WebView renders a local preview capture");capture.GetAwaiter().GetResult();string document=(string)view.GetType().GetMethod("Document").Invoke(null,null);File.WriteAllText(Path.Combine(report,"interface.html"),document,System.Text.Encoding.UTF8);
                Util.Atomic(Path.Combine(report,"initial-state.json"),Call(window,"PluginSnapshot"));
                string row="document.querySelector('[data-id=\""+file.Id+"\"]')";
                JS(window,row+".querySelector('.download-button').click()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().First(j=>j.Id==file.Id).Status=="已暂停","HTML pause action updates the actual Manager");
                JS(window,row+".querySelector('.download-button').click()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().First(j=>j.Id==file.Id).Status=="排队中","HTML continue preserves the original task and signed URL");
                Check(manager.Snapshot().First().Url==file.Url,"signed URL remains byte-for-byte intact");
                JS(window,"document.getElementById('linkURL').value='https://files.example.test/new.bin';document.getElementById('addLink').requestSubmit()");Pump(()=>JS(window,"document.getElementById('editor').open")=="true","adding a link opens the shared confirmation sheet");Check(manager.Snapshot().Count==1,"confirmation does not start or add a task prematurely");
                JS(window,"document.getElementById('editorForm').requestSubmit()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().Count==2,"HTML confirmation adds the chosen file through Manager");
                var browserInput=new Dictionary<string,object>{{"url","https://www.youtube.com/watch?v=fixture"},{"kind","tracks"},{"title","来自浏览器的 720p 视频"},{"height",720},{"videoUrl","https://r1.googlevideo.com/video?signature=a%2Fb%3D"},{"audioUrl","https://r1.googlevideo.com/audio?signature=c%2Fd%3D"},{"referer","https://www.youtube.com/"}};
                window.NewDownload(browserInput);Pump(()=>JS(window,"document.getElementById('editor').open")=="true","browser handoff opens the same HTML confirmation sheet");Check(JS(window,"document.getElementById('editorHeight').value==='720'&&document.getElementById('editorHeight').disabled&&document.getElementById('editorURL').readOnly")=="true","browser-selected quality and signed source are locked in the shared UI");
                JS(window,"document.getElementById('editorHeight').value='1080';document.getElementById('editorForm').requestSubmit()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().Count==3,"browser confirmation creates a queued fixture without running a video engine");var track=manager.Snapshot().Single(job=>job.Kind=="tracks");Check(track.Height==720&&track.VideoUrl==(string)browserInput["videoUrl"]&&track.AudioUrl==(string)browserInput["audioUrl"],"host preserves the original browser quality and signed tracks even if form data is changed");
                var bt=manager.ImportTorrent(Torrent(report));Call(window,"RefreshJobs");Call(window,"PluginMessage",Util.Json().Serialize(new{command="choose",id=bt.Id}));Pump(()=>JS(window,"document.getElementById('btChooser').open")=="true","BT file chooser opens in the same shared interface");Check(JS(window,"document.querySelectorAll('#btFiles input:checked').length===0&&document.getElementById('btStart').disabled")=="true","BT still defaults to no files selected");
                JS(window,"document.querySelectorAll('#btFiles input')[1].click();document.getElementById('btForm').requestSubmit()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().Single(job=>job.Id==bt.Id).Status=="排队中","HTML file selection reaches the real BT Manager");Check(manager.Snapshot().Single(job=>job.Id==bt.Id).BtSelected.SequenceEqual(new[]{2}),"only the checked torrent file is queued, not the entire torrent");
                JS(window,"document.querySelector('[data-command=settings]').click();document.querySelector('#settings input[name=Connections]').value='12';document.getElementById('settingsForm').requestSubmit()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Config.Connections==12,"shared settings controls save through the existing Manager");Check(Util.Json().Deserialize<Settings>(File.ReadAllText(Path.Combine(report,"state","settings.json"))).Connections==12,"settings persist to the test directory");
                var failed=manager.Add("https://files.example.test/failed.bin","file","失败任务删除检查");string partial=Path.Combine(manager.Work(failed),"keep.partial"),finished=Path.Combine(report,"keep.finished");Directory.CreateDirectory(Path.GetDirectoryName(partial));File.WriteAllText(partial,"partial-kept");File.WriteAllText(finished,"finished-kept");failed.Status="失败";failed.File=finished;typeof(Manager).GetMethod("Save",Private).Invoke(manager,null);Call(window,"RefreshJobs");
                string remove="document.querySelector('[data-delete-task=\""+failed.Id+"\"]')";Check(JS(window,"Boolean("+remove+")")=="true","failed task exposes a direct delete button beside continue");JS(window,remove+".click()");Check(JS(window,"document.getElementById('deleteDialog').open&&document.getElementById('deleteFiles').checked")=="true","deletion asks for confirmation and defaults to deleting files");Check(manager.Snapshot().Any(job=>job.Id==failed.Id),"opening delete confirmation changes no task or file");JS(window,"document.getElementById('deleteFiles').click();document.getElementById('deleteForm').requestSubmit()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().All(job=>job.Id!=failed.Id),"delete button removes the selected failed task through the real Manager");Check(File.ReadAllText(partial)=="partial-kept"&&File.ReadAllText(finished)=="finished-kept","deleting a task preserves completed and partial files");Check(manager.Snapshot().Any(job=>job.Id==file.Id),"deleting a failed task leaves unrelated tasks intact");
                var deleting=manager.Add("https://files.example.test/delete.bin","file","删除文件检查",1080,Path.Combine(report,"outputs"));Directory.CreateDirectory(deleting.Folder);deleting.File=Path.Combine(deleting.Folder,"delete.bin");string deletingPartial=Path.Combine(manager.Work(deleting),"delete.part");Directory.CreateDirectory(manager.Work(deleting));File.WriteAllText(deletingPartial,"partial");File.WriteAllText(deleting.File,"finished");deleting.Status="失败";typeof(Manager).GetMethod("Save",Private).Invoke(manager,null);Call(window,"RefreshJobs");
                JS(window,"document.querySelector('[data-delete-task=\""+deleting.Id+"\"]').click();document.getElementById('deleteForm').requestSubmit()");Pump(()=>!(bool)Field(window,"pluginBusy")&&manager.Snapshot().All(job=>job.Id!=deleting.Id),"default delete removes fixture task through the actual host");Check(!File.Exists(deletingPartial)&&!File.Exists(deleting.File),"default confirmed deletion removes final and unfinished fixture files");

                JS(window,"document.querySelector('[data-command=about]').click()");Check(JS(window,"document.getElementById('info').open&&document.getElementById('infoContent').textContent.includes('"+Util.Version+"')")=="true","version is available inside About instead of the title bar");JS(window,"document.querySelector('#info [data-close]').click()");
                window.ClientSize=new Size(1080,720);window.PerformLayout();Size fullClient=window.ClientSize;Rectangle fullBounds=window.Bounds;Check(JS(window,"document.documentElement.scrollWidth<=innerWidth")=="true","large window resize keeps content inside the viewport");
                JS(window,"document.getElementById('miniToggle').click()");Pump(()=>(bool)Field(window,"miniMode"),"same HTML interface switches to mini mode");Check(!window.TopMost&&window.ClientSize.Width<=340*Double.Parse(JS(window,"devicePixelRatio"),System.Globalization.CultureInfo.InvariantCulture),"mini remains compact and not always on top");
                ResizeEdges(window,"mini");Console.WriteLine("MINI SIZE "+window.ClientSize+" PADDING "+window.Padding+" VIEW "+JS(window,"JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,dpr:devicePixelRatio})"));Check(JS(window,"document.documentElement.scrollWidth<=innerWidth")=="true","mini content fits inside its resize frame");
                Call(window,"HideToTray");window.RestoreFromTray();Check((bool)Field(window,"miniMode")&&!(bool)Field(window,"hiddenToTray"),"background hide and restore preserve the mini mode");
                JS(window,"document.getElementById('expand').click()");Pump(()=>!(bool)Field(window,"miniMode"),"expand restores the full plugin interface");Check(window.ClientSize==fullClient&&window.Bounds==fullBounds,"leaving mini restores the full window size and position (before="+fullClient+"/"+fullBounds+", after="+window.ClientSize+"/"+window.Bounds+")");
                ResizeEdges(window,"restored");
                DropChecks(window,manager,report);
                JS(window,"document.querySelector('[data-command=batch]').click()");typeof(MainWindow).GetField("batchFolder",Private).SetValue(window,Path.Combine(report,"cancelled-folder"));Call(window,"PluginSend",new{type="folder",target="batch",path=Path.Combine(report,"cancelled-folder")});
                JS(window,"document.querySelector('#batchEditor [data-close]').click()");Pump(()=>String.IsNullOrEmpty((string)Field(window,"batchFolder")),"cancelling a batch clears its temporary destination");
                JS(window,"document.querySelector('[data-command=batch]').click()");Check(JS(window,"document.getElementById('batchFolder').textContent==="+Util.Json().Serialize(manager.Config.Folder))=="true","reopened batch shows the actual default destination");JS(window,"document.querySelector('#batchEditor [data-close]').click()");
                Check(window.Handle==handle&&!IsWindowVisible(window.Handle),"all HTML actions kept the same native handle hidden");window.Hide();
            }
        }
        WindowMemory(report);
        Util.Atomic(Path.Combine(report,"summary.json"),new{ok=true,checks,method="Actual WebView2 and real Manager; top-level native window hidden; no Show, personal browser control, engine Tick or media downloads",published=false});return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
