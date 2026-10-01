# 01｜主开发与技术负责人任务书

版本：2026-10-01。独立上手版；拿到这份任务书即可按步骤开始。


## 项目现在在做什么

HealthCompanion 的长期目标是商业落地、真实用户体验与持续价值。用户提出的体验方向是大场景、数字人为主要交互对象、语音优先。摄像头和姿态识别是让智能体与现实中的人互动的能力。

目前 Pose Lab 是临时验证页：摄像头在本机识别上半身，双臂抬至肩部高度并保持三秒，页面和数字人给出反馈。具体商用用户、首发场景与商业模式还需要验证。

截至 2026-10-01，M1 数字人动作能力已验收；M2.1 摄像头基础功能由主开发确认；M2.2–M2.5 已实现，重复计时完成和数字人回应已有真人反馈。当前工作是补齐 M2.6 的同屏布局、响应速度、性能和停止/恢复验收。M3 Agent 工具接入尚未开始。

仓库：[HealthCompanion](https://github.com/wsl-HealthCompanion/HealthCompanion)。统一基线：`feat/pose-shoulder-loop`。每次交付记录自己实际使用的提交号。

## 新电脑：先把页面跑起来

以下按 Windows 10/11 写。其他系统请告诉主开发，再安排对应操作。当前摄像头练习只需要前端；新成员不用先部署服务器、数据库、Python 服务或旧数字人引擎。

### 1. 安装软件

| 软件 | 安装方式 | 用途 |
| --- | --- | --- |
| Git | [官方 Windows 安装页](https://git-scm.com/install/windows)，选匹配电脑架构的安装包 | 下载、更新和提交代码 |
| Node.js 24 LTS | [官方下载页](https://nodejs.org/en/download)，选 24.x LTS 和 Windows 安装包；LTS 状态见[官方发布表](https://nodejs.org/en/about/previous-releases) | 运行前端，安装时自带 npm |
| VS Code | [官方下载页](https://code.visualstudio.com/download) | 打开项目、编辑代码和报告 |
| Chrome 或 Edge | 用本机已安装版本 | 访问页面、允许摄像头和声音 |

主开发当前使用 Node.js 24.14.1，团队先统一到 24.x LTS 系列并记录具体版本。安装后重新打开 PowerShell：在开始菜单搜索“PowerShell”，正常打开即可。

逐行执行，每行应出现版本号。如果显示“无法识别”，重新打开 PowerShell 再试，仍失败就发错误给主开发。

```powershell
git --version
node --version
npm.cmd --version
```

### 2. 克隆项目：下载代码到自己的电脑

先在浏览器打开仓库。如果显示 404 或无权访问，让主开发开通项目权限。

下面逐行执行，一行报错就先停下。“clone”表示下载代码并保留以后更新代码的能力。

```powershell
Set-Location $env:USERPROFILE
New-Item -ItemType Directory -Force -Path HealthCompanion-work | Out-Null
Set-Location .\HealthCompanion-work
git clone --branch feat/pose-shoulder-loop https://github.com/wsl-HealthCompanion/HealthCompanion.git HealthCompanion
Set-Location .\HealthCompanion
git rev-parse --short HEAD
```

项目放在用户目录的 `HealthCompanion-work\HealthCompanion`。记下最后显示的提交号。

如果同名目录已经有项目，使用本文的更新步骤或请主开发确认，不再重复克隆到该目录。主开发已有工作目录时直接使用已有目录。

### 主开发的分支安排

当前沿用 `feat/pose-shoulder-loop` 作为团队基线。成员在各自电脑创建工作分支，向基线交 PR，由你审查合并。已有本机改动时先看工作区状态，再操作 Git。

### 3. 安装运行所需的软件依赖

此时在项目根目录，执行：

```powershell
Set-Location .\yhzk-demo-h5
npm.cmd ci
```

第一次需要联网。等命令结束、光标重新出现，再执行下一步。这里用 `npm.cmd`，可避开部分 Windows 电脑对 `npm.ps1` 的限制。安装失败时记录错误，不自行改依赖版本或锁文件。

### 4. 启动前端，打开浏览器

仍在 `yhzk-demo-h5` 中执行：

```powershell
npm.cmd run dev -- --config .local-vite-http.config.mjs
```

窗口显示本地地址后，在浏览器打开：

[http://127.0.0.1:5273/pose-lab.html](http://127.0.0.1:5273/pose-lab.html)

这次使用项目已有的本机 HTTP 配置。`127.0.0.1` 表示你自己的电脑，把这个地址发给别人不能让别人访问你的电脑。运行时保留启动窗口；停止服务按 `Ctrl+C`。以后只需进入 `yhzk-demo-h5` 再执行这条启动命令。

### 5. 第一次体验

1. 点“开启摄像头”，允许权限；有多种来源时选择实体摄像头。
2. 调整位置，让肩、肘和髋部完整入镜，观察人体骨架。首次加载姿态运行文件和模型需要联网，可能需要等待。
3. 识别就绪后点“开始训练”，双臂抬至肩部高度并保持三秒，观察“训练完成”。
4. 完成后可点“再做一次”；结束时点“结束训练”或“关闭摄像头”。

做到这里说明摄像头练习已启动。没有数字人配置也可以检查基础动作和布局。

### 6. 需要数字人时补本机配置

数字人所需 `.env.local` 不会随 Git 克隆。向主开发申请测试配置；尚未拿到时，报告写“数字人未配置”，不要记成程序失败。

如果主开发给配置文件，把它放到 `yhzk-demo-h5/.env.local`。如果给两项值，在 VS Code 打开项目，新建该文件，填写：

```env
VITE_XMOV_APP_ID=填写主开发提供的值
VITE_XMOV_APP_SECRET=填写主开发提供的值
```

右边中文是说明，要替换成真实测试值。文件名不能变成 `.env.local.txt`。保存后停止并重启前端，再点“连接数字人”，连接就绪后开始新一轮训练。

任务书没有真实密钥。配置留在本机，提交代码或发送截图时不带密钥。当前方式用于团队本机验证，商用接入由主开发另行确定。

### 7. 卡住时怎么处理

| 现象 | 先处理什么 | 需要发回的信息 |
| --- | --- | --- |
| Git/Node/npm 无法识别 | 安装后重新打开 PowerShell | 错误与软件版本 |
| npm 找不到 package.json | 用 `Get-Location` 确认位于 `HealthCompanion\yhzk-demo-h5` | 当前路径和错误 |
| 5273 被占用 | 检查是不是自己重复开了前端，关闭自己的重复启动窗口 | 无法确定来源就问主开发，不随意结束其他进程 |
| 页面打不开 | 看启动窗口是否仍运行，检查完整页面地址 | 启动窗口最后几行 |
| 相机黑屏/打不开 | 检查权限、关闭占用相机的软件、选择实体相机 | 浏览器、相机来源、错误 |
| 画面有但模型失败 | 记录是否是模型下载错误，让主开发协助确认资源访问 | 错误和网络环境 |
| 数字人失败 | 确认配置完整且保存后重启过前端 | 不含密钥的错误与发生时间 |



## 你的职责和本轮任务

你是主要开发人和最终合并人，负责核心接口、姿态规则/会话、相机运行时、数字人发送与取消、Agent 和后端集成。其他成员交付测试证据、界面改善和真实场景资料，由你判断和合并。

### 任务一：让另外三人的电脑完成首次启动

1. 确认三人能打开仓库，需要提交的成员有仓库写入权限。
2. 分别发送对应任务书，让每人获取同一基线并建立自己的分支。
3. 给需要使用数字人的人提供本机测试配置，安排测试账号使用。
4. 收集每人的提交号、Git/Node 版本和“页面已启动/卡在哪里”。先解决环境阻塞，再安排修改。

你的现有工作目录为 `D:\HealthCompanion\HealthCompanion`，直接继续用即可。当前工作区 `XmovAvatarPlayer.tsx` 仍有未提交状态，其他成员克隆到的是远端已提交版本。比较问题时以远端基线为准；需要分发本机改动时先审阅再决定提交。

### 任务二：统一验收版本与文件分工

先收测试成员的真人报告，再判断问题能否复现、影响什么流程、由逻辑/显示/环境哪部分造成。

| 问题类型 | 默认负责成员 | 你要给出的信息 |
| --- | --- | --- |
| 规则、计时、取消、SDK 队列、相机运行时 | 你 | 复现步骤、修复范围和验证方法 |
| 布局、按钮外观、样式与文字可读性 | 前端辅助成员 | 具体问题与允许改的文件 |
| 小的状态提示和报告整理 | 测试兼开发成员 | 一次一个小任务，具体文件和预期 |
| 语音理解、真实场景与用户需求 | 产品体验成员 | 希望观察或询问的问题 |

同一文件同一时段只安排一位成员修改。`pose-lab.scss` 优先由前端辅助成员负责；测试成员的小开发由你选文件范围，避免并行修改同一界面。

### 任务三：依据证据收尾 M2.6

重点处理摄像头重开的时间戳、一次完成事件、保持中失效取消、暂停/结束后重新开始、数字人打断/重连与旧提示迟到。

速度报告分别看“动作事件到 SDK 调用”和“真正听到语音”。当前 SDK 全局语音开始回调不能可靠对应某条请求，不用本地显示值推算真实开口时间。

若电脑慢，先看实际 FPS/推理耗时，再决定是否调采样和样本时效。镜头远近仍待标定，不能把归一化肩宽/躯干值解释成厘米。

### 任务四：准备后续阶段

根据产品成员的真实场景证据决定下一阶段的用户任务。M3 的 `pose_monitor / avatar_action / show_widget` 是后续候选方案；设计时写清输入、结果、取消和失败行为，再拆任务。

正式商用大场景和语音流程需要围绕具体场景设计。当前训练验证页完成，不等于商用产品设计完成。

## 先读哪些代码

| 路径 | 用途 |
| --- | --- |
| `docs/README.md` | 当前状态入口 |
| `docs/superpowers/specs/2026-10-01-m2-6-implementation-record.md` | 当前交付与验收边界 |
| `yhzk-demo-h5/src/pose/` | 相机、Pose、规则、会话和反馈 |
| `yhzk-demo-h5/src/services/xmovAvatar.ts` | 数字人服务桥接 |
| `yhzk-demo-h5/src/avatar/` | Provider 和已验证动作 Registry |
| `yhzk-mvp-backend/src/`、`ai-service/app/` | 后续后端与 Agent 集成位置 |

前端独立体验不要求整套后端。需要测试主聊天或 Agent 时，由你提供那次任务实际使用的服务配置。

## 本轮交付和完成标准

建议归档至 `docs/team-work/integration/m2-6-decision.md`：

1. 三位成员是否完成环境准备，尚有哪些阻塞。
2. 采用哪些测试报告及提交号。
3. 修复/合并哪些问题、对应负责成员。
4. 未验证项及原因。
5. M2.6 是否关闭、支撑结论的真人证据。
6. 下一阶段要解决的用户任务；未确定的范围继续注明。

完成标准：三人能开始各自任务；问题有归属；合并后的版本有真人复查；未执行项没有写成通过。

代码修改后，在前端目录执行 `npm.cmd run build` 做编译和构建检查。当前自动测试延期的选择继续保留，恢复自动化由你明确安排。

## 合并与同步怎么做

第一轮收“环境和首次体验”；第二轮收“问题与小改动”；第三轮合并后让测试成员按原步骤复查。每日简短同步已完成、下一件事、阻塞即可。

成员使用 `team/qa-m2-6`、`team/ui-m2-6`、`team/product-scenario`，PR 目标都是 `feat/pose-shoulder-loop`。每次审查改动文件、实际复查结果和未覆盖项。

审查时可以打开 PR 的 Files changed；要在本机查看成员分支而自己的工作区仍有修改，先处理清楚本机状态或使用隔离目录，避免直接切换破坏正在开发的环境。

你要提交文档时，在项目根目录逐项添加实际文件，例如：

```powershell
git status --short
git add -- docs/team-work/integration/m2-6-decision.md
git diff --cached --stat
git commit -m "docs: record M2.6 integration decision"
git push origin feat/pose-shoulder-loop
```

代码改动按审阅后的具体文件另行提交。成员分支冲突先由你协调，推送后确认远端包含团队要验收的版本。

## 当前项目资料入口

[产品和里程碑状态](https://github.com/wsl-HealthCompanion/HealthCompanion/blob/feat/pose-shoulder-loop/docs/README.md)。旧计划按历史资料阅读。本任务书的岗位安排不会自动启动尚未排期的 M3。
