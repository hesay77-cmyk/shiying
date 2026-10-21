# 拾影

免费、开源、无广告的中文网页视频下载插件。打开视频，点一下保存。

当前插件为 **0.4.42 连接引导修复**，配套桌面版为 **0.4.36**：在网盘原下载按钮旁增加独立的「拾影下载」，把勾选文件交给桌面版后台下载，保留原按钮与 Chrome 下载习惯。无需篡改猴；各网盘首次使用时单独开启和授权。保留视频识别、BT 文件勾选、续传、任务详情及主窗口 / 迷你窗。安装与验证范围见 [桌面版说明](desktop/README.md)。桌面版 0.4.36 已提供 GitHub 安装包；Chrome 商店更新须经过审核，以商店实际显示的版本为准。

![拾影主面板](docs/assets/panel.png)

本次复查修复多选漏项、重复 API 记录、百度首次授权提示及登录失效的解析报错，并适配 123 新版分享域名、表格、配额检查、Web 下载接口和实际返回的 CDN。公开的 9,485,296 字节字体已完成真实下载、暂停、退出测试进程后续传，并与源站 MD5 一致。该结果不代表八家登录账号均已验收。

## 下载与安装

在 [Releases](https://github.com/hesay77-cmyk/shiying/releases/latest) 下载 `Ruxget-0.4.42-Chrome.zip`（插件）或 `Ruxget-0.4.36-Windows-Setup.exe`（可选桌面版）。插件 ZIP 解压后在 Chrome 打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的目录。需要 Chrome 116 或更新版本。

点击 Chrome 工具栏的拼图图标，把拾影固定在工具栏。Chrome 商店使用现有的「拾影 · 网页视频下载」商品更新，不需要另装第二个商店条目；提交和上架状态以商店后台为准。

## 怎么用

GitHub 完整版可以打开 B站或 YouTube。Chrome 网上应用店版只保留 B站，以及用户另行授权的其他非 YouTube 网站，构建和商店文案见 [Chrome 商店填写指南](docs/chrome-web-store.md)。

1. 打开正常可播放的 B站或 YouTube 视频（商店版请打开 B站视频）。
2. 点拾影，等待标题和原站实际清晰度出现。
3. 点“下载视频”保存有声音的 MP4，或点“下载 MP3”保存音频。

成品由 Chrome 保存到下载目录中的“拾影”文件夹。主流程在 Chrome 内下载、合并和编码，无需安装或启动下载助手。下载期间可以关闭小面板，请保持 Chrome 运行。

其他网页首次使用时，点击“允许此网站”，按本页检测到的媒体来源授权，然后在媒体列表中下载视频、音频或 HLS。可在菜单“管理网站权限”中添加具体网址或撤销授权；不同媒体来源可能需要分别确认。高级工具保留可选外部服务；仅在用户主动配置或使用时参与，详见 [隐私说明](PRIVACY.md)。

## 可选网盘下载

安装配套 0.4.28 或更新桌面版，并使用 0.4.42 插件。打开支持的网盘页，点 Chrome 中的拾影，再点「开启拾影下载」；确认该网盘的可选权限后，网盘工具栏旁会出现小按钮。勾选文件，点「拾影下载」，即可加入桌面队列，使用记住的保存位置；后台入队不弹主窗口。按钮右侧的小菜单可更换保存位置、查看任务或隐藏按钮；在插件里点「显示网盘按钮」可恢复。百度首次下载可能需另点「百度授权」并在百度页面确认。

内置适配源自 LinkSwift 1.1.3，覆盖百度、阿里、移动、天翼、迅雷云盘、夸克、UC、123 的部分页面。八个适配器已通过隔离页面/API 数据检查，尚未完成八家真实登录账号的下载验收；部分分享页不支持，阿里需使用列表视图。每批最多 100 个文件，受网站登录、会员、限额、实际页面/API 和签名链接有效期影响。链接过期需回网盘重新获取；不提供第三方解析服务或加速保证。源码、修改方式与许可见 [NOTICE](NOTICE.md) 和 `third-party-source/netdisk-sources.json`。

## 视频适用范围

平台主流程优先处理非直播视频，单个媒体轨最大 768 MB；大文件可尝试较低清晰度。网站格式、登录状态、区域、访问权限和媒体地址有效期会影响可用性。只列出原站实际提供的清晰度，不将放大画质冒充原生画质。

拾影不提供 DRM 解密或付费、会员、登录限制绕过。请只处理您拥有权利、取得必要许可或依法允许处理的内容，并遵守来源平台条款。免费开源不会替用户取得媒体授权。

## 桌面连接提示

选择桌面下载后，未找到本机连接时可以下载安装、修复已安装程序的连接，或继续使用 Chrome。配对被拒绝、程序退出或通信异常不会一律提示重新安装；取消保留原链接，不自动下载。商店版与本地测试版的扩展 ID 不同，首次连接失败可从「已安装，修复连接」进入「一键重新配对」。

## 隐私与反馈

插件没有开发者数据接收服务器、广告或统计 SDK。为识别和下载媒体，会处理网页网址、标题、媒体内容、请求头和认证信息。媒体与任务主要在本机或会话中处理；部分设置使用 Chrome 同步。主动使用高级外部工具时可能向所选服务发送相关数据。

- [隐私说明](PRIVACY.md)
- [反馈问题](https://github.com/hesay77-cmyk/shiying/issues)（请勿公开 Cookie、令牌或私密网址）
- [Chrome 商店填写指南](docs/chrome-web-store.md)
- [版本说明](docs/release-notes.md)

## 开源与来源

拾影是 [CatCatch](https://github.com/xifangczy/cat-catch) 的独立改版，非猫抓官方产品，采用 GPL-3.0。原作者及第三方版权、许可保留在 [LICENSE](LICENSE)、[NOTICE](NOTICE.md) 和 [第三方声明](lib/third-party-libraries.md)。源码 ZIP 包含插件、构建脚本与第三方来源包。

[源码来源](docs/SOURCE-PROVENANCE.md) · [原上游说明](README.catcatch.md) · [第三方来源与校验](third-party-source/SOURCES.json)

## 从源码构建

需要 Node.js。插件运行不依赖 Node.js；它只用于构建和开发检查。

```sh
node scripts/package.cjs
node scripts/check.cjs
node scripts/native-check.cjs
node scripts/check-access.cjs
```

之后在 Chrome 中加载生成的 `build` 目录。这是 GitHub 完整包，保留 B站和 YouTube。构建复制随仓库提供的文件，不拉取远端执行代码，也不启动付费 API。

### Chrome 商店包（不含 YouTube）

2026-10-21，现有商品 `nlhoddnpmoakgikfpdmdkjmahcaokbcl` 因 Blue Zinc（协助下载 YouTube 上的版权内容）被拒。不要把同一份带 YouTube 的 0.4.42 包再次提交。商店包是单独构建：去掉 YouTube 主机权限、内容脚本、播放器读取和面向商店的 YouTube 文案，保留 B站、网盘、可选桌面连接和其他非 YouTube 网页功能。GitHub 完整包继续包含 YouTube。

```sh
node scripts/package-chrome-store.cjs
node scripts/check-chrome-store.cjs
```

输出目录是 `build-chrome-store/`。上传用的 ZIP 是 `release/Ruxget-0.4.43-Chrome-Web-Store.zip`，根目录直接是 `manifest.json`。后台字段见 [Chrome 商店填写指南](docs/chrome-web-store.md)。已发布的 `Ruxget-0.4.42-Chrome.zip` 仍是完整版，不要用它更新商店，也不要用商店 ZIP 替换 GitHub 完整版。

发行 ZIP 使用 Python 3 标准库，先构建再执行：

```sh
python scripts/release.py
```

输出位于 `release`，已有同版本 ZIP 会被保留，脚本会停止而不会覆盖。`third-party-source` 提供实际组件对应的来源包及校验；各供应商的构建方法由原包内的说明和配置给出。

浏览器端到端开发检查另需 Playwright、可加载扩展的独立 Chromium，以及仅用于开发成品校验的 FFmpeg；通过 `SHIYING_PLAYWRIGHT`、`SHIYING_CHROMIUM`、`SHIYING_FFMPEG` 指定现有安装路径。浏览器检查会访问测试网站并下载测试媒体，按需手动执行；它们不是普通使用或静态构建的前置步骤。

最终 ZIP 检查还使用 OpenSSL 生成独立浏览器的本地测试证书，通过 `SHIYING_OPENSSL` 指定程序路径；证书和宽松的证书检查仅用于该本地样本环境，插件运行不需要这些程序。原生网站授权确认仍需人工验证；拒绝回调用模拟方式覆盖，授权/撤销与内容脚本范围通过独立逻辑检查覆盖。

### 0.4.30 网盘分享页修复（未发布）

适配百度新分享工具栏和单文件预览的下载入口；页面切换工具栏、隐藏与恢复时保持一个有效按钮。修复百度分享请求的 URL 和表单序列化。夸克请求带上当前网盘的来源头，交接时保留网页当前下载凭据并补充可读取的 Cookie，避免完整凭据被覆盖。

后台使用作者公开的 metradar 资源实测夸克：真实勾选 bou1_4l.shx（11,156 字节）、取址、交给独立桌面引擎、下载完成和 SHX 文件头校验通过。没有使用个人账号、操作现有任务或发布。百度公开页的按钮与授权提示已实测，登录后的百度完整下载尚未验收。
