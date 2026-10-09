@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  HealthCompanion · 1 安装前端依赖
REM  走 7897 代理，避免直连 github / npm registry 超时
REM  针对 npm 可选依赖 bug 做了自动修补
REM ============================================================

title HealthCompanion - 安装前端依赖

cd /d "%~dp0yhzk-demo-h5"
if errorlevel 1 (
    echo [错误] 找不到 yhzk-demo-h5 目录
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   安装 yhzk-demo-h5 依赖
echo   目录: %CD%
echo   代理: 127.0.0.1:7897
echo ============================================================
echo.

REM 为本次命令临时设置代理，不写进 .npmrc，不改全局配置
set "HTTP_PROXY=http://127.0.0.1:7897"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "http_proxy=http://127.0.0.1:7897"
set "https_proxy=http://127.0.0.1:7897"

echo [1/4] 检查代理连通性 ...
curl -s -x http://127.0.0.1:7897 -o nul --max-time 10 https://registry.npmjs.org/ 2>nul
if errorlevel 1 (
    echo        [警告] 代理不通，将尝试直连（可能较慢或失败）
) else (
    echo        [OK] 代理可用
)

echo.
echo [2/4] 安装依赖 ...
if exist "node_modules" (
    echo        已存在 node_modules，改用 npm install 增量更新
    call npm.cmd install
) else (
    echo        首次安装，使用 npm ci 严格还原 lock 文件
    call npm.cmd ci
)
set "RC=!errorlevel!"

echo.
echo [3/4] 修补 npm 可选依赖 - Windows 常见问题 ...
REM npm 有已知 bug：平台原生二进制(esbuild/rollup)可能不落地，
REM 导致 vite 启动时报 MODULE_NOT_FOUND。这里主动补齐。
if not exist "node_modules\@esbuild\win32-x64" (
    echo        补装 @esbuild/win32-x64 ...
    call npm.cmd install --no-save @esbuild/win32-x64@0.21.5
)
if not exist "node_modules\@rollup\rollup-win32-x64-msvc" (
    echo        补装 @rollup/rollup-win32-x64-msvc ...
    call npm.cmd install --no-save @rollup/rollup-win32-x64-msvc
)
echo        修补完成

echo.
echo [4/4] 验证 ...
"C:\Windows\System32\cmd.exe" /c "node node_modules\vite\bin\vite.js --version" 2>nul
if errorlevel 1 (
    echo        [警告] vite 自检未通过，请看上面报错
    set "VERIFY=0"
) else (
    echo        [OK] vite 可用
    set "VERIFY=1"
)

echo.
echo ============================================================
if "!VERIFY!"=="1" (
    echo   安装完成，可以启动前端了
    echo.
    echo   下一步：运行  03-start-frontend.bat
) else (
    echo   安装有问题，安装返回码 !RC!
    echo.
    echo   排查建议：
    echo     1^) 确认 Clash Verge 已开启，7897 端口在监听
    echo     2^) 重跑本脚本即可，支持增量
    echo     3^) 仍失败：删除 node_modules 后重跑
    echo     4^) 不要手动改 package.json / package-lock.json
)
echo ============================================================
echo.
pause
endlocal
