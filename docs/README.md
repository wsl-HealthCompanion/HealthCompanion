# HealthCompanion 文档目录

本目录用于集中存放 HealthCompanion 的产品决策、比赛方案、技术路线与阶段实施文档。

## 当前文档

### 1. [2026-09-29 XmovAvatar 赛道产品方向与技术决策](./2026-09-29-XmovAvatar赛道产品方向与技术决策.md)

记录 2026-09-29 围绕魔珐科技 XmovAvatar 赛道形成的完整产品判断，包括：

- 从“健康问答数字人”转向“视觉共练型具身健康陪伴 Agent”；
- 与魔珐官方导诊 / AI 健康助手的差异化；
- Camera + Pose + VLM 的视觉架构；
- XmovAvatar KA / Widget / Tool Calling；
- Web / Android 平台决策；
- 医疗与隐私边界；
- 比赛 Demo 与后续开发路线。

### 2. [XmovAvatar 三个关键里程碑实施计划](./XmovAvatar三个关键里程碑实施计划.md)

下一阶段的三条硬里程碑：

1. **Xmov Action Lab**：获取真实 KA 动作，确认数字人实际能力。
2. **Camera → Pose → Xmov Feedback**：用一个肩部动作跑通视觉共练闭环。
3. **Tool Calling**：把 `pose_monitor / avatar_action / show_widget` 接入 LangGraph。

### 3. [M2.2 肩部动作规则引擎实施记录](./superpowers/specs/2026-10-01-m2-2-implementation-record.md)

记录 M2.1 的用户确认、M2.2 几何/规则接口、画面宽高比例修正、镜头范围标定边界和自动验证结果。下一阶段是 M2.3 稳定状态与保持计时。

### 4. [M2.3 动作会话与保持计时实施记录](./superpowers/specs/2026-10-01-m2-3-implementation-record.md)

记录稳定 500 ms、保持 3 秒、失效取消、一次完成事件、新样本与单调时钟约定，以及 M2.4 接入方式。按用户要求暂不自动测试。

## 文档约定

后续新增以下类型内容，优先放在本目录：

- 产品方向与决策记录；
- 比赛需求 / 规则拆解；
- 技术架构方案；
- 开发里程碑与验收标准；
- XmovAvatar / Camera / Pose / VLM 调研；
- 演示脚本与答辩材料；
- 安全、隐私与医疗边界说明。

运行、部署、数据库等现有工程文档暂时保持原位置，后续需要时再统一迁移，避免一次性改动过大。
