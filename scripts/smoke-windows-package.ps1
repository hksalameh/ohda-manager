# Run against an isolated copy of the blank TEMPLATE database only.
# This script NEVER reads/writes any data in the current user's OhdaManager directory.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$unpacked = Join-Path $root "dist-desktop\win-unpacked"
$serverRoot = Join-Path $unpacked "resources\server"
$serverJs = Join-Path $serverRoot "server.js"
$serverModules = Join-Path $serverRoot "server_modules"
$templateDb = Join-Path $unpacked "resources\app\runtime\ohda-template.db"
$qaMarker = Join-Path $unpacked "resources\app\QA_BUILD"

foreach ($required in @($serverJs, $serverModules, $templateDb, $qaMarker)) {
  if (-not (Test-Path $required)) { throw "Missing packaged runtime asset: $required" }
}
$isolated = Join-Path $env:RUNNER_TEMP "ohda-desktop-qa-$PID"
New-Item -ItemType Directory -Force $isolated | Out-Null
$dbPath = Join-Path $isolated "ohda-qa.db"
Copy-Item -LiteralPath $templateDb -Destination $dbPath -Force
$port = 39000 + ($PID % 700)
$base = "http://127.0.0.1:$port"

$env:DATABASE_URL = "file:$($dbPath.Replace('\','/'))"
$env:DEFAULT_CENTER_CODE = "RAMTHA"
$env:NODE_ENV = "production"
$env:PORT = "$port"
$env:HOSTNAME = "127.0.0.1"
$env:NODE_PATH = $serverModules
$env:OHDA_PASSWORD = "" # isolated CI fixture: route smoke testing without login
$logOut = Join-Path $isolated "stdout.log"
$logErr = Join-Path $isolated "stderr.log"
$server = $null

try {
  $server = Start-Process -FilePath "node.exe" -ArgumentList @($serverJs) -WorkingDirectory $serverRoot -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
  $live = $false
  for ($i = 0; $i -lt 100; $i++) {
    Start-Sleep -Milliseconds 350
    if ($server.HasExited) {
      throw "Packaged Next.js server exited early with code $($server.ExitCode). $((Get-Content $logErr -Raw -ErrorAction SilentlyContinue))"
    }
    try {
      $response = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200) { $live = $true; break }
    } catch { }
  }
  if (-not $live) { throw "Packaged server did not respond. $((Get-Content $logErr -Raw -ErrorAction SilentlyContinue))" }
  Write-Host "PASS: Packaged standalone Windows server starts from the installer runtime."

  foreach ($route in @("/locations", "/items", "/items/new", "/stocktake", "/locations/unlocated", "/custody/new", "/documents/transfer")) {
    $response = Invoke-WebRequest -Uri "$base$route" -UseBasicParsing -TimeoutSec 20
    if ($response.StatusCode -ne 200 -or $response.Content -match "Internal Server Error|Application error:") {
      throw "Runtime smoke failed for $route (status $($response.StatusCode))"
    }
    Write-Host "PASS: $route HTTP $($response.StatusCode)"
  }
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  if (Test-Path $logErr) { Get-Content $logErr -Tail 25 | ForEach-Object { Write-Host $_ } }
  Remove-Item $isolated -Recurse -Force -ErrorAction SilentlyContinue
}
