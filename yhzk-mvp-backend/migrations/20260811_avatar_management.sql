-- 炎华众康数字人形象管理第一阶段
-- 版本: 20260811
-- 特性: 可重复执行；不删除任何现有数据

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS admin_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(64) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(100) NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id       UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES admin_permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username            VARCHAR(64) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  display_name        VARCHAR(100) NOT NULL,
  role_id             UUID NOT NULL REFERENCES admin_roles(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  last_login_at       TIMESTAMPTZ,
  last_login_ip       VARCHAR(64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active
  ON admin_users(username)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id   UUID REFERENCES admin_users(id),
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(64) NOT NULL,
  resource_id     VARCHAR(128),
  before_data     JSONB,
  after_data      JSONB,
  success         BOOLEAN NOT NULL,
  error_message   TEXT,
  ip_address      VARCHAR(64),
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_resource
  ON admin_audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin
  ON admin_audit_logs(admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS digital_human_avatars (
  id                  VARCHAR(64) PRIMARY KEY,
  model               VARCHAR(20) NOT NULL CHECK (model IN ('wav2lip', 'musetalk')),
  status              VARCHAR(24) NOT NULL CHECK (
    status IN ('uploading', 'generating', 'ready', 'failed', 'interrupted', 'deleting', 'delete_failed')
  ),
  preview_path        TEXT,
  source_video_path   TEXT,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  last_error          TEXT,
  created_by          UUID REFERENCES admin_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_digital_human_avatars_one_default
  ON digital_human_avatars(is_default)
  WHERE is_default = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_digital_human_avatars_status
  ON digital_human_avatars(status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS avatar_generation_tasks (
  task_id         UUID PRIMARY KEY,
  avatar_id       VARCHAR(64) NOT NULL REFERENCES digital_human_avatars(id),
  model           VARCHAR(20) NOT NULL CHECK (model IN ('wav2lip', 'musetalk')),
  status          VARCHAR(24) NOT NULL CHECK (
    status IN ('pending', 'uploading', 'running', 'completed', 'failed', 'interrupted')
  ),
  progress        INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_message   TEXT,
  created_by      UUID REFERENCES admin_users(id),
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avatar_tasks_avatar
  ON avatar_generation_tasks(avatar_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avatar_tasks_active
  ON avatar_generation_tasks(status, created_at DESC)
  WHERE status IN ('pending', 'uploading', 'running');

CREATE TABLE IF NOT EXISTS user_avatar_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id),
  avatar_id     VARCHAR(64) NOT NULL REFERENCES digital_human_avatars(id),
  source        VARCHAR(20) NOT NULL CHECK (source IN ('migration', 'automatic', 'manual', 'default')),
  assigned_by   UUID REFERENCES admin_users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_avatar_assignments_current_user
  ON user_avatar_assignments(user_id)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_avatar_assignments_avatar
  ON user_avatar_assignments(avatar_id)
  WHERE ended_at IS NULL;

INSERT INTO admin_roles (code, name, is_active)
VALUES ('super_admin', '超级管理员', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, is_active = true, updated_at = now();

INSERT INTO admin_permissions (code, name)
VALUES
  ('avatar.view', '查看数字人形象'),
  ('avatar.create', '上传并生成数字人形象'),
  ('avatar.update', '修改默认形象和测试运行'),
  ('avatar.delete', '删除数字人形象'),
  ('audit.view', '查看管理员操作记录'),
  ('user.manage', '管理用户及用户形象')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM admin_roles role
CROSS JOIN admin_permissions permission
WHERE role.code = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION update_avatar_management_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_roles_updated_at ON admin_roles;
CREATE TRIGGER trg_admin_roles_updated_at
  BEFORE UPDATE ON admin_roles
  FOR EACH ROW EXECUTE FUNCTION update_avatar_management_updated_at();

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_avatar_management_updated_at();

DROP TRIGGER IF EXISTS trg_digital_human_avatars_updated_at ON digital_human_avatars;
CREATE TRIGGER trg_digital_human_avatars_updated_at
  BEFORE UPDATE ON digital_human_avatars
  FOR EACH ROW EXECUTE FUNCTION update_avatar_management_updated_at();

DROP TRIGGER IF EXISTS trg_avatar_generation_tasks_updated_at ON avatar_generation_tasks;
CREATE TRIGGER trg_avatar_generation_tasks_updated_at
  BEFORE UPDATE ON avatar_generation_tasks
  FOR EACH ROW EXECUTE FUNCTION update_avatar_management_updated_at();

