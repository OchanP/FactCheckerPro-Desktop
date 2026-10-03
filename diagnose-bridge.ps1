# FactChecker Pro — Desktop Bridge Diagnostic
# Run this in PowerShell while the desktop app is open
# Right-click PowerShell → Run as current user (NOT administrator)

Write-Host "`n=== FactChecker Pro Bridge Diagnostic ===" -ForegroundColor Cyan

# 1. Check bridge.json
$bridgePath = "$env:APPDATA\factchecker-pro-desktop\bridge.json"
Write-Host "`n[1] bridge.json at: $bridgePath"
if (Test-Path $bridgePath) {
    $bridge = Get-Content $bridgePath | ConvertFrom-Json
    Write-Host "    FOUND — port $($bridge.port), secret length $($bridge.secret.Length)" -ForegroundColor Green
} else {
    Write-Host "    MISSING — desktop app is not running or did not start correctly" -ForegroundColor Red
}

# 2. Check registry key for Chrome
$regKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.factcheckerpro.desktop"
Write-Host "`n[2] Chrome registry key: $regKey"
if (Test-Path $regKey) {
    $manifestPath = (Get-ItemProperty $regKey).'(default)'
    Write-Host "    FOUND — points to: $manifestPath" -ForegroundColor Green

    # 3. Check manifest file
    Write-Host "`n[3] Native host manifest: $manifestPath"
    if (Test-Path $manifestPath) {
        $manifest = Get-Content $manifestPath | ConvertFrom-Json
        Write-Host "    FOUND — exe path: $($manifest.path)" -ForegroundColor Green
        Write-Host "    Allowed origins: $($manifest.allowed_origins -join ', ')"

        # 4. Check exe
        Write-Host "`n[4] Native host exe: $($manifest.path)"
        if (Test-Path $manifest.path) {
            $size = (Get-Item $manifest.path).Length / 1MB
            Write-Host "    FOUND — $([math]::Round($size,1)) MB" -ForegroundColor Green
        } else {
            Write-Host "    MISSING — exe not found at this path. Reinstall the desktop app." -ForegroundColor Red
        }
    } else {
        Write-Host "    MISSING — manifest file not found. Open the desktop app once to regenerate it." -ForegroundColor Red
    }
} else {
    Write-Host "    MISSING — registry key not set. Open the desktop app once to register it." -ForegroundColor Red
}

# 5. Check Edge registry key too
$edgeKey = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.factcheckerpro.desktop"
Write-Host "`n[5] Edge registry key:"
if (Test-Path $edgeKey) {
    Write-Host "    FOUND" -ForegroundColor Green
} else {
    Write-Host "    MISSING (only matters if using Edge)" -ForegroundColor Yellow
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host "Share the output above so we can pinpoint the issue.`n"
