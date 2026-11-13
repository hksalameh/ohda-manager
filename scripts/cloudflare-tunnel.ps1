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
    $logFile = Join-Path $env:TEMP "ohda-cloudflared.log"
    Remove-Item $logFile -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "جاري فتح نفق مؤقت إلى http://localhost:$appPort ..." -ForegroundColor Cyan
    $process = Start-Process -FilePath $cloudflared `
      -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://localhost:$appPort") `
      -RedirectStandardError $logFile -NoNewWindow -PassThru

    try {
      $tunnelUrl = $null
      for ($attempt = 0; $attempt -lt 60 -and -not $process.HasExited; $attempt++) {
        Start-Sleep -Seconds 1
        if (Test-Path $logFile) {
          $match = Select-String -Path $logFile -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($match) { $tunnelUrl = $match.Matches[0].Value; break }
        }
      }
      if (-not $tunnelUrl) {
        if (Test-Path $logFile) { Get-Content $logFile -Tail 20 }
        throw "تعذر فتح النفق. تأكد من اتصال الإنترنت وأعد المحاولة."
      }

      Write-Host ""
      Write-Host "الرابط المؤقت: $tunnelUrl" -ForegroundColor Green

      # تحديث الرابط الثابت على workers.dev إن كان مُعداً (انظر cloudflare/redirect-worker).
      $redirectConfig = Join-Path $env:APPDATA "OhdaManager\ohda-tunnel.json"
      if (Test-Path $redirectConfig) {
        try {
          $config = Get-Content $redirectConfig -Raw -Encoding UTF8 | ConvertFrom-Json
          $body = @{ target = $tunnelUrl } | ConvertTo-Json -Compress
          Invoke-RestMethod -Method Post -Uri ($config.workerUrl.TrimEnd("/") + "/__set") `
            -Headers @{ Authorization = "Bearer $($config.secret)" } `
            -ContentType "application/json" -Body $body | Out-Null
          Write-Host "الرابط الثابت للهاتف: $($config.workerUrl)" -ForegroundColor Green
        } catch {
          Write-Host "تعذر تحديث الرابط الثابت: $($_.Exception.Message)" -ForegroundColor Yellow
        }
      }

      Write-Host ""
      Write-Host "اترك هذه النافذة مفتوحة. للإيقاف اضغط Ctrl+C أو أغلق النافذة." -ForegroundColor Cyan
      Wait-Process -Id $process.Id
    }
    finally {
      if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
  }
}
