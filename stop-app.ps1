# Stop the servers started by start-app.ps1 (kills whatever listens on the two ports).
$ErrorActionPreference = "Continue"
foreach ($port in 8000, 5173) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $conns | Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Write-Host "[OK] Stopped server on port $port"
    } else {
        Write-Host "[--] Nothing running on port $port"
    }
}
