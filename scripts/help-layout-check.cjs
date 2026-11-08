// 0.4.74: the help page (shiying-help.html) cards at 360 / 720 / 1100 px in Chinese and English. Every card's content starts
// right below its padding (the second card had an empty band at its top), nothing overflows sideways, and the open
// "details" cards have the same spacing. Screenshots: help-<lang>-<width>.png. Exit code 1 on a problem.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),report=fs.mkdtempSync(path.join(process.env.RUXGET_TMP||require('node:os').tmpdir(),'ruxget-help-layout-'));
(async()=>{
 const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
 const extension=path.join(report,'extension');fs.mkdirSync(extension);
 for(const dir of ['js','css','img','lib','_locales'])fs.cpSync(path.join(root,dir),path.join(extension,dir),{recursive:true});
 for(const name of fs.readdirSync(root))if(name.endsWith('.html')||name.endsWith('.md')||name==='manifest.json'||name==='LICENSE')fs.copyFileSync(path.join(root,name),path.join(extension,name));
 const context=await chromium.launchPersistentContext(path.join(report,'profile'),{executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true,viewport:{width:1100,height:900},ignoreDefaultArgs:['--disable-extensions'],args:['--mute-audio','--autoplay-policy=user-gesture-required',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--lang=zh-CN','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 const problems=[];
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
  for(const lang of ['zh_CN','en']){
   await worker.evaluate(l=>chrome.storage.local.set({ruxgetUiLanguage:l}),lang);
   for(const width of [360,720,1100]){
    const page=await context.newPage();await page.setViewportSize({width,height:900});
    await page.goto(`chrome-extension://${id}/shiying-help.html`);await page.waitForTimeout(900);
    await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));await page.waitForTimeout(200);
    const found=await page.evaluate(()=>{
     const out=[],cards=[...document.querySelectorAll('.help-intro,.start-steps,details.help-details')];
     if(document.documentElement.scrollWidth>innerWidth+1)out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
     for(const card of cards){
      const box=card.getBoundingClientRect(),style=getComputedStyle(card),top=parseFloat(style.paddingTop)+parseFloat(style.borderTopWidth),bottom=parseFloat(style.paddingBottom)+parseFloat(style.borderBottomWidth);
      const kids=[...card.children].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none');if(!kids.length)continue;
      const first=Math.min(...kids.map(el=>el.getBoundingClientRect().top)),last=Math.max(...kids.map(el=>el.getBoundingClientRect().bottom));
      const name=(card.className||card.tagName.toLowerCase())+' “'+(card.querySelector('h2,summary')?.textContent||'').trim().slice(0,24)+'”';
      // A line of text has some leading of its own; more than 12 px beyond the padding is an empty band.
      if(first-box.top-top>12)out.push(`${name}: ${Math.round(first-box.top-top)} px empty above the content`);
      if(box.bottom-last-bottom>18)out.push(`${name}: ${Math.round(box.bottom-last-bottom)} px empty below the content`);
      // A card with its own surface keeps its text off the side edges.
      if(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&Math.min(...kids.map(el=>el.getBoundingClientRect().left))-box.left<12)out.push(`${name}: text touches the left edge of the card`);
      for(const el of card.querySelectorAll('*'))if(el.getClientRects().length&&el.getBoundingClientRect().right>box.right+1&&!el.closest('pre')){out.push(`${name}: ${el.tagName.toLowerCase()} sticks out on the right`);break;}
     }
     return out;});
    await page.screenshot({path:path.join(report,`help-${lang}-${width}.png`),fullPage:true});
    for(const text of found)problems.push(`${lang} ${width}px: ${text}`);
    console.log((found.length?'FOUND ':'PASS ')+`${lang} ${width}px`+(found.length?'\n   '+found.join('\n   '):''));
    await page.close();
   }
  }
 }finally{await context.close();}
 console.log((problems.length?'FAILED ':'OK ')+problems.length+'\nREPORT '+report);process.exit(problems.length?1:0);
})().catch(error=>{console.error(error);console.log('REPORT '+report);process.exit(2);});
