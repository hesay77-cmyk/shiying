// WinForms controls and real Manager, with native top-level windows kept hidden.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using ShiyingDesktop;
class QuietDesktopCheck {
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
    static readonly List<string> checks=new List<string>();
    static readonly BindingFlags Private=BindingFlags.NonPublic|BindingFlags.Instance;
    static object Field(object o,string name){return o.GetType().GetField(name,Private).GetValue(o);}
    static object Call(object o,string name,params object[] args){return o.GetType().GetMethod(name,Private).Invoke(o,args);}
    static void Check(bool condition,string text){if(!condition)throw new Exception(text);checks.Add(text);Console.WriteLine("PASS "+text);}
    static void HiddenLayout(Form form){
        // OS handle stays hidden. Logical visibility lets DataGridView paint its
        // rows in WM_PRINT; never call Show/ShowWindow or change window state.
        var handle=form.Handle;
        typeof(Control).GetMethod("SetState",Private).Invoke(form,new object[]{2,true});

        Handles(form);
        LayoutTree(form);
        Check(!IsWindowVisible(handle),"native test window remains hidden");
    }
    static void Handles(Control control){var handle=control.Handle;foreach(Control child in control.Controls)Handles(child);}
    static void LayoutTree(Control control){control.PerformLayout();foreach(Control child in control.Controls)LayoutTree(child);}
    static void Click(Button button){SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());typeof(Button).GetMethod("OnClick",Private).Invoke(button,new object[]{EventArgs.Empty});Application.DoEvents();}
    static void Wait(MainWindow window){var end=DateTime.UtcNow.AddSeconds(5);while((bool)Field(window,"batchBusy")&&DateTime.UtcNow<end){Application.DoEvents();Thread.Sleep(10);}Check(!(bool)Field(window,"batchBusy"),"background command settles");}
    static void Capture(Form window,string path){window.PerformLayout();Handles(window);using(var bitmap=new Bitmap(window.Width,window.Height)){window.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(path);}Check(!IsWindowVisible(window.Handle),"bitmap capture never displays a native window");}
    static void CaptureSurface(Form window,Control surface,string path){LayoutTree(window);Handles(window);using(var bitmap=new Bitmap(surface.Width,surface.Height)){surface.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(path);}Check(!IsWindowVisible(window.Handle),"client content render keeps the native window hidden");}
    static IEnumerable<Control> Descendants(Control root){foreach(Control child in root.Controls){yield return child;foreach(Control nested in Descendants(child))yield return nested;}}
    static void GridMouse(DataGridView grid,string method,DataGridViewRow row,int x,int y,MouseButtons button,int clicks){SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());typeof(DataGridView).GetMethod(method,Private,null,new[]{typeof(DataGridViewCellMouseEventArgs)},null).Invoke(grid,new object[]{new DataGridViewCellMouseEventArgs(0,row.Index,x,y,new MouseEventArgs(button,clicks,x,y,0))});Application.DoEvents();}
    static bool Own(Control control){return (bool)typeof(Control).GetMethod("GetState",Private).Invoke(control,new object[]{2});}
    static void Bounds(Control control){foreach(Control child in control.Controls){if(Own(child)){if(child.Left<0||child.Top<0||child.Right>control.ClientSize.Width+2||child.Bottom>control.ClientSize.Height+2)throw new Exception("Overflow "+child.GetType().Name+" "+child.Text+" "+child.Bounds+" in "+control.ClientSize);Bounds(child);}}}
    [STAThread] static int Main(string[] args){try{
        AppDomain.CurrentDomain.UnhandledException+=(sender,eventArgs)=>{try{var error=eventArgs.ExceptionObject as Exception;File.AppendAllText(Path.Combine(Path.GetFullPath(args[0]),"unhandled.txt"),(error==null?"unknown":error.GetType().FullName+"\n"+error.Message+"\n"+error.StackTrace)+"\n");}catch{}};
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
        using(var manager=new Manager(Path.Combine(root,"state"))){
            manager.Config.Folder=Path.Combine(root,"files");
            var file=manager.Add("https://files.example.test/model.safetensors?signature="+new string('a',900),"file","一个很长的模型文件名_"+new string('a',100)+".safetensors");
            file.Status="下载中";file.Progress=50;file.Speed="2.0 MiB/s";file.ETag="\"fixture-v1\"";file.Transfer=new TransferInfo{Total=16777216,Completed=8388608,Speed=2097152,Resume=true,Connections=8,PieceLength=1048576,Pieces=16,Bitfield="ff00"};
            var video=manager.Add("https://video.example.test/watch?v=fixture","video","未知大小的视频");video.Status="已暂停";
            Call(manager,"PublishSnapshot");
            using(var window=new MainWindow(manager,true)){
                HiddenLayout(window);SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
                string oldFolder=file.Folder,newFolder=Path.Combine(root,"自己选择的保存文件夹_"+new string('a',80));Directory.CreateDirectory(newFolder);Call(window,"SetDefaultFolder",newFolder);
                Check(manager.Config.Folder==newFolder&&((Label)Field(window,"defaultFolder")).Text==newFolder,"main window exposes and updates the default download folder");
                var savedSettings=Util.Json().Deserialize<Settings>(File.ReadAllText(Path.Combine(root,"state","settings.json")));Check(savedSettings.Folder==newFolder&&file.Folder==oldFolder,"folder choice persists while existing task paths remain unchanged");
                var probe=manager.Add("https://files.example.test/folder-probe.bin","file",autoCategorize:false);Check(probe.Folder==newFolder&&Util.OutputFolder(probe)==newFolder,"new tasks use the selected folder");manager.Pause(probe.Id);manager.Forget(probe.Id);
                typeof(MainWindow).GetField("inspectDialog",Private).SetValue(window,new Action<Form>(form=>{Check(form.Controls.OfType<TextBox>().Any(box=>box.AccessibleName=="本次下载保存文件夹"&&box.Text==newFolder)&&form.Controls.OfType<Button>().Any(button=>button.Text=="选文件夹"),"single-download confirmation has an explicit folder picker");Bounds(form);}));window.NewDownload(null);typeof(MainWindow).GetField("inspectDialog",Private).SetValue(window,null);
                typeof(MainWindow).GetField("inspectDialog",Private).SetValue(window,new Action<Form>(form=>{Check(form.Controls.OfType<TextBox>().Any(box=>box.AccessibleName=="本次批量下载保存文件夹"&&box.Text==newFolder)&&form.Controls.OfType<Button>().Any(button=>button.Text=="选文件夹"),"batch confirmation has an explicit folder picker");Bounds(form);}));Call(window,"BatchDialog");typeof(MainWindow).GetField("inspectDialog",Private).SetValue(window,null);
                var grid=(DataGridView)Field(window,"grid");grid.ClearSelection();var row=grid.Rows.Cast<DataGridViewRow>().First(r=>((Download)r.Tag).Id==file.Id);grid.CurrentCell=row.Cells[0];row.Selected=true;Call(window,"RefreshJobs");
                Check(grid.Columns.Cast<DataGridViewColumn>().Count(c=>c.Visible)==1&&!Own((Control)Field(window,"selectionTools")),"single task is a compact card without a persistent batch toolbar");
                Check(!Own((Control)Field(window,"details")),"selecting a task does not expand details");
                GridMouse(grid,"OnCellMouseDoubleClick",row,90,25,MouseButtons.Left,2);Check(Own((Control)Field(window,"details")),"double-clicking the task title expands inline without another window");
                var values=(Label[])Field(window,"inlineValues");Check(values[0].Text==TransferData.Bytes(16777216)&&values[1].Text==TransferData.Bytes(8388608)&&values[2].Text==TransferData.Bytes(2097152)+"/s","inline values use the actual transfer snapshot");
                Check(values[3].Text.Contains("4 秒")&&values[4].Text.Contains("支持")&&values[5].Text=="8 个","remaining time, resume and connection data remain accurate");
                Check(((SegmentMap)Field(window,"inlineMap")).Segments.Length==16,"inline map uses real piece ranges");
                Bounds(window);Capture(window,Path.Combine(root,"desktop-details.png"));
                var locations=(Control)Field(window,"detailLocations");Check(!Own(locations),"long source and destination are collapsed by default");var locationButton=Descendants(window).OfType<Button>().Single(button=>button.AccessibleName=="展开下载地址和保存路径");Click(locationButton);Check(Own(locations)&&((TextBox)Field(window,"address")).Text==file.Url,"address disclosure retains the exact signed URL");Bounds(window);Capture(window,Path.Combine(root,"desktop-addresses.png"));Click(locationButton);Check(!Own(locations),"address disclosure collapses again");
                string detailId=(string)Field(window,"expandedId");var before=window.Bounds;
                Call(window,"SetMini",true);window.PerformLayout();Check((bool)Field(window,"miniMode")&&!Own((Control)Field(window,"mainSurface"))&&Own((Control)Field(window,"miniSurface")),"mini mode replaces the main surface");
                Check(!window.TopMost&&window.ClientSize.Width<=340,"mini window is compact and never always on top by default");Bounds(window);Capture(window,Path.Combine(root,"desktop-mini.png"));
                file.Status="排队中";file.Speed="";Call(manager,"PublishSnapshot");Call(window,"RefreshJobs");
                Click((Button)Field(window,"miniAction"));Wait(window);Check(manager.Snapshot().First(j=>j.Id==file.Id).Status=="已暂停","mini pause updates the actual Manager");
                Click((Button)Field(window,"miniAction"));Wait(window);Check(manager.Snapshot().First(j=>j.Id==file.Id).Status=="排队中","mini continue queues the same task without losing data");
                Call(window,"HideToTray");Check((bool)Field(window,"hiddenToTray"),"hide retains the mini window state");window.RestoreFromTray();Check(!(bool)Field(window,"hiddenToTray")&&(bool)Field(window,"miniMode"),"restore preserves mini mode");
                Call(window,"SetMini",false);Check(window.Bounds==before&&(string)Field(window,"expandedId")==detailId&&Own((Control)Field(window,"details")),"expanding mini restores window size, task selection and inline detail state");
                Call(window,"OpenDetails",file.Id);Check(!Own((Control)Field(window,"details")),"double-click/Enter detail action toggles closed");
                // Unknown size stays unknown after changing the selected task.
                Call(window,"OpenDetails",file.Id);grid.ClearSelection();row=grid.Rows.Cast<DataGridViewRow>().First(r=>((Download)r.Tag).Id==video.Id);grid.CurrentCell=row.Cells[0];row.Selected=true;Call(window,"UpdateDetails");Check(!Own((Control)Field(window,"details")),"selecting another task keeps its details closed until requested");Call(window,"OpenDetails",video.Id);Check(values[0].Text=="未知"&&values[1].Text=="未知"&&values[2].Text=="—","unknown transfer data is not replaced by estimates");
                Check(!IsWindowVisible(window.Handle),"all desktop interactions kept the OS window hidden");
                Call(window,"OpenDetails",video.Id);Call(window,"SelectTask",file.Id);file.Status="排队中";Call(manager,"PublishSnapshot");Call(window,"RefreshJobs");row=grid.Rows.Cast<DataGridViewRow>().First(r=>((Download)r.Tag).Id==file.Id);
                GridMouse(grid,"OnCellMouseClick",row,grid.Columns[0].Width-90,28,MouseButtons.Left,1);Wait(window);Check(manager.Snapshot().First(j=>j.Id==file.Id).Status=="已暂停","card pause target invokes the actual Manager");
                GridMouse(grid,"OnCellMouseClick",row,grid.Columns[0].Width-90,28,MouseButtons.Left,1);Wait(window);Check(manager.Snapshot().First(j=>j.Id==file.Id).Status=="排队中","card continue resumes the same queued task");
                var other=grid.Rows.Cast<DataGridViewRow>().First(r=>((Download)r.Tag).Id==video.Id);GridMouse(grid,"OnCellMouseDown",other,90,25,MouseButtons.Right,1);Call(window,"BuildTaskMenu");Check(((Download)Call(window,"Selection")).Id==video.Id&&((ContextMenuStrip)Field(window,"taskMenu")).Items.Cast<ToolStripItem>().Any(item=>item.Text=="打开文件夹"),"right-click targets the pointed task and exposes folder and detail actions");
                grid.Rows.Cast<DataGridViewRow>().ToList().ForEach(item=>item.Selected=true);Call(window,"UpdateButtons");Check(Own((Control)Field(window,"selectionTools")),"batch toolbar appears only after multiple tasks are selected");
                window.Hide();
            }
            using(var fullDetails=new DownloadDetailsWindow(manager,file.Id)){HiddenLayout(fullDetails);Bounds(fullDetails);Capture(fullDetails,Path.Combine(root,"desktop-full-details.png"));Check(((Label[])Field(fullDetails,"values"))[0].Text==TransferData.Bytes(file.Transfer.Total),"full detail window keeps the same transfer data and common visual controls");Check(!Own((Control)Field(fullDetails,"empty"))&&((DataGridView)Field(fullDetails,"grid")).Rows.Count==16,"detail list shows received segments immediately without an empty-state flash");fullDetails.Hide();}
            foreach(float factor in new[]{1.25f,1.5f,1.75f})using(var scaled=new MainWindow(manager,true)){
                scaled.Scale(new SizeF(factor,factor));HiddenLayout(scaled);Bounds(scaled);var scaledGrid=(DataGridView)Field(scaled,"grid");Check(scaledGrid.Rows.Cast<DataGridViewRow>().All(row=>row.Height>=(int)Call(scaled,"Ui",104)-1),"DPI scaling reserves the entire card including status and progress");Capture(scaled,Path.Combine(root,"desktop-scaled-"+factor+".png"));var sized=scaled.Bounds;Call(scaled,"SetMini",true);Bounds(scaled);Capture(scaled,Path.Combine(root,"mini-scaled-"+factor+".png"));Call(scaled,"SetMini",false);Check(scaled.Bounds==sized,"scaled mini roundtrip restores full bounds");scaled.Hide();
            }
            var bt=manager.Add("magnet:?xt=urn:btih:0123456789012345678901234567890123456789","magnet");bt.HasMetadata=true;bt.Status="等待选文件";bt.BtFiles=new[]{new TorrentFileInfo{Index=1,Path="first.bin",Length=100},new TorrentFileInfo{Index=2,Path="second.bin",Length=200}};Call(manager,"PublishSnapshot");
            using(var picker=new TorrentSelectionWindow(manager,bt.Id)){HiddenLayout(picker);var list=(DataGridView)Field(picker,"files");Check(list.Rows.Count==2&&list.Rows.Cast<DataGridViewRow>().All(r=>!Convert.ToBoolean(r.Cells[0].Value)),"BT chooser still defaults to no files selected");picker.Hide();}
        }
        using(var demo=new Manager(Path.Combine(root,"visual-fixtures"))){
            demo.Config.Folder=@"D:\Downloads";
            var done=demo.Add("https://example.test/audio","audio","午后电台 · 第 12 期.mp3");done.Status="已完成";done.Progress=100;done.Transfer=new TransferInfo{Total=31*1024*1024,Completed=31*1024*1024};
            var video=demo.Add("https://www.youtube.com/watch?v=fixture","video","一场沿着海岸线的旅行 · 1080p.mp4");video.Status="已暂停";video.Progress=26;video.Transfer=new TransferInfo{Total=320*1024*1024,Completed=83*1024*1024};
            var model=demo.Add("https://huggingface.co/fixture/model.gguf","file","Qwen3-VL-32B-NVFP4.safetensors");model.Status="下载中";model.Progress=74.77;model.Speed="81.89 MiB/s";model.ETag="\"visual-fixture\"";model.Transfer=new TransferInfo{Total=15683005956,Completed=11726307553,Speed=85867888,Resume=true,Connections=8,PieceLength=980187873,Pieces=16,Bitfield="ffe0"};Call(demo,"PublishSnapshot");
            using(var window=new MainWindow(demo,true)){
                HiddenLayout(window);Call(window,"SelectTask",model.Id);Call(window,"RefreshJobs");Bounds(window);CaptureSurface(window,(Control)Field(window,"mainSurface"),Path.Combine(root,"ui-main.png"));var visualGrid=(DataGridView)Field(window,"grid");File.WriteAllText(Path.Combine(root,"layout.json"),Util.Json().Serialize(new{grid=visualGrid.Bounds.ToString(),row=visualGrid.GetCellDisplayRectangle(0,0,false).ToString(),rowHeight=visualGrid.Rows[0].Height,batch=Own((Control)Field(window,"selectionTools"))}));
                Call(window,"OpenDetails",model.Id);Bounds(window);CaptureSurface(window,(Control)Field(window,"mainSurface"),Path.Combine(root,"ui-details.png"));
                Call(window,"SetMini",true);Bounds(window);CaptureSurface(window,(Control)Field(window,"miniSurface"),Path.Combine(root,"ui-mini.png"));window.Hide();
            }
        }
        using(var setup=new SetupWindow(Path.Combine(root,"not-installed"),true)){HiddenLayout(setup);Bounds(setup);Capture(setup,Path.Combine(root,"desktop-setup.png"));setup.Hide();}
        File.WriteAllText(Path.Combine(root,"summary.json"),Util.Json().Serialize(new{ok=true,checks,method="Real Manager and exact WinForms controls; native top-level handles remain hidden throughout; no Show, media transfer, component fetch, registry changes or personal UI control",published=false}),System.Text.Encoding.UTF8);Console.WriteLine("QUIET DESKTOP CHECKS PASSED "+root);return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex.GetType().FullName+": "+ex.Message);Console.Error.WriteLine(ex.StackTrace);return 1;}}
}
