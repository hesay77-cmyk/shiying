// A bounded sheet inside the popup. Nothing downloads until its primary action is used.
window.ShiyingCollectionUI=(()=>{
    const $=id=>document.getElementById(id), say=(zh,en)=>RuxgetI18n.pick(zh,en);
    let catalog=null,reading=0,starting=false,stopping=false,lastQueue=null;
    const send=async(Message,extra={})=>{const r=await chrome.runtime.sendMessage({Message,...extra});if(!r?.ok)throw new Error(r?.error||say('操作未完成，请重试','Could not finish. Try again.'));return r;};
    function summary(){
        const inputs=[...$('collectionItems').querySelectorAll('input:not(:disabled)')], chosen=inputs.filter(i=>i.checked);
        $('collectionAll').checked=!!inputs.length&&chosen.length===inputs.length;
        $('collectionAll').indeterminate=chosen.length>0&&chosen.length<inputs.length;
        $('collectionSelected').textContent=say('已选 '+chosen.length+' / '+inputs.length,chosen.length+' / '+inputs.length+' selected');
        $('collectionStart').disabled=starting||!chosen.length;
        $('collectionStart').textContent=say('下载所选 '+chosen.length+' 项','Download '+chosen.length+' selected');
        $('collectionHeight').hidden=$('collectionFormat').value==='mp3';
        queueView(lastQueue);
    }
    function queueView(queue){
        lastQueue=queue;
        const active=queue&&!queue.paused&&queue.items.some(i=>['waiting','reading','running'].includes(i.status));
        $('collectionQueue').hidden=!queue;
        if(!queue)return;
        const done=queue.items.filter(i=>i.status==='complete').length,failed=queue.items.filter(i=>i.status==='error').length;
        const phase=queue.paused?say('已停止','Stopped'):active?say('正在下载','Downloading'):failed?say('已结束','Finished'):say('已完成','Completed');
        $('collectionQueueText').textContent=say(`${phase} ${done} / ${queue.items.length} 项${failed?'，失败 '+failed+' 项':''}`,`${phase} ${done} / ${queue.items.length}${failed?', '+failed+' failed':''}`);
        $('collectionStop').hidden=!active;
        $('collectionStop').disabled=stopping;
        const errors=queue.items.filter(i=>i.error);
        $('collectionFailures').textContent=errors.map(i=>i.title+': '+RuxgetText.tr(i.error)).join('\n');
        $('collectionFailures').hidden=!errors.length;
    }
    async function open(url,replace=false){
        if(url&&(!$('collectionURL').value||replace)){$('collectionURL').value=url;catalog=null;$('collectionList').hidden=true;}
        $('collectionError').hidden=true;
        if(!$('collectionSheet').open)$('collectionSheet').showModal();
        try{queueView((await send('shiyingCollectionState')).queue);}catch{}
    }
    $('collectionMenu').onclick=()=>open(ShiyingPlatformUI.url());
    $('collectionOpen').onclick=()=>open(ShiyingPlatformUI.url());
    $('collectionClose').onclick=()=>{$('collectionSheet').close();};
    $('collectionSheet').addEventListener('close',()=>{reading++;$('collectionRead').disabled=false;$('collectionRead').textContent=say('读取列表','Read list');});
    $('collectionURL').addEventListener('input',()=>{catalog=null;reading++;$('collectionList').hidden=true;$('collectionRead').disabled=false;$('collectionRead').textContent=say('读取列表','Read list');});
    $('collectionForm').onsubmit=async event=>{
        event.preventDefault();const serial=++reading;catalog=null;$('collectionList').hidden=true;$('collectionError').hidden=true;$('collectionRead').disabled=true;
        $('collectionRead').textContent=say('读取中…','Reading…');
        try{
            const result=await send('shiyingCollectionRead',{url:$('collectionURL').value.trim()});if(serial!==reading)return;
            catalog=result;$('collectionSearch').value='';$('collectionTitle').textContent=result.title;$('collectionItems').replaceChildren();
            result.entries.forEach((item,index)=>{
                const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
                check.type='checkbox';check.value=index;check.disabled=!item.available;check.addEventListener('change',summary);
                text.textContent=item.title;text.title=item.title;
                const note=document.createElement('small');note.textContent=item.available?item.duration||'':say('暂不可用','Unavailable');text.append(note);
                label.append(check,text);$('collectionItems').append(label);
            });
            $('collectionLimit').textContent=result.hasMore?say('这个视频超过 1000 P，这里只载入了前 1000 项，后面的不会下载。','This video has more than 1000 parts. Only the first 1000 are loaded; later parts will not be downloaded.'):say('先勾选需要的条目，再开始下载。','Choose the items you want, then start.');
            // A truncated list must not read as "everything selected".
            const loaded=$('collectionItems').querySelectorAll('input:not(:disabled)').length;$('collectionLimit').classList.toggle('warn',!!result.hasMore);
            $('collectionAll').nextElementSibling.textContent=result.hasMore?say('全选已载入的 '+loaded+' 项','Select all '+loaded+' loaded'):say('全选','Select all');
            $('collectionList').hidden=false;summary();
        }catch(error){if(serial!==reading)return;$('collectionError').textContent=RuxgetText.tr(error.message);$('collectionError').hidden=false;}
        finally{if(serial===reading){$('collectionRead').disabled=false;$('collectionRead').textContent=say('读取列表','Read list');}}
    };
    $('collectionAll').onchange=()=>{$('collectionItems').querySelectorAll('input:not(:disabled)').forEach(i=>i.checked=$('collectionAll').checked);summary();};
    $('collectionSearch').oninput=()=>{const query=$('collectionSearch').value.trim().toLowerCase();$('collectionItems').querySelectorAll('label').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(query));};
    $('collectionFormat').onchange=summary;
    $('collectionStart').onclick=async()=>{
        if(!catalog||starting)return;const chosenCatalog=catalog;starting=true;summary();$('collectionError').hidden=true;
        try{
            const indices=[...$('collectionItems').querySelectorAll('input:checked')].map(i=>Number(i.value));
            const queue=await send('shiyingCollectionStart',{id:catalog.id,indices,format:$('collectionFormat').value,height:Number($('collectionHeight').value)});
            queueView(queue);if(catalog===chosenCatalog)$('collectionItems').querySelectorAll('input').forEach(i=>i.checked=false);
        }catch(error){$('collectionError').textContent=RuxgetText.tr(error.message);$('collectionError').hidden=false;}
        finally{starting=false;summary();}
    };
    $('collectionStop').onclick=async()=>{if(stopping)return;stopping=true;queueView(lastQueue);try{queueView(await send('shiyingCollectionStop'));}catch(error){$('collectionError').textContent=RuxgetText.tr(error.message);$('collectionError').hidden=false;}finally{stopping=false;queueView(lastQueue);}};
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.shiyingCollectionQueue)queueView(changes.shiyingCollectionQueue.newValue);});
    document.addEventListener('ruxget-i18n-applied',summary);
    return {open};
})();
