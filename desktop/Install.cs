// Per-user installation and explicit browser pairing. No profile scanning. GPL-3.0.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace ShiyingDesktop {
public class InstalledFile {public string Path, Sha256;}
public class RegValue {public string Path, Name, Desired, Before;public bool Exists, Number, BeforeNumber;}
public class RegGroup {public string GuardPath, GuardName, GuardValue;public RegValue[] Values;}
public class InstallReceipt {public string Root, Id, Version;public InstalledFile[] Files;public RegGroup[] Registry;public string[] Shortcuts;}
class PayloadManifest {public InstalledFile[] files=new InstalledFile[0];}
public static class Installation {
    public static string DefaultRoot {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Shiying");}}
    public const string Scheme="shiying-desktop";
    public static string Identity(string root){var data=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"identity.json"),Encoding.UTF8));string id=Util.Str(data,"extensionId");if(!Regex.IsMatch(id,@"^[a-p]{32}$"))throw new Exception("连接信息无效，请重新安装");return id;}
    public static string PairId(string url){var match=Regex.Match(url??"",@"^shiying-desktop://pair/([a-p]{32})/?$",RegexOptions.IgnoreCase);if(!match.Success)throw new Exception("连接地址无效，请从拾影插件重新打开");return match.Groups[1].Value.ToLowerInvariant();}
    public static string PairCommand(string root){return Util.Quote(Path.Combine(root,"拾影.exe"))+" --pair \"%1\"";}
    static readonly string[] Browsers={"Google\\Chrome","Microsoft\\Edge"};
    static string NativeKey(string browser){return "Software\\"+browser+"\\NativeMessagingHosts\\"+BrowserBridge.Host;}
    public static string[] ExistingOrigins(string root,RegistryKey registry){
        var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase){Path.Combine(root,"native-host.json")};
        foreach(string browser in Browsers)using(var key=registry.OpenSubKey(NativeKey(browser))){string path=key==null?null:key.GetValue("") as string;if(!String.IsNullOrEmpty(path))paths.Add(path);}
        var origins=new List<string>();foreach(string path in paths)try{var data=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(path,Encoding.UTF8));object list;if(data.TryGetValue("allowed_origins",out list)&&list is IEnumerable)origins.AddRange(((IEnumerable)list).Cast<object>().Select(Convert.ToString).Where(s=>Regex.IsMatch(s??"",@"^chrome-extension://[a-p]{32}/$")));}catch{}
        return origins.Distinct().ToArray();
    }
    public static void Register(string root,string id,RegistryKey registry){
        string manifest=Path.Combine(root,"native-host.json");var origins=BrowserBridge.Origins(ExistingOrigins(root,registry),id);
        Util.Atomic(manifest,new{name=BrowserBridge.Host,description="拾影桌面版",path=Path.Combine(root,"拾影.exe"),type="stdio",allowed_origins=origins});
        foreach(string browser in Browsers)using(var key=registry.CreateSubKey(NativeKey(browser)))key.SetValue("",manifest);
        using(var key=registry.CreateSubKey("Software\\Classes\\"+Scheme)){key.SetValue("","URL:拾影桌面连接");key.SetValue("URL Protocol","");}
        using(var key=registry.CreateSubKey("Software\\Classes\\"+Scheme+"\\shell\\open\\command"))key.SetValue("",PairCommand(root));
    }
    static string Full(string root,string relative){string full=Path.GetFullPath(Path.Combine(root,relative));if(!Util.InDirectory(full,root)||relative.IndexOf(':')>=0||relative.Split('/','\\').Any(part=>part==".."))throw new Exception("安装包路径无效");return full;}
    static RegValue Value(RegistryKey registry,string path,string name,string desired,bool number=false){using(var key=registry.OpenSubKey(path)){object old=key==null?null:key.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames);bool beforeNumber=false;if(old!=null){var kind=key.GetValueKind(name);if(kind!=RegistryValueKind.String&&kind!=RegistryValueKind.DWord)throw new Exception("已有安装项格式异常，请先检查："+path);beforeNumber=kind==RegistryValueKind.DWord;}return new RegValue{Path=path,Name=name,Desired=desired,Before=old==null?null:Convert.ToString(old),Exists=old!=null,Number=number,BeforeNumber=beforeNumber};}}
    static RegGroup[] Groups(string root,RegistryKey registry){
        var groups=new List<RegGroup>();foreach(string browser in Browsers){string path=NativeKey(browser);groups.Add(new RegGroup{GuardPath=path,GuardName="",GuardValue=Path.Combine(root,"native-host.json"),Values=new[]{Value(registry,path,"",Path.Combine(root,"native-host.json"))}});}
        string protocol="Software\\Classes\\"+Scheme,command=protocol+"\\shell\\open\\command";
        groups.Add(new RegGroup{GuardPath=command,GuardName="",GuardValue=PairCommand(root),Values=new[]{Value(registry,protocol,"","URL:拾影桌面连接"),Value(registry,protocol,"URL Protocol",""),Value(registry,command,"",PairCommand(root))}});
        string uninstall="Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShiyingDesktop";
        groups.Add(new RegGroup{GuardPath=uninstall,GuardName="InstallLocation",GuardValue=root,Values=new[]{Value(registry,uninstall,"DisplayName","拾影下载管理"),Value(registry,uninstall,"DisplayVersion",Util.Version),Value(registry,uninstall,"InstallLocation",root),Value(registry,uninstall,"DisplayIcon",Path.Combine(root,"拾影.exe")),Value(registry,uninstall,"UninstallString",Util.Quote(Path.Combine(root,"ShiyingSetup.exe"))+" --uninstall"),Value(registry,uninstall,"NoModify","1",true),Value(registry,uninstall,"NoRepair","1",true)}});
        return groups.ToArray();
    }
    static void WriteGroups(RegistryKey registry,RegGroup[] groups){foreach(var group in groups)foreach(var value in group.Values)using(var key=registry.CreateSubKey(value.Path))key.SetValue(value.Name,value.Number?(object)Int32.Parse(value.Desired):value.Desired,value.Number?RegistryValueKind.DWord:RegistryValueKind.String);}
    static void Restore(RegistryKey registry,RegGroup[] groups,bool guarded){
        foreach(var group in groups){if(guarded){using(var guard=registry.OpenSubKey(group.GuardPath)){if(guard==null||!String.Equals(Convert.ToString(guard.GetValue(group.GuardName)),group.GuardValue,StringComparison.OrdinalIgnoreCase))continue;}}
            foreach(var value in group.Values.Reverse())using(var key=registry.CreateSubKey(value.Path)){if(value.Exists)key.SetValue(value.Name,value.BeforeNumber?(object)Int32.Parse(value.Before):value.Before,value.BeforeNumber?RegistryValueKind.DWord:RegistryValueKind.String);else key.DeleteValue(value.Name,false);}
            foreach(string path in group.Values.Select(v=>v.Path).Distinct().OrderByDescending(p=>p.Length)){using(var key=registry.OpenSubKey(path)){if(key!=null&&(key.SubKeyCount>0||key.ValueCount>0))continue;}registry.DeleteSubKey(path,false);}
        }
    }
    public static bool Running(string root){foreach(var process in Process.GetProcessesByName("拾影"))using(process)try{if(String.Equals(process.MainModule.FileName,Path.Combine(root,"拾影.exe"),StringComparison.OrdinalIgnoreCase))return true;}catch{}return false;}
    public static Stream Payload(){return Assembly.GetExecutingAssembly().GetManifestResourceStream("ShiyingPayload");}
    public static InstallReceipt Apply(string root,RegistryKey registry,Stream payload,string setupFile,bool shortcuts){
        root=Path.GetFullPath(root);if(Path.GetPathRoot(root).TrimEnd('\\')==root.TrimEnd('\\'))throw new Exception("不能安装到磁盘根目录");if(Running(root))throw new Exception("请先关闭正在运行的拾影，再安装更新");
        Directory.CreateDirectory(root);string stage=Path.Combine(root,"data","install-stage-"+Guid.NewGuid().ToString("N")),backup=Path.Combine(root,"data","install-backup-"+DateTime.UtcNow.Ticks);Directory.CreateDirectory(stage);Directory.CreateDirectory(backup);
        var moved=new List<string>();var createdLinks=new List<string>();RegGroup[] groups=null;string manifest=Path.Combine(root,"native-host.json"),oldManifest=File.Exists(manifest)?File.ReadAllText(manifest,Encoding.UTF8):null;InstallReceipt prior=null;
        string receiptPath=Path.Combine(root,"installation.json");if(File.Exists(receiptPath)){prior=Util.Json().Deserialize<InstallReceipt>(File.ReadAllText(receiptPath,Encoding.UTF8));if(prior==null||prior.Registry==null||prior.Files==null||!Regex.IsMatch(prior.Id??"",@"^[a-f0-9]{32}$")||!String.Equals(prior.Root,root,StringComparison.OrdinalIgnoreCase))throw new Exception("已有安装记录不匹配，已保留原文件");}
        try{
            PayloadManifest expected;using(var zip=new ZipArchive(payload,ZipArchiveMode.Read)){
                var manifestEntry=zip.GetEntry("payload-manifest.json");if(manifestEntry==null)throw new Exception("安装包缺少校验清单");using(var reader=new StreamReader(manifestEntry.Open(),Encoding.UTF8))expected=Util.Json().Deserialize<PayloadManifest>(reader.ReadToEnd());
                if(expected.files.Length==0||expected.files.Select(file=>file.Path).Distinct(StringComparer.OrdinalIgnoreCase).Count()!=expected.files.Length)throw new Exception("安装包文件清单无效");
                foreach(var file in expected.files){if(!Regex.IsMatch(file.Path??"",@"^(拾影\.exe|README\.md|components\.json|identity\.json|Shiying\.Interface\.dll|Microsoft\.Web\.WebView2\.(Core|WinForms)\.dll|WebView2Loader\.dll|LICENSE|bin/aria2c\.exe|licenses/[^/\\]+)$")||!Regex.IsMatch(file.Sha256??"",@"^[a-f0-9]{64}$"))throw new Exception("安装包含受保护路径");string destination=Full(stage,file.Path);var entry=zip.GetEntry(file.Path);if(entry==null||entry.Length>16*1024*1024)throw new Exception("安装包内容无效");Directory.CreateDirectory(Path.GetDirectoryName(destination));using(var input=entry.Open())using(var output=File.Create(destination))input.CopyTo(output);if(ComponentStore.Hash(destination)!=file.Sha256)throw new Exception("安装包文件校验失败："+file.Path);}
            }
            // Prepare all files and checks before replacing an existing program. User data is never a payload.
            groups=Groups(root,registry);var inherited=ExistingOrigins(root,registry);
            foreach(var file in expected.files){string target=Full(root,file.Path),source=Full(stage,file.Path),previous=Full(backup,file.Path);Directory.CreateDirectory(Path.GetDirectoryName(target));Directory.CreateDirectory(Path.GetDirectoryName(previous));if(File.Exists(target))File.Replace(source,target,previous);else File.Move(source,target);moved.Add(file.Path);}
            string installedSetup=Path.Combine(root,"ShiyingSetup.exe");if(!String.Equals(Path.GetFullPath(setupFile),installedSetup,StringComparison.OrdinalIgnoreCase)){string setupTemp=installedSetup+".new";File.Copy(setupFile,setupTemp,true);if(File.Exists(installedSetup))File.Replace(setupTemp,installedSetup,Path.Combine(backup,"ShiyingSetup.exe"));else File.Move(setupTemp,installedSetup);moved.Add("ShiyingSetup.exe");}
            string id=Identity(root);Util.Atomic(manifest,new{name=BrowserBridge.Host,description="拾影桌面版",path=Path.Combine(root,"拾影.exe"),type="stdio",allowed_origins=BrowserBridge.Origins(inherited,id)});WriteGroups(registry,groups);
            var restore=Util.Json().Deserialize<RegGroup[]>(Util.Json().Serialize(groups));if(prior!=null)foreach(var value in restore.SelectMany(g=>g.Values)){var previous=prior.Registry.SelectMany(g=>g.Values).FirstOrDefault(v=>v.Path==value.Path&&v.Name==value.Name);if(previous!=null){value.Before=previous.Before;value.Exists=previous.Exists;value.BeforeNumber=previous.BeforeNumber;}}
            var files=expected.files.Concat(new[]{new InstalledFile{Path="ShiyingSetup.exe",Sha256=ComponentStore.Hash(installedSetup)}}).ToArray();
            var receipt=new InstallReceipt{Root=root,Id=prior==null?Guid.NewGuid().ToString("N"):prior.Id,Version=Util.Version,Files=files,Registry=restore,Shortcuts=prior==null?new string[0]:prior.Shortcuts};
            if(shortcuts){createdLinks.AddRange(CreateShortcuts(root));receipt.Shortcuts=createdLinks.Concat(receipt.Shortcuts??new string[0]).Distinct().ToArray();}Util.Atomic(receiptPath,receipt);return receipt;
        }catch{
            foreach(string link in createdLinks)try{File.Delete(link);}catch{}
            if(groups!=null)Restore(registry,groups,false);if(oldManifest!=null)File.WriteAllText(manifest,oldManifest,new UTF8Encoding(false));else if(File.Exists(manifest))File.Delete(manifest);
            foreach(string relative in moved.AsEnumerable().Reverse()){string target=Full(root,relative),previous=Full(backup,relative);if(File.Exists(previous)){if(File.Exists(target))File.Replace(previous,target,null);else File.Move(previous,target);}else if(File.Exists(target))File.Delete(target);}throw;
        }finally{foreach(string file in Directory.GetFiles(stage,"*",SearchOption.AllDirectories)){if(!Util.InDirectory(file,stage))throw new Exception("安装暂存路径异常");File.Delete(file);}RemoveEmpty(stage);}
    }
    static string[] CreateShortcuts(string root){var result=new List<string>();try{Type shell=Type.GetTypeFromProgID("WScript.Shell");if(shell==null)return result.ToArray();dynamic app=Activator.CreateInstance(shell);foreach(string directory in new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.Programs)})try{string link=Path.Combine(directory,"拾影下载管理.lnk");if(File.Exists(link))continue;dynamic shortcut=app.CreateShortcut(link);shortcut.TargetPath=Path.Combine(root,"拾影.exe");shortcut.WorkingDirectory=root;shortcut.Description="拾影下载管理";shortcut.Save();result.Add(link);}catch{}}catch{}return result.ToArray();}
    static void RemoveEmpty(string root){if(!Directory.Exists(root)||(File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0)return;foreach(string directory in Directory.GetDirectories(root)){if(!Util.InDirectory(directory,root))throw new Exception("目录边界无效");RemoveEmpty(directory);}if(!Directory.EnumerateFileSystemEntries(root).Any())Directory.Delete(root);}
    public static void Uninstall(string root,RegistryKey registry,string expectedId){
        root=Path.GetFullPath(root);string receiptPath=Path.Combine(root,"installation.json");var receipt=Util.Json().Deserialize<InstallReceipt>(File.ReadAllText(receiptPath,Encoding.UTF8));if(receipt==null||receipt.Root!=root||receipt.Id!=expectedId)throw new Exception("卸载记录无效，已保留所有文件");if(Running(root))throw new Exception("请先关闭拾影再卸载，下载记录会保留");
        var files=receipt.Files.ToList();var specs=new ComponentStore(root).Specs;foreach(var spec in specs)files.Add(new InstalledFile{Path="bin/"+spec.name,Sha256=spec.sha256});foreach(var file in files)Full(root,file.Path);
        Restore(registry,receipt.Registry,true);
        foreach(var file in files.GroupBy(f=>f.Path,StringComparer.OrdinalIgnoreCase).Select(g=>g.First())){string path=Full(root,file.Path);if(File.Exists(path)&&ComponentStore.Hash(path)==file.Sha256)File.Delete(path);}
        if(receipt.Shortcuts!=null)foreach(string link in receipt.Shortcuts){string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),programs=Environment.GetFolderPath(Environment.SpecialFolder.Programs);if((String.Equals(link,Path.Combine(desktop,"拾影下载管理.lnk"),StringComparison.OrdinalIgnoreCase)||String.Equals(link,Path.Combine(programs,"拾影下载管理.lnk"),StringComparison.OrdinalIgnoreCase))&&File.Exists(link)){try{dynamic app=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic shortcut=app.CreateShortcut(link);if(String.Equals((string)shortcut.TargetPath,Path.Combine(root,"拾影.exe"),StringComparison.OrdinalIgnoreCase))File.Delete(link);}catch{}}}
        foreach(string name in new[]{"native-host.json","native-host.json.bak","installation.json","installation.json.bak"}){string file=Path.Combine(root,name);if(File.Exists(file))File.Delete(file);}foreach(string name in new[]{"bin","licenses"})RemoveEmpty(Path.Combine(root,name));
        // Keep data, install backups, completed files, and anything not owned by this payload.
    }
}
}
