using System;
using System.IO;
using System.Linq;
using System.Threading;
using ShiyingDesktop;
class CollectionChecks {
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static int Main(string[] args){try{
        string root=args[0];Directory.CreateDirectory(root);
        var list=Playlist.Parse(File.ReadAllText(args[1]));Check(list.entries.Length==3,"real flat-playlist response");
        Check(Playlist.Source("https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890")=="https://www.youtube.com/playlist?list=PL1234567890","canonical source");
        foreach(string source in new[]{"https://youtube.com.evil.test/playlist?list=PL1234567890","http://www.youtube.com/playlist?list=PL1234567890","https://user:pass@www.youtube.com/playlist?list=PL1234567890"}){bool rejected=false;try{Playlist.Source(source);}catch{rejected=true;}Check(rejected,"source boundary");}
        using(var manager=new Manager(Path.Combine(root,"data"))){
            Check(manager.Snapshot().Count==0,"read creates no jobs");
            var gate=(SemaphoreSlim)typeof(ComponentStore).GetField("prepareGate",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(manager.Components);
            gate.Wait();try{using(var cancel=new CancellationTokenSource()){cancel.CancelAfter(30);bool cancelled=false;try{manager.Components.Ensure(new string[0],"",null,cancel.Token);}catch(OperationCanceledException){cancelled=true;}Check(cancelled&&gate.CurrentCount==0,"component wait cancels without releasing another operation");}}finally{gate.Release();}

            var invalid=new[]{list.entries[0],new PlaylistEntry{url="file:///bad",title="invalid",available=true}};
            bool rejected=false;try{manager.AddPlaylist(invalid,"video",root,1080,false);}catch{rejected=true;}Check(rejected&&manager.Snapshot().Count==0,"atomic validation");
            int count=manager.AddPlaylist(new[]{list.entries[2],list.entries[0]},"audio",root,720,false);Check(count==2,"selected entries only");
            var saved=manager.Snapshot();Check(saved.Count==2&&saved[0].Url==list.entries[2].url&&saved[1].Url==list.entries[0].url,"order preserved");Check(saved.All(j=>j.Kind=="audio"&&j.Height==720),"format preserved");
        }
        using(var reopened=new Manager(Path.Combine(root,"data")))Check(reopened.Snapshot().Count==2,"persisted selected jobs");
        Console.WriteLine("PASS desktop source validation, real metadata parsing, no task on read, atomic selection, titles/order/format and persistence");
        return 0;
    }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
