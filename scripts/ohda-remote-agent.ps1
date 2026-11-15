# Maintains the free Cloudflare Quick Tunnel for the Windows Ohda QA app.
# The only published data is the current tunnel URL; the SQLite DB stays local.
# Requires %APPDATA%\OhdaManager-QA\ohda-tunnel.json with workerUrl and secret.
param([switch]$Once)

$ErrorActionPreference = "Stop"
$appDir = Join-Path $env:APPDATA "OhdaManager-QA"
$configFile = Join-Path $appDir "ohda-tunnel.json"
$logs = Join-Path $appDir "logs"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$agentLog = Join-Path $logs "remote-agent.log"

function Note([string]$message) {
  Add-Content -LiteralPath $agentLog -Encoding UTF8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
}

function Get-OhdaPort {
  foreach ($port in 3000..3010) {
    try {
      $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/login")
      $req.Method = "GET"
      $req.AllowAutoRedirect = $false
      $req.Timeout = 1250
      $response = $req.GetResponse()
      $response.Close()
      return $port
    } catch [System.Net.WebException] {
      if ($_.Exception.Response) {
        $_.Exception.Response.Close()
        return $port
      }
    } catch {}
  }
  return 0
}

if (-not (Test-Path $cloudflared)) { Note "Cloudflared missing"; exit 2 }
$mutex = [System.Threading.Mutex]::new($false, "Local\OhdaQA-RemoteTunnel")
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
  while ($true) {
    if (-not (Test-Path $configFile)) { Note "Worker config missing"; break }
    $port = Get-OhdaPort
    if (-not $port) {
      if ($Once) { Note "Windows application unavailable"; break }
      Start-Sleep -Seconds 15
      continue
    }

    $config = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $config.workerUrl -or -not $config.secret) { Note "Invalid worker config"; break }
    $errLog = Join-Path $logs ("cloudflared-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
    $p = $null
    try {
      $p = Start-Process -FilePath $cloudflared -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$port") -WindowStyle Hidden -PassThru -RedirectStandardError $errLog
      Note "Tunnel process $($p.Id) started for local app port $port"
      $url = $null
      for ($attempt=0; $attempt -lt 70; $attempt++) {
        Start-Sleep -Milliseconds 650
        if ($p.HasExited) { break }
        if (Test-Path $errLog) {
          $match = Select-String -Path $errLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
          if ($match) { $url = $match.Matches[0].Value; break }
        }
      }
      if (-not $url) { Note "Failed to obtain tunnel URL" }
      else {
        $body = @{ target=$url } | ConvertTo-Json -Compress
        $reply = Invoke-WebRequest -Uri ($config.workerUrl.TrimEnd("/") + "/__set") -Method Post -ContentType "application/json" -Headers @{Authorization=("Bearer " + $config.secret)} -Body $body -TimeoutSec 20 -UseBasicParsing
        if ($reply.StatusCode -ne 200) { throw "Worker update status $($reply.StatusCode)" }
        Note "Worker target updated successfully"
        if ($Once) { break }
        while (-not $p.HasExited) { Start-Sleep -Seconds 20 }
        Note "Tunnel process exited"
      }
    } catch {
      Note ("Tunnel/update failure: " + $_.Exception.Message)
    }
    if ($Once) { break }
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 10
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
