# 拾影：Chrome 商店填写指南（不含 YouTube）

适用上传包：`release/Ruxget-0.4.43-Chrome-Web-Store.zip`（ZIP 根目录直接包含 manifest.json）。整理日期：2026-10-21。

2026-10-21，现有商品「拾影 · 网页视频下载」（ID：`nlhoddnpmoakgikfpdmdkjmahcaokbcl`）因 Blue Zinc（协助下载 YouTube 上的版权内容）被拒。不要再次提交带 YouTube 的 `Ruxget-0.4.42-Chrome.zip`。本指南只描述商店构建。GitHub 完整包仍包含 YouTube，用 `node scripts/package.cjs` 生成，不要拿去更新这个商店商品。

## 怎么打商店包

在仓库根目录执行：

```sh
node scripts/package-chrome-store.cjs
node scripts/check-chrome-store.cjs
```

第一条会生成 `build-chrome-store/`，并写出 `release/Ruxget-0.4.43-Chrome-Web-Store.zip`。第二条再检查同一份结果。商店包版本至少是 0.4.43，因为 0.4.42 已经被拒绝。源码里的 `manifest.json` 可以继续写 0.4.42，那是 GitHub 完整包的版本；商店脚本会在输出里升到 0.4.43。

GitHub 完整包：

```sh
node scripts/package.cjs
```

输出在 `build/`，保留 B站和 YouTube。已发布的 `Ruxget-0.4.42-Chrome.zip` 就是这条线，继续给 GitHub 用户即可。

商店包相对完整包去掉了这些内容：

- `youtube.com`、`www.youtube.com`、`m.youtube.com`、`youtu.be`、`googlevideo.com` 的安装期主机权限和内容脚本匹配。
- YouTube 播放器读取、访客标识和 googlevideo 分段下载代码。
- 扩展界面、简短说明和本指南里把 YouTube 当成可下载网站的说法。
- 可选的按网站授权也不能加上 YouTube、youtu.be、googlevideo、ytimg、youtube-nocookie。即使用户点扩展图标，商店包也不会读取或下载这些地址，也不会把它们交给桌面版。

B站清晰度、MP4、MP3、其他非 YouTube 网页的按站授权、网盘入口和可选桌面连接仍在商店包里。

## 1. 上传

