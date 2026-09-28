/**
 * 档案工具（Task 5）
 * read_health_profile: 读取服务端已加载的用户健康档案（不由 LLM 提供任何数据）。
 */
import { ToolDefinition, ToolContext, ToolExecOutcome } from './tool.types';
import { extractProfileFacts } from './diet-plan.tool';

export const PROFILE_TOOL_NAME = 'read_health_profile';

export function createProfileTool(): ToolDefinition {
  return {
    name: PROFILE_TOOL_NAME,
    description:
      '读取当前用户的健康档案（基本资料、疾病史、过敏史、用药）。当用户要求查看/读取自己的健康档案或问“我的档案里有什么”时调用。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    async execute(ctx: ToolContext, _args): Promise<ToolExecOutcome> {
      const profile = ctx.profile;
      const hasData = profile && typeof profile === 'object' && Object.keys(profile).length > 0;
      if (!hasData) {
        throw new Error('未找到你的健康档案，请先在「我的-完整建档」中完成建档');
      }
      const facts = extractProfileFacts(profile);
      const join = (arr: string[]) => (arr.length ? arr.join('、') : '无');
      const summary =
        `档案信息：${facts.name || '未填写姓名'}；` +
        `疾病史：${join(facts.diseases)}；过敏史：${join(facts.allergies)}；` +
        `正在用药：${join(facts.medications)}。`;
      return {
        summary,
        data: {
          tool: PROFILE_TOOL_NAME,
          name: facts.name,
          diseases: facts.diseases,
          allergies: facts.allergies,
          medications: facts.medications,
        },
      };
    },
  };
}
