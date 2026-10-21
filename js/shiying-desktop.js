// Desktop UI bindings; the explicit native bridge is shared with the link menu.
const ShiyingDesktop=ShiyingNative;
document.querySelector('#desktopHelp')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html')}));
document.querySelector('#platformDesktop')?.addEventListener('click',()=>{
    ShiyingDesktop.send(()=>ShiyingPlatformUI.desktop()).then(()=>{
        document.querySelector('#platformNote').textContent='已交给Ruxget桌面版，请在桌面窗口确认下载';
    }).catch(error=>{if(error.cancelled)return;const field=document.querySelector('#platformError');field.textContent=error.message;field.hidden=false;});
});
const desktopId=document.querySelector('#desktopExtensionId');
if(desktopId){desktopId.textContent=chrome.runtime.id;document.querySelector('#copyDesktopId').addEventListener('click',async()=>{await navigator.clipboard.writeText(chrome.runtime.id);document.querySelector('#copyDesktopId').textContent='已复制';});}
const connectionStatus=document.querySelector('#desktopConnectionStatus');
if(connectionStatus){
    const check=document.querySelector('#checkDesktopConnection');
    document.querySelector('#pairDesktop').href=`shiying-desktop://pair/${chrome.runtime.id}`;
    async function checkConnection(requestPermission=false){
        check.disabled=true;connectionStatus.dataset.state='';
        connectionStatus.textContent='正在检查连接…';
        try{
            const granted=requestPermission
                ?await chrome.permissions.request({permissions:['nativeMessaging']})
                :await chrome.permissions.contains({permissions:['nativeMessaging']});
            if(!granted){connectionStatus.textContent='点击「检查连接」，允许Ruxget与本机桌面版通信。';return;}
            const result=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});
            if(!result?.ok)throw new Error(result?.error||'连接未完成');
            connectionStatus.dataset.state='ready';
            connectionStatus.textContent=`已连接Ruxget桌面版${result.version?' '+result.version:''}。回到视频页即可发送下载。`;
        }catch{
            connectionStatus.dataset.state='missing';
            connectionStatus.textContent='还未连接。请按上方安装步骤运行Ruxget安装器；已经装好可点「一键重新配对」，完成后再次检查。常见问题见下方说明。';
        }finally{check.disabled=false;}
    }
    check.addEventListener('click',()=>checkConnection(true));
    checkConnection();
}
