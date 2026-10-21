// Multi-part (分 P) metadata only. Reading a list never creates a download or opens a tab.
const ShiyingCollection = {
    // B站 returns every part in one response; keep the queue bounded.
    LIMIT: 1000,
    resolvers: [],
    readers: {},
    source(value) {
        const u = new URL(value);
        if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('请使用完整的 HTTPS 视频网址');
        if (['bilibili.com','www.bilibili.com'].includes(u.hostname) && /^\/video\/(BV\w+|av\d+)/i.test(u.pathname)) {
            return {site:'bilibili', url:'https://www.bilibili.com'+u.pathname};
        }
        for (const resolve of this.resolvers) {const found = resolve(u);if (found) return found;}
        throw new Error('支持 B站多 P 视频');
    },
    async read(value) {
        const source=this.source(value);
        if(this.readers[source.site])return {...source,...await this.readers[source.site](source)};
        const id=new URL(source.url).pathname.match(/\/video\/(BV\w+|av\d+)/i)[1];
        const query=new URLSearchParams(/^av/i.test(id)?{aid:id.slice(2)}:{bvid:id});
        const response=await fetch('https://api.bilibili.com/x/web-interface/view?'+query,{credentials:'include',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error('B站列表读取失败');
        const json=await response.json(), data=json.data;
        if(json.code!==0||!Array.isArray(data?.pages)||!data.pages.length)throw new Error('没有读到分 P 列表，请检查视频网址');
        return {...source,title:String(data.title),total:data.pages.length,hasMore:data.pages.length>this.LIMIT,entries:data.pages.slice(0,this.LIMIT).map(p=>({
            url:'https://www.bilibili.com/video/'+data.bvid+'/?p='+p.page,title:'P'+p.page+' '+p.part,duration:Math.floor((p.duration||0)/60)+':'+String((p.duration||0)%60).padStart(2,'0'),available:true}))};
    }
};
if(typeof module!=='undefined')module.exports=ShiyingCollection;
