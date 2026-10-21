// GPL-3.0. Concrete optional origins can be added or removed by the user.
const siteForm=document.querySelector('#sitePermissionForm'),siteStatus=document.querySelector('#sitePermissionStatus');
async function showGrantedSites(){
 await ShiyingAccess.sync();
 const data=await chrome.permissions.getAll(),required=chrome.runtime.getManifest().host_permissions||[];
 const list=document.querySelector('#grantedSites');list.replaceChildren();
 for(const origin of (data.origins||[]).filter(origin=>!required.includes(origin))){
  const item=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');
  name.textContent=origin.replace(/\/\*$/,'');remove.textContent=(window.RuxgetI18n?RuxgetI18n.pick('撤销',"Revoke"):'撤销');remove.type='button';
  remove.addEventListener('click',async()=>{try{await chrome.permissions.remove({origins:[origin]});const result=await chrome.runtime.sendMessage({Message:'shiyingSyncAccess'});if(!result?.ok)throw new Error(result?.error||(window.RuxgetI18n?RuxgetI18n.pick('权限更新失败',"Couldn’t update the permission"):'权限更新失败'));await showGrantedSites();siteStatus.textContent=(window.RuxgetI18n?RuxgetI18n.pick('已撤销。已打开网页中的旧脚本会在刷新或关闭网页后退出。',"Revoked. Scripts already on open pages stop after a refresh or close."):'已撤销。已打开网页中的旧脚本会在刷新或关闭网页后退出。')}catch(error){siteStatus.textContent=error.message}});
  item.append(name,remove);list.append(item);
 }
 if(!list.children.length){const item=document.createElement('li');item.textContent=(window.RuxgetI18n?RuxgetI18n.pick('尚未允许其他网站。',"No other sites allowed yet."):'尚未允许其他网站。');list.append(item)}
}
siteForm.addEventListener('submit',event=>{
 event.preventDefault();const origin=ShiyingAccess.origin(document.querySelector('#sitePermissionURL').value);
 if(!origin){siteStatus.textContent=(window.RuxgetI18n?RuxgetI18n.pick('请填写 HTTP 或 HTTPS 网站网址',"Enter an HTTP or HTTPS address"):'请填写 HTTP 或 HTTPS 网站网址');return;}
 ShiyingAccess.request([origin]).then(async granted=>{
  if(!granted){siteStatus.textContent=(window.RuxgetI18n?RuxgetI18n.pick('未授权，网站访问范围保持原样。',"Not allowed; site access is unchanged."):'未授权，网站访问范围保持原样。');return;}
  const result=await chrome.runtime.sendMessage({Message:'shiyingSyncAccess'});if(!result?.ok)throw new Error(result?.error||(window.RuxgetI18n?RuxgetI18n.pick('权限更新失败',"Couldn’t update the permission"):'权限更新失败'));
  await showGrantedSites();siteStatus.textContent=(window.RuxgetI18n?RuxgetI18n.pick('已允许此网站，刷新相关网页后即可使用。',"Allowed. Refresh the page to use it."):'已允许此网站，刷新相关网页后即可使用。');
 }).catch(error=>{siteStatus.textContent=error.message});
});
showGrantedSites().catch(error=>{siteStatus.textContent=error.message});