1. 打开 [Chrome 开发者后台](https://chrome.google.com/webstore/devconsole)。登录已有开发者账号。
2. 打开已上架的「拾影 · 网页视频下载」（ID：`nlhoddnpmoakgikfpdmdkjmahcaokbcl`），上传 **`Ruxget-0.4.43-Chrome-Web-Store.zip`**。不要新建商品，不要上传 0.4.42 完整包或源码 ZIP。
3. ZIP 根目录直接包含 `manifest.json`。如果后台说找不到文件，请检查是否多套了一层目录。
4. 先把本文件里的隐私说明合并到 `main` 上的 `PRIVACY.md`，再提交审核。商店隐私政策网址读的是 GitHub 上的 `main`。未合并时，审核员会看到旧说明里仍把 YouTube 访客标识写成当前插件行为。

## 2. 商品详情

| 字段 | 填什么 |
|---|---|
| 名称 | Ruxget · Web Video Downloader（来自安装包；中文界面名称为 Ruxget） |
| 简短说明 | 免费开源、无广告的中文视频下载助手，支持 B站清晰度选择、完整 MP4 与单独 MP3 下载。 |
| 主要语言 | 中文（简体） |
| 类别 | 选择最接近“工具 / Tools”的类别 |
| 主页 URL | `https://github.com/hesay77-cmyk/shiying` |
| 支持 URL | `https://github.com/hesay77-cmyk/shiying/issues` |
| 隐私政策 URL | `https://github.com/hesay77-cmyk/shiying/blob/main/PRIVACY.md` |
| 官方网站 / 已验证网站 | 没有已验证的独立网站可以留空 |
| 成熟内容 | 插件自身没有成人内容，通常不勾选 |
| 宣传视频 | 可留空 |

英文浏览器会使用安装包里的英文简短说明：`Free and open-source web video downloader. Supports Bilibili quality selection, full MP4 and MP3 downloads.`

详细说明可直接复制：

```text
拾影 / Ruxget 是免费、开源、无广告的网页媒体下载扩展。本 Chrome 网上应用店版本支持 B站，不支持 YouTube。

在 B站正常可播放的视频页读取标题、时长和实际清晰度，按需保存有声音的 MP4 或单独 MP3。常规下载默认在 Chrome 内完成，不强制安装桌面软件。

支持轻量浮钮的拖动、隐藏与恢复；保留网页媒体列表、保存位置选择和下载任务进度。其他网站需由用户按具体网站授权后才会列出媒体。本版本拒绝 YouTube、youtu.be 以及对应媒体域名的授权和下载。

可选配套 Windows 桌面下载器，处理普通文件、视频及 BT 任务，并提供文件勾选、暂停/继续、下载详情和迷你窗。用户主动选择桌面下载后，才尝试连接本机程序。连接异常时可选择下载安装、修复连接或继续用 Chrome。商店版不会把 YouTube 地址交给桌面程序。

可按具体网盘单独开启内置下载入口，在网盘原下载按钮旁增加“Ruxget 下载”。首次需要授权对应网盘与必要登录信息，原站按钮仍可使用。各网盘和页面的实际可用性取决于登录、源站接口、访问权限和临时签名地址，不承诺网盘或 BT 加速。

浏览器主流程需要 Chrome 116 或更新版本；非直播视频、网站格式、登录状态、区域和源站限制会影响可用性。单个浏览器媒体轨最大 768 MB，大文件可选择配套桌面版。拾影不提供 DRM、付费、会员或登录限制绕过。请只下载有权处理的内容并遵守源站规则。

媒体信息、任务和必要认证信息按功能在本机处理；部分设置可经 Chrome 同步。网盘 Cookie 与可选外部服务的数据流见隐私说明。没有开发者数据接收服务器、广告或统计 SDK。

基于 CatCatch 及已注明许可的开源组件修改，源码、许可、隐私政策和反馈入口见项目 GitHub。
```

图片仍在 `docs/assets/`：

- 图标：`icon-128.png`，128 × 128。
- 商店截图：`screenshot-1280x800.png`，1280 × 800。
- 小宣传图：`promo-440x280.png`，440 × 280。

如果现有截图画面上仍能看出 YouTube 页面，请换一张 B站或扩展面板本身的截图后再提交。本仓库里的截图没有在本次改动中重拍。

## 3. 隐私与权限

**单一用途 / Single purpose**，复制：

```text
识别用户访问网页中的媒体资源，并按用户选择下载视频或音频，包括在 Chrome 内合并 MP4、编码 MP3，以及与媒体下载直接相关的预览、任务管理和保存设置。本商店版本的固定视频站是 B站，不包含 YouTube。
```

每项权限说明，复制对应行：

| 后台显示的权限 | 说明 |
|---|---|
| activeTab | 用户点击插件图标后，临时读取当前网页中与媒体相关的信息，以发现本页视频和媒体来源。商店版即使获得当前标签的临时访问，也不会读取或下载 YouTube 相关地址。访问随页面跨站跳转或关闭而撤销，不默认读取所有网页。 |
| tabs | 获取当前视频标签页的网址和标题，定位用户选择的视频页面，展示媒体来源；必要时打开用户输入的视频页或相关任务、帮助、工具页面。 |
| webRequest | 监听用户已授权网页的网络请求以发现媒体资源、识别格式与大小，并读取下载所需的来源请求头和认证信息。不监听未授权主机，也不监听 YouTube 相关主机。 |
| downloads | 通过 Chrome 下载管理器保存用户选择的视频和音频，监听下载完成、失败或取消，并打开已保存文件所在目录。 |
| storage | 保存媒体目录、下载状态及用户设置。媒体和任务主要在本地或会话存储；部分设置及可选外部服务配置使用 Chrome 同步存储。 |
| webNavigation | 在网页跳转或更新时维护标签页与媒体记录的对应关系，清理过期资源，并在相关工具页面就绪后发送用户选择的媒体任务。 |
| alarms | 延迟合并媒体缓存写入，清理失效标签页和临时记录，减少高频请求带来的重复写入。 |
| declarativeNetRequestWithHostAccess | 只在已获得主机权限的媒体来源上，为用户选择的下载设置原站要求的 Referer、Origin 或必要认证请求头。商店版不为 YouTube 设置这类规则。 |
| scripting | 在用户选择的视频网页中运行随插件打包的脚本，读取播放信息、媒体目录和相关页面内容；执行与媒体识别、预览或录制有关的本地脚本。 |
| offscreen | 通过 Chrome 隐藏页执行本地音视频下载、MP4 合并、MP3 编码和校验，使用户关闭小面板后任务仍能继续。 |
| sidePanel | 支持用户在设置中选择用侧边栏展示同一媒体下载界面，保持工具栏小面板为默认入口。 |
| nativeMessaging（可选） | 用户选择桌面下载、网盘下载或连接检查时，与本机配套下载器通信，转交所选任务与必要来源信息。不转发 YouTube 或 googlevideo 地址。不在安装插件或普通读取时自动启动桌面软件。 |
| cookies（可选） | 只在具体网盘开启并授权后，读取该网盘下载所需的登录 Cookie。只用于对应网盘 API 和所选文件；夸克/UC 必要 Cookie 可交给同机下载器，不交给开发者或第三方解析服务。 |
| contextMenus | 用户开启此选项时提供与媒体下载相关的右键入口；普通下载链接的可选桌面菜单不接管 Chrome 下载。 |
| 主机权限 | 必选主机权限只覆盖 B站页面、B站读取 API 和 B站媒体 CDN。没有 YouTube、youtu.be 或 googlevideo 的必选权限。其他网站使用可选权限：用户主动操作后，仅按具体网站授权，并可撤销。商店版会拒绝 YouTube 相关主机的可选授权。可选匹配范围不代表安装时已获得所有网站权限。数据仅用于用户操作的媒体识别和下载，不用于广告、画像或出售浏览活动。 |

**远程代码 / Remote code：选择“是 / Yes”，并解释高级功能。** 说明可复制：

```text
插件本身的脚本、MP4Box.js 和 lamejs 均随安装包提供。默认 B站的 MP4/MP3 下载和转换由本地隐藏页执行，不下载远端 JavaScript 到扩展中执行。本商店版本不包含 YouTube 下载。

高级工具保留用户主动选择的在线转换或流式保存功能，会打开普通第三方网页，或在独立来源的 iframe 中运行其网页代码，与其交换用户选择的媒体数据。这些网页没有直接访问 chrome.* 扩展 API 的权限。预置地址包括 ffmpeg.bmmmd.com、ffmpeg.94cat.com 和 stream.bmmmd.com。相关数据交换已在隐私政策中披露；这是可选高级功能，不是默认主下载流程的依赖。
```

**数据类型 / Data usage：不要选“完全不处理用户数据”。** 按实际字段勾选：

| 类别 | 为什么选 |
|---|---|
| 网站内容 / Website content | 视频、音频、网页标题、相关页面信息，以及主动使用高级预览、识别或录制功能时的内容。 |
| 网络记录 / Web history | 媒体来源页面网址、媒体请求网址、相关访问记录；用于媒体识别和下载。 |
| 身份验证信息 / Authentication information | 来源请求头中可能包含 Cookie、Authorization、令牌；可选外部服务的密码或令牌。 |
| 个人身份信息 / Personally identifiable information | 用户主动配置的外部服务用户名等标识信息。商店版不读取 YouTube 访客标识。 |
| 用户活动 / User activity | 媒体网络请求监测、用户发起的下载任务及其状态。 |

数据使用的三个声明，如当前代码和用途保持本指南描述，可勾选：不出售用户数据；不将用户数据用于与单一用途无关的目的；不用于确定信用状况或贷款资格。

## 4. 分发与测试说明

费用选“免费 / Free”。测试说明可复制：

```text
无需拾影账号。本商店版不包含 YouTube，请用 B站测试。普通视频下载在 Chrome 内完成。打开正常可播放的 B站视频页，点扩展读取标题与画质，选 MP4 或 MP3 保存。桌面功能可选；未安装时点“用Ruxget下载”可看到连接引导，选“继续用 Chrome”返回且不会自动下载。已安装但配对异常显示修复连接。测试普通视频无须开启网盘权限。网盘需逐站开启并授权，原下载按钮保留。高级外部服务仅主动使用或配置时连接。
```

提交前请确认上传的是 0.4.43 商店 ZIP，而不是 GitHub 上的 0.4.42 完整包。反复提交仍带 YouTube 下载能力的包可能影响开发者账号。

依据：[官方发布步骤](https://developer.chrome.com/docs/webstore/publish)、[商品详情](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)、[图片规格](https://developer.chrome.com/docs/webstore/images)、[隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[用户数据 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)、[商店政策](https://developer.chrome.com/docs/webstore/program-policies/policies)。
