(async()=>{
  await RuxgetI18n.ready();
  // 0.4.74: the sheet's own text follows a language switch (js/shiying-native.js); the page's language does too.
  const lang=()=>{document.documentElement.lang=RuxgetI18n.getLang()==='en'?'en':'zh-CN';};
  lang();document.addEventListener('ruxget-i18n-applied',lang);
  const reason=new URLSearchParams(location.search).get('reason')==='connection'?'connection':'missing';
  await ShiyingNative.offerDesktopDownload(reason);
  window.close();
})().catch(()=>{document.querySelector('#desktopConnectFallback').hidden=false;});
