/* Adapted from LinkSwift 1.1.3, Hmjz100 and 油小猴, AGPL-3.0-or-later.
 * Source and changes: third-party-source/LinkSwift-1.1.3.user.js, scripts/build-netdisk.py.
 * This adapter has no userscript manager, remote code, page theme changes or download UI.
 */
(()=>{
 'use strict';
 if(globalThis.ShiyingNetdiskPage)return;
 const unsafeWindow=window;
 const clean=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
 globalThis.ShiyingNetdiskPage={async resolve(intent,provider,values={}){
  const pending=new Map();let serial=0,output=null,expected=[],requests=0;
  const onReply=e=>{if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='shiying-netdisk-reply'||e.data.intent!==intent)return;const item=pending.get(e.data.id);if(!item)return;pending.delete(e.data.id);clearTimeout(item.timer);e.data.ok?item.resolve(e.data.value):item.reject(new Error(e.data.error||'网盘请求失败'));};
  window.addEventListener('message',onReply);
  const call=(action,payload)=>new Promise((resolve,reject)=>{if(++requests>120)return reject(new Error('本次文件数量较多，请分批选择文件下载'));const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('网盘请求超时，请重试'));},25000);pending.set(id,{resolve,reject,timer});window.postMessage({channel:'shiying-netdisk-request',intent,id,action,payload},location.origin);});
  const fail=text=>{throw new Error(clean(text)||'未能获取下载地址，请刷新网盘后重试');};
  const message={error:fail,warning:fail,info:fail,success:fail};
  const Swal={fire:async options=>fail(options.html||options.title),close(){}};
  const $=selector=>Array.from(document.querySelectorAll(selector));
  const $doc={find:()=>({html(){}})};
  const GM_openInTab=()=>fail('百度下载需先授权：桌面版用 token、不传百度 Cookie，公开分享页也一样。请在 Ruxget 插件内点“百度授权”后重试');
  const temp={main:null,page:'',mode:'aria2',links:[],glinks:[],swalDefault:{}};
  	let config = {
		base: {
			num: "865746",
			license: "AGPL3",
			service: {
				account: "https://pic.rmb.bdstatic.com/bjh/8b9e14345b3cdf96aedac2f3971adcb02681.png"
			},
			dom: {
				footer: `o(≧▽≦)o 十分感谢您的支持！来给此项目一个 <a href="https://github.com/hmjz100/LinkSwift" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-star"></use></svg>Star</a> 吧~`,
				button: {
					api: {
						title: "API 下载",
						footer: `<p>适用于 <a href="https://www.youxiaohou.com/zh-cn/idm.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>IDM</a>，<a href="https://www.youxiaohou.com/zh-cn/ndm.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>NDM</a> 以及浏览器自带下载</p>`
					},
					aria2: {
						title: "Aria2 下载",
						footer: `<p>RPC 适用于 <a href="https://www.youxiaohou.com/zh-cn/motrix.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>Motrix</a>，<a href="https://www.youxiaohou.com/download.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>Aria2 Tools</a>，<a href="https://www.youxiaohou.com/download.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>AriaNgGUI</a></p>
						<p>命令行适用于 <a href="https://www.youxiaohou.com/zh-cn/xdown.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>XDown</a> 及 <a href="https://www.youxiaohou.com/zh-cn/linux.html#linux-shell" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>Linux Shell 命令行</a></p>`
					},
					curl: {
						title: "cURL 下载",
						footer: `<p>适用于 <a href="https://www.youxiaohou.com/zh-cn/curl.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>Windows，Linux，MacOS 终端</a></p>`
					},
					bitcomet: {
						title: "比特彗星下载",
						footer: `<p>适用于 <a href="https://www.youxiaohou.com/zh-cn/bitcomet.html" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>比特彗星</a></p>`
					},
					abdm: {
						title: "ABDM 下载",
						footer: `<p>适用于 <a href="https://abdownloadmanager.com/" target="_blank" class="pl-a" data-no-instant="1"><svg class="pl-icon"><use xlink:href="#pl-icon-fa-link"></use></svg>AB Download Manager</a></p>`
					}
				},
				themes: [
					{ color: "#09AAFF", name: "度盘|经典蓝" },
					{ color: "#cc3235", name: "度盘|平安红" },
					{ color: "#518c17", name: "度盘|盎然绿" },
					{ color: "#ed944b", name: "度盘|周年橙" },
					{ color: "#f969a5", name: "度盘|幸会粉" },
					{ color: "#bca280", name: "度盘|午后棕" },
					{ color: "#b673ab", name: "度盘|物语紫" },
					{ color: "#574AB8", name: "度盘|星空紫" },
					{ color: "#1d2327", name: "OpenAI|默认黑" },
					{ color: "#18a497", name: "OpenAI|默认青" },
					{ color: "#637dff", name: "度里叁|霞光紫" },
					{ color: "#0d53ff", name: "夸克|极简蓝" },
					{ color: "#3181f9", name: "移动|彩云蓝" },
					{ color: "#f8d800", name: "果核|柠檬黄" },
					{ color: "#0396ff", name: "果核|默认蓝" },
					{ color: "#32ccbc", name: "果核|碧波绿" },
					{ color: "#f6416c", name: "果核|玫瑰红" },
					{ color: "#2271b1", name: "文派|默认蓝" },
					{ color: "#59524c", name: "文派|咖啡灰" },
					{ color: "#ff679a", name: "哔哩|少女粉" },
					{ color: "#f44236", name: "哔哩|高能红" },
					{ color: "#fec107", name: "哔哩|咸蛋黄" },
					{ color: "#8bc24a", name: "哔哩|早苗绿" },
					{ color: "#2594ed", name: "哔哩|宝石蓝" },
					{ color: "#9c28b1", name: "哔哩|罗兰紫" }
				]
			}
		},
		$baidu: {
			api: {
				ua: {
					downloadLink: "pan.baidu.com"
				},
				getAccessToken: "https://openapi.baidu.com/oauth/2.0/authorize?response_type=token&scope=basic,netdisk&client_id=omiOnr2tYnN9vSyDErcVFWpPU2mZA7YO&redirect_uri=oob&confirm_login=0",
				getLink: "https://pan.baidu.com/rest/2.0/xpan/multimedia?method=filemetas&dlink=1",
				getFiles: "https://pan.baidu.com/rest/2.0/xpan/file?method=list&showempty=1",
				getShareLink: "https://pan.baidu.com/api/sharedownload?channel=chunlei&clienttype=0&web=1&app_id=250528",
				getShareSign: "https://pan.baidu.com/share/tplconfig?fields=sign,timestamp&channel=chunlei&web=1&app_id=250528&clienttype=0&view_mode=1",
				getShareVerify: "https://pan.baidu.com/share/verify?channel=chunlei&clienttype=0&web=1&app_id=250528",
				getShareFiles: "https://pan.baidu.com/rest/2.0/xpan/share?method=list&showempty=1"
			},
			mount: {
				home: ".frame-main>div>div>div>div:has(.g-dropdown-button.g-new-create)",
				main: ".wp-s-agile-tool-bar__header",
				share: ".module-share-top-bar .x-button-box .g-dropdown-button.tools-more"
			},
			dom: {
				enhance: `+<br/>此方式可以自动设置用户代理(UA)，然后下载。<br/>此方式的下载请求<b>可能会</b>被<b>旧版 IDM</b> 捕获。`,
				normal: `+<br/>此方式<b>无法下载超过 50MB 的文件</b>，若超过点击会无反应（服务器 403）。<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`,
				copy: `注：此服务直接访问超过 50MB 文件的直链会导致服务器回报 403 错误<br/>如需访问，<b>请修改用户代理(UA)为 "pan.baidu.com"</b>`
			}
		},
		$aliyun: {
			api: {
				getLink: "https://api.aliyundrive.com/v2/file/get_download_url",
				getShareLink: "https://api.aliyundrive.com/v2/file/get_share_link_download_url"
			},
			mount: {
				home: `[class^="header--"]>[class^="actions--"]`,
				share: `[class^="banner--"]>[class^="right--"]`,
				list: `[class^="node-list-table-view--"]`,
				grid: `[class^="node-list-grid-view--"]`,
				switch: `[class^="switch-wrapper--"]`
			},
			dom: {
				enhance: `+<br/>此方式可以自动设置 Referer，然后下载。<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`,
				copy: `注：此服务直接访问直链会导致服务器回报 403 错误<br/>如需访问，<b>请修改 Referer 为 "https://${location.host}/"</b>`,
				filename: `注：此服务在下载高峰期时<b>可能不会</b>向客户端回报文件名，下载时需要复制文件名。`
			}
		},
		$mcloud: {
			api: {
				getLink: "https://personal-kd-njs.yun.139.com/hcy/file/getDownloadUrl"
			},
			mount: {
				home: ".top_button",
				share: ".top-btns"
			},
			dom: {
				enhance: `+<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`
			}
		},
		$tcloud: {
			api: {
				getAccessToken: "https://api.cloud.189.cn/open/oauth2/ssoH5.action",
				getLink: "https://api.cloud.189.cn/open/file/getFileDownloadUrl.action"
			},
			mount: {
				home: "[class*=\"FileHead_file-head-left\"]",
				share: ".nav-opea"
			},
			dom: {
				enhance: `+<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`
			}
		},
		$xunlei: {
			api: {
				mirror: [
					"vod0780-aliyun04-vip-lixian.xunlei.com", "vod0781-aliyun04-vip-lixian.xunlei.com", "vod3379-aliyun04-vip-lixian.xunlei.com", "vod3429-aliyun04-vip-lixian.xunlei.com", "vod3459-aliyun04-vip-lixian.xunlei.com", "vod3533-aliyun04-vip-lixian.xunlei.com", "vod4252-aliyun04-vip-lixian.xunlei.com", "vod4253-aliyun04-vip-lixian.xunlei.com", "vod4320-aliyun04-vip-lixian.xunlei.com", "vod4321-aliyun04-vip-lixian.xunlei.com", "vod0555-aliyun06-vip-lixian.xunlei.com", "vod0556-aliyun06-vip-lixian.xunlei.com", "vod1284-aliyun06-vip-lixian.xunlei.com", "vod1285-aliyun06-vip-lixian.xunlei.com", "vod1363-aliyun06-vip-lixian.xunlei.com", "vod1372-aliyun06-vip-lixian.xunlei.com", "vod1629-aliyun06-vip-lixian.xunlei.com", "vod1630-aliyun06-vip-lixian.xunlei.com", "vod1703-aliyun06-vip-lixian.xunlei.com", "vod1704-aliyun06-vip-lixian.xunlei.com", "vod1844-aliyun06-vip-lixian.xunlei.com", "vod0254-aliyun08-vip-lixian.xunlei.com", "vod0255-aliyun08-vip-lixian.xunlei.com", "vod0256-aliyun08-vip-lixian.xunlei.com", "vod0257-aliyun08-vip-lixian.xunlei.com", "vod0261-aliyun08-vip-lixian.xunlei.com", "vod0262-aliyun08-vip-lixian.xunlei.com", "vod0263-aliyun08-vip-lixian.xunlei.com", "vod0264-aliyun08-vip-lixian.xunlei.com", "vod0759-aliyun08-vip-lixian.xunlei.com", "vod0760-aliyun08-vip-lixian.xunlei.com", "vod9410-aliyun08-vip-lixian.xunlei.com", "vod9411-aliyun08-vip-lixian.xunlei.com", "vod9412-aliyun08-vip-lixian.xunlei.com", "vod0080-b02-vip-lixian.xunlei.com", "vod0432-b02-vip-lixian.xunlei.com", "vod0531-b02-vip-lixian.xunlei.com", "vod0532-b02-vip-lixian.xunlei.com", "vod0533-b02-vip-lixian.xunlei.com", "vod0534-b02-vip-lixian.xunlei.com", "vod0537-b02-vip-lixian.xunlei.com", "vod0563-b02-vip-lixian.xunlei.com", "vod0565-b02-vip-lixian.xunlei.com", "vod0566-b02-vip-lixian.xunlei.com", "vod0568-b02-vip-lixian.xunlei.com", "vod0571-b02-vip-lixian.xunlei.com", "vod0572-b02-vip-lixian.xunlei.com", "vod0573-b02-vip-lixian.xunlei.com", "vod0595-b02-vip-lixian.xunlei.com", "vod0596-b02-vip-lixian.xunlei.com", "vod0597-b02-vip-lixian.xunlei.com", "vod0598-b02-vip-lixian.xunlei.com", "vod0636-b02-vip-lixian.xunlei.com", "vod0637-b02-vip-lixian.xunlei.com", "vod0638-b02-vip-lixian.xunlei.com", "vod0639-b02-vip-lixian.xunlei.com", "vod0640-b02-vip-lixian.xunlei.com", "vod0641-b02-vip-lixian.xunlei.com", "vod0642-b02-vip-lixian.xunlei.com", "vod0643-b02-vip-lixian.xunlei.com", "vod0644-b02-vip-lixian.xunlei.com", "vod0645-b02-vip-lixian.xunlei.com", "vod0646-b02-vip-lixian.xunlei.com", "vod0647-b02-vip-lixian.xunlei.com", "vod0648-b02-vip-lixian.xunlei.com", "vod0649-b02-vip-lixian.xunlei.com", "vod0650-b02-vip-lixian.xunlei.com", "vod0651-b02-vip-lixian.xunlei.com", "vod0652-b02-vip-lixian.xunlei.com", "vod0653-b02-vip-lixian.xunlei.com", "vod0654-b02-vip-lixian.xunlei.com", "vod0725-b02-vip-lixian.xunlei.com", "vod0726-b02-vip-lixian.xunlei.com", "vod0727-b02-vip-lixian.xunlei.com", "vod0006-b05-vip-lixian.xunlei.com", "vod0009-b05-vip-lixian.xunlei.com", "vod0010-b05-vip-lixian.xunlei.com", "vod0011-b05-vip-lixian.xunlei.com", "vod0012-b05-vip-lixian.xunlei.com", "vod0013-b05-vip-lixian.xunlei.com", "vod0014-b05-vip-lixian.xunlei.com", "vod0043-b05-vip-lixian.xunlei.com", "vod0044-b05-vip-lixian.xunlei.com", "vod0045-b05-vip-lixian.xunlei.com", "vod0051-b05-vip-lixian.xunlei.com", "vod0053-b05-vip-lixian.xunlei.com", "vod0054-b05-vip-lixian.xunlei.com", "vod0055-b05-vip-lixian.xunlei.com", "vod0139-b05-vip-lixian.xunlei.com", "vod0140-b05-vip-lixian.xunlei.com", "vod0141-b05-vip-lixian.xunlei.com", "vod0142-b05-vip-lixian.xunlei.com", "vod0143-b05-vip-lixian.xunlei.com", "vod0349-b05-vip-lixian.xunlei.com", "vod0001-c01-vip-lixian.xunlei.com", "vod0002-c01-vip-lixian.xunlei.com", "vod0003-c01-vip-lixian.xunlei.com", "vod0004-c01-vip-lixian.xunlei.com", "vod0005-c01-vip-lixian.xunlei.com", "vod0070-h01-vip-lixian.xunlei.com", "vod0071-h01-vip-lixian.xunlei.com", "vod0074-h01-vip-lixian.xunlei.com", "vod0075-h01-vip-lixian.xunlei.com", "vod0131-h01-vip-lixian.xunlei.com", "vod0132-h01-vip-lixian.xunlei.com", "vod0153-h01-vip-lixian.xunlei.com", "vod0088-h04-vip-lixian.xunlei.com", "vod0089-h04-vip-lixian.xunlei.com", "vod0090-h04-vip-lixian.xunlei.com", "vod0091-h04-vip-lixian.xunlei.com", "vod0092-h04-vip-lixian.xunlei.com", "vod0093-h04-vip-lixian.xunlei.com", "vod0094-h04-vip-lixian.xunlei.com", "vod0097-h04-vip-lixian.xunlei.com", "vod0098-h04-vip-lixian.xunlei.com", "vod0099-h04-vip-lixian.xunlei.com", "vod0100-h04-vip-lixian.xunlei.com", "vod0101-h04-vip-lixian.xunlei.com", "vod0105-h04-vip-lixian.xunlei.com", "vod0128-h04-vip-lixian.xunlei.com", "vod0129-h04-vip-lixian.xunlei.com", "vod0143-h04-vip-lixian.xunlei.com", "vod0317-h04-vip-lixian.xunlei.com", "vod0318-h04-vip-lixian.xunlei.com", "vod0319-h04-vip-lixian.xunlei.com", "vod0320-h04-vip-lixian.xunlei.com", "vod0003-h05-vip-lixian.xunlei.com", "vod0004-h05-vip-lixian.xunlei.com", "vod0007-h05-vip-lixian.xunlei.com", "vod0008-h05-vip-lixian.xunlei.com", "vod0009-h05-vip-lixian.xunlei.com", "vod0010-h05-vip-lixian.xunlei.com", "vod0012-h05-vip-lixian.xunlei.com", "vod0013-h05-vip-lixian.xunlei.com", "vod0014-h05-vip-lixian.xunlei.com", "vod0017-h05-vip-lixian.xunlei.com", "vod0097-h05-vip-lixian.xunlei.com", "vod0098-h05-vip-lixian.xunlei.com", "vod0099-h05-vip-lixian.xunlei.com", "vod0116-h05-vip-lixian.xunlei.com", "vod0117-h05-vip-lixian.xunlei.com", "vod0121-h05-vip-lixian.xunlei.com", "vod0122-h05-vip-lixian.xunlei.com", "vod0131-h05-vip-lixian.xunlei.com", "vod0145-h05-vip-lixian.xunlei.com", "vod0146-h05-vip-lixian.xunlei.com", "vod0184-h05-vip-lixian.xunlei.com", "vod0185-h05-vip-lixian.xunlei.com", "vod0221-h05-vip-lixian.xunlei.com", "vod0222-h05-vip-lixian.xunlei.com", "vod0223-h05-vip-lixian.xunlei.com", "vod0224-h05-vip-lixian.xunlei.com", "vod0225-h05-vip-lixian.xunlei.com", "vod0227-h05-vip-lixian.xunlei.com", "vod0252-h05-vip-lixian.xunlei.com", "vod0253-h05-vip-lixian.xunlei.com", "vod0254-h05-vip-lixian.xunlei.com", "vod0001-m01-vip-lixian.xunlei.com", "vod0002-m01-vip-lixian.xunlei.com", "vod0003-m01-vip-lixian.xunlei.com", "vod0006-m01-vip-lixian.xunlei.com", "vod0007-m01-vip-lixian.xunlei.com", "vod0008-m01-vip-lixian.xunlei.com", "vod0010-m01-vip-lixian.xunlei.com", "vod0011-m01-vip-lixian.xunlei.com", "vod0012-m01-vip-lixian.xunlei.com", "vod0013-m01-vip-lixian.xunlei.com", "vod0014-m01-vip-lixian.xunlei.com", "vod0019-m01-vip-lixian.xunlei.com", "vod0020-m01-vip-lixian.xunlei.com", "vod0021-m01-vip-lixian.xunlei.com", "vod0022-m01-vip-lixian.xunlei.com", "vod0064-txyun08-vip-lixian.xunlei.com", "vod0065-txyun08-vip-lixian.xunlei.com", "vod0066-txyun08-vip-lixian.xunlei.com", "vod0067-txyun08-vip-lixian.xunlei.com", "vod0068-txyun08-vip-lixian.xunlei.com", "vod0069-txyun08-vip-lixian.xunlei.com", "vod0070-txyun08-vip-lixian.xunlei.com", "vod0340-txyun08-vip-lixian.xunlei.com", "vod0341-txyun08-vip-lixian.xunlei.com", "vod0032-z01-vip-lixian.xunlei.com", "vod0035-z01-vip-lixian.xunlei.com", "vod0036-z01-vip-lixian.xunlei.com", "vod0037-z01-vip-lixian.xunlei.com", "vod0038-z01-vip-lixian.xunlei.com", "vod0039-z01-vip-lixian.xunlei.com", "vod0040-z01-vip-lixian.xunlei.com", "vod0041-z01-vip-lixian.xunlei.com", "vod0042-z01-vip-lixian.xunlei.com", "vod0091-z01-vip-lixian.xunlei.com", "vod0093-z01-vip-lixian.xunlei.com", "vod0131-z01-vip-lixian.xunlei.com", "vod0135-z01-vip-lixian.xunlei.com", "vod0136-z01-vip-lixian.xunlei.com", "vod0146-z01-vip-lixian.xunlei.com", "vod0155-z01-vip-lixian.xunlei.com", "vod0156-z01-vip-lixian.xunlei.com", "vod0167-z01-vip-lixian.xunlei.com", "vod0195-z01-vip-lixian.xunlei.com", "vod0196-z01-vip-lixian.xunlei.com", "vod0281-z01-vip-lixian.xunlei.com"
				],
				getLink: "https://api-pan.xunlei.com/drive/v1/files/"
			},
			mount: {
				home: `[class^="FileMenu__menu--"]`,
				share: `[class^="Share__batchActionBox--"]`
			},
			dom: {
				enhance: `+<br/>此方式可以自动设置文件名，然后下载。<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此服务不会向客户端回报文件名，选用此方式下载需手动重命名文件。<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				filename: `注：此服务不会向客户端回报文件名，下载时需要复制文件名。`
			}
		},
		$quark: {
			api: {
				ua: {
					downloadLink: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/3.20.0 Chrome/112.0.5615.165 Electron/24.1.3.8 Safari/537.36 Channel/pckk_other_ch"
				},
				getLink: "https://drive-pc.quark.cn/1/clouddrive/file/download?entry=ft&fr=pc&pr=ucpro"
			},
			mount: {
				home: ".btn-operate .btn-main",
				share: ".share-btns"
			},
			dom: {
				enhance: `+<br/>此方式可以自动设置用户代理(UA)，然后下载。<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`
			}
		},
		$uc: {
			api: {
				ua: {
					downloadLink: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch"
				},
				getLink: "https://pc-api.uc.cn/1/clouddrive/file/download?entry=ft&fr=pc&pr=UCBrowser"
			},
			mount: {
				home: ".btn-operate .btn-main",
				share: ".file-info-share-buttom"
			},
			dom: {
				enhance: `+<br/>此方式可以自动设置用户代理(UA)，然后下载。<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`
			}
		},
		$123pan: {
			api: {
				getLink: "https://www.123pan.com/api/file/download_info",
				getShareLink: "https://www.123pan.com/api/share/download/info"
			},
			mount: {
				home: ".home-operator .home-operator-button-group",
				share: ".conter .rightInfo",
				shareNew: ".content .content-header-container-wrap .rightInfo, .single-file-sharing-container-content-file-operate"
			},
			dom: {
				enhance: `+<br/>此方式的下载请求<b>不会</b>被 IDM 捕获。`,
				normal: `+<br/>此方式的下载请求<b>可能会</b>被 IDM 捕获。`
			}
		}
	}

	/**
	 * 基础工具集合
	 * @author 油小猴
	 * @author hmjz100
	 */

  const memory={...values},storage=new Map();
  const recordKey=item=>String(item.fs_id??item.fileId??item.fid??item.FileId??item.contentID??item.contentId??item.id??'');
  const base={
   		isType(obj) {
			return Object.prototype.toString.call(obj).replace(/^\[object (.+)\]$/, "$1").toLowerCase();
		},
		encodeBase(str) {
			try { str = btoa(str) } catch { }
			return str;
		},
		decodeBase(str) {
			try { str = decodeURIComponent(str) } catch { }
			try { str = atob(str) } catch { }
			try { str = decodeURIComponent(str) } catch { }
			return str;
		},
		stringify(obj) {
			let str = "";
			for (let key in obj) {
				if (obj.hasOwnProperty(key)) {
					let value = obj[key];
					if (Array.isArray(value)) {
						for (let i = 0; i < value.length; i++) {
							str += encodeURIComponent(key) + "=" + encodeURIComponent(value[i]) + "&";
						}
					} else {
						str += encodeURIComponent(key) + "=" + encodeURIComponent(value) + "&";
					}
				}
			}
			return str.slice(0, -1); // 去掉末尾的 "&"
		},
		findReact(dom, traverseUp = 0) {
			let key = Object.keys(dom).find(key => {
				return key.startsWith("__reactFiber$")
					|| key.startsWith("__reactInternalInstance$");
			});
			let domFiber = dom[key];
			if (domFiber == null) return null;
			if (domFiber._currentElement) {
				let compFiber = domFiber._currentElement._owner;
				for (let i = 0; i < traverseUp; i++) {
					compFiber = compFiber._currentElement._owner;
				}
				return compFiber._instance;
			}
			let GetCompFiber = fiber => {
				let parentFiber = fiber.return;
				while (base.isType(parentFiber.type) == "string") {
					parentFiber = parentFiber.return;
				}
				return parentFiber;
			};
			let compFiber = GetCompFiber(domFiber);
			for (let i = 0; i < traverseUp; i++) {
				compFiber = GetCompFiber(compFiber);
			}
			return compFiber.stateNode || compFiber;
		},
   clone:value=>JSON.parse(JSON.stringify(value)),
   getStorage(key){if(storage.has(key))return storage.get(key);const value=localStorage.getItem(key);try{return JSON.parse(value);}catch{return value;}},
   setStorage(key,value){if(key)storage.set(key,value);},
   getValue:key=>memory[key],setValue:(key,value)=>{memory[key]=value;},delValue:key=>{delete memory[key];},
   sleep:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(1000,ms))),
   async get(url,headers={},type='json'){return (await call('api',{url:String(url),headers,method:'GET',type})).data;},
   async post(url,data,headers={},type='json'){const form=data instanceof URLSearchParams;return (await call('api',{url:String(url),headers:form?{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',...headers}:headers,method:'POST',body:typeof data==='string'||form?String(data):JSON.stringify(data),type})).data;},
   async getFinal(url,headers={},usingGET=false,returnURL=true){const result=await call('api',{url:String(url),headers,method:usingGET?'GET':'HEAD',type:'final'});return returnURL?result.finalUrl:result;},
   getMirrorList:()=>[],showMainDialog(){},
   generateDom([items,mapper]){
    if(!Array.isArray(items)||!items.length)fail('没有可下载的文件，请先勾选文件');
    if(items.length>100)fail('一次最多下载 100 个文件，请分批选择');
    expected=temp.main.getSelectedList().filter(item=>!mapper.isFolder(item)).map(recordKey);
    output=items.filter(item=>!mapper.isFolder(item)).map(item=>({url:mapper.getFileLink(item),title:mapper.getFileName(item),size:mapper.getFileSize(item),key:recordKey(item)}));
    return '';
   }
  };
  const $baidu = {
		async getShareData() {
			// 前置
			let url = new URL(location.href);
			let locals = unsafeWindow?.locals?.dump?.();

			// 参数们
			let surl = url.pathname.split('/').pop().replace(/^1(.{22})$/, '$1');
			let pwd = localStorage.getItem(`${surl}_pwd`) || url.searchParams.get('pwd');
			let baidu_id = document?.cookie?.split?.('BAIDUID=')?.[1]?.split?.(';')?.[0];
			let share_uk = locals?.share_uk?.value;
			let share_id = locals?.shareid?.value;
			let bds_token = locals?.bdstoken?.value;
			let js_token = unsafeWindow?.jsToken;
			let se_key = unsafeWindow?.currentSekey || unsafeWindow?.cache?.list?.config?.params?.sekey;

			return {
				share: {
					id: share_id,
					url: surl,
					pwd: pwd,
					uk: share_uk,
				},
				baidu: {
					id: baidu_id,
					token: bds_token
				},
				jsToken: js_token,
				sekey: se_key
			}
		},
		async getFilesUrl(items, accessToken) {
			if (base.isType(items) !== "array") return [];
			let size = 50;
			let processed = 0;
			let now = Date.now();
			let outdate = [];

			items.forEach(item => {
				let cacheIndex = temp.glinks.findIndex(c => c.id == item.fs_id);
				if (cacheIndex !== -1) {
					let cached = temp.glinks[cacheIndex];
					if (cached.expires > now) {
						Object.assign(item, cached.data);
						processed++;
						return;
					} else {
						temp.glinks.splice(cacheIndex, 1);
					}
				}
				outdate.push(item);
			});

			for (let i = 0; i < outdate.length; i += size) {
				let url = `${config.$baidu.api.getLink}&fsids=${encodeURIComponent(JSON.stringify(outdate.map(i => i.fs_id).slice(i, i + size)))}&access_token=${accessToken}`;
				let res = await base.get(url, { "User-Agent": config.$baidu.api.ua.downloadLink });

				if (res.list && res.list.length !== 0 && res.errno === 0) {
					outdate.slice(i, i + size).forEach(item => {
						let infos = res.list.find(i => i.fs_id == item.fs_id);
						if (infos) {
							Object.assign(item, infos);
							temp.glinks.push({ "id": item.fs_id, "expires": (Date.now() + 4 * 60 * 60 * 1000), "data": infos });
						};
					})
					processed += res.list.length;
					$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${items.length} 个链接~</div>`);

				} else {
					if (res.errno) {
						if (res.errno === 112) return message.error("提示：<br/>页面过期了，刷新重试下吧~<br/>代码：" + res.errno);
						if (res.errno === 9019) {
							base.delValue("baidu_access_token");
							return message.error("提示：<br/>访问令牌已过期，刷新网页后再获取一次吧~<br/>代码：" + res.errno);
						}

						items.slice(i, i + size).forEach(i => {
							i.dlink = `获取下载地址失败，${(res.errno || res.errmsg) ? "服务器说：" + (res.errno && res.errmsg ? res.errno + " - " + res.errmsg : (res.errmsg || res.errno)) + "。" : "刷新后再试试吧~"}`
						})
					}
					return message.error("提示：<br/>获取下载链接失败，刷新网页后再试试吧~");
				}
				await base.sleep(1000);
			}
			return items;
		},
		async getShareFileUrl(items, data) {
			if (base.isType(items) !== "array") return [];
			let processed = 0;
			let now = Date.now();

			for (const item of items) {
				let cacheIndex = temp.glinks.findIndex(c => c.id == item.fs_id);
				if (cacheIndex !== -1) {
					let cached = temp.glinks[cacheIndex];
					if (cached.expires > now) {
						Object.assign(item, cached.data);
						processed++;
						$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${items.length} 个链接~</div>`);
						continue;
					} else {
						temp.glinks.splice(cacheIndex, 1); // 删除过期
					}
				}

				let url = new URL(config.$baidu.api.getShareLink);
				url.searchParams.set("sign", data?.sign);
				url.searchParams.set("timestamp", data?.timestamp);
				url.searchParams.set("bdstoken", data.baidu.token);
				url.searchParams.set("logid", base.encodeBase(data.baidu.id));
				url.searchParams.set("jsToken", data.jsToken);
				let _data = new URLSearchParams({ "encrypt": 0, "product": "share", "uk": data.share.uk, "primaryid": data.share.id, "fid_list": JSON.stringify([item.fs_id]) });
				if (data.sekey) _data.set("extra", JSON.stringify({ "sekey": data.sekey }));

				let res = await base.post(url, _data, { "User-Agent": "netdisk;" });
				processed++
				$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${items.length} 个链接~</div>`);

				if (res.list && base.isType(res.list) === "array" && res.list.length !== 0 && res.errno === 0) {
					Object.assign(item, res.list[0]);
					temp.glinks.push({ "id": item.fs_id, "expires": (Date.now() + 4 * 60 * 60 * 1000), "data": res.list[0] });

				} else {
					if (res.errno === 0 && base.isType(res.list) === "string") {
						item.dlink = `<span>获取下载地址失败，服务器说：此文件过大，需要<b>保存到网盘</b>后于网盘中下载。</span>`
						temp.glinks.push({ "id": item.fs_id, "expires": (Date.now() + 4 * 60 * 60 * 1000), "data": item });
						continue;

					} else if (res.errno) {
						if (res.errno === 112) return message.error("提示：<br/>页面过期了，刷新重试下吧~<br/>代码：" + res.errno);
						if (res.errno === 9019) {
							// base.delValue("baidu_access_token");
							return message.error("提示：<br/>访问令牌已过期，刷新网页后再获取一次吧~<br/>代码：" + res.errno);
						}
						item.dlink = `获取下载地址失败，${(res.errno || res.errmsg) ? "服务器说：" + (res.errno && res.errmsg ? res.errno + " - " + res.errmsg : (res.errmsg || res.errno)) + "。" : "刷新后再试试吧~"}`
						continue;
					}
					return message.error("提示：<br/>获取下载链接失败，刷新网页后再试试吧~");
				}
				await base.sleep(100);
			}
			return items;
		},
		async getFilesList(dirs, accessToken, processed = 0) {
			let cnt = 0;
			const fetch = async (targets) => {
				let files = [];
				for (let dir of targets) {
					$doc.find(".loading-popup .loading-title").html(`文件获取中`);
					let url = `${config.$baidu.api.getFiles}&dir=${encodeURIComponent(dir.path)}&access_token=${accessToken}`;
					let res = await base.get(url, { "User-Agent": config.$baidu.api.ua.downloadLink });
					cnt++;
					if (res?.list?.length && (res.errno === 0 || res.errmsg === "succ")) {
						let subFiles = res.list.filter(f => !f.isdir);
						processed += subFiles.length;
						$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} 个文件~</div><div>${dir.path}</div>`);
						files = files.concat(subFiles);
						let subDirs = res.list.filter(f => f.isdir);
						if (subDirs.length > 0) {
							files = files.concat(await fetch(subDirs));
						}
					}
					if (cnt >= 50) {
						$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} 个文件~</div><div>休息 3 秒...</div>`);
						await base.sleep(3000);
						cnt = 0;
					}
				}
				return files;
			};
			return await fetch(dirs);
		},
		async getLink() {
			// 获取选择的文件列表
			let selectList = this.getSelectedList();
			let accessToken = (base.getValue("baidu_access_token") || await temp.main.getToken());

			// 回退授权
			if (!accessToken) {
				message.info("提示：<br/>百度下载需先授权：桌面版用 token、不传百度 Cookie，公开分享页也一样。请在 Ruxget 插件内点“百度授权”。");
				base.delValue("baidu_access_token");
				await base.sleep(3300);
				GM_openInTab(config.$baidu.api.getAccessToken, { active: true, insert: true, setParent: true })
				let attempts = 0;
				let interval = setInterval(() => {
					if (!!base.getValue("baidu_access_token")) {
						clearInterval(interval);
						accessToken = base.getValue("baidu_access_token")
					}
					attempts++;
					if (attempts > 120) {
						clearInterval(interval);
						return message.error("提示：<br/>时间太长，我先撤下啦~");
					}
				}, 1000);
				return;
			}

			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");

			if (temp.page === "home" || temp.page === "main" || temp.page === "youth") {
				let files = selectList.filter(f => !f.isdir);
				let dirs = selectList.filter(f => f.isdir);
				if (dirs.length > 0) files = files.concat(await this.getFilesList(dirs, accessToken, files.length));
				if (!files.length) return message.error("提示：<br/>文件夹是空的哦~");
				$doc.find(".loading-popup .loading-title").html(`链接获取中`);
				$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);

				files = await this.getFilesUrl(files, accessToken);

				if (base.isType(files) === "array" && files.length) {
					temp.links = [files, {
						isFolder: v => v.isdir === 1,
						getFileName: v => (v.server_filename || v.filename),
						getFileSize: v => v.size,
						getFileLink: v => {
							if (!v.dlink || !v.dlink.startsWith("http")) return v.dlink;
							let url = new URL(v.dlink);
							url.searchParams.set("access_token", accessToken);
							return url.href;
						},
						convert: {
							aria2: `--header "User-Agent:${config.$baidu.api.ua.downloadLink}"`,
							curl: `-A "${config.$baidu.api.ua.downloadLink}"`,
							bitcomet: `user_agent=${encodeURIComponent(config.$baidu.api.ua.downloadLink)}`
						},
						tooltip: config.$baidu.dom
					}];
					base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
				} else {
					return message.error("提示：<br/>获取下载链接失败，刷新网页后再试试吧~");
				}
			} else if (temp.page === "share") {
				let files = selectList.filter(f => !f.isdir);
				let data = await this.getShareData();

				//if (data.share.url) {
				//	let res = await base.post(`${config.$baidu.api.getShareVerify}&surl=${data.share.url}&t=${Date.now()}&bdstoken=${data.baidu.token}&logid=${base.encodeBase(data.baidu.id)}`, new URLSearchParams({ "pwd": data?.share?.pwd ? data.share.pwd : "" }));
				//	data.sekey = res?.randsk;
				//}

				let sign = await base.get(`${config.$baidu.api.getShareSign}&surl=1${data.share.url}&bdstoken=${data.baidu.token}&logid=${base.encodeBase(data.baidu.id)}`);
				if (sign?.data?.sign && sign?.data?.timestamp) {
					data.sign = sign.data.sign;
					data.timestamp = sign.data.timestamp;
				}

				files = await this.getShareFileUrl(files, data, accessToken);

				if (base.isType(files) === "array" && files.length) {
					temp.links = [files, {
						isFolder: v => v.isdir === 1,
						getFileName: v => (v.server_filename || v.filename),
						getFileSize: v => v.size,
						getFileLink: v => {
							if (!v.dlink || !v.dlink.startsWith("http")) return v.dlink;
							let url = new URL(v.dlink);
							url.searchParams.set("access_token", accessToken);
							return url.href;
						},
						convert: {
							aria2: `--header "User-Agent:${config.$baidu.api.ua.downloadLink}"`,
							curl: `-A "${config.$baidu.api.ua.downloadLink}"`,
							bitcomet: `user_agent=${encodeURIComponent(config.$baidu.api.ua.downloadLink)}`
						},
						tooltip: config.$baidu.dom
					}];
					base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
				} else {
					return message.error("提示：<br/>获取下载链接失败，刷新网页后再试试吧~");
				}
			} else {
				return message.error("提示：<br/>页面错误~");
			}
		},
		getSelectedList() {
			try {
				let list = [];
				// 3
				let fileList = unsafeWindow.document.querySelector(".file-list");
				if (fileList?.__vue__?.allFileList?.[0]) list = fileList.__vue__.allFileList.filter(function (item) { return !!item.selected; });

				// 2
				let wpCore = unsafeWindow.document.querySelector(".wp-s-core-pan");
				if (wpCore?.__vue__?.selectedList?.[0]) list = wpCore.__vue__.selectedList;

				// 1
				let context = unsafeWindow.require?.("system-core:context/context.js");
				if (context?.instanceForSystem?.list?.getSelected?.()?.[0]) list = context.instanceForSystem.list.getSelected();

				return base.clone(list);
			} catch (e) {
				console.error(e);
				return [];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/disk\/home/.test(path)) return "home";
			if (/^\/disk\/main/.test(path)) return "main";
			if (/^\/youth\/pan\/main/.test(path)) return "youth";
			if (/^\/(s|share)\//.test(path)) return "share";
			return "";
		},
};
const $aliyun = {
		async getLink() {
			let reactDomGrid = document.querySelector(config.$aliyun.mount.grid);
			if (reactDomGrid) {
				var dialog = await Swal.fire({
					...temp.swalDefault,
					title: "提示",
					html: `<div style="display:flex;align-items:center;justify-content:center;">请先切换到&nbsp;&nbsp;<svg class="icon" class="icon--D3kMk " viewBox="0 0 1024 1024" width="20" height="20" fill="currentColor"><use xlink:href="#PDSDrag"></use></svg>&nbsp;<b>列表视图</b>&nbsp;&nbsp;后再获取下载链接哦</div>`,
					icon: "info",
					showCloseButton: true,
					showDenyButton: true,
					confirmButtonText: `<svg class="pl-icon"><use xlink:href="#pl-icon-fa-check"/></svg> 切换`,
					denyButtonText: `<svg class="pl-icon"><use xlink:href="#pl-icon-fa-x-mark"/></svg> 不要`,
				});
				if (dialog.isConfirmed) {
					document.querySelector(config.$aliyun.mount.switch).click();
					return message.success("提示：<br/>切换为列表视图成功<br/>请再获取一次下载链接吧~");
				}
				return false;
			}

			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => item.type !== "file")) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			if (temp.page === "home") {
				selectList = selectList.filter(item => item.type === "file")
				let batchSize = 15;
				let processed = 0;
				$doc.find(".loading-popup .loading-title").html(`链接获取中`);
				$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);
				for (let i = 0; i < selectList.length; i += batchSize) {
					// 当前批次文件
					let batch = selectList.slice(i, i + batchSize);
					// 过滤掉已有 URL 的文件
					let noUrlSelectList = batch.filter(v => !Boolean(v.url));
					let hasUrlSelectList = batch.filter(v => Boolean(v.url));
					let queue = [];
					// 为没有 URL 的文件生成请求队列
					noUrlSelectList.forEach((item) => {
						queue.push(this.getFileUrl(item.driveId, item.fileId)
							.then(val => {
								processed++;
								$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
								return val;
							}));
					});
					hasUrlSelectList.forEach((item) => {
						processed++;
						$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
					});
					// 等待本批次的请求结果
					let res = await Promise.all(queue);
					res.forEach((val, index) => {
						noUrlSelectList[index].url = val;
					});
					// 每次处理完一个批次后，等待 1 秒
					await base.sleep(1000);
				}
			} else {
				return message.error("提示：<br/>页面错误~");
			}
			temp.links = [selectList, {
				isFolder: v => v.type === "folder",
				getFileName: v => v.name,
				getFileSize: v => v.size,
				getFileLink: v => (v.downloadUrl || v.url),
				convert: {
					aria2: `--header "Referer:https://${location.host}/"`,
					curl: `-e "https://${location.host}/"`,
					bitcomet: `&refer=${encodeURIComponent(`https://${location.host}/`)}`
				},
				tooltip: config.$aliyun.dom
			}];
			base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
		},
		async getFileUrl(d, f) {
			let res = await base.post(config.$aliyun.api.getLink, { drive_id: d, file_id: f }, { "Content-Type": "application/json", "Authorization": `${base.getStorage("token").token_type} ${base.getStorage("token").access_token}`, "X-Canary": "client=windows,app=adrive,version=v6.0.0" });
			if (res.code == "AccessTokenInvalid") {
				return message.error("提示：<br/>访问令牌过期了，请刷新网页后再试");
			}
			if (res.url) {
				return res.url;
			}
			return "";
		},
		getSelectedList() {
			try {
				let selectedList = [];
				let reactDom = document.querySelector(config.$aliyun.mount.list);
				let reactObj = base.findReact(reactDom, 1);
				let props = reactObj.pendingProps;
				if (props) {
					let fileList = props.dataSource || [];
					let selectedKeys = props.selectedKeys.split(",");
					fileList.forEach(function (val) {
						if (selectedKeys.includes(val.fileId)) {
							selectedList.push(val);
						}
					});
				}
				return selectedList;
			} catch (e) {
				return [];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/(drive)/.test(path)) return "home";
			if (/^\/(s|share)\//.test(path)) return "share";
			return "";
		},
};
const $mcloud = {
		getRandomString(len) {
			len = len || 16;
			let $chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
			let maxPos = $chars.length;
			let pwd = "";
			for (let i = 0; i < len; i++) {
				pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
			}
			return pwd;
		},
		utob(str) {
			let u = String.fromCharCode;
			return str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g, function (t) {
				if (t.length < 2) {
					let e = t.charCodeAt(0);
					return e < 128 ? t : e < 2048 ? u(192 | e >>> 6) + u(128 | 63 & e) : u(224 | e >>> 12 & 15) + u(128 | e >>> 6 & 63) + u(128 | 63 & e);
				}
				e = 65536 + 1024 * (t.charCodeAt(0) - 55296) + (t.charCodeAt(1) - 56320);
				return u(240 | e >>> 18 & 7) + u(128 | e >>> 12 & 63) + u(128 | e >>> 6 & 63) + u(128 | 63 & e);
			});
		},
		getSign(e, t, a, n) {
			let r = "",
				i = "";
			if (t) {
				let s = Object.assign({}, t);
				i = JSON.stringify(s),
					i = i.replace(/\s*/g, ""),
					i = encodeURIComponent(i);
				let c = i.split(""),
					u = c.sort();
				i = u.join("");
			}
			let A = md5(base.encodeBase(this.utob(i)));
			let l = md5(a + ":" + n);
			return md5(A + l).toUpperCase();
		},
		async getFileUrl(item, index) {
			try {
				if (item.downloadUrl) return {
					index,
					downloadUrl: item.downloadUrl
				};
				if (this.detectPage() === "home") {
					let body = {
						fileId: item.contentID
					}
					let time = new Date(+new Date() + 8 * 3600 * 1000).toJSON().substr(0, 19).replace("T", " ");
					let key = this.getRandomString(16);
					let sign = this.getSign(undefined, body, time, key);
					let getCookie = (name) => {
						let cname = name + "=";
						let ca = document.cookie.split(";");
						for (let i = 0; i < ca.length; i++) {
							let c = ca[i].trim();
							if (c.indexOf(cname) == 0) return c.substring(cname.length, c.length);
						}
						return "";
					}
					let res = await base.post(config.$mcloud.api.getLink, body, {
						"Authorization": getCookie("authorization"),
						"Caller": "web",
						"Content-Type": "application/json;charset=UTF-8",
						"CMS-DEVICE": "default",
						"Mcloud-Channel": "1000101",
						"Mcloud-Client": "10701",
						"Mcloud-Sign": time + "," + key + "," + sign,
						"Mcloud-Version": "7.14.2",
						"X-DeviceInfo": "||9|7.17.0|edge||||windows 10||zh-CN|||",
						"X-Huawei-ChannelSrc": "10000034",
						"X-Inner-Ntwk": "2",
						"X-M4C-Caller": "PC",
						"X-M4C-Src": "10002",
						"X-SvcType": "1",
						"X-Yun-Api-Version": "v1",
						"X-Yun-App-Channel": "10000034",
						"X-Yun-Channel-Source": "10000034",
						"X-Yun-Client-Info": "||9|7.17.0|edge||||windows 10||zh-CN|||||",
						"X-Yun-Module-Type": "100",
						"X-Yun-Svc-Type": "1",
						"X-Yun-Url-Type": "3"
					});
					if (res.success) {
						return {
							index,
							downloadUrl: res.data.url
						};
					} else {
						return {
							index,
							downloadUrl: "获取下载地址失败，刷新后再试试吧~"
						};
					}
				}
				if (this.detectPage() === "share") {
					let vueDom = document.querySelector(".main_file_list").__vue__;
					let res = await base.post(config.$mcloud.api.getShareLink, `linkId=${vueDom.linkID}&contentIds=${item.path}&catalogIds=`, { "Content-Type": "application/x-www-form-urlencoded" });
					if (res.code == 0) {
						return {
							index,
							downloadUrl: res.data.redrUrl
						};
					} else {
						return {
							index,
							downloadUrl: "获取下载地址失败，刷新后再试试吧~"
						};
					}
				}
			} catch (e) {
				return {
					index,
					downloadUrl: "获取下载地址失败，刷新后再试试吧~"
				};
			}
		},
		async getLink() {
			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => !item.contentID && !item.contentName)) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			if (temp.page === "home") {
				selectList = selectList.filter(item => item.contentID && item.contentName && item.contentSuffix);
				let batchSize = 15;
				let processed = 0;
				$doc.find(".loading-popup .loading-title").html(`链接获取中`);
				$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);
				for (let i = 0; i < selectList.length; i += batchSize) {
					let batch = selectList.slice(i, i + batchSize);
					let queue = [];
					batch.forEach((item, localIndex) => {
						let globalIndex = i + localIndex;
						queue.push(this.getFileUrl(item, globalIndex)
							.then(val => {
								processed++;
								$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
								return val;
							}));
					});
					let res = await Promise.all(queue);
					res.forEach(val => {
						selectList[val.index].downloadUrl = val.downloadUrl;
					});
					await base.sleep(1000);
				}
			} else {
				return message.error("提示：<br/>页面错误~");
			}
			temp.links = [selectList, {
				isFolder: v => (v.dirEtag || v.caName),
				getFileName: v => (v.contentName || v.coName),
				getFileSize: v => (v.contentSize || v.coSize),
				getFileLink: v => v.downloadUrl,
				tooltip: config.$mcloud.dom
			}];
			base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
		},
		getSelectedList() {
			try {
				return document.querySelector(".main_file_list").__vue__.selectList.map(val => val.item);
			} catch (e) {
				let vueDom = document.querySelector(".home-page").__vue__;
				let fileList = vueDom._computedWatchers.fileList.value;
				let dirList = vueDom._computedWatchers.dirList.value;
				let selectedFileIndex = vueDom.selectedFile;
				let selectedDirIndex = vueDom.selectedDir;
				let selectFileList = fileList.filter((v, i) => {
					return selectedFileIndex.includes(i);
				});
				let selectDirList = dirList.filter((v, i) => {
					return selectedDirIndex.includes(i);
				});
				return [...selectFileList, ...selectDirList];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/w/.test(path)) return "home";
			if (/^\/link|shareweb/.test(path)) return "share";
			return "";
		},
};
const $tcloud = {
		async getToken() {
			$doc.find(".loading-popup .loading-title").html(`令牌获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取状态~</div>`);
			let res = await base.getFinal(config.$tcloud.api.getAccessToken, undefined, true);
			let accessToken = res.match(/accessToken=(\w+)/)?.[1];
			accessToken && base.setStorage("accessToken", accessToken);
			$doc.find(".loading-popup .loading-title").html(`令牌获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>获取成功，令牌已缓存~</div>`);
			return accessToken;
		},
		async getFileUrl(item, index, token) {
			try {
				if (item.downloadUrl) {
					return {
						index,
						downloadUrl: item.downloadUrl
					}
				};
				let time = Date.now();
				let url = `${config.$tcloud.api.getLink}?fileId=${item.fileId}`;
				let _sign = `AccessToken=${token}&Timestamp=${time}`;
				if (item.shareId) {
					url += `&dt=1&shareId=${item.shareId}`;
					_sign += `&dt=1`;
				}
				_sign += `&fileId=${item.fileId}`;
				if (item.shareId) {
					_sign += `&shareId=${item.shareId}`;
				}
				let res = await base.get(url, { "Accept": "application/json;charset=UTF-8", "Sign-Type": 1, "Accesstoken": token, "Timestamp": time, "Signature": md5(_sign).toString() });
				if (res.res_code == 0) {
					return {
						index,
						downloadUrl: res.fileDownloadUrl
					};
				} else if (res.errorcode == "InvalidSessionKey") {
					return {
						index,
						downloadUrl: "提示：<br/>请先登录网盘~"
					};
				} else if (res.res_code == "ShareNotFoundFlatDir") {
					return {
						index,
						downloadUrl: "提示：<br/>请[转存]文件，之后再👉前往[我的网盘]中下载哦~"
					};
				} else {
					return {
						index,
						downloadUrl: "获取下载地址失败，刷新后再试试吧~" + (res.res_code ? res.res_code : "")
					};
				}
			} catch (e) {
				return {
					index,
					downloadUrl: "获取下载地址失败，刷新后再试试吧~"
				};
			}
		},
		async getLink() {
			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => item.isFolder)) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			selectList = selectList.filter(item => !item.isFolder)
			$doc.find(".loading-popup .loading-title").html(`令牌获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取状态~</div>`);
			let token = base.getStorage("accessToken") || await this.getToken();
			if (!token) {
				return message.error("提示：<br/>请先登录网盘~");
			}
			$doc.find(".loading-popup .loading-title").html(`令牌获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>获取缓存成功~</div>`);
			let batchSize = 15;
			let processed = 0;
			$doc.find(".loading-popup .loading-title").html(`链接获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);
			for (let i = 0; i < selectList.length; i += batchSize) {
				let batch = selectList.slice(i, i + batchSize);
				let queue = [];
				batch.forEach((item, localIndex) => {
					let globalIndex = i + localIndex;
					queue.push(this.getFileUrl(item, globalIndex, token)
						.then(val => {
							processed++;
							$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
							return val;
						}));
				});
				let res = await Promise.all(queue);
				res.forEach(val => {
					selectList[val.index].downloadUrl = val.downloadUrl;
				});
				await base.sleep(1000);
			}
			temp.links = [selectList, {
				isFolder: v => v.isFolder,
				getFileName: v => v.fileName,
				getFileSize: v => v.size,
				getFileLink: v => v.downloadUrl,
				tooltip: config.$mcloud.dom
			}];
			base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
		},
		getSelectedList() {
			try {
				return document.querySelector(".c-file-list").__vue__.selectedList;
			} catch (e) {
				return [document.querySelector(".info-detail").__vue__.fileDetail];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/web\/main/.test(path)) return "home";
			if (/^\/web\/share/.test(path)) return "share";
			return "";
		},
};
const $xunlei = {
		getToken() {
			$doc.find(".loading-popup .loading-title").html(`令牌获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取状态~</div>`);
			let credentials = {}, captcha = {};
			for (let i = 0; i < localStorage.length; i++) {
				if (/^credentials_/.test(localStorage.key(i))) {
					credentials = base.getStorage(localStorage.key(i));
					base.setStorage("");
				}
				if (/^captcha_[\w]{16}/.test(localStorage.key(i))) {
					captcha = base.getStorage(localStorage.key(i));
				}
			}
			let deviceid = /(\w{32})/.exec(base.getStorage("deviceid").split(","))[0];
			let token = {
				credentials,
				captcha,
				deviceid
			};
			return token;
		},
		async getFileUrl(item, index, token) {
			try {
				if (item.downloadUrl) return {
					index,
					downloadUrl: item.downloadUrl
				};
				let res = await base.get(config.$xunlei.api.getLink + item.id, { "Authorization": `${token.credentials.token_type} ${token.credentials.access_token}`, "Content-Type": "application/json", "X-Captcha-Token": token.captcha.token, "X-Device-Id": token.deviceid });
				if (res.web_content_link) {
					return {
						index,
						downloadUrl: res.web_content_link
					};
				} else if (res?.error_code == 9) {
					return {
						index,
						downloadUrl: "获取下载地址失败，服务器说：页面验证过期了，刷新后再获取吧~"
					};
				} else {
					return {
						index,
						downloadUrl: `获取下载地址失败，${res?.error_description ? "服务器说：" + res.error_description + "。" : "刷新后再试试吧~"}`
					};
				}
			} catch (e) {
				return message.error("提示：<br/>请先登录网盘后再刷新页面呢~");
			}
		},
		async getLink() {
			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => item.kind !== "drive#file")) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			if (temp.page === "home") {
				let token = this.getToken();
				let batchSize = 15;
				let processed = 0;
				$doc.find(".loading-popup .loading-title").html(`链接获取中`);
				$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);
				for (let i = 0; i < selectList.length; i += batchSize) {
					let batch = selectList.slice(i, i + batchSize);
					let queue = [];
					batch.forEach((item, localIndex) => {
						let globalIndex = i + localIndex;
						queue.push(this.getFileUrl(item, globalIndex, token)
							.then(val => {
								processed++;
								$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
								return val;
							}));
					});
					let res = await Promise.all(queue);
					res.forEach(val => {
						selectList[val.index].downloadUrl = val.downloadUrl;
					});
					await base.sleep(1000);
				}
			} else {
				return message.error("提示：<br/>页面错误~");
			}
			temp.links = [selectList, {
				isFolder: v => v.kind === "drive#folder",
				getFileName: v => v.name,
				getFileSize: v => v.size,
				getFileLink: v => v.downloadUrl,
				getFileMirror: v => base.getMirrorList(v, config.$xunlei.api.mirror),
				tooltip: config.$xunlei.dom
			}];
			base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
		},
		getSelectedList() {
			try {
				let doms = document.querySelectorAll(`[class*="SourceListItem__item--"]`), list = [];
				if (doms.length) for (let dom of doms) {
					let domVue = dom.__vue__;
					if (domVue?.selected?.includes?.(domVue.info.id)) list.push(domVue.info);
				}
				return base.clone(list);
			} catch (e) {
				return [];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/$/.test(path)) return "home";
			if (/^\/(s|share)\//.test(path)) return "share";
			return "";
		},
};
const $quark = {
		async getLink() {
			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => !item.file)) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			if (temp.page === "home") {
				let data = [];
				let batchSize = 15;
				let processed = 0;
				selectList = selectList.filter(item => item.file === true)
				for (let i = 0; i < selectList.length; i += batchSize) {
					// 获取当前批次文件
					let batch = selectList.slice(i, i + batchSize);
					let fids = batch.map(item => item.fid);
					// 发起请求获取链接
					let res = await base.post(config.$quark.api.getLink, { "fids": fids }, { "Content-Type": "application/json", "User-Agent": config.$quark.api.ua.downloadLink });
					if (res?.code == 31001) {
						return message.error("提示：<br/>请先登录网盘~<br/>代码：" + res.code);
					} else if (res?.code == 23018) {
						let fid = res?.message?.match(/\[([a-f0-9]{32})\]/)?.[1];
						let item = batch.find(item => item.fid === fid);
						return message.error(`提示：<br/>超出游客可获取大小限制<br/>请登录后获取哦~${item?.file_name ? `<br/>文件：${item.file_name}` : ""}`);
					}
					if (res?.code !== 0) {
						return message.error("提示：<br/>获取链接失败了~<br/>代码：" + res.code);
					}
					// 合并响应数据
					if (res?.data) {
						data.push(...res.data);
					}
					// 更新处理进度
					processed += batch.length;
					// 更新UI显示
					$doc.find(".loading-popup .loading-title").html(`链接获取中`);
					$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
					// 请求间隔节流
					await base.sleep(1000);
				}
				temp.links = [data, {
					isFolder: v => v.file === false,
					getFileName: v => v.file_name,
					getFileSize: v => v.size,
					getFileLink: v => v.download_url,
					convert: {
						aria2: `--header "User-Agent:${config.$quark.api.ua.downloadLink}" --header "Referer:https://${location.host}/" --header "Cookie:${document.cookie}"`,
						curl: `-A "${config.$quark.api.ua.downloadLink}" -e "https://${location.host}/" -b "${document.cookie}"`,
						bitcomet: `user_agent=${encodeURIComponent(config.$quark.api.ua.downloadLink)}&refer=${encodeURIComponent(`https://${location.host}/`)}&cookie=${encodeURIComponent(document.cookie)}`
					},
					tooltip: config.$quark.dom
				}];
				base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
			} else if (temp.page === "share") {
				let pwd_id = unsafeWindow.factStat?.ut?.baseParams?.pwd_id || // fast
					unsafeWindow.factStat?.wa?.customStatParams?.pwd_id || // drive
					location.pathname.match(/^\/(?:s|share)\/([a-zA-Z0-9]+)/)?.[1]; // 兜底
				if (!pwd_id) return message.error("错误：<br/>无法提取分享 ID~");

				let data = [];
				let batchSize = 15;
				let processed = 0;
				selectList = selectList.filter(item => item.file === true)
				for (let i = 0; i < selectList.length; i += batchSize) {
					// 获取当前批次文件
					let batch = selectList.slice(i, i + batchSize);
					let fids = batch.map(item => item.fid);
					let fids_token = batch.map(item => item.share_fid_token);
					// 发起请求获取链接
					let res = await base.post(config.$quark.api.getLink, { "fids": fids, "fids_token": fids_token, pwd_id, "stoken": batch[0].stoken }, { "Content-Type": "application/json", "User-Agent": config.$quark.api.ua.downloadLink });
					if (res?.code == 31001) {
						return message.error("提示：<br/>请先登录网盘~<br/>代码：" + res.code);
					} else if (res?.code == 23018) {
						let fid = res?.message?.match(/\[([a-f0-9]{32})\]/)?.[1];
						let item = batch.find(item => item.fid === fid);
						return message.error(`提示：<br/>超出游客可获取大小限制<br/>请登录后获取哦~${item?.file_name ? `<br/>文件：${item.file_name}` : ""}`);
					}
					if (res?.code !== 0) return message.error("提示：<br/>获取链接失败了~<br/>代码：" + res.code);
					// 合并响应数据
					if (res?.data) {
						data.push(...res.data);
					}
					// 更新处理进度
					processed += batch.length;
					// 更新UI显示
					$doc.find(".loading-popup .loading-title").html(`链接获取中`);
					$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
					// 请求间隔节流
					await base.sleep(1000);
				}
				temp.links = [data, {
					isFolder: v => v.file === false,
					getFileName: v => v.file_name,
					getFileSize: v => v.size,
					getFileLink: v => v.download_url,
					convert: {
						aria2: `--header "User-Agent:${config.$quark.api.ua.downloadLink}" --header "Referer:https://${location.host}/" --header "Cookie:${document.cookie}"`,
						curl: `-A "${config.$quark.api.ua.downloadLink}" -e "https://${location.host}/" -b "${document.cookie}"`,
						bitcomet: `user_agent=${encodeURIComponent(config.$quark.api.ua.downloadLink)}&refer=${encodeURIComponent(`https://${location.host}/`)}&cookie=${encodeURIComponent(document.cookie)}`
					},
					tooltip: config.$quark.dom
				}];
				base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
			} else {
				return message.error("提示：<br/>页面错误~");
			}
		},
		getSelectedList() {
			try {
				let selectedList = [];
				let reactDom = document.getElementsByClassName("file-list")[0];
				let reactObj = base.findReact(reactDom);
				let props = reactObj.props;
				if (props) {
					let stoken = props.stoken || "";
					let fileList = props.list || [];
					let selectedKeys = props.selectedRowKeys || [];
					fileList.forEach(function (val) {
						if (selectedKeys.includes(val.fid)) {
							selectedList.push({ ...val, stoken });
						}
					});
				}
				return selectedList;
			} catch (e) {
				return [];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/(list)/.test(path)) return "home";
			if (/^\/(s|share)\//.test(path)) return "share";
			return "";
		},
};
const $uc = {
		async getLink() {
			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => !item.file)) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			if (temp.page === "home") {
				let data = [];
				let batchSize = 15;
				let processed = 0;
				selectList = selectList.filter(item => item.file === true)
				for (let i = 0; i < selectList.length; i += batchSize) {
					// 获取当前批次文件
					let batch = selectList.slice(i, i + batchSize);
					let fids = batch.map(item => item.fid);
					// 发起请求获取链接
					let res = await base.post(config.$uc.api.getLink, { "fids": fids }, { "Content-Type": "application/json", "User-Agent": config.$uc.api.ua.downloadLink });
					if (res?.code == 31001) {
						return message.error("提示：<br/>请先登录网盘~<br/>代码：" + res.code);
					} else if (res?.code == 23018) {
						let fid = res?.message?.match(/\[([a-f0-9]{32})\]/)?.[1];
						let item = batch.find(item => item.fid === fid);
						return message.error(`提示：<br/>超出游客可获取大小限制<br/>请登录后获取哦~${item?.file_name ? `<br/>文件：${item.file_name}` : ""}`);
					}
					if (res?.code !== 0) {
						return message.error(`提示：<br/>获取链接失败了~<br/>${res.code ? res.code : ""} ${res.message ? res.message : ""}`);
					}
					// 合并响应数据
					if (res?.data) {
						data.push(...res.data);
					}
					// 更新处理进度
					processed += batch.length;
					// 更新UI显示
					$doc.find(".loading-popup .loading-title").html(`链接获取中`);
					$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
					// 请求间隔节流
					await base.sleep(1000);
				}
				temp.links = [data, {
					isFolder: v => v.file === false,
					getFileName: v => v.file_name,
					getFileSize: v => v.size,
					getFileLink: v => v.download_url,
					convert: {
						aria2: `--header "User-Agent:${config.$uc.api.ua.downloadLink}" --header "Referer:https://${location.host}/" --header "Cookie:${document.cookie}"`,
						curl: `-A "${config.$uc.api.ua.downloadLink}" -e "https://${location.host}/" -b "${document.cookie}"`,
						bitcomet: `user_agent=${encodeURIComponent(config.$uc.api.ua.downloadLink)}&refer=${encodeURIComponent(`https://${location.host}/`)}&cookie=${encodeURIComponent(document.cookie)}`
					},
					tooltip: config.$uc.dom
				}];
				base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
			} else if (temp.page === "share") {
				let pwd_id = unsafeWindow.factStat?.ut?.baseParams?.pwd_id || // fast
					unsafeWindow.factStat?.wa?.customStatParams?.pwd_id || // drive
					location.pathname.match(/^\/(?:s|share)\/([a-zA-Z0-9]+)/)?.[1]; // 兜底
				if (!pwd_id) return message.error("错误：<br/>无法提取分享 ID~");

				let data = [];
				let batchSize = 15;
				let processed = 0;
				selectList = selectList.filter(item => item.file === true)
				for (let i = 0; i < selectList.length; i += batchSize) {
					// 获取当前批次文件
					let batch = selectList.slice(i, i + batchSize);
					let fids = batch.map(item => item.fid);
					let fids_token = batch.map(item => item.share_fid_token);
					// 发起请求获取链接
					let res = await base.post(config.$uc.api.getLink, { "fids": fids, "fids_token": fids_token, pwd_id, "stoken": batch[0].stoken }, { "Content-Type": "application/json", "User-Agent": config.$uc.api.ua.downloadLink });
					if (res?.code == 31001) {
						return message.error("提示：<br/>请先登录网盘~<br/>代码：" + res.code);
					} else if (res?.code == 23018) {
						let fid = res?.message?.match(/\[([a-f0-9]{32})\]/)?.[1];
						let item = batch.find(item => item.fid === fid);
						return message.error(`提示：<br/>超出游客可获取大小限制<br/>请登录后获取哦~${item?.file_name ? `<br/>文件：${item.file_name}` : ""}`);
					}
					if (res?.code !== 0) return message.error("提示：<br/>获取链接失败了~<br/>代码：" + res.code);
					// 合并响应数据
					if (res?.data) {
						data.push(...res.data);
					}
					// 更新处理进度
					processed += batch.length;
					// 更新UI显示
					$doc.find(".loading-popup .loading-title").html(`链接获取中`);
					$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
					// 请求间隔节流
					await base.sleep(1000);
				}
				temp.links = [data, {
					isFolder: v => v.file === false,
					getFileName: v => v.file_name,
					getFileSize: v => v.size,
					getFileLink: v => v.download_url,
					convert: {
						aria2: `--header "User-Agent:${config.$uc.api.ua.downloadLink}" --header "Referer:https://${location.host}/" --header "Cookie:${document.cookie}"`,
						curl: `-A "${config.$uc.api.ua.downloadLink}" -e "https://${location.host}/" -b "${document.cookie}"`,
						bitcomet: `user_agent=${encodeURIComponent(config.$uc.api.ua.downloadLink)}&refer=${encodeURIComponent(`https://${location.host}/`)}&cookie=${encodeURIComponent(document.cookie)}`
					},
					tooltip: config.$uc.dom
				}];
				base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
			} else {
				return message.error("提示：<br/>页面错误~");
			}
		},
		getSelectedList() {
			try {
				let selectedList = [];
				let reactDom = document.getElementsByClassName("file-list")[0];
				let reactObj = base.findReact(reactDom);
				let props = reactObj.props;
				if (props) {
					let stoken = props.stoken || "";
					let fileList = props.list || [];
					let selectedKeys = props.selectedRowKeys || [];
					fileList.forEach(function (val) {
						if (selectedKeys.includes(val.fid)) {
							selectedList.push({ ...val, stoken });
						}
					});
				}
				return selectedList;
			} catch (e) {
				return [];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/(list)/.test(path)) return "home";
			if (/^\/(s|share)\//.test(path)) return "share";
			return "";
		},
};
const $123pan = {
		getToken() {
			$doc.find(".loading-popup .loading-title").html(`令牌获取中`);
			$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取令牌~</div>`);
			let token = base.getStorage("authorToken");
			return token;
		},
		async getLink() {
			let selectList = this.getSelectedList();
			if (selectList.length === 0) return message.error("提示：<br/>请勾选要下载的文件哦~");
			if (selectList.every(item => item.Type !== 0)) return message.error("提示：<br/>请打开文件夹后再勾选文件~");
			if (temp.page === "home") {
				let token = this.getToken();
				let batchSize = 15;
				let processed = 0;
				selectList = selectList.filter(item => item.Type === 0);
				for (let i = 0; i < selectList.length; i += batchSize) {
					let batch = selectList.slice(i, i + batchSize);
					let queue = [];
					$doc.find(".loading-popup .loading-title").html(`链接获取中`);
					$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);
					batch.forEach((item, localIndex) => {
						let globalIndex = i + localIndex;
						queue.push(this.getFileUrl(item, globalIndex, token)
							.then(val => {
								processed++;
								$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
								return val;
							}));
					});
					let res = await Promise.all(queue);
					res.forEach(val => {
						selectList[val.index].DownloadUrl = val.downloadUrl;
					});
					await base.sleep(1000);
				}
				temp.links = [selectList, {
					isFolder: v => v.Type !== 0,
					getFileName: v => v.FileName,
					getFileSize: v => v.Size,
					getFileLink: v => v.DownloadUrl || v.DownloadURL,
					tooltip: config.$123pan.dom
				}]
				base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
			} else if (temp.page === "share") {
				let token = this.getToken();
				let batchSize = 15;
				let processed = 0;
				selectList = selectList.filter(item => item.Type === 0);
				let pathSplit = location.pathname.split("/").filter(Boolean);
				let ShareKey = pathSplit[1];
				for (let i = 0; i < selectList.length; i += batchSize) {
					let batch = selectList.slice(i, i + batchSize);
					let queue = [];
					$doc.find(".loading-popup .loading-title").html(`链接获取中`);
					$doc.find(".loading-popup .swal2-html-container").html(`<div>正在获取文件对应的下载链接~</div>`);
					batch.forEach((item, localIndex) => {
						let globalIndex = i + localIndex;
						queue.push(this.getFileUrl(item, globalIndex, token, ShareKey)
							.then(val => {
								processed++;
								$doc.find(".loading-popup .swal2-html-container").html(`<div>已获取 ${processed} / ${selectList.length} 个链接~</div>`);
								return val;
							}));
					});
					let res = await Promise.all(queue);
					res.forEach(val => {
						selectList[val.index].DownloadUrl = val.downloadUrl;
					});
					await base.sleep(1000);
				}
				temp.links = [selectList, {
					isFolder: v => v.Type !== 0,
					getFileName: v => v.FileName,
					getFileSize: v => v.Size,
					getFileLink: v => v.DownloadUrl || v.DownloadURL,
					tooltip: config.$123pan.dom
				}]
				base.showMainDialog(config.base.dom.button[temp.mode].title, base.generateDom(temp.links), config.base.dom.button[temp.mode].footer);
			} else {
				return message.error("提示：<br/>页面错误~");
			}
		},
		async getFileUrl(item, index, token, ShareKey) {
			let res = null;
			if (ShareKey) {
				res = await base.post(config.$123pan.api.getShareLink, { "ShareKey": ShareKey, "FileID": item.FileId, "S3keyFlag": item.S3KeyFlag, "Size": item.Size, "Etag": item.Etag }, { "Content-Type": "application/json", ...(token ? {"Authorization": `Bearer ${token}`} : {}), "Platform": "ios" });
			} else {
				res = await base.post(config.$123pan.api.getLink, { "driveId": 0, "etag": item.Etag, "fileId": item.FileId, "s3keyFlag": item.S3KeyFlag, "type": item.Type, "fileName": item.FileName, "size": item.Size }, { "Content-Type": "application/json", ...(token ? {"Authorization": `Bearer ${token}`} : {}), "Platform": "ios" });
			}
			if (res.data?.DownloadUrl || res.data?.DownloadURL) {
				let url = res.data.DownloadUrl ? res.data.DownloadUrl : res.data?.DownloadURL;
				let surl = new URL(url).searchParams.get("params");
				if (surl) url = base.decodeBase(surl);
				// url = await base.getFinalUrl(url);
				return {
					index,
					downloadUrl: url
				};
			} else if (res?.code == 5112) {
				return message.error(res?.message || "请先登录网盘后再获取链接");
			} else if (res?.code == 5113) {
				return {
					index,
					downloadUrl: "获取下载地址失败，服务器说：本月免费流量不足，请开通网盘会员~"
				};
			} else {
				return {
					index,
					downloadUrl: `获取下载地址失败，${res?.message ? "服务器说：" + res.message + "。" : "刷新后再试试吧~"}`
				};
			}
		},
		getSelectedList() {
			try {
				let selectedList = [];
				let reactDom = $(".ant-table-wrapper, .tiled-list, .file-list, .single-file-sharing-container-content, [class*=table-module__shell]")[0];
				let reactObj = base.findReact(reactDom);
				let props = reactObj.pendingProps;
				if (props) {
					let fileList = props?.dataSource || props?.loadedFileList || props?.files || [];
					let selectedKey = props?.rowSelection?.selectedRowKeys || [];
					fileList.forEach(function (val) {
						if (val?.checked === true) {
							selectedList.push(val);
						} else if (selectedKey.includes(val.FileId)) {
							selectedList.push(val);
						}
					});
					if (props?.file?.S3KeyFlag) selectedList.push(props.file);
				}
				return selectedList;
			} catch (e) {
				return [];
			}
		},
		detectPage() {
			let path = location.pathname;
			if (/^\/$/.test(path)) return "home";
			if (/^\/s\//.test(path)) return "share";
			return "";
		},
};
  const baiduSelected=$baidu.getSelectedList;
  $baidu.getSelectedList=function(){
   if(temp.page==='share'){
    const rows=[...document.querySelectorAll('[data-file-key]')].filter(node=>node.getClientRects().length);
    if(rows.length){
     const keys=rows.filter(node=>node.querySelector('[role=checkbox][aria-checked=true]')).map(node=>node.getAttribute('data-file-key'));
     if(!keys.length)return [];
     const files=unsafeWindow.yunData?.file_list||unsafeWindow.locals?.dump?.().file_list?.value;
     const selected=Array.isArray(files)?files.filter(item=>keys.includes(String(item.fs_id))):[];
     if(new Set(keys).size!==keys.length||selected.length!==keys.length)fail('网盘列表刚刚发生变化，请刷新后重新勾选文件');
     return base.clone(selected);
    }
   }
   const selected=baiduSelected.call(this);if(selected.length||temp.page!=='share')return selected;
   // The new single-file preview has no selectable list. Never select a whole share implicitly.
   const files=unsafeWindow.yunData?.file_list;
   if(document.querySelector('.bottom_download_btn')&&!document.querySelector('.JS-list-view-item,.file-list,.wp-s-core-pan')&&Array.isArray(files)&&files.length===1&&files[0].isdir===0)return base.clone(files);
   return [];
  };
  // Cached grants arrive from the isolated extension; a fresh grant requires its explicit button.
  $baidu.getToken=async()=>fail('百度下载需先授权：桌面版用 token、不传百度 Cookie，公开分享页也一样。请在 Ruxget 插件内点“百度授权”后重试');
  const adapters={baidu:$baidu,aliyun:$aliyun,mcloud:$mcloud,tcloud:$tcloud,xunlei:$xunlei,quark:$quark,uc:$uc,pan123:$123pan};
  try{
   const main=adapters[provider];if(!main)fail('当前网盘尚未支持');temp.main=main;temp.page=main.detectPage();const modern123=provider==='pan123'&&/^[a-z0-9-]+\.share\.123pan\.cn$/.test(location.hostname)&&/^\/123pan\/[^/]+\/?$/.test(location.pathname);if(modern123)temp.page='share';
   const selected=base.clone(main.getSelectedList());if(!selected.length)fail('请先在网盘里勾选需要下载的文件');if(selected.length>100)fail('一次最多下载 100 个文件，请分批选择');main.getSelectedList=()=>selected;
   if(provider==='baidu'&&temp.page==='share'&&selected.every(item=>item.isdir===1))fail('请打开文件夹后，再勾选需要下载的文件');
   if(modern123){
    const files=selected.filter(item=>item.Type===0),shareKey=location.pathname.split('/').filter(Boolean)[1],token=base.getStorage('authorToken'),apiHeaders={'Content-Type':'application/json','Platform':'web',...(typeof token==='string'&&token?{'Authorization':'Bearer '+token}:{})};
    if(!files.length)fail('请打开文件夹后再勾选需要下载的文件');
    const traffic=await base.post(location.origin+'/api/share/download/traffic/check',{shareKey,fileIds:files.map(item=>item.FileId)},apiHeaders);
    if(traffic.code!==0)fail(traffic.message||'网盘未允许这次下载，请回到原网页查看');
    if(['isBlocked','isTrafficExceeded','isPay'].some(key=>traffic.data?.[key]===true||traffic.data?.[key]===1))fail(traffic.data?.desc1||'源站要求处理下载权限或流量配额，请使用原下载按钮查看；本次未创建下载');
    main.getFileUrl=async(item,index)=>{const res=await base.post(location.origin+'/api/v2/share/download/info',{ShareKey:shareKey,FileID:item.FileId,S3keyFlag:item.S3KeyFlag,Size:item.Size,Etag:item.Etag},apiHeaders);if(res.code!==0)fail(res.message||'网盘未返回可用下载地址');const data=res.data,prefix=data?.dispatchList?.[0]?.prefix;if(String(data?.fileId)!==String(item.FileId)||typeof prefix!=='string'||typeof data?.downloadPath!=='string'||!/^\/[^/]/.test(data.downloadPath))fail('网盘返回的下载信息与所选文件不一致');const server=new URL(prefix);if(server.pathname!=='/'||server.search||server.hash)fail('网盘下载线路格式已变化，请刷新后重试');return {index,downloadUrl:new URL(data.downloadPath,server).href};};
   }
   await main.getLink();if(!output?.length)fail('没有取得可下载的文件，请进入文件夹后勾选文件');for(const file of output)if(typeof file.url!=='string'||!/^https:\/\//.test(file.url))fail(file.url||'网盘未返回可用下载地址，请重新登录或刷新后重试');
   const folders=provider==='baidu'&&temp.page!=='share'&&selected.some(item=>item.isdir===1);
   if(!folders&&output.length!==expected.length)fail('部分所选文件没有取得下载地址，请刷新后重新勾选；本次尚未加入下载');
   const chosen=new Set(expected);if(!folders&&!chosen.has('')&&(new Set(output.map(file=>file.key)).size!==output.length||output.some(file=>!chosen.has(file.key))))fail('网盘返回的文件与所选内容不一致，请刷新后重新勾选');
   const headers={'User-Agent':navigator.userAgent,'Referer':location.origin+'/'};
   if(provider==='baidu')headers['User-Agent']=config.$baidu.api.ua.downloadLink;
   if(provider==='quark'||provider==='uc'){headers['User-Agent']=config['$'+provider].api.ua.downloadLink;headers.Cookie=document.cookie;}
   return {ok:true,files:output.map(item=>({...item,headers}))};
  }catch(error){return {ok:false,error:error instanceof TypeError?'网盘登录信息或页面结构已变化，请刷新网盘并重新登录后重试':clean(error.message||error)};}
  finally{window.removeEventListener('message',onReply);for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('本次读取已结束'));}pending.clear();}
 }};
})();
