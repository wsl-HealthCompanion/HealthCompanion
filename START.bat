@echo off
setlocal

REM ============================================================
REM  HealthCompanion · 快捷入口
REM  双击本文件 → 选择要执行的操作
REM ============================================================

title HealthCompanion - 启动菜单

:menu
cls
echo.
echo ============================================================
echo      炎华众康 HealthCompanion   本地启动菜单
echo      仓库目录: D:\Health
echo      代理端口: 127.0.0.1:7897
echo ============================================================
echo.
echo   [1] 环境自检 + 生成 .env          ^<首次必做^>
echo   [2] 安装前端依赖                  ^<首次必做, 需联网^>
echo   [3] 启动 Pose Lab 前端            ^<5273, 最常用^>
echo   [4] 启动开发后端 dev-server       ^<3001, 需 DeepSeek Key^>
echo   [5] 启动 Python AI 服务           ^<8000, 完整链路才需要^>
echo.
echo   [6] 构建前端生产包  npm run build
echo   [7] 检查各端口占用情况
echo   [8] 打开 Pose Lab 页面
echo.
echo   [0] 退出
echo ============================================================
echo.
set /p "CHOICE=请输入序号后回车: "

if "%CHOICE%"=="1" start "" "%~dp0env-setup.bat"        & goto menu
if "%CHOICE%"=="2" start "" "%~dp002-install-deps.bat"  & goto menu
if "%CHOICE%"=="3" start "" "%~dp003-start-frontend.bat"& goto menu
if "%CHOICE%"=="4" start "" "%~dp004-start-backend-dev.bat" & goto menu
if "%CHOICE%"=="5" start "" "%~dp005-start-ai-service.bat"  & goto menu
if "%CHOICE%"=="6" goto build
if "%CHOICE%"=="7" goto ports
if "%CHOICE%"=="8" start "" "http://127.0.0.1:5273/pose-lab.html" & goto menu
if "%CHOICE%"=="0" exit /b 0

echo.
echo   无效输入，请重新选择。
timeout /t 2 >nul
goto menu

:build
cls
echo.
echo   构建前端生产包 ...
echo.
cd /d "%~dp0yhzk-demo-h5"
call npm.cmd run build
echo.
echo   构建结束，产物在 yhzk-demo-h5\dist\
pause
goto menu

:ports
cls
echo.
echo   端口占用检查  LISTENING：
echo.
for %%p in (3000 3001 4000 5273 8000 8010 9880 8180 1935) do (
    netstat -ano | findstr /R /C:":%%p .*LISTENING" >nul 2>nul
    if errorlevel 1 (
        echo      %%p    [空闲]
    ) else (
        echo      %%p    [占用]
    )
)
echo.
echo   7897 = Clash Verge 代理端口，应该显示 占用
echo.
pause
goto menu
