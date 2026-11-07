// 0.4.72: the old panel ▾ choice 「用桌面版下载」 (shiyingVideoPreference.method) becomes 交给桌面版 → 全部 once, on upgrade.
// Plain Node with an in-memory chrome.storage; no browser, no native host.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let store={},allowed=true;
globalThis.chrome={permissions:{async contains(){return allowed;}},storage:{local:{
    async get(keys){const out={};for(const key of [].concat(keys))if(key in store)out[key]=structuredClone(store[key]);return out;},
    async set(values){Object.assign(store,structuredClone(values));},
    async remove(keys){for(const key of [].concat(keys))delete store[key];},
}}};
const RuxgetOffer=require(path.join(root,'js/ruxget-offer.js'));
const run=async(initial)=>{store=structuredClone(initial);const result=await RuxgetOffer.migrateMethod();return {result,store:structuredClone(store)};};
(async()=>{
    // Chose 「用桌面版下载」 and no mode yet: every panel video keeps going to the desktop app (全部); takeover untouched.
    let r=await run({shiyingVideoPreference:{height:1080,format:'mp4',method:'desktop'},ruxgetTakeover:{enabled:false,minMB:50}});
    assert.equal(r.result,'all');assert.equal(r.store.ruxgetDesktopMode,'all');assert.equal(r.store.ruxgetMethodMigrated,true);
    assert.deepEqual(r.store.ruxgetTakeover,{enabled:false,minMB:50},'Chrome downloads stay as they were');
    // Only once: a later 从不 chosen in settings is never overwritten.
    store.ruxgetDesktopMode='never';assert.equal(await RuxgetOffer.migrateMethod(),null);assert.equal(store.ruxgetDesktopMode,'never');
    // Never chose it (Chrome, or no preference at all, i.e. a new install): nothing but the marker.
    for(const initial of [{shiyingVideoPreference:{height:720,format:'mp4',method:'chrome'}},{shiyingVideoPreference:{height:720,format:'mp4'}},{}]){
        r=await run(initial);assert.equal(r.result,null);assert.equal('ruxgetDesktopMode' in r.store,false);assert.deepEqual(Object.keys(r.store).filter(k=>!(k in initial)),['ruxgetMethodMigrated']);
    }
    // Already picked a mode in 0.4.71: that choice wins.
    r=await run({shiyingVideoPreference:{method:'desktop'},ruxgetDesktopMode:'large'});assert.equal(r.store.ruxgetDesktopMode,'large');
    // The desktop connection no longer allowed (permission removed, app gone): the old choice did nothing, nothing moves.
    allowed=false;r=await run({shiyingVideoPreference:{method:'desktop'}});assert.equal('ruxgetDesktopMode' in r.store,false);assert.equal(r.store.ruxgetMethodMigrated,true);allowed=true;
    // Already migrated: no second time.
    r=await run({shiyingVideoPreference:{method:'desktop'},ruxgetMethodMigrated:true});assert.equal('ruxgetDesktopMode' in r.store,false);
    // The worker runs it at start (the block that only runs in the service worker).
    const source=fs.readFileSync(path.join(root,'js/ruxget-offer.js'),'utf8'),worker=source.slice(source.indexOf('ServiceWorkerGlobalScope'));
    assert(/RuxgetOffer\.migrateMethod\(\)/.test(worker),'the service worker runs the migration');
    console.log('METHOD MIGRATION PASSED: old 用桌面版下载 → 全部 once; everyone else unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;});
