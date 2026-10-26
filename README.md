# 红薯调研站 · XHS Research Studio

**小红书调研、经验帖筛选、视频转录与关键帧分析的 Windows AI Skill。**

先判断哪些内容值得看，再把视频里的声音和画面变成带来源、时间戳的调研材料。

Windows x64 · 本地转录 · Chrome 独立登录 · 无付费 API · v0.1.0 预览版

[English](#english) · [安装](#安装) · [反馈问题](https://github.com/YKW-666/xhs-research-studio/issues/new/choose)

## 能做什么

| 环节 | 能力 |
|---|---|
| 找经验 | 关键词搜索，读取帖子正文、作者和可见评论 |
| 先筛选 | 让 AI 按研究目标判断相关性、信息增量和推广倾向 |
| 听视频 | 本地 Whisper large-v3-turbo 转录，输出 JSON、TXT、SRT 和时间戳 |
| 看画面 | 镜头变化检测 + 定时抽帧，生成关键帧总览，可按秒补帧 |
| 形成结论 | 具备图片理解能力的 AI 助手结合字幕与画面整理证据 |

适合比赛备赛、作品集、产品与用户体验、求职、留学和工具实测。没有发布、点赞、收藏、评论或私信命令。网页访问本身仍会产生正常浏览记录。

Python 脚本负责转录和抽帧；你的 AI 助手必须实际读取字幕、查看图片后才能形成视频分析。生成图片文件不等于已经看懂视频。

## 安装

目前面向 **Windows x64**。需要 Google Chrome、Node.js 20+（包含 npm）；视频分析另需 Python 3.12（本预览版仅支持已验证的版本）。

从 [Releases](https://github.com/YKW-666/xhs-research-studio/releases) 下载并解压 Windows 源码包，或：

```powershell
git clone https://github.com/YKW-666/xhs-research-studio.git
cd xhs-research-studio
.\setup.ps1
```

视频转录和画面分析：

```powershell
.\setup.ps1 -Video
```

模型首次下载约 **1.6 GB**，之后本地复用。脚本核验固定版本模型文件的 SHA-256；无须 API Key。Python 不在 PATH 时，传入 `-Python 'python.exe完整路径'`。

如果系统禁止运行脚本，请遵守所在组织的执行策略；也可以阅读 setup.ps1 后手动运行其中的 npm、Python 安装命令。本项目不修改系统执行策略。

## 给 Codex 安装技能

```powershell
.\install-skill.ps1
```

技能名称 `xhs-research-studio`，下轮对话可用。请保留仓库文件夹；移动后需更新已安装技能中的路径。

可以这样说：

> 用红薯调研站调研职业规划大赛的答辩经验。先读正文和评论筛选，只分析最相关的视频，给出时间戳、适用条件和需要回到官方规则核验的结论。

## 手动运行

```powershell
node scripts/reader.mjs login
node scripts/reader.mjs search '职业规划大赛 答辩经验'
node scripts/reader.mjs read '搜索结果返回的完整帖子链接'
node scripts/reader.mjs video '已筛选的视频帖子链接'
```

首次在弹出的普通 Chrome 窗口扫码登录。脚本完成后关闭自己的窗口，登录状态会保留。`video` 返回 `sourceManifest` 路径，将它传入：

```powershell
.\.venv\Scripts\python.exe scripts/analyze-video.py 'source.json完整路径' --language zh
# 不指定语言时自动识别；按秒补看重要动作/PPT：
.\.venv\Scripts\python.exe scripts/analyze-video.py 'source.json完整路径' --stage frames --at 120 122 124
```

输出包括字幕、原分辨率关键帧、`contact-*.jpg` 总览及处理记录。`visualReviewed: false` 是刻意保留的状态：抽帧程序不能证明有人实际看过画面。

## 数据与权限

默认数据目录 `%LOCALAPPDATA%\XhsResearch`，包含独立登录资料、访问链接、视频与衍生文件，不在 Git 仓库内。请勿把整个目录附到 Issue。

可配置：`XHS_STATE_DIR`（浏览器/媒体目录）、`XHS_MODEL_DIR`（模型目录）、`XHS_CHROME_PATH`（Chrome 路径）。不读取日常浏览器 Cookie，不把登录信息发给转录服务；ASR 使用本地 CPU。AI 助手读取材料时仍受所用服务的数据处理规则约束。

每次最多 10 张首屏搜索卡片；评论是可见子集；单视频上限 30 分钟、500 MiB。遇到登录、验证、限流、403 或访问限制会停止，不绕过或换账号。

**不承诺防封或不被识别。** 普通浏览器与低频读取仍属于自动化，平台可能要求验证或限制访问；本项目的价值是按目标筛选、在本地处理视频、保留可追溯证据，不是规避平台检测。

## 预览版状态

- 原型在 Windows 完成过约 12 分 49 秒真实视频的全音频处理：285 段字幕、34 张抽样画面，并实际检查关键画面。
- 发布版使用可配置路径、独立依赖与新实现的 DOM 搜索模块，提供离线测试和 Windows CI。
- 发布版已在独立 Python 环境安装，完成模型哈希验证、30 秒真实音频转录及合成视频分析；新 DOM 搜索实测返回 10 条结果。不是另一台全新 Windows 机器的验收。
- 现场回声可能导致姓名、术语、数字识别错误；不要直接当逐字引文。
- 均匀抽帧与镜头抽样不等于逐帧观看，快速动作和闪现文字需要加密检查。
- 页面变化、账号状态和网络环境会影响可用性；尚未完成多机器与全视频格式验证。

## 中断后的恢复

- **锁文件**：`reader.lock`、`analysis.lock`、模型目录 `prepare.lock` 保存进程信息。先查看对应 PID 的进程和启动时间；确认原进程已经退出后，才移除那个锁文件。不要只因为文件较旧就删除；PID 可能被重用。
- **模型下载中断**：确认没有仍在运行的准备进程，按上项处理残留锁后重跑 `setup.ps1 -Video`。哈希正确的完整文件会复用，未完成文件会重新获取并校验。
- **视频存在但 source.json 缺失 / 残留 .part**：程序会拒绝覆盖。保留该视频目录，记录文件长度与 SHA-256，确认是预期帖子并检查视频是否可解码，再联系维护者处理收据恢复；不要把未知文件手动标记成已验证。其他视频仍可处理。若选择重新获取，先将整个受影响视频目录移到本地备份位置，保留原始材料，勿上传备份。
- **迁移仓库位置**：编辑已安装技能中的旧路径，或先备份并移走那个技能目录，再重新运行 `install-skill.ps1`；安装器不会覆盖已有技能。

## 反馈与参与

欢迎通过 [Issues](https://github.com/YKW-666/xhs-research-studio/issues) 提交故障和建议。请提供项目、Windows、Node、Python 版本以及脱敏错误。不要上传 Cookie、带访问参数的链接、账号截图或未经允许的视频。

维护者按反馈迭代；目前没有自动读取或回复所有 Issue 的常驻机器人。敏感问题见 [SECURITY.md](SECURITY.md)。

```powershell
npm ci --ignore-scripts
npm test
```

## 开源与致谢

自有代码采用 [MIT](LICENSE)。依赖和模型各自遵循原许可证，见 [THIRD_PARTY.md](THIRD_PARTY.md)。本项目不隶属于小红书，请遵守平台规则与内容使用权限。

## English

XHS Research Studio is a Windows-first, read-only Xiaohongshu / RedNote research skill: search experience posts, triage captions and comments, transcribe selected videos locally, and inspect timestamped scene/uniform frames with your AI assistant. No paid API key or social-write commands. Windows preview; Chrome, Node 20+, and Python 3.12 for video. Machine transcripts and sampled frames are evidence aids, not guaranteed accuracy or continuous video review.
