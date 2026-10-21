// Standalone regression: no network, no engine starts, no registry changes.
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using ShiyingDesktop;
class ManagementCheck {
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static object Field(object obj,string name){return obj.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(obj);}
    static void Click(Button button){SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());typeof(Button).GetMethod("OnClick",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(button,new object[]{EventArgs.Empty});Application.DoEvents();}
    static void Wait(Func<bool> condition,string stage){var end=DateTime.UtcNow.AddSeconds(5);while(!condition()&&DateTime.UtcNow<end){Application.DoEvents();Thread.Sleep(10);}Check(condition(),"UI operation did not settle: "+stage);Console.WriteLine(stage+" passed");}
    [STAThread] static int Main(string[] args){try{
        string root=Path.GetFullPath(args[0]),state=Path.Combine(root,"state"),folder=Path.Combine(root,"files");Directory.CreateDirectory(root);
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        string signed="https://files.example.test/archive.zip?signature=a%2Fb%3D&token=A+B";
        using(var manager=new Manager(state)){
            manager.Config.Folder=folder;
            Check(manager.AddMany(signed+"\r\nhttps://files.example.test/model.gguf\n"+signed,"file",folder)==2,"batch deduplication");
            Check(manager.Snapshot()[0].Url==signed,"signed URL changed");
            foreach(string invalid in new[]{"https://files.example.test/ok\njavascript:bad",String.Join("\n",Enumerable.Repeat(signed,101))}){bool refused=false;try{manager.AddMany(invalid,"file",folder);}catch{refused=true;}Check(refused&&manager.Snapshot().Count==2,"invalid batch partially added");}
            Check(Util.Category("file","WEIGHTS.SAFETENSORS")=="模型"&&Util.Category("audio","x")=="音乐"&&Util.Category("tracks","x")=="视频","classification");
            var job=manager.Snapshot()[0];Check(Util.OutputFolder(job)==Path.Combine(folder,"压缩包"),"categorized destination");job.AutoCategorize=false;Check(Util.OutputFolder(job)==folder,"exact destination opt out");
            string original=Path.Combine(root,"one.tmp"),second=Path.Combine(root,"two.tmp");File.WriteAllText(original,"first");File.WriteAllText(second,"second");
            string placed=Util.PlaceFile(original,Path.Combine(folder,"压缩包"),"archive.zip"),deduped=Util.PlaceFile(second,Path.Combine(folder,"压缩包"),"archive.zip");Check(placed!=deduped&&File.ReadAllText(placed)=="first","overwrite protection");
            string partial=Path.Combine(manager.Work(manager.Snapshot()[0]),"keep.partial");Directory.CreateDirectory(Path.GetDirectoryName(partial));File.WriteAllText(partial,"unfinished data");
            using(var window=new MainWindow(manager,true)){
                var hiddenHandle=window.Handle;window.PerformLayout();SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());var grid=(DataGridView)Field(window,"grid");foreach(DataGridViewRow row in grid.Rows)row.Selected=true;
                manager.Add("https://files.example.test/third.bin","file");typeof(MainWindow).GetMethod("RefreshJobs",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(window,null);
                Check(grid.SelectedRows.Count==2,"refresh lost selected rows");
                Click((Button)Field(window,"pause"));Wait(()=>!((bool)Field(window,"batchBusy"))&&((Button)Field(window,"resume")).Enabled&&manager.Snapshot().Count(j=>j.Status=="已暂停")==2,"pause selected");
                Check(manager.Snapshot().Count(j=>j.Status=="排队中")==1,"batch pause touched unselected task");
                Click((Button)Field(window,"resume"));Wait(()=>!((bool)Field(window,"batchBusy"))&&((Button)Field(window,"pause")).Enabled&&manager.Snapshot().All(j=>j.Status=="排队中"),"resume selected");
                Click((Button)Field(window,"pause"));Wait(()=>!((bool)Field(window,"batchBusy"))&&((Button)Field(window,"forget")).Enabled&&manager.Snapshot().Count(j=>j.Status=="已暂停")==2,"pause again");
                Check(((Button)Field(window,"forget")).Enabled,"forget button did not refresh");
                Click((Button)Field(window,"forget"));Wait(()=>!((bool)Field(window,"batchBusy"))&&manager.Snapshot().Count==1,"forget selected");
                Check(File.ReadAllText(partial)=="unfinished data"&&File.ReadAllText(placed)=="first","record removal touched files");window.Close();
            }
            manager.Config.Connections=64;manager.Config.FileSlots=0;manager.Config.VideoSlots=99;manager.Config.RateKiB=-1;manager.SaveSettings();
            Check(manager.Config.Connections==16&&manager.Config.FileSlots==1&&manager.Config.VideoSlots==2&&manager.Config.RateKiB==0,"setting bounds");
        }
        string tasks=Path.Combine(state,"tasks.json");File.Copy(tasks,tasks+".bak",true);File.WriteAllText(tasks,"[null]");
        using(var manager=new Manager(state)){Check(manager.Snapshot().Count==1&&manager.RecoveryNotice.Length>0,"backup recovery");Check(Directory.GetFiles(state,"tasks.json.damaged-*").Any(p=>File.ReadAllText(p)=="[null]"),"damaged data not preserved");}
        string broken=Path.Combine(root,"both-broken");Directory.CreateDirectory(broken);File.WriteAllText(Path.Combine(broken,"tasks.json"),"broken");File.WriteAllText(Path.Combine(broken,"tasks.json.bak"),"also broken");bool failed=false;try{new Manager(broken);}catch{failed=true;}Check(failed&&File.ReadAllText(Path.Combine(broken,"tasks.json"))=="broken","bad files silently replaced");
        string old=Path.Combine(root,"legacy");Directory.CreateDirectory(old);File.WriteAllText(Path.Combine(old,"settings.json"),"{\"Connections\":8,\"Proxy\":null}");
        Util.Atomic(Path.Combine(old,"tasks.json"),new[]{new{Id=new String('a',16),Url=signed,Title="archive.zip",Kind="file",Folder=folder,Status="已暂停"}});
        using(var manager=new Manager(old)){Check(manager.Config.FileSlots==2&&manager.Config.VideoSlots==1&&manager.Config.Proxy=="","legacy defaults");Check(!manager.Snapshot()[0].AutoCategorize&&Util.OutputFolder(manager.Snapshot()[0])==folder,"old tasks were reclassified");}
        string blocked=Path.Combine(root,"blocked-save");Directory.CreateDirectory(Path.Combine(blocked,"tasks.json"));var unsaved=new Manager(blocked);bool saveFailed=false;try{unsaved.AddMany(signed,"file",folder);}catch{saveFailed=true;}Check(saveFailed&&unsaved.Snapshot().Count==0,"failed save retained queued tasks");try{unsaved.Dispose();}catch{}
        File.WriteAllText(Path.Combine(root,"summary.json"),"{\"ok\":true,\"method\":\"real manager and WinForms controls, queued fixtures only; no downloads or registry changes\",\"checks\":[\"batch validation and deduplication\",\"signed URL preservation\",\"classification and opt out\",\"no overwrite\",\"multi-selection across refresh\",\"batch pause/resume/remove via buttons\",\"unselected tasks untouched\",\"completed and partial files retained\",\"setting bounds and legacy defaults\",\"backup recovery and damaged-file retention\",\"unrecoverable data preserved\",\"failed-save rollback\"]}");Console.WriteLine("MANAGEMENT CHECKS PASSED "+root);return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
