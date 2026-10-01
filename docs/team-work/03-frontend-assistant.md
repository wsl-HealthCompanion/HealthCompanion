# 03｜前端辅助与交互完善任务书

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

### 建立自己的工作分支

此时在项目根目录执行：

```powershell
git switch -c team/ui-m2-6
```

“分支”保存自己的改动。本轮用 `team/ui-m2-6`，合并目标是 `feat/pose-shoulder-loop`。若分支已存在，先确认是不是自己创建过的；确认后用 `git switch team/ui-m2-6`。

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



## 你的职责：完善当前训练窗口的操作便利性

第一轮先体验当前界面，找到真实问题，再完成一个经主开发确认的小改动。最新基线已做相机、数字人和训练操作同屏；先检查它，不需要从头重做页面。

商用大场景和完整语音流程尚待具体产品方案；本轮聚焦临时验证窗口的布局、样式与小组件。

## 先看哪些文件

VS Code 选择“文件 → 打开文件夹”，打开整个 `HealthCompanion`，按路径查看：

| 文件 | 用途 | 本轮用法 |
| --- | --- | --- |
| `yhzk-demo-h5/src/pose-lab.scss` | 页面布局、大小、间距、颜色 | 优先在这里修布局问题 |
| `yhzk-demo-h5/src/components/PoseFeedbackWidget.tsx` | 训练按钮、保持进度和姿势提示 | 改显示时保留回调接口 |
| `yhzk-demo-h5/src/components/PoseAvatarFeedbackPanel.tsx` | 数字人连接与反馈区域 | 改连接区外观 |
| `yhzk-demo-h5/src/components/PoseLabPage.tsx` | 相机、识别和训练入口，含运行逻辑 | 先看结构；涉及逻辑时协调主开发 |

不必一次读完代码。选定问题后，只读影响它的样式和组件。

## 第一轮怎么做

### 1. 检查最新界面

1. 浏览器缩放设为 100%，打开实际笔记本窗口。
2. 有配置时连接数字人，开启相机，检查能否同时看到自己、数字人和开始训练。
3. 把窗口缩小一些再检查，记录两次实际窗口大小。
4. 点击开始、暂停、继续、结束、再做一次，观察按钮和提示是否遮挡或挤出边界。
5. 在两种窗口移动手臂，检查视频比例和骨架对齐，包括有黑边时。

记录到 `docs/team-work/ui/first-layout-review.md`，包含提交号、窗口大小、缩放、相机分辨率和准确问题描述。最好有截图。

目前宽度不超过 620px 会纵向排列并允许滚动，这是当前设计边界；记录实际表现，重点先检查笔记本/桌面窗口的一屏操作。

### 2. 选一个经确认的小问题修改

把问题交主开发后，确认本次目标。例如：“连接按钮遮住标题”“训练按钮挤出边界”“错误提示辨认困难”。记录触发步骤、修改前表现和期望效果，再编辑。

一次提交解决一个能清楚检查的问题，优先修改相关样式。涉及组件时保留状态和原有按钮回调，不顺手改相机、规则、计时或 SDK 控制逻辑。

### 3. 用同样步骤复查

保存后开发页通常自动刷新。用修改前相同窗口和操作复查，再检查正常窗口与缩小窗口，以及：

- 摄像头未开启、加载中和已开启。
- 数字人未连接、已连接和出错。
- 训练等待、保持、暂停和完成。
- 按钮能否看清并点击，提示是否遮挡。
- 视频/骨架仍与人体对齐。

尺寸调整不能简单拉伸相机画面。缩放/裁剪要与骨架显示一致；发现错位先和主开发确认，不通过裁剪掩盖问题。

## 提交前怎么检查

另开 PowerShell，在 `yhzk-demo-h5` 运行：

```powershell
Set-Location (Join-Path $env:USERPROFILE "HealthCompanion-work\HealthCompanion\yhzk-demo-h5")
npm.cmd run build
```

正常结束表示编译和生产构建完成，不代表真人流程通过。报错时先保留原始错误，再解决或交主开发。

回到项目根目录运行 `git diff` 和 `git status --short`，核对实际改动。如果看到依赖、配置或无关文件变化，让主开发协助检查。

## 交付报告模板

文件：`docs/team-work/ui/first-layout-review.md`。

```text
姓名/代号、日期、分支与提交号
窗口大小、浏览器缩放、相机分辨率
修改前：具体问题和操作步骤
目标：用户修改后应能怎么操作
实际文件：这次改了哪些文件
修改后：按原步骤观察到什么
人工复查：正常/缩小窗口、按钮状态、视频/骨架
构建：通过/失败和错误
附件：前后截图（没有就说明）
剩余问题：尚未处理什么
```

首轮完成标准：启动成功；交两种窗口体验记录；有明确问题时完成一个确认的小改动；构建和人工复查情况完整。没有明确问题时交体验记录，不为产生代码改动而改动。

正式场景确定后，可以再领取一个独立区域、组件或语音状态显示任务，由主开发先提供明确交互方案。


## 怎样交付、提交和更新

第一份交付先注明：姓名或团队代号、日期、电脑/浏览器、分支、提交号、完成项、未执行项和阻塞。没有执行就写“未执行＋原因”。

### 保存和提交自己的结果

用 VS Code 新建本文指定的报告目录和文件。不会用 Git 时，先把报告文件发给主开发，由他归档也算有效交付。

要提交时另开 PowerShell，进入**项目根目录**，那里同时有 `docs`、`yhzk-demo-h5`、`ai-service` 等目录。按前面默认路径克隆的成员可以执行：

```powershell
Set-Location (Join-Path $env:USERPROFILE "HealthCompanion-work\HealthCompanion")
```

首次提交前替换示例设置自己的身份：

```powershell
git config user.name "你的姓名或GitHub名称"
git config user.email "你在GitHub使用的提交邮箱"
git status --short
```

`git status` 显示自己实际改了什么文件。下面以第一份报告为例；先创建并保存文件再执行，只添加这次任务涉及的文件。

```powershell
git add -- docs/team-work/ui/first-layout-review.md
git diff --cached --stat
git commit -m "docs: record first layout review"
git push -u origin team/ui-m2-6
```

前端有实际样式修改时，再添加 `yhzk-demo-h5/src/pose-lab.scss`；其他组件只添加本次确实修改的文件，提交消息写清实际改动。

“commit”保存本次改动，“push”把自己的分支传到仓库。要求登录时用自己的 GitHub 账号；没有写入权限就请主开发开通，或先直接交报告文件。

推送后到 GitHub 创建 Pull Request（PR，申请合并改动）：**base 选 `feat/pose-shoulder-loop`，compare 选自己的工作分支**。说明改了什么、人工复查结果、未处理问题，由主开发审查合并。可从自己分支的 “Contribute → Open pull request” 进入。

出现冲突或不懂的 Git 报错，保留当前状态，把提示交给主开发处理。

### 主开发更新了基线，如何同步

在项目根目录先运行 `git status --short`。有自己的未提交文件时先交付或请主开发协助；仅在工作区干净时执行：

```powershell
git fetch origin
git merge origin/feat/pose-shoulder-loop
git rev-parse --short HEAD
```

冲突时联系主开发。依赖文件更新后，停止前端，在 `yhzk-demo-h5` 运行 `npm.cmd ci`，再按启动步骤运行。报告记录更新后的提交号。

## 当前项目资料入口

[产品和里程碑状态](https://github.com/wsl-HealthCompanion/HealthCompanion/blob/feat/pose-shoulder-loop/docs/README.md)。旧计划按历史资料阅读。本任务书的岗位安排不会自动启动尚未排期的 M3。
