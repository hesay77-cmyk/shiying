// 0.4.81: after “Ruxget 下载” on a cloud-drive page, the “已将 N 个文件加入 Ruxget，可在 Ruxget 的“已下载”里查看” notice
// stays at least 4 seconds, also when the drive redraws its toolbar right after the click (that used to take the
// notice away with the button). The content script runs on a local stand-in page with a stubbed extension API.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SHIYING_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),checks=[],check=(value,name)=>{assert(value,name);checks.push(name);console.log('ok  '+name);};
const script=fs.readFileSync(path.join(root,'js','shiying-netdisk-content.js'),'utf8');
const stub=lang=>`window.chrome={runtime:{sendMessage:async m=>{if(m.Message==='shiyingNetdiskState')return {ok:true,provider:'baidu',enabled:true,visible:true,config:{mounts:['#bar']}};
 if(m.Message==='shiyingNetdiskBegin')return {ok:true,intent:'i1'};if(m.Message==='shiyingNetdiskRun'){if(window.redraw){const bar=document.querySelector('#bar');bar.remove();setTimeout(()=>{const b=document.createElement('div');b.id='bar';b.innerHTML='<button>下载</button>';document.body.prepend(b);},50);}return {ok:true,count:3};}return {ok:true};}},storage:{onChanged:{addListener(){},removeListener(){}}}};
 window.RuxgetI18n={t:k=>(${JSON.stringify(lang==='en'?{uiNetdiskAdded:JSON.parse(fs.readFileSync(path.join(root,'_locales/en/messages.json'),'utf8')).uiNetdiskAdded.message}:{})})[k]||k,pick:(zh,en)=>${lang==='en'?'en':'zh'},ready:async()=>{}};`;
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end('<!doctype html><meta charset="utf-8"><title>百度网盘</title><div id="bar"><button>下载</button></div><p style="height:2000px">files</p>');});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.SHIYING_CHROMIUM||undefined,headless:true});
 try{
  for(const [lang,redraw] of [['zh',false],['zh',true],['en',true]]){
   const page=await browser.newPage({viewport:{width:900,height:600}});await page.goto(origin+'/');
   await page.evaluate(stub(lang));await page.evaluate(r=>{window.redraw=r;},redraw);await page.evaluate(script);
   const button=page.locator('shiying-netdisk >> #download');await button.waitFor();await button.click();
   const shown=()=>page.evaluate(()=>!!document.querySelector('shiying-netdisk-note'));
   await page.waitForTimeout(300);
   const expected=lang==='en'?/^Added 3 file\(s\) to Ruxget\. You can find them under “Downloads” in Ruxget\.$/:/^已将 3 个文件加入 Ruxget，可在 Ruxget 的“已下载”里查看$/;
   const words=await page.evaluate(()=>document.querySelector('shiying-netdisk-note')?.shadowRoot.querySelector('[role=status]').textContent||'');
   check(expected.test(words),`${lang}: the notice says where to find the files (${words})`);
   await page.waitForTimeout(4000);check(await shown(),`${lang}${redraw?' (toolbar redrawn)':''}: still there after 4 s`);
   await page.waitForTimeout(2600);check(!(await shown()),`${lang}: gone after about 6 s`);
   await page.close();
  }
  console.log('NETDISK NOTICE CHECKS PASSED ('+checks.length+')');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
