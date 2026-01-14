# Cross-platform build script for CAM Engine
# Builds binaries for Windows, Linux, and macOS

$ErrorActionPreference = "Stop"
$GO = "C:\Program Files\Go\bin\go.exe"
$VERSION = "1.0.0"
$SCRIPT_DIR = $PSScriptRoot
$OUT_DIR = Join-Path $SCRIPT_DIR "dist"

# Change to script directory (where go.mod is)
Push-Location $SCRIPT_DIR

Write-Host "Building CAM Engine v$VERSION..." -ForegroundColor Cyan
Write-Host "Working dir: $SCRIPT_DIR" -ForegroundColor Gray

# Create output directory
if (!(Test-Path $OUT_DIR)) {
    New-Item -ItemType Directory -Path $OUT_DIR | Out-Null
}

# Build configurations
$builds = @(
    @{GOOS="windows"; GOARCH="amd64"; EXT=".exe"; NAME="cam-engine-windows-amd64.exe"},
    @{GOOS="linux"; GOARCH="amd64"; EXT=""; NAME="cam-engine-linux-amd64"},
    @{GOOS="linux"; GOARCH="arm64"; EXT=""; NAME="cam-engine-linux-arm64"},
    @{GOOS="darwin"; GOARCH="amd64"; EXT=""; NAME="cam-engine-darwin-amd64"},
    @{GOOS="darwin"; GOARCH="arm64"; EXT=""; NAME="cam-engine-darwin-arm64"}
)

foreach ($build in $builds) {
    $env:GOOS = $build.GOOS
    $env:GOARCH = $build.GOARCH
    $env:CGO_ENABLED = "0"

    $output = Join-Path $OUT_DIR $build.NAME
    Write-Host "  Building $($build.NAME)..." -ForegroundColor Yellow

    & $GO build -ldflags="-s -w" -o $output .

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAILED!" -ForegroundColor Red
        exit 1
    }

    $size = [math]::Round((Get-Item $output).Length / 1MB, 2)
    Write-Host "  OK ($size MB)" -ForegroundColor Green
}

# Clean up environment
Remove-Item Env:GOOS -ErrorAction SilentlyContinue
Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue

# Restore original directory
Pop-Location

Write-Host "`nAll builds completed!" -ForegroundColor Cyan
Write-Host "Binaries in: $OUT_DIR" -ForegroundColor Gray
