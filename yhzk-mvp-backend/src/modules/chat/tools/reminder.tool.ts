/**
 * 提醒工具（Task 5）
 * create_reminder: 把提醒真实写入数据库（reminders 表），返回可复核的提醒编号与时间。
 * 模型不能伪造执行结果：本工具成功与否由数据库写入决定。
 */
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { ToolDefinition, ToolContext, ToolExecOutcome } from './tool.types';

export const REMINDER_TOOL_NAME = 'create_reminder';

const REPEAT_LABEL: Record<string, string> = {
  none: '仅一次',
  daily: '每天',
  weekly: '每周',
};

function formatLocal(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function createReminderTool(dataSource: DataSource): ToolDefinition {
  const ensureTable = async (): Promise<void> => {
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        title varchar(200) NOT NULL,
        remind_at timestamptz NOT NULL,
        repeat_rule varchar(16) NOT NULL DEFAULT 'none',
        source varchar(32) NOT NULL DEFAULT 'chat_tool',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  };

  return {
    name: REMINDER_TOOL_NAME,
    description:
      '为用户创建健康提醒（如吃药、测血压、测血糖、喝水、复诊）。当用户明确要求设置/创建提醒时调用；缺少时间时不要编造，应先向用户询问时间。',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          description: '提醒内容，如：测血压',
        },
        remind_at: {
          type: 'string',
          format: 'date-time',
          description: '提醒时间，ISO 8601，如 2026-09-30T08:00:00+08:00',
        },
        repeat: {
          type: 'string',
          enum: ['none', 'daily', 'weekly'],
          description: '重复规则，默认 none',
        },
      },
      required: ['title', 'remind_at'],
    },

    async execute(ctx: ToolContext, args): Promise<ToolExecOutcome> {
      const title = String(args.title).trim();
      const remindAtRaw = String(args.remind_at);
      const repeat = (args.repeat as string) || 'none';

      const remindAt = new Date(remindAtRaw);
      if (Number.isNaN(remindAt.getTime())) {
        throw new Error('提醒时间无法解析，请提供如 2026-09-30T08:00:00+08:00 的格式');
      }
      if (remindAt.getTime() < Date.now() - 60_000) {
        throw new Error('提醒时间已过去，请提供未来时间');
      }

      await ensureTable();
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO reminders (id, user_id, title, remind_at, repeat_rule, source)
         VALUES ($1, $2, $3, $4, $5, 'chat_tool')`,
        [id, ctx.userId, title, remindAt.toISOString(), repeat],
      );

      const repeatText = repeat !== 'none' ? `，重复：${REPEAT_LABEL[repeat] || repeat}` : '';
      return {
        summary: `已创建提醒「${title}」，时间 ${formatLocal(remindAt.toISOString())}${repeatText}（编号 ${id.slice(0, 8)}）。`,
        data: {
          tool: REMINDER_TOOL_NAME,
          id,
          title,
          remind_at: remindAt.toISOString(),
          repeat,
        },
      };
    },
  };
}
