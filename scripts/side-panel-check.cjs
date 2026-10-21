// Exercise the actual tab-update listener without opening Chrome or making requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'js/background.js'),'utf8');
const begin=source.indexOf('chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {');
const end=source.indexOf('\n});',begin)+5;
assert(begin>=0&&end>begin,'tab-update listener not found');
let update;const options=[];
vm.runInNewContext(source.slice(begin,end),{
 G:{initSyncComplete:true,autoClearMode:0,blockUrl:[],damnUrlSet:new Set()},
 isSpecialPage:url=>!/^https?:/.test(url),isDamnUrl:()=>false,
 chrome:{tabs:{onUpdated:{addListener:listener=>update=listener}},sidePanel:{setOptions:option=>options.push(option)}}
});
for(const [tabId,url] of [[23,'https://www.youtube.com/watch?v=abcdefghijk'],[24,'https://www.bilibili.com/video/BV15z4y1U7HS/'],[25,'https://example.test/video']]){
 update(tabId,{url,status:'loading'},{url});
 update(tabId,{status:'complete'},{url});
 assert.deepEqual(options.splice(0).map(o=>JSON.parse(JSON.stringify(o))),[
  {tabId,path:'shiying.html?tabId='+tabId},{tabId,path:'shiying.html?tabId='+tabId}
 ]);
}
update(26,{status:'complete'},{url:'chrome://extensions/'});assert.equal(options.length,0);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.side_panel.default_path,'shiying.html');
console.log('Side panel routing passed: YouTube, Bilibili, ordinary pages, repeated updates, and special-page exclusion. No browser or network used.');
