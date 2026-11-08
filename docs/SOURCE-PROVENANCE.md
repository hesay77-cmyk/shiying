# 源码来源与发行边界

- 上游项目：[xifangczy/cat-catch](https://github.com/xifangczy/cat-catch)。
- 上游基线：`876fdce8e5dfaa267d849a8348cbf8fa4dd56776`，CatCatch 2.7.2，GPL-3.0。
- 拾影公开版本：0.3.1，整理日期：2026-10-12。
- 此仓库由已验收的 0.3.1 完整源码发行包整理而来，原包 SHA-256：`2ddeaa7c33f0459547bb42fbc19e16d46c9fae5dfcc0fd414f0a1ac788313250`。
- 下载代码保持该发行包原样。公开发行移除上游插件公钥，将主页指向独立仓库，补齐隐私、构建、发行和第三方来源资料。
- 发行目录仅包含插件文件、构建/检查脚本、文档和第三方来源。开发浏览器资料、下载测试成品、原始日志、旧助手、凭据、旧发行包及开发工作区历史不在此仓库中。

第三方来源及 SHA-256 见 `third-party-source/SOURCES.json`，版权及许可见 `lib/third-party-libraries.md`、各组件原始来源包和 `LICENSE`。`README.catcatch.md` 保留原上游说明；其中上游商店链接和项目名称均指 CatCatch。

本次公开仓库使用独立的初始提交；来源保留在本文件和 NOTICE 中，未导入开发工作区的全部 Git 历史。

0.3.2 更新：在同一发行源码上收窄权限、增加按网站授权和撤销入口，更新隐私和商店填写资料。`shiying-engine.js`、`shiying-platform.js`、`shiying-core.js`、`shiying-task.js` 和主平台任务实现未修改；新增权限检查脚本。0.3.1 发行标签和安装包继续保留。

## 干净重写（0.4.76 起）

从 0.4.76 开始，来自 CatCatch 的部分按“干净室”方式逐块换成从零编写的代码：先根据现有行为写功能说明书（不含原代码），再由没有读过原代码的实现者只凭说明书和黑盒测试编写，最后用 `scripts/overlap-check.cjs` 与 CatCatch 2.7.2 和 LinkSwift 比对（20 个记号的结构序列；Ruxget 原创文件基线 0–1.6%，CatCatch 派生文件 79–97%，门槛 5%）。已经发布的版本仍按 GPL-3.0 提供。

| 版本 | 新文件 | 替代 | 比对结果 |
|---|---|---|---|
| 0.4.76 | `file-download.html`、`js/file-download.js`、`css/file-download.css` | 主面板中需要来源头的文件下载（原 `downloader.html`） | 结构重合 4.3%，相同行 0 |
| 0.4.76 | `dash-download.html`、`js/dash-download.js`、`css/dash-download.css` | 主面板和粘贴链接的 DASH 下载（原 `mpd.html`），改为一次下载合成带声音的 MP4 | 结构重合 0.8%，相同行 3（通用写法） |

旧的 `downloader.html`、`mpd.html` 在 0.4.76 中仍供“高级工具（当前网页）”使用，计划随高级工具调整在 0.4.77 移除。
