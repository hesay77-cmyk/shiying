# 拾影

免费、开源、无广告的中文网页视频下载插件。打开视频，点一下保存。

![拾影主面板](docs/assets/panel.png)

## 下载与安装

在 [下载页](https://github.com/hesay77-cmyk/shiying/releases/tag/v0.4.36) 选择所需文件：

- 可选桌面版：`Ruxget-0.4.36-Windows-Setup.exe`，适用于 Windows 10/11 64 位。
- 新版插件：`Ruxget-0.4.42-Chrome.zip`，解压后在 `chrome://extensions` 开启开发者模式，加载直接包含 `manifest.json` 的目录。
- 配套源码：`Ruxget-0.4.42-source.zip`，包含插件 0.4.42、桌面版 0.4.36、构建脚本及第三方来源和许可。仓库目录保留较早基线，当前版本请使用该源码附件。

普通下载仍可在 Chrome 内完成，不强制安装桌面版。选择桌面下载后才连接本机程序；未连接时可下载安装、修复连接或继续用 Chrome。商店版与本地测试版 ID 不同，已安装但无法连接时，请在插件引导中选择“已安装，修复连接”，再点“一键重新配对”。

点击 Chrome 工具栏的拼图图标，把拾影固定在工具栏。Chrome 商店请使用现有的「拾影 · 网页视频下载」商品更新；GitHub 下载包已发布，不代表商店 0.4.42 已审核或上架。

## 怎么用

1. 打开正常可播放的 B站或 YouTube 视频。
2. 点拾影，等待标题和原站实际清晰度出现。
3. 点“下载视频”保存有声音的 MP4，或点“下载 MP3”保存音频。

成品由 Chrome 保存到下载目录中的“拾影”文件夹。主流程在 Chrome 内下载、合并和编码，无需安装或启动下载助手。下载期间可以关闭小面板，请保持 Chrome 运行。

其他网页首次使用时，点击“允许此网站”，按本页检测到的媒体来源授权，然后在媒体列表中下载视频、音频或 HLS。可在菜单“管理网站权限”中添加具体网址或撤销授权；不同媒体来源可能需要分别确认。高级工具保留可选外部服务；仅在用户主动配置或使用时参与，详见 [隐私说明](PRIVACY.md)。

## 适用范围

平台主流程优先处理非直播视频，单个媒体轨最大 768 MB；大文件可尝试较低清晰度。网站格式、登录状态、区域、访问权限和媒体地址有效期会影响可用性。只列出原站实际提供的清晰度，不将放大画质冒充原生画质。

拾影不提供 DRM 解密或付费、会员、登录限制绕过。请只处理您拥有权利、取得必要许可或依法允许处理的内容，并遵守来源平台条款。免费开源不会替用户取得媒体授权。

## 隐私与反馈

插件没有开发者数据接收服务器、广告或统计 SDK。为识别和下载媒体，会处理网页网址、标题、媒体内容、请求头和认证信息。媒体与任务主要在本机或会话中处理；部分设置使用 Chrome 同步。主动使用高级外部工具时可能向所选服务发送相关数据。

- [隐私说明](PRIVACY.md)
- [反馈问题](https://github.com/hesay77-cmyk/shiying/issues)（请勿公开 Cookie、令牌或私密网址）
- [Chrome 商店填写指南](docs/chrome-web-store.md)
- [版本说明](docs/release-notes.md)

新版可按具体网盘开启独立下载按钮，相关 Cookie 仅在授权后用于对应网盘及本机下载任务，详见隐私说明。网盘适配基于 LinkSwift 1.1.3，保留 AGPL 许可；完整修改源码与第三方说明随当前源码附件提供。

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

之后在 Chrome 中加载生成的 `build` 目录。构建复制随仓库提供的文件，不拉取远端执行代码，也不启动付费 API。

发行 ZIP 使用 Python 3 标准库，先构建再执行：

```sh
python scripts/release.py
```

输出位于 `release`，已有同版本 ZIP 会被保留，脚本会停止而不会覆盖。`third-party-source` 提供实际组件对应的来源包及校验；各供应商的构建方法由原包内的说明和配置给出。

浏览器端到端开发检查另需 Playwright、可加载扩展的独立 Chromium，以及仅用于开发成品校验的 FFmpeg；通过 `SHIYING_PLAYWRIGHT`、`SHIYING_CHROMIUM`、`SHIYING_FFMPEG` 指定现有安装路径。浏览器检查会访问测试网站并下载测试媒体，按需手动执行；它们不是普通使用或静态构建的前置步骤。

最终 ZIP 检查还使用 OpenSSL 生成独立浏览器的本地测试证书，通过 `SHIYING_OPENSSL` 指定程序路径；证书和宽松的证书检查仅用于该本地样本环境，插件运行不需要这些程序。原生网站授权确认仍需人工验证；拒绝回调用模拟方式覆盖，授权/撤销与内容脚本范围通过独立逻辑检查覆盖。
