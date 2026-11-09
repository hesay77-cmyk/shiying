// 只在用户点击时申请 Native Messaging；浏览器不直接访问桌面下载引擎的 RPC。
const ShiyingNative = {
    DESKTOP_RELEASE_URL: 'https://hidaydream.cloud/ruxget/desktop/?from=ext',
    file(url,referer='') {
        url=String(url||'').trim().replace(/ /g,'%20');let parsed;
        try{parsed=new URL(url);}catch{throw new Error('请输入完整的 HTTP 或 HTTPS 下载链接');}
        if(url.length>16384||/[\u0000-\u0020\u007f]/.test(url)||!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('请使用 HTTP 或 HTTPS 下载链接；网页生成的临时文件请继续用 Chrome 保存');
        let source='';try{const page=new URL(referer);if(['http:','https:'].includes(page.protocol)&&!page.username&&!page.password)source=referer;}catch{}
        return {action:'add',kind:'file',url,referer:source,userAgent:navigator.userAgent};
    },
    // Chrome's download folder, known exactly from files Ruxget saved itself (<folder>\Ruxget\<file>).
    // Never guessed from other downloads: a wrong folder would move where the desktop app saves.
    chromeFolderFrom(file) {
        const match=/^(.*)[\\/]Ruxget[\\/][^\\/]+$/i.exec(String(file||''));
        return match&&/^([a-z]:|\\\\)/i.test(match[1])?match[1]:'';
    },
    async learnChromeFolder(file) {
        const folder=ShiyingNative.chromeFolderFrom(file);
        if(folder)await chrome.storage.local.set({ruxgetChromeFolder:folder}).catch(()=>{});
    },
    async chromeFolder() {
        try{return (await chrome.storage.local.get('ruxgetChromeFolder')).ruxgetChromeFolder||'';}catch{return '';}
    },
    msg(key, fallback) {
        try {
            // Ruxget's own language setting first (a global i18n from polyfill.js would follow Chrome's language).
            const text = (window.RuxgetI18n?.t ? RuxgetI18n.t(key) : '') || (typeof i18n === 'function' ? i18n(key) : '') || chrome.i18n.getMessage(key) || '';
            return text && text !== key ? text : fallback;
        } catch {
            return fallback;
        }
    },
    connectionIssue(error) {
        const text=String(error?.message||error);
        if (/native messaging host.*not found/i.test(text)) return 'missing';
        if (/native messaging host.*forbidden|failed to start.*native messaging host|native host has exited|error when communicating with.*native messaging host/i.test(text)) return 'connection';
        return null;
    },
    async offerDesktopDownload(reason='missing') {
        if (typeof document==='undefined'||!document.body||typeof document.createElement!=='function') {
            await chrome.tabs.create({url:chrome.runtime.getURL('shiying-get-desktop.html?reason='+reason)});
            return 'guide';
        }
        if (ShiyingNative.pendingPrompt) return ShiyingNative.pendingPrompt;
        ShiyingNative.pendingPrompt=(async()=>{
            const t=ShiyingNative.msg,missing=reason==='missing';
            // 0.4.74: the sheet follows a language switch while it is open (RuxgetI18n.live in js/shiying-locale.js).
            const say=(element,render)=>window.RuxgetI18n?.live?RuxgetI18n.live(element,render):(element.textContent=render());
            const dialog=document.createElement('dialog');
            dialog.className='link-download-sheet desktop-connect-sheet';
            dialog.id='desktopConnectPrompt';dialog.setAttribute('aria-labelledby','desktopConnectTitle');
            dialog.setAttribute('aria-describedby','desktopConnectNote');
            const title=document.createElement('h2');title.id='desktopConnectTitle';
            say(title,()=>missing?t('uiDesktopConnectionMissing','尚未连接 Ruxget 桌面版'):t('uiDesktopConnectionFailed','暂时无法连接 Ruxget 桌面版'));
            const note=document.createElement('p');note.id='desktopConnectNote';note.className='quality-note';
            say(note,()=>missing?t('uiDesktopConnectionMissingNote','如未安装，可免费下载（3 MB）；如已安装，请修复连接。也可以继续用 Chrome 下载。'):t('uiDesktopConnectionFailedNote','可能是连接权限或桌面版启动异常。请先修复连接，无需重新安装。'));
            const actions=document.createElement('div');actions.className='desktop-connect-actions';
            dialog.append(title,note,actions);
            const choice=await new Promise(resolve=>{
                for (const [value,key,label] of [['install','uiDesktopInstallAction','下载安装'],['repair','uiDesktopRepairAction','已安装，修复连接'],['chrome','uiDesktopChromeAction','继续用 Chrome']]) {
                    const button=document.createElement('button');button.type='button';button.dataset.desktopAction=value;
                    button.className=(missing?value==='install':value==='repair')?'download-button':'text-button';
                    say(button,()=>t(key,label));button.addEventListener('click',()=>dialog.close(value));actions.append(button);
                }
                dialog.addEventListener('close',()=>{const value=dialog.returnValue||'cancel';dialog.remove();resolve(value);},{once:true});
                document.body.append(dialog);dialog.showModal();
                actions.querySelector('[data-desktop-action="chrome"]').focus();
            });
            if (choice==='install') await chrome.tabs.create({url:ShiyingNative.DESKTOP_RELEASE_URL});
            if (choice==='repair') await chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html#connection')});
            if (choice==='chrome') setTimeout(()=>{
                const trigger=document.querySelector('#linkDownload[open] #linkUseChrome')||document.querySelector('#platformDownload');
                if (trigger&&!trigger.disabled) trigger.focus();
            },0);
            return choice;
        })();
        try {return await ShiyingNative.pendingPrompt;} finally {ShiyingNative.pendingPrompt=null;}
    },
    async send(payloadFactory) {
        // Already allowed: no second request, which Chrome refuses once the click's user gesture has expired.
        const granted=await chrome.permissions.contains({permissions:['nativeMessaging']})||await chrome.permissions.request({permissions:['nativeMessaging']});
        // denied: the panel names the button that still downloads (js/shiying-platform-ui.js).
        if(!granted)throw Object.assign(new Error('没有允许连接桌面版，可以继续用插件下载'),{denied:true});
        const result=await payloadFactory();
        // Every hand-off tells the desktop app where Chrome saves, so it can keep its folder beside the extension's.
        const payload=result.payload||result,folder=await ShiyingNative.chromeFolder();
        if(folder&&payload&&typeof payload==='object'&&!payload.chromeFolder)payload.chromeFolder=folder;
        // 0.4.71: this extension shows a quietly started task in 已下载, so the desktop app may start it without its window.
        if(payload&&typeof payload==='object'&&payload.action==='add')payload.quiet=true;
        let response;
        try {
            response=await chrome.runtime.sendNativeMessage('org.shiying.desktop',payload);
        } catch(error) {
            const reason=ShiyingNative.connectionIssue(error);
            if(reason) {
                const action=await ShiyingNative.offerDesktopDownload(reason);
                const handled=new Error(ShiyingNative.msg('uiDesktopConnectionPending','尚未连接桌面版，可以继续用 Chrome 下载'));
                handled.cancelled=true;handled.desktopAction=action;handled.connectionIssue=reason;
                throw handled;
            }
            throw error;
        }
        if(!response?.ok)throw new Error(response?.error||'桌面版未接收任务');
        // A task handed over by hand shows on the icon once the desktop starts it.
        // Never lets the hand-off itself fail.
        // 0.4.70 desktop: the task starts at once and comes back with its id; 已下载 lists it from now on.
        if(payload?.action==='add'&&response.id){try{if(typeof RuxgetDesktopTasks!=='undefined')await RuxgetDesktopTasks.remember(response.id,response.name);else await chrome.runtime.sendMessage({Message:'ruxgetDesktopRemember',id:response.id,name:response.name});}catch{}}
        if(['add','netdisk'].includes(payload?.action)){try{if(typeof RuxgetDesktopTasks!=='undefined')RuxgetDesktopTasks.watch(60000).catch(()=>{});else chrome.runtime.sendMessage({Message:'ruxgetDesktopWatch'}).catch(()=>{});}catch{}}
        return response;
    }
};
