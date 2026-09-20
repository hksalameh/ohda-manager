@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo       نظام إدارة العهد - مركز الرمثا
echo ========================================
echo.

if not exist ".env" (
  echo ملف .env غير موجود. شغّل scripts\windows-setup.ps1 أولاً.
  pause
  exit /b 1
)

if not exist ".next" (
  echo نسخة التشغيل غير مبنية. جاري البناء...
  call npm run build
  if errorlevel 1 (
    echo فشل بناء التطبيق.
    pause
    exit /b 1
  )
)

for /f "tokens=*" %%i in ('powershell -NoProfile -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown'} ^| Sort-Object InterfaceMetric ^| Select-Object -First 1 -ExpandProperty IPAddress); if($ip){$ip}"') do set LANIP=%%i

echo افتح على هذا الكمبيوتر:
echo http://localhost:3000
if defined LANIP (
  echo.
  echo افتح من الهاتف المتصل بنفس الشبكة:
  echo http://%LANIP%:3000
)
echo.
echo اترك هذه النافذة مفتوحة أثناء استخدام النظام.
echo للإيقاف اضغط Ctrl+C.
echo.

call npm run start:lan
pause
