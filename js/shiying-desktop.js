// Desktop UI bindings; the explicit native bridge is shared with the link menu.
const ShiyingDesktop=ShiyingNative;
document.querySelector('#desktopHelp')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html')}));
const pick=(zh,en)=>window.RuxgetI18n?RuxgetI18n.pick(zh,en):zh;
const desktopId=document.querySelector('#desktopExtensionId');
if(desktopId){desktopId.textContent=chrome.runtime.id;document.querySelector('#copyDesktopId').addEventListener('click',async()=>{await navigator.clipboard.writeText(chrome.runtime.id);document.querySelector('#copyDesktopId').textContent=pick('已复制','Copied');});}
const connectionStatus=document.querySelector('#desktopConnectionStatus');
if(connectionStatus){
    // Setup wizard: install → connect → done. Only a click may ask for the native permission;
    // once it is granted the page re-checks every few seconds so finishing the installer or pairing advances on its own.
    const steps=['install','connect','done'],buttons=()=>document.querySelectorAll('#checkDesktopConnection,[data-recheck]');
    let checking=false,granted=false,timer=0;
    document.querySelector('#pairDesktop').href=`shiying-desktop://pair/${chrome.runtime.id}`;
    function show(step,status,version=''){
        document.body.dataset.step=step;
        const current=steps.indexOf(step);
        document.querySelectorAll('.wizard-steps [data-step]').forEach(item=>{const index=steps.indexOf(item.dataset.step);item.classList.toggle('is-done',index<current||step==='done');item.classList.toggle('is-current',index===current);if(index===current)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
        document.querySelectorAll('.wizard-panel').forEach(panel=>{const visible=panel.dataset.panel===step;if(panel.hidden===visible)panel.hidden=!visible;});
        document.querySelector('#desktopVersion').textContent=version;
        connectionStatus.dataset.state=step==='done'?'ready':step==='install'?'missing':step;
        connectionStatus.textContent=status;
    }
    function schedule(){clearTimeout(timer);if(granted&&!document.hidden&&document.body.dataset.step!=='done')timer=setTimeout(()=>checkConnection(false),3000);}
    async function checkConnection(requestPermission=false){
        if(checking)return;checking=true;buttons().forEach(button=>button.disabled=true);
        try{
            granted=requestPermission
                ?await chrome.permissions.request({permissions:['nativeMessaging']})
                :await chrome.permissions.contains({permissions:['nativeMessaging']});
            if(!granted){show('install',requestPermission?pick('没有允许连接。装好桌面版后，再点「我已经装好了」并选择允许。','The connection wasn’t allowed. After installing, click “I’ve installed it” and allow it.'):'');return;}
            const result=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});
            if(!result?.ok)throw new Error(result?.error||'连接未完成');
            show('done','',result.version?'v'+result.version:'');
        }catch(error){
            const missing=ShiyingNative.connectionIssue(error)==='missing';
            show(missing?'install':'connect',missing?(requestPermission?pick('还没检测到桌面版。安装完成后，这里会自动进入下一步。','The desktop app isn’t detected yet. This page moves on once it’s installed.'):pick('正在等待安装完成…','Waiting for the installation…')):pick('正在等待连接…','Waiting for the connection…'));
        }finally{checking=false;buttons().forEach(button=>button.disabled=false);schedule();}
    }
    document.querySelector('#checkDesktopConnection').addEventListener('click',()=>checkConnection(true));
    document.querySelectorAll('[data-recheck]').forEach(button=>button.addEventListener('click',()=>checkConnection(true)));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkConnection(false);else clearTimeout(timer);});
    // Wait for the language so the first status line is already translated.
    (window.RuxgetI18n?RuxgetI18n.ready():Promise.resolve()).catch(()=>{}).then(()=>checkConnection());
}
