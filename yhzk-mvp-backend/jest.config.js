/**
 * 后端单元测试配置 — 纯单测(不连数据库/Redis/AI服务)
 * 注意: feat/xmov-task4-trusted-rag 与 fix/ci-xmov-rag 分支各自也引入了 jest 配置,
 * 合并时如冲突, 保留一份并把双方的 testMatch 合并即可。
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
