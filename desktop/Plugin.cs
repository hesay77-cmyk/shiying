// The desktop uses the plugin's HTML/CSS components, with actions routed to Manager.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
namespace ShiyingDesktop {
public partial class MainWindow {
    Control pluginView;
    Action<string> sendPlugin;
    bool pluginReady,pluginBusy;
    string editorToken="",editorFolder="",batchFolder="";
    IDictionary<string,object> editorInput;
    public void PreparePluginLayout(){if(IsHandleCreated)throw new InvalidOperationException("Prepare the desktop layout before creating a window handle");MinimumSize=new Size(720,520);FormBorderStyle=FormBorderStyle.Sizable;MaximizeBox=true;SizeGripStyle=SizeGripStyle.Hide;resizeFrameEnabled=true;RestoreWindowSize();UpdateResizeFrame();}
    public async Task InitializePlugin(string cache,string library=null){
        if(pluginView!=null)return;
        var type=Assembly.LoadFrom(library??Path.Combine(Util.Root,"Shiying.Interface.dll")).GetType("ShiyingInterface.PluginView",true);
        pluginView=(Control)Activator.CreateInstance(type);pluginView.Dock=DockStyle.Fill;
        sendPlugin=json=>{if(!pluginView.IsDisposed)type.GetMethod("Send").Invoke(pluginView,new object[]{json});};
        type.GetEvent("Message").AddEventHandler(pluginView,new Action<string>(PluginMessage));
        type.GetEvent("FileDropped").AddEventHandler(pluginView,new Action<string>(PluginTorrentDrop));
        Controls.Add(pluginView);pluginView.BringToFront();mainSurface.Visible=miniSurface.Visible=false;
        await (Task)type.GetMethod("Initialize").Invoke(pluginView,new object[]{cache});
    }
    async void StartPlugin(){try{await InitializePlugin(Path.Combine(Util.Root,"data","interface-cache"));}catch(Exception ex){
        if(IsDisposed)return;if(pluginView!=null)pluginView.Visible=false;
        var message=new Label{Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,Padding=new Padding(24),ForeColor=Muted,Text="下载界面未能启动。\n请重新运行新版安装器，并确认已安装 Microsoft Edge WebView2。\n\n"+Util.SafeError(ex.GetBaseException().Message)};Controls.Add(message);message.BringToFront();
    }}
    void PluginSend(object value){if(pluginReady&&sendPlugin!=null&&!IsDisposed)sendPlugin(Util.Json().Serialize(value));}
    object PluginJob(Download job){
        var t=job.Transfer??new TransferInfo();bool bt=TorrentInfo.IsBt(job),active=job.Status=="下载中";string stage=job.Status;
        if((active||job.Status=="准备组件"||job.Status=="等待节点")&&!String.IsNullOrEmpty(job.Stage))stage=job.Stage;
        if(active&&!String.IsNullOrEmpty(job.Speed))stage+=" · "+job.Speed;
        string amount=t.Completed>=0?TransferData.Bytes(t.Completed)+(t.Total>=0?" / "+(t.Estimated?"约 ":"")+TransferData.Bytes(t.Total):""):"大小待确认";
        if(job.Status=="已完成"&&t.Total>=0)amount=TransferData.Bytes(t.Total);
        string btNotice=job.Status=="已暂停"?"任务已暂停；点击“继续”后才会重新寻找节点。"+(String.IsNullOrEmpty(job.BtReason)?"":" 上次状态："+job.BtReason):(job.BtReason??"")+" "+(job.BtAdvice??"");
        return new{id=job.Id,title=job.Title,url=job.Url,kind=job.Kind,status=job.Status,stage,amount,progress=job.Progress,percent=job.Progress.ToString("0.#",System.Globalization.CultureInfo.InvariantCulture),known=t.Total>0||job.Status=="已完成"||job.Status=="准备组件",active=Active(job),bt,typeLabel=bt?"BT":job.Kind=="audio"?"MP3":job.Kind=="file"?"文件":"视频",canPause=CanPause(job),canResume=CanResume(job),canForget=CanForget(job),choose=job.Status=="等待选文件",canChoose=bt&&job.HasMetadata&&new[]{"等待选文件","已暂停","失败","已完成"}.Contains(job.Status),destination=String.IsNullOrEmpty(job.File)?Util.OutputFolder(job):job.File,
            metrics=new[]{new[]{"文件大小",(t.Estimated&&t.Total>=0?"约 ":"")+TransferData.Bytes(t.Total)},new[]{"已下载",TransferData.Bytes(t.Completed)},new[]{"传输速度",active&&t.Speed>=0?TransferData.Bytes(t.Speed)+"/s":"—"},new[]{"预计剩余",TransferData.Remaining(job)},new[]{"能否续传",TransferData.ResumeText(job)},new[]{"活动连接",active&&t.Connections>=0?t.Connections+" 个":"—"}},
            segments=TransferData.Segments(job).Select(piece=>new{percent=piece.Percent,label="区间 "+piece.Number+" · "+TransferData.Bytes(piece.Completed)+" / "+TransferData.Bytes(piece.Length)}).ToArray(),segmentNote=job.Kind=="file"||bt?"收到分段信息后显示，未知数据不会推算为已完成。":"当前媒体轨进度；内核暂不提供独立分片的字节进度。",notice=!String.IsNullOrEmpty(job.Error)?job.Error:bt?btNotice:job.Kind!="file"&&job.Status!="已完成"?(String.IsNullOrEmpty(t.Scope)?"视频可能分轨下载":t.Scope)+"；最终大小以合并后的文件为准":"",error=!String.IsNullOrEmpty(job.Error),
            files=(job.BtFiles??new TorrentFileInfo[0]).Select(file=>new{index=file.Index,path=file.Path,length=file.Length,size=TransferData.Bytes(file.Length),completed=TransferData.Bytes(file.Completed),selected=file.Selected}).ToArray()};
    }
    object PluginSnapshot(){return new{type="state",version=Util.Version,jobs=manager.Snapshot().AsEnumerable().Reverse().Select(PluginJob).ToArray(),settings=manager.Config,mini=miniMode,maximized=WindowState==FormWindowState.Maximized,miniId,busy=pluginBusy||batchBusy||closingWindow};}
    void PushPluginState(){if(pluginReady)PluginSend(PluginSnapshot());}
    void PluginNotice(string text,string close=null){PluginSend(new{type="notice",text,close});}
    void PluginEditor(IDictionary<string,object> input){
        editorInput=input==null?null:new Dictionary<string,object>(input);editorToken=Guid.NewGuid().ToString("N");editorFolder=manager.Config.Folder;
        if(!pluginReady)return;string kind=input==null?"file":Util.Str(input,"kind","file"),url=input==null?"":Util.Str(input,"url");
        PluginSend(new{type="editor",context=new{token=editorToken,url,kind,height=input==null?1080:Int32.Parse(Util.Str(input,"height","1080")),locked=kind=="tracks",folder=editorFolder,categorize=manager.Config.AutoCategorize}});
    }
    bool PrepareDrop(){if(closingWindow)return false;if(pluginBusy||batchBusy||editorToken.Length>0){PluginNotice("请先确认或取消当前操作，再拖入新任务");return false;}if(miniMode)SetMini(false);return true;}
    void PluginTorrentDrop(string path){try{
        path=Path.GetFullPath(path);if(!path.EndsWith(".torrent",StringComparison.OrdinalIgnoreCase)||!File.Exists(path)||new FileInfo(path).Length>4*1024*1024)throw new Exception("请选择不超过 4 MiB 的 .torrent 文件");
        if(PrepareDrop())PluginEditor(new Dictionary<string,object>{{"url",path},{"kind","torrent"}});
    }catch(Exception ex){PluginNotice(Util.SafeError(ex.Message));}}
    string[] PluginIds(IDictionary<string,object> data){object raw;if(!data.TryGetValue("ids",out raw)||!(raw is IEnumerable))return new string[0];return ((IEnumerable)raw).Cast<object>().Select(Convert.ToString).Distinct().Take(2000).ToArray();}
    async void PluginMessage(string json){try{
        if(json.Length>3*1024*1024)throw new Exception("操作内容过长");var data=Util.Json().Deserialize<Dictionary<string,object>>(json);if(data==null)return;
        string command=Util.Str(data,"command"),id=Util.Str(data,"id");
        if(command=="ready"){pluginReady=true;PushPluginState();if(editorToken.Length>0)PluginEditor(editorInput);return;}
        if(closingWindow)return;
        if(command=="cancelEditor"){if(Util.Str(data,"token")==editorToken){editorToken="";editorInput=null;}return;}
        if(command=="mini"||command=="expand"){if(command=="mini"&&!String.IsNullOrEmpty(id))SelectTask(id);SetMini(command=="mini");return;}
        if(command=="window"){
            string action=Util.Str(data,"action");if(action=="close")Close();else if(action=="minimize")WindowState=FormWindowState.Minimized;else if(action=="maximize"){ToggleMaximize();PushPluginState();}return;
        }
        if(command=="resize"){int hit;if(Int32.TryParse(Util.Str(data,"hit"),out hit))BeginNativeResize(hit);return;}
        if(command=="hide"){HideToTray();return;}
        if(command=="next"){var jobs=manager.Snapshot();if(jobs.Count>0){int n=jobs.FindIndex(job=>job.Id==miniId);miniId=jobs[(n+1)%jobs.Count].Id;UpdateMini();PushPluginState();}return;}
        if(command=="dropRejected"){PluginNotice("未能读取拖入的种子，请重试或使用“导入 BT 种子”");return;}
        if(command=="new"||command=="dropLink"){
            if(command=="dropLink"){Uri dropped;string link=Util.Str(data,"url").Trim();if(link.Length>16384||!Uri.TryCreate(link,UriKind.Absolute,out dropped)||!new[]{"http","https","magnet"}.Contains(dropped.Scheme))throw new Exception("请拖入网页、文件下载链接或磁力链接");if(!PrepareDrop())return;}
            string url=Util.Str(data,"url").Trim(),kind=url.StartsWith("magnet:",StringComparison.OrdinalIgnoreCase)?"magnet":"file";Uri uri;if(Uri.TryCreate(url,UriKind.Absolute,out uri)&&(uri.Host=="youtu.be"||uri.Host.EndsWith("youtube.com",StringComparison.OrdinalIgnoreCase)||uri.Host.EndsWith("bilibili.com",StringComparison.OrdinalIgnoreCase)||uri.AbsolutePath.EndsWith(".m3u8")||uri.AbsolutePath.EndsWith(".mpd")))kind="video";
            PluginEditor(new Dictionary<string,object>{{"url",url},{"kind",kind}});return;
        }
        if(command=="torrent"){if(preview)return;using(var picker=TorrentPicker())if(picker.ShowDialog(this)==DialogResult.OK)PluginEditor(new Dictionary<string,object>{{"url",picker.FileName},{"kind","torrent"}});return;}
        if(command=="pickFolder"){
            string target=Util.Str(data,"target");if(!new[]{"default","editor","batch"}.Contains(target))return;if(preview)return;string picked=PickFolder(this,target=="editor"?editorFolder:target=="batch"&&!String.IsNullOrEmpty(batchFolder)?batchFolder:manager.Config.Folder);if(picked==null)return;
            if(target=="default")SetDefaultFolder(picked);else{if(target=="editor")editorFolder=picked;else batchFolder=picked;PluginSend(new{type="folder",target,path=picked});}PushPluginState();return;
        }
        if(command=="folder"){if(!preview){SelectTask(id);OpenFolder();}return;}
        if(command=="copy"){var job=manager.Snapshot().FirstOrDefault(item=>item.Id==id);if(job!=null&&!preview){Clipboard.SetText(job.Url);PluginNotice("已复制下载链接");}return;}
        if(command=="choose"){var job=manager.Snapshot().FirstOrDefault(item=>item.Id==id);if(job==null||!TorrentInfo.IsBt(job)||!job.HasMetadata)throw new Exception("正在获取种子文件列表，请稍后再试");if(!new[]{"等待选文件","已暂停","失败","已完成"}.Contains(job.Status))throw new Exception("请先暂停任务，再调整下载文件");PluginSend(new{type="bt",job=PluginJob(job)});return;}
        if(command=="components"){var lines=await Task.Run(()=>manager.Components.Specs.Select(spec=>spec.name+" · "+spec.version+" · "+(manager.Components.Ready(spec.name)?"已就绪":spec.bundled?"需要修复安装":"首次使用时自动准备")).ToArray());PluginSend(new{type="info",title="视频组件",lines=lines.Concat(new[]{"准备过程可暂停和继续；校验通过后才会使用组件。"}),action=new{label="网络设置",command="settings"}});return;}
        if(command=="about"){PluginSend(new{type="info",title="关于拾影",lines=new[]{"版本 "+Util.Version,"免费开源，无广告。"}});return;}
        if(command=="connection"){PluginSend(new{type="info",title="连接 Chrome 插件",lines=new[]{"安装时会自动登记配套插件连接。回到 Chrome 的拾影插件，点击“检查连接”即可。","如果移动了便携版或更换了插件，可点击下方修复连接。"},action=new{label="修复连接",command="repair"}});return;}
        if(command=="repair"){if(preview)return;BrowserBridge.RegisterKnown();PluginNotice("已修复连接，回到 Chrome 插件检查即可。","info");return;}
        if(command=="settings"){PluginSend(new{type="info",title="下载设置",lines=new[]{"请从右上角菜单打开“下载设置”。"}});return;}
        if(pluginBusy)return;pluginBusy=true;PushPluginState();try{
            if(command=="add"){
                if(String.IsNullOrEmpty(editorToken)||Util.Str(data,"token")!=editorToken)throw new Exception("这个确认窗口已过期，请重新添加");
                var original=editorInput;string token=editorToken,type=original!=null&&Util.Str(original,"kind")=="tracks"?"tracks":Util.Str(data,"kind"),url=type=="tracks"?Util.Str(original,"url"):Util.Str(data,"url").Trim(),folder=editorFolder;int height=type=="tracks"?Int32.Parse(Util.Str(original,"height","1080")):Convert.ToInt32(data["height"]);bool category=Convert.ToBoolean(data["categorize"]);
                if(!new[]{"file","video","audio","tracks","magnet","torrent"}.Contains(type))throw new Exception("下载类型无效");
                var added=await Task.Run(()=>type=="torrent"?manager.ImportTorrent(url,folder,category):manager.Add(url,type,original==null?"":Util.Str(original,"title"),height,folder,original,category));
                if(editorToken==token){editorToken="";editorInput=null;}PluginNotice("已添加到下载队列","editor");if(added.Status=="等待选文件")PluginSend(new{type="bt",job=PluginJob(added)});
            }else if(command=="batchAdd"){
                string urls=Util.Str(data,"urls"),type=Util.Str(data,"kind"),folder=String.IsNullOrEmpty(batchFolder)?manager.Config.Folder:batchFolder;int height=Convert.ToInt32(data["height"]);bool category=Convert.ToBoolean(data["categorize"]);if(!new[]{"file","video","audio"}.Contains(type))throw new Exception("下载类型无效");int count=await Task.Run(()=>manager.AddMany(urls,type,folder,height,category));PluginNotice("已添加 "+count+" 项任务","batchEditor");batchFolder="";
            }else if(command=="pause"||command=="resume"||command=="forget"){
                object choice;bool deleteFiles=false;if(command=="forget"){if(!data.TryGetValue("deleteFiles",out choice)||!(choice is bool))throw new Exception("请先确认是否删除文件");deleteFiles=(bool)choice;}
                var ids=PluginIds(data);var jobs=manager.Snapshot().Where(job=>ids.Contains(job.Id)).ToArray();var failures=await Task.Run(()=>{var errors=new List<string>();foreach(var job in jobs)try{if(command=="pause"&&CanPause(job))manager.Pause(job.Id);else if(command=="resume"&&CanResume(job))manager.Resume(job.Id);else if(command=="forget"){if(!CanForget(job))throw new Exception("请先暂停这个任务");manager.Forget(job.Id,deleteFiles);}}catch(Exception ex){errors.Add(job.Title+"："+ex.Message);}return errors;});if(failures.Count>0)PluginNotice(String.Join("\n",failures.Take(5)),command=="forget"?"deleteDialog":null);else if(command=="forget")PluginNotice(deleteFiles?"已删除任务及其文件":"已删除任务，文件已保留","deleteDialog");
            }else if(command=="selectFiles"){
                object raw;var indices=data.TryGetValue("indices",out raw)&&raw is IEnumerable?((IEnumerable)raw).Cast<object>().Select(Convert.ToInt32).ToArray():new int[0];await Task.Run(()=>manager.SelectBtFiles(id,indices));PluginNotice("已保存所选文件，加入下载队列","btChooser");
            }else if(command=="uiLanguage"){string lang=Util.Str(data,"value","auto");if(lang!="auto"&&lang!="en"&&lang!="zh_CN")lang="auto";manager.Config.UiLanguage=lang;await Task.Run(()=>manager.SaveSettings());PushPluginState();
            }else if(command=="settingsSave"){
                var values=data["config"] as Dictionary<string,object>;if(values==null)throw new Exception("设置内容无效");string proxy=Util.Str(values,"Proxy").Trim();if(proxy.Length>0)Util.Url(proxy);
                var next=Util.Json().Deserialize<Settings>(Util.Json().Serialize(values));next.Proxy=proxy;next.Folder=manager.Config.Folder;var previous=Util.Json().Deserialize<Settings>(Util.Json().Serialize(manager.Config));
                Action<Settings> apply=value=>{manager.Config.Proxy=value.Proxy;manager.Config.Connections=value.Connections;manager.Config.FileSlots=value.FileSlots;manager.Config.VideoSlots=value.VideoSlots;manager.Config.RateKiB=value.RateKiB;manager.Config.BtUploadKiB=value.BtUploadKiB;manager.Config.AutoCategorize=value.AutoCategorize;manager.Config.UiLanguage=(value.UiLanguage=="en"||value.UiLanguage=="zh_CN"||value.UiLanguage=="auto")?value.UiLanguage:"auto";};
                try{apply(next);await Task.Run(()=>manager.SaveSettings());}catch{apply(previous);throw;}PluginNotice("设置已保存","settings");
            }
        }finally{pluginBusy=false;RefreshJobs();}
    }catch(Exception ex){PluginNotice(Util.SafeError(ex.GetBaseException().Message));}}
}
}
