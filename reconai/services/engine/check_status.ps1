# Check system memory and running processes
$os = Get-CimInstance Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
Write-Host "RAM: ${freeGB}GB free / ${totalGB}GB total"

Write-Host ""
Write-Host "Top processes by memory:"
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 | ForEach-Object {
    $mb = [math]::Round($_.WorkingSet64/1MB, 0)
    Write-Host "  $($_.Name) PID=$($_.Id) MEM=${mb}MB"
}

Write-Host ""
Write-Host "Python processes:"
Get-Process python -ErrorAction SilentlyContinue | ForEach-Object {
    $mb = [math]::Round($_.WorkingSet64/1MB, 0)
    Write-Host "  python PID=$($_.Id) MEM=${mb}MB CPU=$($_.CPU)s"
}
if (-not (Get-Process python -ErrorAction SilentlyContinue)) {
    Write-Host "  (none)"
}
