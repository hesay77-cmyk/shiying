// GPL-3.0. Concrete optional origins can be added or removed by the user.
const siteForm=document.querySelector('#sitePermissionForm'),siteStatus=document.querySelector('#sitePermissionStatus');
async function showGrantedSites(){
 await ShiyingAccess.sync();
 const data=await chrome.permissions.getAll(),required=chrome.runtime.getManifest().host_permissions||[];
 const list=document.querySelector('#grantedSites');list.replaceChildren();
 for(const origin of (data.origins||[]).filter(origin=>!required.includes(origin))){
  const item=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');
  name.textContent=origin.replace(/\/\*$/,'');remove.textContent='撤销';remove.type='button';
  remove.addEventListener('click',async()=>{try{await chrome.permissions.remove({origins:[origin]});const result=await chrome.runtime.sendMessage({Message:'shiyingSyncAccess'});if(!result?.ok)throw new Error(result?.error||'权限更新失败');await showGrantedSites();siteStatus.textContent='已撤销。已打开网页中的旧脚本会在刷新或关闭网页后退出。'}catch(error){siteStatus.textContent=error.message}});
  item.append(name,remove);list.append(item);
 }
 if(!list.children.length){const item=document.createElement('li');item.textContent='尚未允许其他网站。';list.append(item)}
}
siteForm.addEventListener('submit',event=>{
 event.preventDefault();const origin=ShiyingAccess.origin(document.querySelector('#sitePermissionURL').value);
 if(!origin){siteStatus.textContent='请填写 HTTP 或 HTTPS 网站网址';return;}
 ShiyingAccess.request([origin]).then(async granted=>{
  if(!granted){siteStatus.textContent='未授权，网站访问范围保持原样。';return;}
  const result=await chrome.runtime.sendMessage({Message:'shiyingSyncAccess'});if(!result?.ok)throw new Error(result?.error||'权限更新失败');
  await showGrantedSites();siteStatus.textContent='已允许此网站，刷新相关网页后即可使用。';
 }).catch(error=>{siteStatus.textContent=error.message});
});
showGrantedSites().catch(error=>{siteStatus.textContent=error.message});
