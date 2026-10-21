(async()=>{
  await RuxgetI18n.ready();
  const reason=new URLSearchParams(location.search).get('reason')==='connection'?'connection':'missing';
  await ShiyingNative.offerDesktopDownload(reason);
  window.close();
})().catch(()=>{document.querySelector('#desktopConnectFallback').hidden=false;});
