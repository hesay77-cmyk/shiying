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
    // The published Chrome Web Store build has its own ID; allow it at install time so store users connect without pairing.
    public const string StoreExtensionId="nlhoddnpmoakgikfpdmdkjmahcaokbcl";
    static IEnumerable<string> WithStore(IEnumerable<string> origins){return origins.Concat(new[]{"chrome-extension://"+StoreExtensionId+"/"});}
    // 0.4.45 renamed the program; the legacy names are only used to migrate and clean up older installs.
    public const string Program="Ruxget.exe",LegacyProgram="拾影.exe",Shortcut="Ruxget.lnk",LegacyShortcut="拾影下载管理.lnk";
    public static string Identity(string root){var data=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"identity.json"),Encoding.UTF8));string id=Util.Str(data,"extensionId");if(!Regex.IsMatch(id,@"^[a-p]{32}$"))throw new Exception("连接信息无效，请重新安装");return id;}
    public static string PairId(string url){var match=Regex.Match(url??"",@"^shiying-desktop://pair/([a-p]{32})/?$",RegexOptions.IgnoreCase);if(!match.Success)throw new Exception("连接地址无效，请从 Ruxget 插件重新打开");return match.Groups[1].Value.ToLowerInvariant();}
    public static string PairCommand(string root){return Util.Quote(Path.Combine(root,Program))+" --pair \"%1\"";}
    static readonly string[] Browsers={"Google\\Chrome","Microsoft\\Edge"};
    static string NativeKey(string browser){return "Software\\"+browser+"\\NativeMessagingHosts\\"+BrowserBridge.Host;}
    public static string[] ExistingOrigins(string root,RegistryKey registry){
        var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase){Path.Combine(root,"native-host.json")};
        foreach(string browser in Browsers)using(var key=registry.OpenSubKey(NativeKey(browser))){string path=key==null?null:key.GetValue("") as string;if(!String.IsNullOrEmpty(path))paths.Add(path);}
        var origins=new List<string>();foreach(string path in paths)try{var data=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(path,Encoding.UTF8));object list;if(data.TryGetValue("allowed_origins",out list)&&list is IEnumerable)origins.AddRange(((IEnumerable)list).Cast<object>().Select(Convert.ToString).Where(s=>Regex.IsMatch(s??"",@"^chrome-extension://[a-p]{32}/$")));}catch{}
        return origins.Distinct().ToArray();
    }
    public static void Register(string root,string id,RegistryKey registry){
        string manifest=Path.Combine(root,"native-host.json");var origins=BrowserBridge.Origins(WithStore(ExistingOrigins(root,registry)),id);
        Util.Atomic(manifest,new{name=BrowserBridge.Host,description="Ruxget Desktop",path=Path.Combine(root,Program),type="stdio",allowed_origins=origins});
        foreach(string browser in Browsers)using(var key=registry.CreateSubKey(NativeKey(browser)))key.SetValue("",manifest);
        using(var key=registry.CreateSubKey("Software\\Classes\\"+Scheme)){key.SetValue("","URL:Ruxget Desktop");key.SetValue("URL Protocol","");}
        using(var key=registry.CreateSubKey("Software\\Classes\\"+Scheme+"\\shell\\open\\command"))key.SetValue("",PairCommand(root));
    }
    static string Full(string root,string relative){string full=Path.GetFullPath(Path.Combine(root,relative));if(!Util.InDirectory(full,root)||relative.IndexOf(':')>=0||relative.Split('/','\\').Any(part=>part==".."))throw new Exception("安装包路径无效");return full;}
    static RegValue Value(RegistryKey registry,string path,string name,string desired,bool number=false){using(var key=registry.OpenSubKey(path)){object old=key==null?null:key.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames);bool beforeNumber=false;if(old!=null){var kind=key.GetValueKind(name);if(kind!=RegistryValueKind.String&&kind!=RegistryValueKind.DWord)throw new Exception("已有安装项格式异常，请先检查："+path);beforeNumber=kind==RegistryValueKind.DWord;}return new RegValue{Path=path,Name=name,Desired=desired,Before=old==null?null:Convert.ToString(old),Exists=old!=null,Number=number,BeforeNumber=beforeNumber};}}
    static RegGroup[] Groups(string root,RegistryKey registry){
        var groups=new List<RegGroup>();foreach(string browser in Browsers){string path=NativeKey(browser);groups.Add(new RegGroup{GuardPath=path,GuardName="",GuardValue=Path.Combine(root,"native-host.json"),Values=new[]{Value(registry,path,"",Path.Combine(root,"native-host.json"))}});}
        string protocol="Software\\Classes\\"+Scheme,command=protocol+"\\shell\\open\\command";
        groups.Add(new RegGroup{GuardPath=command,GuardName="",GuardValue=PairCommand(root),Values=new[]{Value(registry,protocol,"","URL:Ruxget Desktop"),Value(registry,protocol,"URL Protocol",""),Value(registry,command,"",PairCommand(root))}});
        string uninstall="Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShiyingDesktop";
        groups.Add(new RegGroup{GuardPath=uninstall,GuardName="InstallLocation",GuardValue=root,Values=new[]{Value(registry,uninstall,"DisplayName","Ruxget"),Value(registry,uninstall,"DisplayVersion",Util.Version),Value(registry,uninstall,"InstallLocation",root),Value(registry,uninstall,"DisplayIcon",Path.Combine(root,Program)),Value(registry,uninstall,"UninstallString",Util.Quote(Path.Combine(root,"ShiyingSetup.exe"))+" --uninstall"),Value(registry,uninstall,"NoModify","1",true),Value(registry,uninstall,"NoRepair","1",true)}});
        return groups.ToArray();
    }
    static void WriteGroups(RegistryKey registry,RegGroup[] groups){foreach(var group in groups)foreach(var value in group.Values)using(var key=registry.CreateSubKey(value.Path))key.SetValue(value.Name,value.Number?(object)Int32.Parse(value.Desired):value.Desired,value.Number?RegistryValueKind.DWord:RegistryValueKind.String);}
    static void Restore(RegistryKey registry,RegGroup[] groups,bool guarded){
        foreach(var group in groups){if(guarded){using(var guard=registry.OpenSubKey(group.GuardPath)){if(guard==null||!String.Equals(Convert.ToString(guard.GetValue(group.GuardName)),group.GuardValue,StringComparison.OrdinalIgnoreCase))continue;}}
            foreach(var value in group.Values.Reverse())using(var key=registry.CreateSubKey(value.Path)){if(value.Exists)key.SetValue(value.Name,value.BeforeNumber?(object)Int32.Parse(value.Before):value.Before,value.BeforeNumber?RegistryValueKind.DWord:RegistryValueKind.String);else key.DeleteValue(value.Name,false);}
            foreach(string path in group.Values.Select(v=>v.Path).Distinct().OrderByDescending(p=>p.Length)){using(var key=registry.OpenSubKey(path)){if(key!=null&&(key.SubKeyCount>0||key.ValueCount>0))continue;}registry.DeleteSubKey(path,false);}
        }
    }
    public static bool Running(string root){foreach(string name in new[]{Program,LegacyProgram})foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(name)))using(process)try{if(String.Equals(process.MainModule.FileName,Path.Combine(root,name),StringComparison.OrdinalIgnoreCase))return true;}catch{}return false;}
    public static Stream Payload(){return Assembly.GetExecutingAssembly().GetManifestResourceStream("ShiyingPayload");}
    public static InstallReceipt Apply(string root,RegistryKey registry,Stream payload,string setupFile,bool shortcuts){
        root=Path.GetFullPath(root);if(Path.GetPathRoot(root).TrimEnd('\\')==root.TrimEnd('\\'))throw new Exception("不能安装到磁盘根目录");if(Running(root))throw new Exception("请先关闭正在运行的 Ruxget，再安装更新");
        Directory.CreateDirectory(root);string stage=Path.Combine(root,"data","install-stage-"+Guid.NewGuid().ToString("N")),backup=Path.Combine(root,"data","install-backup-"+DateTime.UtcNow.Ticks);Directory.CreateDirectory(stage);Directory.CreateDirectory(backup);
        var moved=new List<string>();var createdLinks=new List<string>();RegGroup[] groups=null;string manifest=Path.Combine(root,"native-host.json"),oldManifest=File.Exists(manifest)?File.ReadAllText(manifest,Encoding.UTF8):null;InstallReceipt prior=null;
        string receiptPath=Path.Combine(root,"installation.json");if(File.Exists(receiptPath)){prior=Util.Json().Deserialize<InstallReceipt>(File.ReadAllText(receiptPath,Encoding.UTF8));if(prior==null||prior.Registry==null||prior.Files==null||!Regex.IsMatch(prior.Id??"",@"^[a-f0-9]{32}$")||!String.Equals(prior.Root,root,StringComparison.OrdinalIgnoreCase))throw new Exception("已有安装记录不匹配，已保留原文件");}
        try{
            PayloadManifest expected;using(var zip=new ZipArchive(payload,ZipArchiveMode.Read)){
                var manifestEntry=zip.GetEntry("payload-manifest.json");if(manifestEntry==null)throw new Exception("安装包缺少校验清单");using(var reader=new StreamReader(manifestEntry.Open(),Encoding.UTF8))expected=Util.Json().Deserialize<PayloadManifest>(reader.ReadToEnd());
                if(expected.files.Length==0||expected.files.Select(file=>file.Path).Distinct(StringComparer.OrdinalIgnoreCase).Count()!=expected.files.Length)throw new Exception("安装包文件清单无效");
                foreach(var file in expected.files){if(!Regex.IsMatch(file.Path??"",@"^(Ruxget\.exe|README\.md|components\.json|identity\.json|Shiying\.Interface\.dll|Microsoft\.Web\.WebView2\.(Core|WinForms)\.dll|WebView2Loader\.dll|LICENSE|bin/aria2c\.exe|licenses/[^/\\]+)$")||!Regex.IsMatch(file.Sha256??"",@"^[a-f0-9]{64}$"))throw new Exception("安装包含受保护路径");string destination=Full(stage,file.Path);var entry=zip.GetEntry(file.Path);if(entry==null||entry.Length>16*1024*1024)throw new Exception("安装包内容无效");Directory.CreateDirectory(Path.GetDirectoryName(destination));using(var input=entry.Open())using(var output=File.Create(destination))input.CopyTo(output);if(ComponentStore.Hash(destination)!=file.Sha256)throw new Exception("安装包文件校验失败："+file.Path);}
            }
            // Prepare all files and checks before replacing an existing program. User data is never a payload.
            groups=Groups(root,registry);var inherited=ExistingOrigins(root,registry);
            foreach(var file in expected.files.OrderBy(f=>String.Equals(f.Path,Program,StringComparison.OrdinalIgnoreCase)?1:0)){string target=Full(root,file.Path),source=Full(stage,file.Path),previous=Full(backup,file.Path);Directory.CreateDirectory(Path.GetDirectoryName(target));Directory.CreateDirectory(Path.GetDirectoryName(previous));if(File.Exists(target))File.Replace(source,target,previous);else File.Move(source,target);moved.Add(file.Path);}
            string installedSetup=Path.Combine(root,"ShiyingSetup.exe");if(!String.Equals(Path.GetFullPath(setupFile),installedSetup,StringComparison.OrdinalIgnoreCase)){string setupTemp=installedSetup+".new";File.Copy(setupFile,setupTemp,true);if(File.Exists(installedSetup))File.Replace(setupTemp,installedSetup,Path.Combine(backup,"ShiyingSetup.exe"));else File.Move(setupTemp,installedSetup);moved.Add("ShiyingSetup.exe");}
            string legacy=Path.Combine(root,LegacyProgram);if(File.Exists(legacy)){File.Move(legacy,Full(backup,LegacyProgram));moved.Add(LegacyProgram);}
            string id=Identity(root);Util.Atomic(manifest,new{name=BrowserBridge.Host,description="Ruxget Desktop",path=Path.Combine(root,Program),type="stdio",allowed_origins=BrowserBridge.Origins(WithStore(inherited),id)});WriteGroups(registry,groups);
            var restore=Util.Json().Deserialize<RegGroup[]>(Util.Json().Serialize(groups));if(prior!=null)foreach(var value in restore.SelectMany(g=>g.Values)){var previous=prior.Registry.SelectMany(g=>g.Values).FirstOrDefault(v=>v.Path==value.Path&&v.Name==value.Name);if(previous!=null){value.Before=previous.Before;value.Exists=previous.Exists;value.BeforeNumber=previous.BeforeNumber;}}
            var files=expected.files.Concat(new[]{new InstalledFile{Path="ShiyingSetup.exe",Sha256=ComponentStore.Hash(installedSetup)}}).ToArray();
            var receipt=new InstallReceipt{Root=root,Id=prior==null?Guid.NewGuid().ToString("N"):prior.Id,Version=Util.Version,Files=files,Registry=restore,Shortcuts=prior==null?new string[0]:MigrateShortcuts(root,prior.Shortcuts)};
            if(shortcuts){createdLinks.AddRange(CreateShortcuts(root));receipt.Shortcuts=createdLinks.Concat(receipt.Shortcuts??new string[0]).Distinct().ToArray();}Util.Atomic(receiptPath,receipt);
            // 0.4.70: only the two newest program backups are kept (each upgrade used to leave one more, about 10 MB).
            try{foreach(var old in new DirectoryInfo(Path.Combine(root,"data")).GetDirectories("install-backup-*").OrderByDescending(d=>d.Name.Length).ThenByDescending(d=>d.Name,StringComparer.Ordinal).Skip(2))old.Delete(true);}catch(Exception){}
            return receipt;
        }catch{
            foreach(string link in createdLinks)try{File.Delete(link);}catch{}
            if(groups!=null)Restore(registry,groups,false);if(oldManifest!=null)File.WriteAllText(manifest,oldManifest,new UTF8Encoding(false));else if(File.Exists(manifest))File.Delete(manifest);
            foreach(string relative in moved.AsEnumerable().Reverse()){string target=Full(root,relative),previous=Full(backup,relative);if(File.Exists(previous)){if(File.Exists(target))File.Replace(previous,target,null);else File.Move(previous,target);}else if(File.Exists(target))File.Delete(target);}try{RemoveEmpty(backup);}catch{}throw;
        }finally{foreach(string file in Directory.GetFiles(stage,"*",SearchOption.AllDirectories)){if(!Util.InDirectory(file,stage))throw new Exception("安装暂存路径异常");File.Delete(file);}RemoveEmpty(stage);}
    }
    static string[] CreateShortcuts(string root){var result=new List<string>();try{Type shell=Type.GetTypeFromProgID("WScript.Shell");if(shell==null)return result.ToArray();dynamic app=Activator.CreateInstance(shell);foreach(string directory in new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.Programs)})try{string link=Path.Combine(directory,Shortcut);if(File.Exists(link))continue;MakeShortcut(app,link,root);result.Add(link);}catch{}}catch{}return result.ToArray();}
    static void MakeShortcut(dynamic app,string link,string root){dynamic shortcut=app.CreateShortcut(link);shortcut.TargetPath=Path.Combine(root,Program);shortcut.WorkingDirectory=root;shortcut.Description="Ruxget";shortcut.Save();}
    static bool OwnShortcut(string link,string root){string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),programs=Environment.GetFolderPath(Environment.SpecialFolder.Programs);if(!File.Exists(link)||!new[]{desktop,programs}.Any(d=>new[]{Shortcut,LegacyShortcut}.Any(n=>String.Equals(link,Path.Combine(d,n),StringComparison.OrdinalIgnoreCase))))return false;try{dynamic app=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));string target=(string)app.CreateShortcut(link).TargetPath;return new[]{Program,LegacyProgram}.Any(n=>String.Equals(target,Path.Combine(root,n),StringComparison.OrdinalIgnoreCase));}catch{return false;}}
    // Older installs created 拾影下载管理.lnk pointing at 拾影.exe; replace each with Ruxget.lnk in the same folder.
    static string[] MigrateShortcuts(string root,string[] links){var result=new List<string>();foreach(string link in links??new string[0]){if(!String.Equals(Path.GetFileName(link),LegacyShortcut,StringComparison.OrdinalIgnoreCase)||!OwnShortcut(link,root)){result.Add(link);continue;}string renamed=Path.Combine(Path.GetDirectoryName(link),Shortcut);try{if(!File.Exists(renamed))MakeShortcut(Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")),renamed,root);File.Delete(link);result.Add(renamed);}catch{result.Add(link);}}return result.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();}
    static void RemoveEmpty(string root){if(!Directory.Exists(root)||(File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0)return;foreach(string directory in Directory.GetDirectories(root)){if(!Util.InDirectory(directory,root))throw new Exception("目录边界无效");RemoveEmpty(directory);}if(!Directory.EnumerateFileSystemEntries(root).Any())Directory.Delete(root);}
    public static void Uninstall(string root,RegistryKey registry,string expectedId){
        root=Path.GetFullPath(root);string receiptPath=Path.Combine(root,"installation.json");var receipt=Util.Json().Deserialize<InstallReceipt>(File.ReadAllText(receiptPath,Encoding.UTF8));if(receipt==null||receipt.Root!=root||receipt.Id!=expectedId)throw new Exception("卸载记录无效，已保留所有文件");if(Running(root))throw new Exception("请先关闭 Ruxget 再卸载，下载记录会保留");
        var files=receipt.Files.ToList();var specs=new ComponentStore(root).Specs;foreach(var spec in specs)files.Add(new InstalledFile{Path="bin/"+spec.name,Sha256=spec.sha256});foreach(var file in files)Full(root,file.Path);
        Restore(registry,receipt.Registry,true);
        foreach(var file in files.GroupBy(f=>f.Path,StringComparer.OrdinalIgnoreCase).Select(g=>g.First())){string path=Full(root,file.Path);if(File.Exists(path)&&ComponentStore.Hash(path)==file.Sha256)File.Delete(path);}
        if(receipt.Shortcuts!=null)foreach(string link in receipt.Shortcuts)if(OwnShortcut(link,root))try{File.Delete(link);}catch{}
        foreach(string name in new[]{"native-host.json","native-host.json.bak","installation.json","installation.json.bak"}){string file=Path.Combine(root,name);if(File.Exists(file))File.Delete(file);}foreach(string name in new[]{"bin","licenses"})RemoveEmpty(Path.Combine(root,name));
        // Keep data, install backups, completed files, and anything not owned by this payload.
    }
}

// 0.4.72: automatic updates. Once a day at most, a small signed list at hidaydream.cloud (reachable from mainland China,
// unlike GitHub downloads) says which version is current. A newer setup is downloaded in the background into
// data\update, and is used only when its size, SHA-256 and RSA signature (key embedded below; the private key never
// leaves the author's machine) all match. It is installed quietly when Ruxget quits or the next time it starts,
// keeping tasks, settings and shortcuts, like any update. Nothing pops up; the setting 自动更新 turns it off.
public class UpdateManifest {public string version, url, sha256, signature, notes;public long size;}
public class UpdatePending {public string version, file, sha256;}
public static class Updater {
    internal static string ManifestUrl="https://hidaydream.cloud/update/ruxget.json";
    internal static string AllowedPrefix="https://hidaydream.cloud/download/";
    internal static string PublicKey="<RSAKeyValue><Modulus>2YphrtOLG+TtkbGblAh5DhFp+Ymjn4jvfzqHzRoyQuhwImHTgE4afA3U50GOmBd16EDXFm748WrRSgQOewyci2bgFZPsVWrPf8kRiVnoq/X6eT/d/NsXkkXIgygiuzv90NFvip92MONuWzMGb2q5F/0l6d9ieo14Jnb7B1isMW/AsDX2HYw8AyB6Pg6NhCYwvoSjFt0XSbjBmpNDDAOqpefBJzk+7z2dZtgMKmprl+G/KG9xaSIJUoAmOL5RijLXcFzHLGW0EU8kKXHBjfXPWGofSvuPXWFe6Rh0LwBQu6j76UVXw5gMUhpxjRcO8w9um8guvDX2iH863/gxEyrZfrS4dNIgYjS/ubgqGA9wv8EUN76xC9XJaLdCB28evKsMyP1XmLGKFXCqlfy0Hcm0GduDcfQXs02tSfd2J7Xrta+joSq3u0GT3GkLnqccBN65y376nLhNtv8yWB+oEq+vnH+8Nqhs00DGXQvSbXhYEjV5QnJG6z3c3DxTdenPpLNJ</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>";
    internal static string CurrentVersion=Util.Version;
    internal static TimeSpan CheckEvery=TimeSpan.FromHours(20);
    const long MaxSize=80L*1024*1024;
    static readonly object gate=new object();
    // TLS 1.2 for hidaydream.cloud, whoever calls first (the task manager switches it on too).
    static Updater(){System.Net.ServicePointManager.SecurityProtocol|=(System.Net.SecurityProtocolType)3072;}
    static string Folder(string data){return Path.Combine(data,"update");}
    // Held by the setup for the whole quiet install: Ruxget, the browser bridge and a second setup stay out meanwhile.
    public const string LockName="Local\\Ruxget-Update";
    public const int MaxAttempts=3;
    public sealed class Lock : IDisposable {readonly System.Threading.Mutex mutex;internal Lock(System.Threading.Mutex mutex){this.mutex=mutex;}public void Dispose(){try{mutex.ReleaseMutex();}catch{}mutex.Dispose();}}
    public static Lock TakeLock(){var mutex=new System.Threading.Mutex(false,LockName);bool got;try{got=mutex.WaitOne(2000);}catch(System.Threading.AbandonedMutexException){got=true;}if(got)return new Lock(mutex);mutex.Dispose();return null;}
    // Only setups create the lock, so it exists exactly while one of them runs.
    public static bool Busy(){System.Threading.Mutex mutex;if(!System.Threading.Mutex.TryOpenExisting(LockName,out mutex))return false;mutex.Dispose();return true;}
    // Someone opened Ruxget while it was being updated: the setup opens it when it is done.
    public static void RequestStart(string data){try{Directory.CreateDirectory(Folder(data));File.WriteAllText(Path.Combine(Folder(data),"start-requested"),DateTime.UtcNow.ToString("o"));}catch{}}
    public static bool TakeStartRequest(string data){try{string file=Path.Combine(Folder(data),"start-requested");if(!File.Exists(file))return false;bool fresh=DateTime.UtcNow-File.GetLastWriteTimeUtc(file)<TimeSpan.FromMinutes(5);File.Delete(file);return fresh;}catch{return false;}}
    // 自动更新 as saved in settings.json (on unless turned off).
    static bool Enabled(string data){try{string file=Path.Combine(data,"settings.json");if(!File.Exists(file))return true;var saved=Util.Json().Deserialize<Settings>(Util.SettingsText(File.ReadAllText(file,Encoding.UTF8)));return saved==null||saved.AutoUpdate;}catch{return true;}}
    // How often installing this version has failed (failed.json, written by the setup).
    public static int Failures(string data,string version){try{string file=Path.Combine(Folder(data),"failed.json");if(!File.Exists(file))return 0;var failed=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(file));if(Util.Str(failed,"version")!=version)return 0;object count;return failed.TryGetValue("attempts",out count)?Convert.ToInt32(count):1;}catch{return 0;}}
    public static void RecordFailure(string data,string version,string error){try{Directory.CreateDirectory(Folder(data));int attempts=Failures(data,version)+1;File.WriteAllText(Path.Combine(Folder(data),"failed.json"),Util.Json().Serialize(new{version,attempts,error,at=DateTime.UtcNow.ToString("o")}));}catch{}}
    // 自动更新 turned off: a setup already waiting is removed too.
    public static void Discard(string data){try{string folder=Folder(data);if(!Directory.Exists(folder))return;foreach(string name in new[]{"pending.json","failed.json"}){string file=Path.Combine(folder,name);if(File.Exists(file))File.Delete(file);}foreach(var setup in Directory.GetFiles(folder,"Ruxget-*-Setup.exe"))File.Delete(setup);}catch{}}
    public static bool Newer(string candidate,string current){Version a,b;return Version.TryParse(candidate??"",out a)&&Version.TryParse(current??"",out b)&&a>b;}
    public static string Signed(UpdateManifest m){return "ruxget-update\n"+m.version+"\n"+m.url+"\n"+m.size+"\n"+(m.sha256??"").ToLowerInvariant();}
    public static bool Verify(UpdateManifest m){
        try{
            if(m==null||String.IsNullOrEmpty(m.signature)||!Regex.IsMatch(m.sha256??"","^[0-9a-fA-F]{64}$")||m.size<=0||m.size>MaxSize)return false;
            if(!(m.url??"").StartsWith(AllowedPrefix,StringComparison.Ordinal)||m.url.IndexOfAny(new[]{'\r','\n','"','\\'})>=0||m.url.Contains(".."))return false;
            using(var rsa=new System.Security.Cryptography.RSACryptoServiceProvider()){rsa.PersistKeyInCsp=false;rsa.FromXmlString(PublicKey);
                return rsa.VerifyData(Encoding.UTF8.GetBytes(Signed(m)),"SHA256",Convert.FromBase64String(m.signature));}
        }catch{return false;}
    }
    static string Sha256(string file){using(var sha=System.Security.Cryptography.SHA256.Create())using(var stream=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
    static System.Net.HttpWebRequest Request(string url,string proxy,int timeout){
        var request=(System.Net.HttpWebRequest)System.Net.WebRequest.Create(url);request.Timeout=timeout;request.ReadWriteTimeout=timeout;request.AllowAutoRedirect=false;request.KeepAlive=false;
        request.UserAgent="Ruxget/"+CurrentVersion;request.Proxy=String.IsNullOrEmpty(proxy)||new Uri(url).IsLoopback?null:new System.Net.WebProxy(proxy);return request;
    }
    // Returns what happened, for the tests: "off", "recent", "current", "invalid", "ready", "downloaded" or "failed: …".
    public static string Check(string data,bool enabled,string proxy,bool force=false){
        lock(gate){
            if(!enabled){Discard(data);return "off";}
            string folder=Folder(data),stamp=Path.Combine(folder,"checked.txt");Directory.CreateDirectory(folder);
            DateTime last;if(!force&&File.Exists(stamp)&&DateTime.TryParse(File.ReadAllText(stamp),null,System.Globalization.DateTimeStyles.RoundtripKind,out last)&&DateTime.UtcNow-last<CheckEvery)return "recent";
            File.WriteAllText(stamp,DateTime.UtcNow.ToString("o"));
            UpdateManifest manifest;
            try{using(var response=(System.Net.HttpWebResponse)Request(ManifestUrl,proxy,15000).GetResponse())using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){
                if(response.StatusCode!=System.Net.HttpStatusCode.OK)return "failed: "+(int)response.StatusCode;char[] buffer=new char[16384];int n=reader.ReadBlock(buffer,0,buffer.Length);
                manifest=Util.Json().Deserialize<UpdateManifest>(new string(buffer,0,n));}}
            catch(Exception ex){return "failed: "+ex.Message;}
            if(!Verify(manifest))return "invalid";
            if(!Newer(manifest.version,CurrentVersion))return "current";
            var pending=Pending(data);if(pending!=null&&pending.version==manifest.version)return "ready";
            string name="Ruxget-"+Regex.Replace(manifest.version,"[^0-9.]","")+"-Setup.exe",target=Path.Combine(folder,name),partial=target+".partial";
            try{
                using(var response=(System.Net.HttpWebResponse)Request(manifest.url,proxy,30000).GetResponse()){
                    if(response.StatusCode!=System.Net.HttpStatusCode.OK)return "failed: "+(int)response.StatusCode;
                    using(var input=response.GetResponseStream())using(var output=File.Create(partial)){byte[] buffer=new byte[81920];long total=0;int read;
                        while((read=input.Read(buffer,0,buffer.Length))>0){total+=read;if(total>manifest.size)throw new IOException("larger than announced");output.Write(buffer,0,read);}}
                }
                if(new FileInfo(partial).Length!=manifest.size||Sha256(partial)!=manifest.sha256.ToLowerInvariant())throw new IOException("size or checksum differs");
                if(File.Exists(target))File.Delete(target);File.Move(partial,target);
                File.WriteAllText(Path.Combine(folder,"pending.json"),Util.Json().Serialize(new UpdatePending{version=manifest.version,file=name,sha256=manifest.sha256.ToLowerInvariant()}));
                return "downloaded";
            }catch(Exception ex){try{File.Delete(partial);}catch{}return "failed: "+ex.Message;}
        }
    }
    // A verified, newer setup waiting to be installed, or null (anything stale or tampered with is removed).
    public static UpdatePending Pending(string data){
        try{
            string folder=Folder(data),file=Path.Combine(folder,"pending.json");if(!File.Exists(file))return null;
            var pending=Util.Json().Deserialize<UpdatePending>(File.ReadAllText(file));string setup=pending==null||!Regex.IsMatch(pending.file??"",@"^Ruxget-[0-9.]+-Setup\.exe$")?null:Path.Combine(folder,pending.file);
            string applying=Path.Combine(folder,"applying.json");bool cutOff=pending!=null&&pending.version==CurrentVersion&&File.Exists(applying)&&File.ReadAllText(applying).Contains("\""+pending.version+"\"");
            if(setup!=null&&(Newer(pending.version,CurrentVersion)||cutOff)&&Failures(data,pending.version)<MaxAttempts&&File.Exists(setup)&&Sha256(setup)==pending.sha256)return pending;
            File.Delete(file);if(setup!=null&&File.Exists(setup))File.Delete(setup);try{File.Delete(applying);}catch{}return null;
        }catch{return null;}
    }
    // Hands the install to the new setup (it waits for this process to end). start: open Ruxget again afterwards.
    public static bool Launch(string data,bool start,string[] startArgs){
        if(Busy())return false;
        if(!Enabled(data)){Discard(data);return false;}
        string launched=Path.Combine(Folder(data),"launched.json");
        try{if(File.Exists(launched)&&DateTime.UtcNow-File.GetLastWriteTimeUtc(launched)>TimeSpan.FromSeconds(30)){var last=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(launched));File.Delete(launched);RecordFailure(data,Util.Str(last,"version"),"the setup did not finish");}}catch{}
        var pending=Pending(data);if(pending==null||start&&Failures(data,pending.version)>0)return false;
        try{
            File.WriteAllText(launched,Util.Json().Serialize(new{version=pending.version,at=DateTime.UtcNow.ToString("o")}));
            var args=new List<string>{"--update",Process.GetCurrentProcess().Id.ToString()};if(start){args.Add("--start");args.AddRange(startArgs??new string[0]);}
            var info=new ProcessStartInfo(Path.Combine(Folder(data),pending.file),String.Join(" ",args.Select(Util.Quote))){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Folder(data)};
            Process.Start(info).Dispose();return true;
        }catch{return false;}
    }
    // After an update: the one quiet line to show, once.
    public static string TakeDoneNotice(string data){
        try{string file=Path.Combine(Folder(data),"done.json");if(!File.Exists(file))return null;var done=Util.Json().Deserialize<Dictionary<string,object>>(File.ReadAllText(file));File.Delete(file);
            foreach(var old in Directory.GetFiles(Folder(data),"Ruxget-*-Setup.exe"))try{File.Delete(old);}catch{}
            return Util.Str(done,"version")==CurrentVersion?"已更新到 "+CurrentVersion:null;}catch{return null;}
    }
}
}
