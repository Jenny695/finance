@echo off
chcp 65001 >nul
cd /d "%~dp0"
node -e "const v=process.versions.node.split('.').map(Number);if(v[0]<22||(v[0]===22&&v[1]<12)){console.error('请先安装 Node.js 24 LTS，再重新打开此文件。');process.exit(1)}"
if errorlevel 1 goto failed
if not exist "node_modules\read-excel-file" (
  call npm ci
  if errorlevel 1 goto failed
)
node scripts/prepare-local-catalogs.js
if errorlevel 1 goto failed
if exist ".local\imports\manifest.json" (
  node scripts/import-catalog-bundle.js --if-needed
  if errorlevel 1 goto failed
)
call npm run dev -- --open "/#/analysis"
if errorlevel 1 goto failed
exit /b 0
:failed
echo 启动未完成，请将上方错误截图发来。请勿关闭此窗口后再截图。
pause
exit /b 1
