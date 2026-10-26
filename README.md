# 红薯调研站 · XHS Research Studio

**小红书调研、经验帖筛选、视频转录与关键帧分析的 Windows AI Skill。**

先判断哪些内容值得看，再把视频里的声音和画面变成带来源、时间戳的调研材料。

Windows x64 · 默认轻量 · Chrome 独立登录 · 本地/云端转写可选 · v0.2.0 预览版

**默认不下载 AI 模型、不安装 Python。** 搜帖、正文、评论和视频画面读取只需现有 Chrome + Node.js。新增 Node 依赖本机约 19 MB；这不包含 Chrome、Node、账号浏览器缓存和内容文件。

[English](#english) · [安装](#安装) · [反馈问题](https://github.com/YKW-666/xhs-research-studio/issues/new/choose)

## 能做什么

| 环节 | 能力 |
|---|---|
| 找经验 | 关键词搜索，读取帖子正文、作者和可见评论 |
| 先筛选 | 让 AI 按研究目标判断相关性、信息增量和推广倾向 |
| 听视频（选装） | 点点官方 API 云端转写，或本地 Whisper 转录 |
| 看画面（默认自带） | 直接用 Chrome 定位视频并保存时间戳画面，无 Python/语音模型；默认 8 帧，可指定最多 12 个时间点 |
| 形成结论 | 具备图片理解能力的 AI 助手结合字幕与画面整理证据 |

适合比赛备赛、作品集、产品与用户体验、求职、留学和工具实测。没有发布、点赞、收藏、评论或私信命令。网页访问本身仍会产生正常浏览记录。

轻量模式只读取画面，不声称听懂音轨。需要语音内容时选云端或本地转写。AI 助手必须实际读取文字、查看图片后才能形成分析；生成文件不等于已经理解。

## 安装

目前面向 **Windows x64**。需要 Google Chrome、Node.js 20+（包含 npm）；视频分析另需 Python 3.12（本预览版仅支持已验证的版本）。

从 [Releases](https://github.com/YKW-666/xhs-research-studio/releases) 下载并解压 Windows 源码包，或：

```powershell
git clone https://github.com/YKW-666/xhs-research-studio.git
cd xhs-research-studio
.\setup.ps1
```

默认安装完成后即可读视频画面：

```powershell
node scripts/reader.mjs frames '已筛选的视频帖子链接'
# 只看关键时间点，单位秒：
node scripts/reader.mjs frames '视频帖子链接' 30 60 120
```

### 可选：点点官方云端转写（无需本地模型）

在 [点点官方平台](https://dots.ai/platform/login) 登录，创建自己的 API Key，然后运行：

```powershell
.\configure-dots.ps1
node scripts/reader.mjs dots '已筛选的视频帖子链接' --allow-cloud
```

密钥只保存到本机数据目录，也支持 `DOTS_API_KEY` 环境变量。不要把 Key 发到聊天、Issue 或提交进 Git。`--allow-cloud` 明确允许把选中的媒体地址交给点点处理，不传浏览器 Cookie。官方文档在 2026-10-26 标注免费体验，**不是永久免费承诺，使用前查看当前收费规则**。模型生成的文字不是平台原生字幕，也不保证精确时间戳。

接口状态：依据 [官方音视频输入文档](https://dots.ai/platform/docs) 实现，离线协议测试通过；实际调用验收状态见后续发布说明。

### 可选：完全本地语音转写

仅当你需要离线语音识别，再安装：

```powershell
.\setup.ps1 -Transcribe
```

额外需要 Python 3.12，语音模型约 **1.6 GB**、Python 依赖本机约 **437 MB**；完整本地路线新增约 **2.1 GB 起**，不包含基础运行时和内容缓存。模型首次下载后共享复用，并校验 SHA-256。没有本地 ASR API 费用。Python 不在 PATH 时传 `-Python 'python.exe完整路径'`。

**从 v0.1.0 升级**：`-Video` 现在只提示视频画面已包含在基础模式，不再下载模型；需要旧版完整离线转写请显式使用 `-Transcribe`。升级不会擅自删除已有环境和模型。

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

首次在弹出的普通 Chrome 窗口扫码登录。脚本完成后关闭自己的窗口，登录状态会保留。默认用 `frames` 获取画面即可。只有选择本地完整转写路线，才用 `video` 获取媒体文件；它返回 `sourceManifest` 路径，将它传入：

```powershell
.\.venv\Scripts\python.exe scripts/analyze-video.py 'source.json完整路径' --language zh
# 不指定语言时自动识别；按秒补看重要动作/PPT：
.\.venv\Scripts\python.exe scripts/analyze-video.py 'source.json完整路径' --stage frames --at 120 122 124
```

输出包括字幕、原分辨率关键帧、`contact-*.jpg` 总览及处理记录。`visualReviewed: false` 是刻意保留的状态：抽帧程序不能证明有人实际看过画面。

## 数据与权限

默认数据目录 `%LOCALAPPDATA%\XhsResearch`，包含独立登录资料、访问链接、视频与衍生文件，不在 Git 仓库内。请勿把整个目录附到 Issue。

可配置：`XHS_STATE_DIR`（浏览器/媒体目录）、`XHS_MODEL_DIR`（模型目录）、`XHS_CHROME_PATH`（Chrome 路径）。不读取日常浏览器 Cookie，本地 ASR 使用本地 CPU；选择点点路线会将所选媒体交给点点服务处理，不会发送小红书 Cookie。AI 助手读取材料时仍受所用服务的数据处理规则约束。

每次最多 10 张首屏搜索卡片；评论是可见子集；单视频上限 30 分钟、500 MiB。遇到登录、验证、限流、403 或访问限制会停止，不绕过或换账号。

**不承诺防封或不被识别。** 普通浏览器与低频读取仍属于自动化，平台可能要求验证或限制访问；开发测试曾遇到“IP 存在风险”。本项目的价值是按目标筛选、在本地处理视频、保留可追溯证据，不是规避平台检测。

## 预览版状态

- 原型在 Windows 完成过约 12 分 49 秒真实视频的全音频处理：285 段字幕、34 张抽样画面，并实际检查关键画面。
- 发布版使用可配置路径、独立依赖与新实现的 DOM 搜索模块，提供离线测试和 Windows CI。
- 发布版已在独立 Python 环境安装，完成模型哈希验证、30 秒真实音频转录及合成视频分析；新 DOM 搜索实测返回 10 条结果。不是另一台全新 Windows 机器的验收。
- 现场回声可能导致姓名、术语、数字识别错误；不要直接当逐字引文。
- 均匀抽帧与镜头抽样不等于逐帧观看，快速动作和闪现文字需要加密检查。
- 页面变化、账号状态和网络环境会影响可用性；尚未完成多机器与全视频格式验证。

## 中断后的恢复

- **锁文件**：`reader.lock`、`analysis.lock`、模型目录 `prepare.lock` 保存进程信息。先查看对应 PID 的进程和启动时间；确认原进程已经退出后，才移除那个锁文件。不要只因为文件较旧就删除；PID 可能被重用。
- **模型下载中断**：确认没有仍在运行的准备进程，按上项处理残留锁后重跑 `setup.ps1 -Transcribe`。哈希正确的完整文件会复用，未完成文件会重新获取并校验。
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

XHS Research Studio is a Windows-first, read-only Xiaohongshu / RedNote research skill: search experience posts, triage captions and comments, transcribe selected videos locally, and inspect timestamped scene/uniform frames with your AI assistant. No model or Python download for basic research and browser frames. Optional cloud transcription needs your own API key; local ASR is separately installed. No social-write commands. Windows preview; Chrome, Node 20+, and Python 3.12 for video. Machine transcripts and sampled frames are evidence aids, not guaranteed accuracy or continuous video review.
