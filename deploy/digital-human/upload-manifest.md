# 用户独立数字人会话：上传与部署清单

本清单对应检查点 `checkpoint-user-avatar-runtime-switch-20260813`。所有代码只在本地修改；服务器文件由管理员按下列相对路径覆盖。

服务器项目根目录：

```text
/mnt/newdisk/opt/AIAgents/HealthyDigitalHuman
```

## 1. 必须上传：LiveTalking

上传到 `LiveTalking-main/` 下的相同相对路径：

```text
app.py
config.py
server/audio_port_pool.py
server/internal_auth.py
server/routes.py
server/session_manager.py
server/subtitle_sync.py
streamout/rtmp.py
```

这些文件负责内部令牌鉴权、随机会话、每用户独立 RTMP 流、独立 UDP 音频端口、定向字幕/停止，以及 FFmpeg/SRS 就绪失败时的安全回滚。固定 `session 0` 和管理员预览端口不进入用户动态端口池。

## 2. 必须上传：NestJS 后端

上传到 `yhzk-mvp-backend/` 下的相同相对路径：

```text
src/app.module.ts
src/main.ts
src/common/guards/jwt-auth.guard.ts
src/config/redis.config.ts
src/modules/admin-user/admin-user.module.ts
src/modules/admin-user/admin-user.service.ts
src/modules/admin-user/admin-user.service.spec.ts
src/modules/auth/auth.controller.ts
src/modules/auth/auth.module.ts
src/modules/auth/auth.service.ts
src/modules/auth/jwt.strategy.ts
src/modules/avatar-admin/user-avatar-assignment.service.ts
src/modules/avatar-admin/user-avatar-assignment.service.spec.ts
src/modules/digital-human/digital-human-cleanup.service.ts
src/modules/digital-human/digital-human-media-ticket.service.ts
src/modules/digital-human/digital-human-session.repository.ts
src/modules/digital-human/digital-human.controller.ts
src/modules/digital-human/digital-human.dto.ts
src/modules/digital-human/digital-human.module.ts
src/modules/digital-human/digital-human.service.ts
src/modules/digital-human/digital-human.types.ts
src/modules/digital-human/live-talking-session.client.ts
src/modules/digital-human/real-user.guard.ts
src/modules/digital-human/redis-digital-human-session.repository.ts
```

上面两个 `*.spec.ts` 是已存在的后端源码树文件，这次因构造函数依赖变化而同步更新；如果服务器只保留生产源文件可不上传，但若服务器执行完整 Jest 测试则应一并上传。

## 3. 必须上传：H5

上传到 `yhzk-demo-h5/` 下的相同相对路径：

```text
.env.example
src/App.tsx
src/config.ts
src/vite-env.d.ts
src/components/DigitalHumanPlayer.tsx
src/components/dynamicPlayerPolicy.ts
src/services/auth.ts
src/services/authLogout.ts
src/services/chat.ts
src/services/digitalHuman.ts
src/services/digitalHumanSession.ts
```

H5 不再调用 LiveTalking 公共控制接口，也不再使用固定 `hdh` 流。会话控制令牌只保存在页面内存，媒体凭证只使用 HttpOnly Cookie。

## 4. 部署配置（先阅读并手工合并）

建议把整个 `deploy/digital-human/` 上传到项目根目录留档，但不要直接用示例覆盖现有 Nginx 配置：

```text
deploy/digital-human/README.md
deploy/digital-human/environment.example
deploy/digital-human/nginx-isolated-streams.conf.example
deploy/digital-human/verify-isolation.sh
deploy/digital-human/upload-manifest.md
```

- 将 `nginx-isolated-streams.conf.example` 中的 location 合并到当前 HTTP server 块。
- 必须让动态 `/live/dh_*.flv` 经过 NestJS `auth_request`。
- 必须让公网 `/dh/api/internal/` 和 `/dh/api/admin/` 返回 404。
- 必须让未实现的其他 `/live/dh_*` 媒体变体失败关闭。
- SRS HTTP-FLV 原始端口（例如 8180）不能暴露给公网。

## 5. 环境变量

