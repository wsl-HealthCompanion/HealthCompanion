@echo off
setlocal

REM ============================================================
REM  HealthCompanion · 3 启动 Pose Lab 前端
REM  地址: http://127.0.0.1:5273/  (主界面)   http://127.0.0.1:5273/pose-lab.html  (动作练习)
REM  本窗口必须保持打开，关掉网页就打不开了。
REM ============================================================

title HealthCompanion 前端 5273

cd /d "%~dp0yhzk-demo-h5"
if errorlevel 1 (
    echo [错误] 找不到 yhzk-demo-h5 目录
    echo        本脚本必须放在 D:\Health 根目录下。
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   前端启动中
echo   目录: %CD%
echo   端口: 5273  仅本机
echo ============================================================
echo.

if not exist "node_modules" (
    echo [错误] 未安装依赖，请先运行  02-install-deps.bat
    echo.
    pause
    exit /b 1
)

netstat -ano | findstr /R /C:"127.0.0.1:5273 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo [提示] 5273 已被占用，可能你自己已经开过一个窗口。
    echo        请先关闭那个窗口，再运行本脚本。
    echo.
    pause
    exit /b 1
)

REM ---------- 找一个可用的 node ----------
set "NODE_EXE="

REM 1) 官方安装位置
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"

REM 2) 托管运行时：扫描 versions 下所有版本，不写死版本号
if not defined NODE_EXE (
    for /f "delims=" %%v in ('dir /b /ad /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
        if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%v\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%v\node.exe"
    )
)

REM 3) 兜底：PATH 里找
if not defined NODE_EXE (
    for /f "delims=" %%p in ('where node 2^>nul') do (
        if not defined NODE_EXE set "NODE_EXE=%%p"
    )
)
if not defined NODE_EXE (
    echo [错误] 找不到 Node.js，请先安装 Node.js 24.x LTS，
    echo        或告知主开发你的 Node 安装位置。
    echo.
    pause
    exit /b 1
)
echo   Node: %NODE_EXE%

echo.
echo 等窗口出现 Local 提示后，手动把地址复制到浏览器打开。本机有两个页面：
echo.
echo   [1] 主界面 - 数字人对话 + 摄像头卡   ^<-- 一般看这个
echo       http://127.0.0.1:5273/
echo.
echo   [2] 肩部动作练习 - 独立训练页
echo       http://127.0.0.1:5273/pose-lab.html
echo.
echo   动作练习首次体验：点"开启摄像头" -^> 允许权限 -^> 点"开始训练"
echo   双臂抬至肩部高度并保持三秒，观察"训练完成"。
echo.
echo   停止服务：在本窗口按 Ctrl + C，或直接关闭本窗口。
echo ============================================================
echo.

REM ---------- 前台启动 vite（占用本窗口）----------
"%NODE_EXE%" node_modules\vite\bin\vite.js --config .local-vite-http.config.mjs
set "RC=%errorlevel%"

echo.
echo ============================================================
if not "%RC%"=="0" (
    echo   [启动失败] vite 退出码 %RC%
    echo.
    echo   常见原因：
    echo     1^) 依赖不完整，重跑 02-install-deps.bat
    echo     2^) 5273 端口被别的程序占用
    echo     3^) node_modules 损坏，删掉后重跑 02-install-deps.bat
) else (
    echo   前端已停止。
)
echo ============================================================
echo.
pause
endlocal
