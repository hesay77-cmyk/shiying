// Generated fixture files only. Never opens a window, starts an engine or accesses real tasks.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using ShiyingDesktop;
class DeleteCheck {
    static readonly List<string> checks=new List<string>();
    static void Check(bool value,string name){if(!value)throw new Exception(name);checks.Add(name);Console.WriteLine("PASS "+name);}
    static bool Refused(Action action){try{action();return false;}catch(IOException){return true;}}
    static Download FileJob(Manager manager,string folder){var job=manager.Add("https://files.example.test/fixture.bin","file","fixture.bin",1080,folder);job.Status="失败";Directory.CreateDirectory(folder);Directory.CreateDirectory(manager.Work(job));job.File=Path.Combine(folder,job.Id+".bin");File.WriteAllText(job.File,"completed");File.WriteAllText(Path.Combine(manager.Work(job),"fixture.part"),"partial");return job;}
    static void Save(Manager manager){typeof(Manager).GetMethod("Save",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(manager,null);}
    static bool Has(Manager manager,Download job){return manager.Snapshot().Any(item=>item.Id==job.Id);}
    static int Main(string[] args){try{
        string root=Path.GetFullPath(args[0]);if(root.IndexOf("\\reports\\delete-",StringComparison.OrdinalIgnoreCase)<0)throw new Exception("Fixture root must be a delete-check report");
        using(var manager=new Manager(Path.Combine(root,"state"))){
            string folder=Path.Combine(root,"downloads");var retained=FileJob(manager,folder);Save(manager);manager.Forget(retained.Id,false);Check(!Has(manager,retained)&&File.Exists(retained.File)&&Directory.Exists(manager.Work(retained)),"keep-files choice preserves completed and partial data");
            var other=FileJob(manager,folder);var deleting=FileJob(manager,folder);Save(manager);manager.Forget(deleting.Id,true);Check(!Has(manager,deleting)&&!File.Exists(deleting.File)&&!Directory.Exists(manager.Work(deleting)),"delete-files choice removes completed file and private work directory");Check(Has(manager,other)&&File.Exists(other.File)&&File.Exists(retained.File),"neighboring files and unrelated tasks remain intact");
            var outside=FileJob(manager,folder);outside.File=Path.Combine(root,"outside.bin");File.WriteAllText(outside.File,"outside");Save(manager);Check(Refused(()=>manager.Forget(outside.Id,true))&&Has(manager,outside)&&File.Exists(outside.File)&&Directory.Exists(manager.Work(outside)),"out-of-directory destination is refused before file mutations");
            var shared=FileJob(manager,folder);shared.File=other.File;Save(manager);Check(Refused(()=>manager.Forget(shared.Id,true))&&Has(manager,shared)&&File.Exists(other.File),"file referenced by another task is protected");manager.Forget(shared.Id,false);
            var locked=FileJob(manager,folder);Save(manager);using(var stream=new FileStream(locked.File,FileMode.Open,FileAccess.Read,FileShare.None)){Check(Refused(()=>manager.Forget(locked.Id,true))&&Has(manager,locked),"locked file reports failure and retains task for retry");}manager.Forget(locked.Id,true);Check(!Has(manager,locked)&&!File.Exists(locked.File),"failed cleanup can be retried after file unlock");
            var active=FileJob(manager,folder);active.Status="下载中";Save(manager);bool rejected=false;try{manager.Forget(active.Id,true);}catch{rejected=true;}Check(rejected&&Has(manager,active)&&File.Exists(active.File),"active task cannot be deleted");active.Status="已暂停";
            var missing=FileJob(manager,folder);File.Delete(missing.File);Save(manager);manager.Forget(missing.Id,true);Check(!Has(manager,missing)&&!Directory.Exists(manager.Work(missing)),"already missing completed file does not block removal");
            var linked=FileJob(manager,folder);string link=Path.Combine(manager.Work(linked),"linked");Directory.Move(Path.Combine(root,"junction"),link);Save(manager);Check(Refused(()=>manager.Forget(linked.Id,true))&&Has(manager,linked)&&File.Exists(Path.Combine(root,"junction-target","sentinel.bin"))&&File.Exists(linked.File),"junction inside work data is refused before deletion and target remains intact");
            string source=Path.Combine(root,"fixture.torrent");byte[] prefix=Encoding.ASCII.GetBytes("d4:infod5:filesld6:lengthi4e4:pathl5:a.bineed6:lengthi4e4:pathl5:b.bineee4:name7:fixture12:piece lengthi4e6:pieces40:");File.WriteAllBytes(source,prefix.Concat(new byte[40]).Concat(Encoding.ASCII.GetBytes("ee")).ToArray());
            var bt=manager.ImportTorrent(source,folder,false);bt.BtFolder=Path.Combine(folder,"fixture ["+bt.Id.Substring(0,8)+"]");bt.BtSelected=new[]{1};bt.Status="已暂停";Directory.CreateDirectory(bt.BtFolder);foreach(var file in bt.BtFiles){string path=Path.Combine(bt.BtFolder,file.Path.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,"data");}string control=Path.Combine(bt.BtFolder,"fixture.aria2"),neighbor=Path.Combine(bt.BtFolder,"my-notes.txt");File.WriteAllText(control,"control");File.WriteAllText(neighbor,"user file");Save(manager);manager.Forget(bt.Id,true);
            Check(!Has(manager,bt)&&bt.BtFiles.All(file=>!File.Exists(Path.Combine(bt.BtFolder,file.Path.Replace('/',Path.DirectorySeparatorChar))))&&!File.Exists(control)&&!Directory.Exists(manager.Work(bt)),"BT cleanup deletes selected and unselected boundary files and control data");Check(File.Exists(source)&&File.ReadAllText(neighbor)=="user file"&&Directory.Exists(bt.BtFolder),"original torrent and unrelated file inside BT directory are preserved");
            var absent=manager.ImportTorrent(source,folder,false);absent.BtFolder=Path.Combine(folder,"fixture ["+absent.Id.Substring(0,8)+"]");Directory.CreateDirectory(absent.BtFolder);Save(manager);manager.Forget(absent.Id,true);Check(!Has(manager,absent)&&!Directory.Exists(absent.BtFolder),"missing BT files and their missing parent directories do not block cleanup");
            var empty=manager.ImportTorrent(source,folder,false);manager.Forget(empty.Id,true);Check(!Has(manager,empty)&&File.Exists(source),"unstarted torrent removes only its private metadata copy");
        }
        Util.Atomic(Path.Combine(root,"summary.json"),new{ok=true,version=Util.Version,checks,fixtureOnly=true,enginesStarted=false,personalFilesDeleted=false,windowsShown=false,published=false});return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