在 `yhzk-mvp-backend/.env` 中增加以下配置。两个密钥必须分别生成，不能复用现有管理员或形象上传密钥：

```bash
openssl rand -hex 32  # DIGITAL_HUMAN_INTERNAL_TOKEN
openssl rand -hex 32  # DIGITAL_HUMAN_MEDIA_SECRET
```

```ini
DIGITAL_HUMAN_INTERNAL_TOKEN=<第一条随机密钥>
DIGITAL_HUMAN_MEDIA_SECRET=<第二条随机密钥>
DIGITAL_HUMAN_COOKIE_SECURE=false
LIVE_TALKING_INTERNAL_URL=http://127.0.0.1:8010
DIGITAL_HUMAN_RUNTIME_MODEL=wav2lip
DIGITAL_HUMAN_MAX_SESSIONS=10
DIGITAL_HUMAN_OUTPUT_READY_TIMEOUT=30
DIGITAL_HUMAN_ADMIN_AUDIO_PORT=19876
DIGITAL_HUMAN_AUDIO_PORT_START=21000
DIGITAL_HUMAN_AUDIO_PORT_END=21009
DIGITAL_HUMAN_DYNAMIC_PUSH_URL_BASE=rtmp://127.0.0.1:1935/live/dh_
```

当前是 HTTP，因此 `DIGITAL_HUMAN_COOKIE_SECURE=false`。正式切换 HTTPS 时必须改为 `true`。

## 6. 部署顺序

1. 备份上述将被覆盖的文件和当前 Nginx 配置。
2. 上传运行文件并写入环境变量。若服务器从源码构建，上传本清单列出的源码后在服务器执行构建；若发布构建产物，只发布由本检查点提交生成的后端 `dist/` 和 H5 静态产物，禁止混用旧源码/旧产物。
3. 合并 Nginx 配置，确认使用更具体的 `location ^~ /live/dh_`，并执行 `sudo nginx -t`；此时只检查语法，不 reload。
4. 在后端目录执行 `npm run build`，退出码必须为 0；随后把环境变量导入 PM2，先重启 `backend` 并检查健康接口。
5. 重启 `dh`，检查内部健康、动态端口池和 SRS 推流依赖；这是第二个回滚暂停点。
6. 在 H5 目录执行 `npm run build`，退出码必须为 0；把产物发布到新的版本目录，但先不要把公共入口切到新版本。
7. 执行 `sudo nginx -t && sudo nginx -s reload`，随后运行 `deploy/digital-human/verify-isolation.sh`。脚本任何断言失败都必须停止发布并回滚，不能切换 H5 公共入口。
8. 验证脚本通过后再把 H5 公共入口原子切换到新版本，执行双浏览器/双用户真实验收。

无需执行数据库迁移，也无需修改 SRS 延迟参数。

回滚以本功能分支各任务提交以及最终标签 `checkpoint-user-avatar-runtime-switch-20260813` 为准。后端、`dh`、H5/Nginx 每个暂停点分别保留上一版产物和配置；任何一步失败只回滚该步及其后续步骤。

## 7. 双用户隔离验收

1. 用两个独立浏览器或无痕窗口登录用户 A、用户 B，并分配不同形象。
2. 刷新两个页面；两者 `/live/dh_<随机值>.flv` 地址必须不同，地址中不能出现用户 ID 或手机号。
3. 两人同时发送内容明显不同的问题；画面、声音、字幕和打断操作只能影响各自页面。
4. 在 B 的浏览器中请求 A 的流地址，应返回 401/403，不能播放。
5. 管理员给 A 更换形象：A 当前会话保持不变，A 刷新/重新进入后使用新形象；B 不重连。
6. A 登出后，A 的旧流应失效；B 的会话必须继续播放。
7. 用户停用或软删除后，该用户活动数字人会话应被定向关闭，其他用户不受影响。

HTTP 只能保证应用层的用户/会话隔离，不能提供链路加密。公网传输保密性要等正式 HTTPS 才成立。

## 8. 不需要上传的文件

`tests/`、`*.spec.ts` 和设计/计划文档只用于本地回归验证，不影响服务器运行，可不上传。
