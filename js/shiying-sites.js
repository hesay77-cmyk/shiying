// GPL-3.0. Concrete optional origins can be added or removed by the user.
const siteForm=document.querySelector('#sitePermissionForm'),siteStatus=document.querySelector('#sitePermissionStatus');
// 0.4.74: these texts follow a language switch while the page is open (RuxgetI18n.live in js/shiying-locale.js).
const siteSay=(element,zh,en)=>window.RuxgetI18n?.live?RuxgetI18n.live(element,()=>RuxgetI18n.pick(zh,en)):(element.textContent=zh);
async function showGrantedSites(){
 // Wait for the page language first, or the English page can show a Chinese line.
 if(window.RuxgetI18n?.ready)await RuxgetI18n.ready().catch(()=>{});
 await ShiyingAccess.sync();
 const data=await chrome.permissions.getAll(),required=chrome.runtime.getManifest().host_permissions||[];
 const list=document.querySelector('#grantedSites');list.replaceChildren();
 for(const origin of (data.origins||[]).filter(origin=>!required.includes(origin))){
  const item=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');
  name.textContent=origin.replace(/\/\*$/,'');siteSay(remove,'撤销',"Revoke");remove.type='button';
  remove.addEventListener('click',async()=>{try{await chrome.permissions.remove({origins:[origin]});const result=await chrome.runtime.sendMessage({Message:'shiyingSyncAccess'});if(!result?.ok)throw new Error(result?.error||(window.RuxgetI18n?RuxgetI18n.pick('权限更新失败',"Couldn’t update the permission"):'权限更新失败'));await showGrantedSites();siteSay(siteStatus,'已撤销。已打开网页中的旧脚本会在刷新或关闭网页后退出。',"Revoked. Scripts already on open pages stop after a refresh or close.")}catch(error){siteStatus.textContent=error.message}});
  item.append(name,remove);list.append(item);
 }
 if(!list.children.length){const item=document.createElement('li');siteSay(item,'尚未允许其他网站。',"No other sites allowed yet.");list.append(item)}
}
siteForm.addEventListener('submit',event=>{
 event.preventDefault();const origin=ShiyingAccess.origin(document.querySelector('#sitePermissionURL').value);
 if(!origin){siteSay(siteStatus,'请填写 HTTP 或 HTTPS 网站网址',"Enter an HTTP or HTTPS address");return;}
 ShiyingAccess.request([origin]).then(async granted=>{
  if(!granted){siteSay(siteStatus,'未获得访问权限，网站权限没有变化。',"Access wasn’t allowed; site permissions are unchanged.");return;}
  const result=await chrome.runtime.sendMessage({Message:'shiyingSyncAccess'});if(!result?.ok)throw new Error(result?.error||(window.RuxgetI18n?RuxgetI18n.pick('权限更新失败',"Couldn’t update the permission"):'权限更新失败'));
  await showGrantedSites();siteSay(siteStatus,'已允许此网站，刷新相关网页后即可使用。',"Allowed. Refresh the page to use it.");
 }).catch(error=>{siteStatus.textContent=error.message});
});
showGrantedSites().catch(error=>{siteStatus.textContent=error.message});
