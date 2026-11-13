# فتح نظام العهد من الهاتف عبر الإنترنت باستخدام Cloudflare Tunnel (مجاني، بدون فتح منافذ على الراوتر).
#
# الاستخدام:
#   تجربة سريعة بدون حساب ولا دومين (رابط عشوائي يتغير كل تشغيل):
#     powershell -ExecutionPolicy Bypass -File .\scripts\cloudflare-tunnel.ps1
#
#   تشغيل دائم كخدمة ويندوز برابط ثابت (يحتاج Tunnel Token من لوحة Cloudflare، ويشغّل كمسؤول):
#     powershell -ExecutionPolicy Bypass -File .\scripts\cloudflare-tunnel.ps1 -Mode Install -Token "eyJ..."
#
#   إزالة الخدمة:
#     powershell -ExecutionPolicy Bypass -File .\scripts\cloudflare-tunnel.ps1 -Mode Uninstall

param(
  [ValidateSet("Quick", "Install", "Uninstall")]
  [string]$Mode = "Quick",
  [int]$Port = 0,
  [string]$Token = "",
  [switch]$AllowWithoutPassword
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Find-Cloudflared {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Ensure-Cloudflared {
  $path = Find-Cloudflared
  if ($path) { return $path }
  Write-Host "cloudflared غير مثبت. جاري التثبيت عبر winget..." -ForegroundColor Yellow
  & winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  $path = Find-Cloudflared
  if (-not $path) {
    throw "تعذر العثور على cloudflared بعد التثبيت. أغلق PowerShell وافتحه من جديد ثم أعد تشغيل السكربت."
  }
  return $path
}

function Test-PasswordConfigured {
  if ($env:OHDA_PASSWORD) { return $true }
  # برنامج ويندوز (Electron) يولّد الرمز في ohda-config.json
  $desktopConfig = Join-Path $env:APPDATA "OhdaManager\ohda-config.json"
  if (Test-Path $desktopConfig) {
    try {
      $config = Get-Content $desktopConfig -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($config.password) { return $true }
    } catch { }
  }
  $envFile = Join-Path $projectRoot ".env"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*OHDA_PASSWORD\s*=\s*"?([^"\s]+)' } | Select-Object -First 1
    if ($line) { return $true }
  }
  return $false
}

function Find-AppPort {
  if ($Port -gt 0) { return $Port }
  foreach ($candidate in 3000..3010) {
    $listening = Get-NetTCPConnection -State Listen -LocalPort $candidate -ErrorAction SilentlyContinue
    if ($listening) { return $candidate }
  }
  throw "نظام العهد غير شغال. شغّل البرنامج أولاً (أو start-ohda.cmd) ثم أعد تشغيل هذا السكربت."
}

$cloudflared = Ensure-Cloudflared

switch ($Mode) {
  "Uninstall" {
    & $cloudflared service uninstall
    Write-Host "تمت إزالة خدمة Cloudflare Tunnel." -ForegroundColor Green
  }

  "Install" {
    if (-not $Token) { throw "أضف -Token مع رمز النفق من لوحة Cloudflare (Zero Trust > Networks > Tunnels)." }
    if (-not (Test-PasswordConfigured) -and -not $AllowWithoutPassword) {
      throw "لا يوجد رمز دخول للنظام (OHDA_PASSWORD). لا تنشر النظام على الإنترنت بدونه."
    }
    & $cloudflared service install $Token
    Write-Host "تم تثبيت النفق كخدمة ويندوز، ويعمل تلقائياً مع تشغيل الكمبيوتر." -ForegroundColor Green
    Write-Host "تأكد أن Public Hostname في لوحة Cloudflare يشير إلى http://localhost:3000"
  }

  "Quick" {
    if (-not (Test-PasswordConfigured) -and -not $AllowWithoutPassword) {
      throw "لا يوجد رمز دخول للنظام (OHDA_PASSWORD). الرابط سيكون عاماً على الإنترنت، فلا تشغّله بدون رمز."
    }
    $appPort = Find-AppPort
    Write-Host ""
    Write-Host "جاري فتح نفق مؤقت إلى http://localhost:$appPort ..." -ForegroundColor Cyan
    Write-Host "انتظر ظهور رابط ينتهي بـ trycloudflare.com وافتحه من الهاتف." -ForegroundColor Cyan
    Write-Host "الرابط يتغير في كل تشغيل. اترك هذه النافذة مفتوحة، وللإيقاف اضغط Ctrl+C." -ForegroundColor Cyan
    Write-Host ""
    & $cloudflared tunnel --no-autoupdate --url "http://localhost:$appPort"
  }
}
