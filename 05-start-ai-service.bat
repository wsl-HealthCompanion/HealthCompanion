@echo off
setlocal

REM ============================================================
REM  HealthCompanion · 4 启动 Python AI 服务 (LangGraph)
REM  目录: D:\Health\ai-service
REM  端口: 8000   （端口来自 ai-service\.env 的 PORT）
REM  代理: 127.0.0.1:7897（调用 DeepSeek / DashScope 必需）
REM
REM  注意：这是「完整后端链路」才需要的一环。
REM        只做 Pose Lab 摄像头练习的话，不需要本脚本。
REM ============================================================

title HealthCompanion - AI Service (8000)

cd /d "%~dp0ai-service" || (echo [错误] 找不到 ai-service 目录 & pause & exit /b 1)

echo.
echo ============================================================
echo   Python AI Service 启动中
echo   目录: %CD%
echo   端口: 8000
echo ============================================================
echo.

if not exist ".env" (
    echo [错误] 缺少 .env，请先运行  env-setup.bat  并填入 DEEPSEEK_API_KEY
    echo.
    pause
    exit /b 1
)

REM ---------- 定位可用的 Python ----------
set "PY="
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
if not defined PY if exist "%USERPROFILE%\.workbuddy\binaries\python\envs\default\Scripts\python.exe" set "PY=%USERPROFILE%\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
if not defined PY (
    where python >nul 2>nul
    if not errorlevel 1 set "PY=python"
)
if not defined PY (
    echo [错误] 未找到 Python，请安装 Python 3.11 并创建虚拟环境：
    echo.
    echo     python -m venv .venv
    echo     .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)
echo   Python: %PY%

REM ---------- 检查依赖 ----------
"%PY%" -c "import fastapi, uvicorn, langgraph" >nul 2>nul
if errorlevel 1 (
    echo.
    echo [缺少依赖] 正在安装 requirements.txt（走 7897 代理）...
    echo.
    "%PY%" -m pip install -r requirements.txt ^
        --proxy http://127.0.0.1:7897 ^
        -i https://pypi.tuna.tsinghua.edu.cn/simple
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败。请检查 Clash Verge 是否开启，或手动执行：
        echo     "%PY%" -m pip install -r requirements.txt
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 启动 ----------
set "HTTP_PROXY=http://127.0.0.1:7897"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "http_proxy=http://127.0.0.1:7897"
set "https_proxy=http://127.0.0.1:7897"

echo.
echo   健康检查:  http://127.0.0.1:8000/healthz
echo   流式对话:  POST http://127.0.0.1:8000/v1/chat/stream
echo.
echo   停止服务：Ctrl + C
echo ============================================================
echo.

"%PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

echo.
echo   AI 服务已停止。
pause
endlocal
