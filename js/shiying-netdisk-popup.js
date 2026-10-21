// First-use permissions are requested by an explicit extension button, never by webpage scripts.
(()=>{
 const section=document.querySelector('#netdiskEntry');if(!section)return;let provider,tab;
 const field=document.querySelector('#netdiskNote'),enable=document.querySelector('#netdiskEnable'),disable=document.querySelector('#netdiskDisable'),auth=document.querySelector('#netdiskAuthorize');
 const tMsg=(k,fb)=>{if(window.RuxgetI18n){const v=RuxgetI18n.t(k);if(v&&v!==k)return v;}return fb;};
 const note=text=>{field.textContent=text;};
 const send=async value=>{const result=await chrome.runtime.sendMessage(value);if(!result?.ok)throw new Error(result?.error||tMsg('uiNetdiskIncomplete','网盘设置未完成'));return result;};
 const nameKey={baidu:'netdiskNameBaidu',aliyun:'netdiskNameAliyun',mcloud:'netdiskNameMcloud',tcloud:'netdiskNameTcloud',xunlei:'netdiskNameXunlei',quark:'netdiskNameQuark',uc:'netdiskNameUc',pan123:'netdiskNamePan123'};
 function providerLabel(){
  const item=ShiyingNetdisk.items[provider];
  const fallback=item?.name||provider||'';
  const key=nameKey[provider];
  return key?tMsg(key,fallback):fallback;
 }
 function applyNetdiskTitle(){
  const title=document.querySelector('#netdiskTitle');if(!title||!provider)return;
  const named=tMsg('uiNetdiskTitleNamed','$1 · Ruxget 下载');
  title.textContent=named.includes('$1')?named.replace(/\$1/g,providerLabel()):(providerLabel()+' · Ruxget');
  title.setAttribute('data-i18n-live','');
  title.removeAttribute('data-i18n');
 }
 async function render(){
  const value=await send({Message:'shiyingNetdiskState',provider});
  enable.textContent=value.enabled?(value.visible===false?tMsg('uiNetdiskShowBtn','显示网盘按钮'):tMsg('uiNetdiskBtnOn','按钮已开启')):tMsg('uiNetdiskEnable','开启 Ruxget 下载');
  enable.disabled=value.enabled&&value.visible!==false;
  disable.hidden=!value.enabled;
  auth.hidden=provider!=='baidu'||!value.enabled;
  let text=value.enabled?tMsg('uiNetdiskNoteOn','在网盘中勾选文件，再点工具栏旁的“Ruxget 下载”。原下载按钮照常使用。'):tMsg('uiNetdiskNoteOff','开启后，在网盘工具栏旁显示一个“Ruxget 下载”按钮。首次需允许读取这个网盘的登录信息，并连接桌面版。');
  if(provider==='baidu'&&value.enabled){
   const cache=(await chrome.storage.local.get('shiyingNetdiskBaiduSealed')).shiyingNetdiskBaiduSealed,error=(await chrome.storage.session.get('shiyingNetdiskAuthError')).shiyingNetdiskAuthError;
   auth.textContent=cache?.expires>Date.now()?tMsg('uiNetdiskReauth','重新授权'):tMsg('uiNetdiskAuth','百度授权');
   if(cache?.expires>Date.now())text=tMsg('uiNetdiskNoteBaiduReady','百度授权已保存。在网盘中勾选文件，再点“Ruxget 下载”。');
   else if(error)text=error;
   else text=tMsg('uiNetdiskNoteBaiduNeedAuth','百度下载需先点下方“百度授权”。桌面版用 token、不传百度 Cookie，公开分享页也一样。');
  }
  note(text);applyNetdiskTitle();
 }
 enable.addEventListener('click',async()=>{try{
  const granted=await chrome.permissions.request({permissions:['nativeMessaging','cookies'],origins:ShiyingNetdisk.origins(provider)});
  if(!granted)throw new Error(tMsg('uiNetdiskDenied','未授权；网盘原来的下载方式仍可使用'));
  const ping=await chrome.runtime.sendNativeMessage('org.shiying.desktop',{action:'ping'});
  if(!ping?.netdisk||!(ping.netdiskApi>=2))throw new Error(tMsg('uiNetdiskNeedDesktop','请先安装 Ruxget 桌面版 0.4.28 或更新版本，再开启网盘下载'));
  const saved=(await chrome.storage.local.get('shiyingNetdisks')).shiyingNetdisks||{};saved[provider]={enabled:true,visible:true};await chrome.storage.local.set({shiyingNetdisks:saved});
  await send({Message:'shiyingNetdiskSync',tabId:tab.id});await render();
 }catch(error){note(/not found|forbidden|exited|Failed to start/i.test(error.message)?tMsg('uiNetdiskSetupHint','请先通过下方“安装与连接桌面版”完成安装。'):error.message);}});
 disable.addEventListener('click',async()=>{try{const saved=(await chrome.storage.local.get('shiyingNetdisks')).shiyingNetdisks||{};saved[provider]={enabled:false,visible:false};await chrome.storage.local.set({shiyingNetdisks:saved});await send({Message:'shiyingNetdiskSync',tabId:tab.id});await render();}catch(error){note(error.message);}});
 auth.addEventListener('click',()=>send({Message:'shiyingNetdiskAuthorize'}).catch(error=>note(error.message)));
 chrome.storage.onChanged.addListener(changes=>{if(provider==='baidu'&&(changes.shiyingNetdiskBaiduSealed||changes.shiyingNetdiskAuthError))render().catch(error=>note(error.message));});
 document.querySelector('#netdiskSetup').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('shiying-desktop.html')}));
 document.addEventListener('ruxget-netdisk-refresh',()=>{render().catch(error=>note(error.message));});
 document.addEventListener('ruxget-i18n-applied',()=>{applyNetdiskTitle();render().catch(error=>note(error.message));});
 (async()=>{
  const requested=Number(new URLSearchParams(location.search).get('tabId'));
  tab=Number.isInteger(requested)&&requested>0?await chrome.tabs.get(requested):(await chrome.tabs.query({active:true,currentWindow:true}))[0];
  provider=ShiyingNetdisk.site(tab?.url);if(!provider)return;
  section.hidden=false;document.body.dataset.netdisk='true';
  applyNetdiskTitle();await render();
 })().catch(error=>note(error.message));
})();
