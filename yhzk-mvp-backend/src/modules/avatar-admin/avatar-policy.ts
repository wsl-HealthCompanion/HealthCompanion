export type AvatarDeleteBlockerCode =
  | 'DEFAULT_AVATAR'
  | 'ASSIGNED_USERS'
  | 'TEST_RUNNING'
  | 'ACTIVE_TASK'
  | 'ACTIVE_SESSION'
  | 'INVALID_STATUS';

export interface AvatarDeleteBlocker {
  code: AvatarDeleteBlockerCode;
  count: number;
  message: string;
}

export interface AvatarDeletionInput {
  avatarId: string;
  status: string;
  isDefault: boolean;
  assignedUserCount: number;
  testRunning: boolean;
  activeTaskCount: number;
  activeSessionCount: number;
}

const DELETABLE_STATUSES = new Set(['ready', 'failed', 'delete_failed', 'interrupted']);

export function evaluateAvatarDeletion(
  input: AvatarDeletionInput,
): { allowed: boolean; blockers: AvatarDeleteBlocker[] } {
  const blockers: AvatarDeleteBlocker[] = [];
  const id = input.avatarId;

  if (!DELETABLE_STATUSES.has(input.status)) {
    blockers.push({
      code: 'INVALID_STATUS',
      count: 1,
      message: `形象${id}当前状态为${input.status}，不能删除`,
    });
  }
  if (input.isDefault) {
    blockers.push({
      code: 'DEFAULT_AVATAR',
      count: 1,
      message: `形象${id}是系统默认形象，请先更换默认形象`,
    });
  }
  if (input.assignedUserCount > 0) {
    blockers.push({
      code: 'ASSIGNED_USERS',
      count: input.assignedUserCount,
      message: `形象${id}正在被${input.assignedUserCount}名有效用户使用，请先为这些用户更换形象`,
    });
  }
  if (input.testRunning) {
    blockers.push({
      code: 'TEST_RUNNING',
      count: 1,
      message: `形象${id}正在测试运行，请先切换测试形象`,
    });
  }
  if (input.activeTaskCount > 0) {
    blockers.push({
      code: 'ACTIVE_TASK',
      count: input.activeTaskCount,
      message: `形象${id}有${input.activeTaskCount}个未结束的生成任务`,
    });
  }
  if (input.activeSessionCount > 0) {
    blockers.push({
      code: 'ACTIVE_SESSION',
      count: input.activeSessionCount,
      message: `形象${id}正被${input.activeSessionCount}个数字人会话使用`,
    });
  }

  return { allowed: blockers.length === 0, blockers };
}
