# Start the AI Research Intelligence Center (backend + frontend) as
# independent Windows processes. Run start-app.bat to launch.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

function Test-Port([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return [bool]$c
}

if (-not (Test-Port 8000)) {
    $env:PYTHONPATH = "$backend\pyenv;$backend\vendor;$backend"
    Start-Process -FilePath "python" `
        -ArgumentList "$backend\run.py" `
        -WorkingDirectory $backend `
        -WindowStyle Minimized
    Write-Host "[OK] Backend started -> http://127.0.0.1:8000"
} else {
    Write-Host "[OK] Backend already running on :8000"
}

if (-not (Test-Port 5173)) {
    $env:npm_config_cache = "$root\.npm-cache"
    Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory $frontend `
        -WindowStyle Minimized
    Write-Host "[OK] Frontend dev server started -> http://localhost:5173"
} else {
    Write-Host "[OK] Frontend dev server already running on :5173"
}

Start-Sleep -Seconds 3
Start-Process "http://127.0.0.1:8000/"
Write-Host "Opening http://127.0.0.1:8000/ in your browser..."
