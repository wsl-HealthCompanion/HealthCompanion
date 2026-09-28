-- 用户账号停用、恢复和软删除（2026-08-13）
-- 可重复执行；不会删除或覆盖现有用户数据。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_disabled
  ON users(disabled_at)
  WHERE deleted_at IS NULL AND disabled_at IS NOT NULL;
