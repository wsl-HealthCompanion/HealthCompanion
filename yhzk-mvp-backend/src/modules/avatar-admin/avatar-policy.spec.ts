import { evaluateAvatarDeletion } from './avatar-policy';

describe('evaluateAvatarDeletion', () => {
  it('allows deletion of a ready avatar with no live references', () => {
    expect(evaluateAvatarDeletion({
      avatarId: '1008',
      status: 'ready',
      isDefault: false,
      assignedUserCount: 0,
      testRunning: false,
      activeTaskCount: 0,
      activeSessionCount: 0,
    })).toEqual({ allowed: true, blockers: [] });
  });

  it('returns every independent blocker with useful counts', () => {
    const result = evaluateAvatarDeletion({
      avatarId: '1005',
      status: 'ready',
      isDefault: true,
      assignedUserCount: 14,
      testRunning: true,
      activeTaskCount: 2,
      activeSessionCount: 3,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual([
      {
        code: 'DEFAULT_AVATAR',
        count: 1,
        message: '形象1005是系统默认形象，请先更换默认形象',
      },
      {
        code: 'ASSIGNED_USERS',
        count: 14,
        message: '形象1005正在被14名有效用户使用，请先为这些用户更换形象',
      },
      {
        code: 'TEST_RUNNING',
        count: 1,
        message: '形象1005正在测试运行，请先切换测试形象',
      },
      {
        code: 'ACTIVE_TASK',
        count: 2,
        message: '形象1005有2个未结束的生成任务',
      },
      {
        code: 'ACTIVE_SESSION',
        count: 3,
        message: '形象1005正被3个数字人会话使用',
      },
    ]);
  });

  it.each(['uploading', 'generating', 'deleting'])(
    'blocks deletion while avatar status is %s',
    (status) => {
      const result = evaluateAvatarDeletion({
        avatarId: 'new-avatar',
        status,
        isDefault: false,
        assignedUserCount: 0,
        testRunning: false,
        activeTaskCount: 0,
        activeSessionCount: 0,
      });

      expect(result.allowed).toBe(false);
      expect(result.blockers).toEqual([
        {
          code: 'INVALID_STATUS',
          count: 1,
          message: `形象new-avatar当前状态为${status}，不能删除`,
        },
      ]);
    },
  );
});
