@echo off
rem ============================================================
rem  "Ming Tian Chuan Shen Me" - local preview launcher
rem  Double-click this file. It starts a tiny local web server
rem  and opens the app in your browser.
rem
rem  It looks for a runtime in this order:
rem    1. node on PATH
rem    2. node bundled with DeepSeek Harness
rem    3. python on PATH
rem    4. py launcher
rem    5. python bundled with DeepSeek Harness
rem    6. a PowerShell-only fallback (this computer only)
rem ============================================================
setlocal
cd /d "%~dp0"
set "PORT=8080"
title Ming Tian Chuan Shen Me - Local Preview (port %PORT%)

echo.
echo   ============================================
echo    Ming Tian Chuan Shen Me / local preview
echo   ============================================
echo.

set "BUNDLED_NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
set "BUNDLED_PY=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"

where node >nul 2>nul
if not errorlevel 1 goto useNodePath

if exist "%BUNDLED_NODE%" goto useBundledNode

where python >nul 2>nul
if not errorlevel 1 goto usePythonPath

where py >nul 2>nul
if not errorlevel 1 goto usePyLauncher

if exist "%BUNDLED_PY%" goto useBundledPy

goto usePowerShell

:useNodePath
set "RUNNER=NODE"
set "EXE=node"
goto run

:useBundledNode
set "RUNNER=NODE"
set "EXE=%BUNDLED_NODE%"
goto run

:usePythonPath
set "RUNNER=PY"
set "EXE=python"
goto run

:usePyLauncher
set "RUNNER=PY"
set "EXE=py"
goto run

:useBundledPy
set "RUNNER=PY"
set "EXE=%BUNDLED_PY%"
goto run

:usePowerShell
set "RUNNER=PS"
goto run

:run
call :openBrowser
if "%RUNNER%"=="NODE" (
  echo   Using: %EXE%
  "%EXE%" "%~dp0tools\static-server.js" %PORT%
  goto end
)
if "%RUNNER%"=="PY" (
  echo   Using: %EXE%
  "%EXE%" -m http.server %PORT%
  goto end
)

echo   Using: PowerShell fallback server (this computer only)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve-fallback.ps1" -Port %PORT%
goto end

:openBrowser
rem Wait ~2s so the server socket is listening before the browser asks for it.
rem ping is used instead of timeout because timeout needs an interactive console.
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:%PORT%/index.html"
exit /b 0

:end
echo.
echo   Server stopped.
pause
