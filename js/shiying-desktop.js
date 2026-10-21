// Desktop UI bindings; the explicit native bridge is shared with the link menu.
const ShiyingDesktop=ShiyingNative;
document.querySelector('#desktopHelp')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html')}));
// Brings the desktop window forward (starting the app if needed). Not installed or not connected: the shared prompt offers the download page.
document.querySelector('#openDesktop')?.addEventListener('click',async()=>{
    const menu=document.querySelector('.menu');if(menu)menu.open=false;
    try{await ShiyingNative.send(()=>({action:'show'}));window.close();}
    catch(error){if(!error.cancelled&&typeof notify==='function')notify(error.message||String(error));}
});
document.querySelector('#takeoverMenu')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html#takeover')}));
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
        if(location.hash==='#takeover'){
            const card=document.querySelector('#takeover');
            if(step==='done'&&card&&!card.dataset.shown){card.dataset.shown='1';card.classList.add('is-highlight');requestAnimationFrame(()=>card.scrollIntoView({block:'center',behavior:'smooth'}));}
            else if(step!=='done')connectionStatus.textContent=[status,pick('接管 Chrome 下载需要先装好并连接桌面版，连上后开关会出现在这里。','Taking over Chrome downloads needs the desktop app installed and connected; the switch appears here once it is.')].filter(Boolean).join(' ');
        }
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
const takeoverSwitch=document.querySelector('#takeoverEnabled');
if(takeoverSwitch&&chrome.storage?.local){
    // Takeover settings live in storage.local under ruxgetTakeover; js/shiying-takeover.js reads them per download.
    const KEY='ruxgetTakeover',LOG='ruxgetTakeoverLog',options=document.querySelector('#takeoverOptions'),status=document.querySelector('#takeoverStatus');
    const min=document.querySelector('#takeoverMin'),skip=document.querySelector('#takeoverSkip'),log=document.querySelector('#takeoverLog');
    const read=async()=>Object.assign({enabled:false,minMB:1,skipHosts:[]},(await chrome.storage.local.get(KEY))[KEY]||{});
    const save=async patch=>chrome.storage.local.set({[KEY]:Object.assign(await read(),patch)});
    const hosts=text=>[...new Set(text.split(/[\s,，]+/).map(entry=>entry.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/[/:].*$/,'')).filter(Boolean))].slice(0,200);
    async function render(){
        const config=await read();
        takeoverSwitch.checked=!!config.enabled;options.hidden=!config.enabled;
        if(document.activeElement!==min)min.value=config.minMB;
        if(document.activeElement!==skip)skip.value=(config.skipHosts||[]).join('\n');
        let entries=[];try{entries=(await chrome.storage.session.get(LOG))[LOG]||[];}catch{}
        log.replaceChildren(...entries.map(entry=>{const item=document.createElement('li');item.className=entry.result==='desktop'?'is-desktop':'';item.textContent=(entry.result==='desktop'?pick('已交给桌面版：','Sent to the desktop app: '):pick('留在 Chrome：','Kept in Chrome: '))+(entry.name||entry.url);item.title=entry.url;return item;}));
    }
    takeoverSwitch.addEventListener('change',async()=>{
        const on=takeoverSwitch.checked;status.textContent='';
        // Chrome only shows the permission prompt inside the click, so ask before anything awaits.
        if(on&&!await chrome.permissions.request({permissions:['nativeMessaging']})){takeoverSwitch.checked=false;status.textContent=pick('没有允许连接桌面版，接管未打开。','The connection wasn’t allowed, so takeover is still off.');return;}
        await save({enabled:on});status.textContent=on?pick('已打开。网页上的下载会交给桌面版。','On. Downloads from web pages now go to the desktop app.'):pick('已关闭。下载回到 Chrome。','Off. Downloads stay in Chrome.');render();
    });
    min.addEventListener('change',()=>{const value=Math.min(1024,Math.max(0,Math.round(Number(min.value)||0)));min.value=value;save({minMB:value});});
    skip.addEventListener('change',()=>{const list=hosts(skip.value);skip.value=list.join('\n');save({skipHosts:list});});
    chrome.storage.onChanged.addListener((changes,area)=>{if(changes[KEY]||changes[LOG])render();});
    render();
}
