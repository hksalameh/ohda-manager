param(
  [switch]$ImportRamtha,
  [string]$ExcelPath = "private-data\عهدة الرمثا 2025.xlsx"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "=== إعداد نظام إدارة العهد على ويندوز ===" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js غير مثبت. ثبّت Node.js 22 LTS ثم شغّل هذا الملف مرة أخرى."
}

$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
  throw "إصدار Node.js قديم. يلزم Node.js 20.9 أو أحدث، ويوصى بالإصدار 22 LTS."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "تم إنشاء ملف الإعدادات .env" -ForegroundColor Green
}

Write-Host "تثبيت الحزم..." -ForegroundColor Yellow
& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "فشل npm install" }

Write-Host "تجهيز Prisma وقاعدة SQLite..." -ForegroundColor Yellow
& npm run db:generate
if ($LASTEXITCODE -ne 0) { throw "فشل prisma generate" }
& npm run db:push
if ($LASTEXITCODE -ne 0) { throw "فشل إنشاء قاعدة البيانات" }

if ($ImportRamtha) {
  if (-not (Test-Path $ExcelPath)) {
    throw "ملف Excel غير موجود: $ExcelPath"
  }
  Write-Host "استيراد جرد الرمثا بتاريخ 31/12/2025..." -ForegroundColor Yellow
  & npm run import:ramtha -- $ExcelPath --date=2025-12-31
  if ($LASTEXITCODE -ne 0) { throw "فشل استيراد ملف الرمثا" }
}

Write-Host "بناء نسخة التشغيل..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) { throw "فشل بناء التطبيق" }

Write-Host "" 
Write-Host "تم الإعداد بنجاح." -ForegroundColor Green
Write-Host "للتشغيل على الكمبيوتر والهاتف استخدم: start-ohda.cmd" -ForegroundColor Cyan
