// 只在用户点击时申请 Native Messaging；浏览器不直接访问桌面下载引擎的 RPC。
const ShiyingNative = {
    DESKTOP_RELEASE_URL: 'https://hidaydream.com/tools/ruxget/#editions',
    file(url,referer='') {
        url=String(url||'').trim();let parsed;
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
            const text = (typeof i18n === 'function' ? i18n(key) : '') || chrome.i18n.getMessage(key) || '';
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
            const dialog=document.createElement('dialog');
            dialog.className='link-download-sheet desktop-connect-sheet';
            dialog.id='desktopConnectPrompt';dialog.setAttribute('aria-labelledby','desktopConnectTitle');
            dialog.setAttribute('aria-describedby','desktopConnectNote');
            const title=document.createElement('h2');title.id='desktopConnectTitle';
            title.textContent=missing?t('uiDesktopConnectionMissing','还没有连接桌面下载器'):t('uiDesktopConnectionFailed','桌面下载器暂时无法连接');
            const note=document.createElement('p');note.id='desktopConnectNote';note.className='quality-note';
            note.textContent=missing?t('uiDesktopConnectionMissingNote','尚未安装可以下载；已经安装，请检查或重新配对。也可以继续使用 Chrome 下载。'):t('uiDesktopConnectionFailedNote','可能是配对权限或程序启动异常，请先修复连接，无需反复下载安装。');
            const actions=document.createElement('div');actions.className='desktop-connect-actions';
            dialog.append(title,note,actions);
            const choice=await new Promise(resolve=>{
                for (const [value,key,label] of [['install','uiDesktopInstallAction','下载安装'],['repair','uiDesktopRepairAction','已安装，修复连接'],['chrome','uiDesktopChromeAction','继续用 Chrome']]) {
                    const button=document.createElement('button');button.type='button';button.dataset.desktopAction=value;
                    button.className=(missing?value==='install':value==='repair')?'download-button':'text-button';
                    button.textContent=t(key,label);button.addEventListener('click',()=>dialog.close(value));actions.append(button);
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
        const granted=await chrome.permissions.request({permissions:['nativeMessaging']});
        if(!granted)throw new Error('未允许连接桌面版，仍可使用原有下载入口');
        const result=await payloadFactory();
        // Every hand-off tells the desktop app where Chrome saves, so it can keep its folder beside the extension's.
        const payload=result.payload||result,folder=await ShiyingNative.chromeFolder();
        if(folder&&payload&&typeof payload==='object'&&!payload.chromeFolder)payload.chromeFolder=folder;
        let response;
        try {
            response=await chrome.runtime.sendNativeMessage('org.shiying.desktop',payload);
        } catch(error) {
            const reason=ShiyingNative.connectionIssue(error);
            if(reason) {
                const action=await ShiyingNative.offerDesktopDownload(reason);
                const handled=new Error(ShiyingNative.msg('uiDesktopConnectionPending','桌面连接尚未完成，可以继续使用 Chrome 下载'));
                handled.cancelled=true;handled.desktopAction=action;handled.connectionIssue=reason;
                throw handled;
            }
            throw error;
        }
        if(!response?.ok)throw new Error(response?.error||'桌面版未接收任务');
        return response;
    }
};
