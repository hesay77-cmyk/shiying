// Isolated rendering adapter. The download executable has no browser engine dependency.
using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
namespace ShiyingInterface {
public class PluginView:UserControl {
    readonly WebView2 browser=new WebView2();
    public string Diagnostics="initializing";
    public event Action<string> Message;
    public event Action<string> FileDropped;
    public PluginView(){SetStyle(ControlStyles.SupportsTransparentBackColor,true);BackColor=System.Drawing.Color.Transparent;browser.DefaultBackgroundColor=System.Drawing.Color.Transparent;browser.Dock=DockStyle.Fill;Controls.Add(browser);}
    static string Read(string name){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(name))using(var reader=new StreamReader(stream,System.Text.Encoding.UTF8))return reader.ReadToEnd();}
    public static string Document(){string nonce=Guid.NewGuid().ToString("N");return Read("Interface.html").Replace("__PLUGIN_CSS__",Read("Plugin.css")).Replace("__DESKTOP_CSS__",Read("Interface.css")).Replace("__ICON__","data:image/svg+xml;base64,"+Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(Read("Icon.svg")))).Replace("__DESKTOP_JS__",Read("Interface.js")).Replace("__NONCE__",nonce);}
    public async Task Initialize(string cache){
        var environment=await CoreWebView2Environment.CreateAsync(null,cache,new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-component-update --disable-features=msSmartScreenProtection"));
        await browser.EnsureCoreWebView2Async(environment);var core=browser.CoreWebView2;
        string html=Document(),documentUri="data:text/html;charset=utf-8;base64,"+Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(html));
        core.Settings.IsNonClientRegionSupportEnabled=true;core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;core.Settings.IsPasswordAutosaveEnabled=false;core.Settings.IsGeneralAutofillEnabled=false;
        core.NewWindowRequested+=(s,e)=>e.Handled=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;core.DownloadStarting+=(s,e)=>e.Cancel=true;
        core.NavigationStarting+=(s,e)=>{Diagnostics="navigating "+e.Uri.Substring(0,Math.Min(60,e.Uri.Length));if(e.Uri!="about:blank"&&e.Uri!=documentUri)e.Cancel=true;};
        core.NavigationCompleted+=(s,e)=>Diagnostics+=" | navigation "+e.IsSuccess+" "+e.WebErrorStatus;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(s,e)=>{if(Diagnostics.Length<2000)Diagnostics+=" | request "+e.Request.Uri;if(!e.Request.Uri.StartsWith("data:",StringComparison.OrdinalIgnoreCase)&&e.Request.Uri!="about:blank")e.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Local interface only","");};
        core.WebMessageReceived+=(s,e)=>{
            Diagnostics="message received";if(e.Source!="about:blank"&&e.Source!=documentUri)return;
            if(e.WebMessageAsJson=="\"shiying-drop-torrent\""){
                try{var objects=e.AdditionalObjects;if(objects.Count!=1||!(objects[0] is CoreWebView2File))throw new InvalidOperationException();if(FileDropped!=null)FileDropped(((CoreWebView2File)objects[0]).Path);}
                catch{if(Message!=null)Message("{\"command\":\"dropRejected\"}");}return;
            }
            if(Message!=null)Message(e.WebMessageAsJson);
        };
        core.NavigateToString(html);
    }
    public void Send(string message){if(browser.CoreWebView2!=null)browser.CoreWebView2.PostWebMessageAsJson(message);}
    public Task<string> Evaluate(string script){return browser.CoreWebView2.ExecuteScriptAsync(script);}
    public async Task CapturePreview(string path){using(var stream=File.Create(path))await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);}
    protected override void Dispose(bool disposing){if(disposing)browser.Dispose();base.Dispose(disposing);}
}
}
