@echo off
setlocal

REM ============================================================
REM  HealthCompanion 本地启动脚本 · 0 环境自检与配置生成
REM  仓库目录: D:\Health
REM  代理端口: 7897  (Clash Verge / mihomo mixed 端口)
REM ============================================================

title HealthCompanion - 环境自检

echo.
echo ============================================================
echo   炎华众康 HealthCompanion  环境自检与配置生成
echo   仓库: D:\Health
echo   代理: 127.0.0.1:7897
echo ============================================================
echo.

cd /d "%~dp0"
if errorlevel 1 (
    echo [错误] 无法进入脚本所在目录
    pause
    exit /b 1
)

REM ---------- 1. 检查 git ----------
echo [1/5] 检查 Git ...
where git >nul 2>nul
if errorlevel 1 (
    echo        [缺失] 未找到 git，请先安装 Git for Windows
) else (
    for /f "delims=" %%v in ('git --version') do echo        [OK] %%v
)

REM ---------- 2. 检查 node ----------
echo.
echo [2/5] 检查 Node.js ...
where node >nul 2>nul
if errorlevel 1 (
    echo        [缺失] 未找到 node，请先安装 Node.js 24.x LTS
) else (
    for /f "delims=" %%v in ('node --version') do echo        [OK] node %%v
    for /f "delims=" %%v in ('npm.cmd --version 2^>nul') do echo        [OK] npm %%v
)

REM ---------- 3. 检查代理端口 7897 ----------
echo.
echo [3/5] 检查代理端口 7897 ...
netstat -ano | findstr /R /C:"127.0.0.1:7897 .*LISTENING" >nul 2>nul
if errorlevel 1 (
    echo        [警告] 7897 未监听，Clash Verge 可能没开
    echo               依赖下载和 npm install 可能很慢或失败
) else (
    echo        [OK] 127.0.0.1:7897 正在监听
)

REM ---------- 4. 生成 .env 文件 ----------
echo.
echo [4/5] 生成各子项目 .env ...
if not exist "yhzk-demo-h5\.env" (
    copy /y "yhzk-demo-h5\.env.example" "yhzk-demo-h5\.env" >nul
    echo        [新建] yhzk-demo-h5\.env
) else (
    echo        [跳过] yhzk-demo-h5\.env 已存在
)

if not exist "ai-service\.env" (
    copy /y "ai-service\.env.example" "ai-service\.env" >nul
    echo        [新建] ai-service\.env      ^<-- 记得填 DEEPSEEK_API_KEY
) else (
    echo        [跳过] ai-service\.env 已存在
)

if not exist "yhzk-mvp-backend\.env" (
    copy /y "yhzk-mvp-backend\.env.example" "yhzk-mvp-backend\.env" >nul
    echo        [新建] yhzk-mvp-backend\.env ^<-- 记得填 DEEPSEEK_API_KEY
) else (
    echo        [跳过] yhzk-mvp-backend\.env 已存在
)

REM ---------- 5. 前端依赖 ----------
echo.
echo [5/5] 检查前端依赖 ...
if exist "yhzk-demo-h5\node_modules" (
    echo        [OK] yhzk-demo-h5\node_modules 已存在
) else (
    echo        [待安装] 请先运行  02-install-deps.bat
)

echo.
echo ============================================================
echo   自检完成
echo ============================================================
echo.
echo   下一步：
echo     1^) 运行  02-install-deps.bat   安装前端依赖（首次必做）
echo     2^) 运行  03-start-frontend.bat 启动 Pose Lab 前端
echo     3^) 浏览器打开  http://127.0.0.1:5273/pose-lab.html
echo.
echo   可选：需要 AI 对话时，先填好两个 .env 里的 DEEPSEEK_API_KEY，
echo         再用 04-start-backend-dev.bat 启动开发后端（端口 3001）
echo.
pause
endlocal
