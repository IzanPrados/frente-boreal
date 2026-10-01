@echo off
setlocal
cd /d "%~dp0"
set "FB_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%FB_NODE%" set "FB_NODE=node"
echo Frente Boreal: abre http://127.0.0.1:8787 en el navegador.
echo Mantiene el acceso limitado a este ordenador. Ctrl+C para detener.
"%FB_NODE%" server\index.mjs
pause
