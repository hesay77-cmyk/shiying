(async()=>{
  await RuxgetI18n.ready();
  // 0.4.74: the sheet's own text follows a language switch (js/shiying-native.js); the page's language does too.
  const lang=()=>{const en=RuxgetI18n.getLang()==='en';document.documentElement.lang=en?'en':'zh-CN';document.title=en?'Ruxget Desktop':'Ruxget 桌面版';};
  lang();document.addEventListener('ruxget-i18n-applied',lang);
  const reason=new URLSearchParams(location.search).get('reason')==='connection'?'connection':'missing';
  await ShiyingNative.offerDesktopDownload(reason);
  window.close();
})().catch(()=>{document.querySelector('#desktopConnectFallback').hidden=false;});
