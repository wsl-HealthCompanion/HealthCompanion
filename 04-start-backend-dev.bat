@echo off
setlocal

REM ============================================================
REM  HealthCompanion · 3 启动开发后端（最小化，零数据库依赖）
REM  文件: yhzk-mvp-backend\dev-server.js
REM  端口: 3001  （固定，不受 .env 的 PORT 影响）
REM  仅依赖 DeepSeek API，走 7897 代理
REM ============================================================

title HealthCompanion - Dev Backend (3001)

cd /d "%~dp0yhzk-mvp-backend" || (echo [错误] 找不到 yhzk-mvp-backend 目录 & pause & exit /b 1)

echo.
echo ============================================================
echo   开发后端 dev-server.js 启动中
echo   目录: %CD%
echo   端口: 3001
echo ============================================================
echo.

if not exist ".env" (
    echo [错误] 缺少 .env
    echo        请先运行  env-setup.bat  生成，并填入真实的 DEEPSEEK_API_KEY
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [错误] 缺少 node_modules，dev-server.js 需要 fetch 运行环境
    echo        请在 yhzk-mvp-backend 目录执行：  npm.cmd install
    echo.
    pause
    exit /b 1
)

netstat -ano | findstr /R /C:"127.0.0.1:3001 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo [警告] 3001 已被占用，请先关闭占用进程。
    echo.
    pause
    exit /b 1
)

REM dev-server.js 内部 fetch 调 https://api.deepseek.com，需要代理
set "HTTP_PROXY=http://127.0.0.1:7897"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "http_proxy=http://127.0.0.1:7897"
set "https_proxy=http://127.0.0.1:7897"

echo   端点：
echo     GET  http://127.0.0.1:3001/api/v1/health
echo     POST http://127.0.0.1:3001/api/v1/chat/message   (SSE)
echo     POST http://127.0.0.1:3001/api/v1/chat/simple
echo.
echo   注意：H5 默认请求 3000 端口。要让前端走这个后端，请在前端目录
echo         新建 .env.local 并写入：
echo             VITE_PROXY_API_TARGET=http://127.0.0.1:3001
echo         然后重启前端（03-start-frontend.bat）。
echo.
echo   停止服务：Ctrl + C
echo ============================================================
echo.

node dev-server.js

echo.
echo   开发后端已停止。
pause
endlocal
