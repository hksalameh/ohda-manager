@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo إنشاء نسخة احتياطية من قاعدة بيانات نظام العهد...
call npm run backup:db
if errorlevel 1 (
  echo.
  echo فشل إنشاء النسخة الاحتياطية.
  pause
  exit /b 1
)

echo.
echo تم الحفظ داخل private-data\backups
echo هذا المجلد خاص وغير مرفوع إلى GitHub.
pause
