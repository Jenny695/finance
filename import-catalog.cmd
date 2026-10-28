@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules\vite" (
  echo 请先在本文件夹运行 npm ci 安装项目依赖。
  pause
  exit /b 1
)
node scripts/import-catalog-bundle.js
if errorlevel 1 (
  echo 导入失败。请保留上方错误信息。
  pause
  exit /b 1
)
echo 完成后可运行 npm run dev 打开网页。
pause
