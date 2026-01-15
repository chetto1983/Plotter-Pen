# Go Backend Validation Script (PowerShell)
# Run this after any Go code changes

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "========================================"
Write-Host "  Go Backend Validation"
Write-Host "========================================"
Write-Host ""

$Errors = 0
$Warnings = 0

function Report {
    param($Status, $Message)
    if ($Status -eq "OK") {
        Write-Host "[OK] $Message" -ForegroundColor Green
    } elseif ($Status -eq "WARN") {
        Write-Host "[WARN] $Message" -ForegroundColor Yellow
        $script:Warnings++
    } else {
        Write-Host "[FAIL] $Message" -ForegroundColor Red
        $script:Errors++
    }
}

# 1. Check Go version
Write-Host "1. Checking Go version..."
try {
    $GoVersion = (go version) -replace ".*?(go\d+\.\d+).*", '$1'
    if ($GoVersion -match "go1\.(2[2-9]|[3-9]\d)") {
        Report "OK" "Go version: $GoVersion"
    } else {
        Report "FAIL" "Go version $GoVersion < 1.22 required"
    }
} catch {
    Report "FAIL" "Go not found in PATH"
}

# 2. Check go.mod exists
Write-Host ""
Write-Host "2. Checking go.mod..."
if (Test-Path "go.mod") {
    Report "OK" "go.mod exists"
} else {
    Report "FAIL" "go.mod not found"
}

# 3. Run go mod tidy
Write-Host ""
Write-Host "3. Running go mod tidy..."
$ModTidy = go mod tidy 2>&1
if ($LASTEXITCODE -eq 0) {
    Report "OK" "Dependencies resolved"
} else {
    Report "FAIL" "go mod tidy failed"
    Write-Host $ModTidy
}

# 4. Run go vet
Write-Host ""
Write-Host "4. Running go vet..."
$VetOutput = go vet ./... 2>&1
if ([string]::IsNullOrWhiteSpace($VetOutput)) {
    Report "OK" "No vet issues"
} else {
    Report "WARN" "Vet issues found:"
    Write-Host $VetOutput
}

# 5. Build check
Write-Host ""
Write-Host "5. Building binary..."
$BuildOutput = go build -o plotter-server.exe cmd/server/main.go 2>&1
if ($LASTEXITCODE -eq 0) {
    Report "OK" "Build successful"
    $Size = (Get-Item plotter-server.exe).Length / 1MB
    Write-Host ("    Binary size: {0:N2} MB" -f $Size)
} else {
    Report "FAIL" "Build failed"
    Write-Host $BuildOutput
}

# 6. Run tests
Write-Host ""
Write-Host "6. Running tests..."
$TestOutput = go test ./... 2>&1
if ($TestOutput -match "FAIL") {
    Report "FAIL" "Tests failed"
    Write-Host $TestOutput
} elseif ($TestOutput -match "no test files") {
    Report "WARN" "No test files found"
} else {
    Report "OK" "Tests passed"
}

# 7. Check handler coverage
Write-Host ""
Write-Host "7. Checking handler coverage..."
$Handlers = (Get-ChildItem "internal/handler/*.go" -ErrorAction SilentlyContinue).Count
Report "OK" "Found $Handlers handler files"

# 8. Check required directories
Write-Host ""
Write-Host "8. Checking directory structure..."
$RequiredDirs = @("cmd/server", "internal/handler", "internal/persistence", "internal/service", "internal/machine")
foreach ($dir in $RequiredDirs) {
    if (Test-Path $dir) {
        Report "OK" "$dir exists"
    } else {
        Report "WARN" "$dir missing"
    }
}

# 9. Check file line counts (industrial grade: max 500 lines)
Write-Host ""
Write-Host "9. Checking file sizes (max 500 lines)..."
$GoFiles = Get-ChildItem -Recurse -Include "*.go" | Where-Object { $_.FullName -notmatch "vendor" }
foreach ($file in $GoFiles) {
    $lines = (Get-Content $file.FullName).Count
    if ($lines -gt 500) {
        Report "WARN" "$($file.Name): $lines lines (exceeds 500)"
    }
}

# Summary
Write-Host ""
Write-Host "========================================"
Write-Host "  Summary"
Write-Host "========================================"
if ($Errors -eq 0 -and $Warnings -eq 0) {
    Write-Host "All checks passed!" -ForegroundColor Green
    exit 0
} elseif ($Errors -eq 0) {
    Write-Host "Passed with $Warnings warning(s)" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "Failed with $Errors error(s) and $Warnings warning(s)" -ForegroundColor Red
    exit 1
}
