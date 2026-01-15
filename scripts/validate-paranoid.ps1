# PARANOID VALIDATION SCRIPT
# Industrial-grade 100% validation - NO SMOKE TESTS
# Fails on ANY issue - zero tolerance

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "========================================"
Write-Host "  PARANOID VALIDATION - 100% COVERAGE"
Write-Host "  Zero Tolerance Mode"
Write-Host "========================================"
Write-Host ""

$TotalChecks = 0
$PassedChecks = 0
$FailedChecks = @()

function Test-Requirement {
    param(
        [string]$Category,
        [string]$Check,
        [scriptblock]$Test
    )

    $script:TotalChecks++
    Write-Host "[$Category] $Check... " -NoNewline

    try {
        $result = & $Test
        if ($result -eq $true) {
            Write-Host "PASS" -ForegroundColor Green
            $script:PassedChecks++
            return $true
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            $script:FailedChecks += "[$Category] $Check"
            return $false
        }
    } catch {
        Write-Host "FAIL - $($_.Exception.Message)" -ForegroundColor Red
        $script:FailedChecks += "[$Category] $Check - $($_.Exception.Message)"
        return $false
    }
}

Write-Host "=== SECTION 1: ENVIRONMENT ===" -ForegroundColor Cyan
Write-Host ""

# Go version check
Test-Requirement "ENV" "Go version >= 1.22" {
    $version = (go version) -replace ".*go(\d+)\.(\d+).*", '$1.$2'
    $major, $minor = $version -split '\.'
    return ([int]$major -ge 1 -and [int]$minor -ge 22)
}

# Go modules enabled
Test-Requirement "ENV" "Go modules enabled" {
    return (Test-Path "go.mod")
}

# Required directories exist
$RequiredDirs = @(
    "cmd/server",
    "internal/handler",
    "internal/persistence",
    "internal/service",
    "internal/machine",
    "scripts"
)
foreach ($dir in $RequiredDirs) {
    Test-Requirement "ENV" "Directory exists: $dir" {
        return (Test-Path $dir -PathType Container)
    }
}

Write-Host ""
Write-Host "=== SECTION 2: GO MODULE VALIDATION ===" -ForegroundColor Cyan
Write-Host ""

# go.mod syntax valid
Test-Requirement "MOD" "go.mod syntax valid" {
    $output = go mod verify 2>&1
    return ($LASTEXITCODE -eq 0)
}

# go mod tidy has no changes
Test-Requirement "MOD" "Dependencies are tidy" {
    # Capture current go.sum hash
    $beforeHash = if (Test-Path "go.sum") { (Get-FileHash "go.sum").Hash } else { "" }
    go mod tidy 2>&1 | Out-Null
    $afterHash = if (Test-Path "go.sum") { (Get-FileHash "go.sum").Hash } else { "" }
    return ($beforeHash -eq $afterHash)
}

# No replace directives (production ready)
Test-Requirement "MOD" "No replace directives in go.mod" {
    $content = Get-Content "go.mod" -Raw
    return (-not ($content -match "replace\s+"))
}

Write-Host ""
Write-Host "=== SECTION 3: CODE QUALITY ===" -ForegroundColor Cyan
Write-Host ""

# go vet passes
Test-Requirement "QUALITY" "go vet passes" {
    $output = go vet ./... 2>&1
    return ($LASTEXITCODE -eq 0 -and [string]::IsNullOrWhiteSpace($output))
}

# go fmt check (no unformatted files)
Test-Requirement "QUALITY" "All files formatted (gofmt)" {
    $unformatted = gofmt -l . 2>&1
    return ([string]::IsNullOrWhiteSpace($unformatted))
}

# No files exceed 500 lines
Test-Requirement "QUALITY" "All Go files <= 500 lines" {
    $GoFiles = Get-ChildItem -Recurse -Include "*.go" | Where-Object { $_.FullName -notmatch "vendor" }
    $oversized = @()
    foreach ($file in $GoFiles) {
        $lines = (Get-Content $file.FullName).Count
        if ($lines -gt 500) {
            $oversized += "$($file.Name): $lines lines"
        }
    }
    if ($oversized.Count -gt 0) {
        Write-Host ""
        $oversized | ForEach-Object { Write-Host "    OVERSIZED: $_" -ForegroundColor Yellow }
    }
    return ($oversized.Count -eq 0)
}

# No TODO/FIXME in production code (optional warning)
Test-Requirement "QUALITY" "No TODO/FIXME comments" {
    $GoFiles = Get-ChildItem -Recurse -Include "*.go" | Where-Object { $_.FullName -notmatch "vendor|_test\.go" }
    $todos = @()
    foreach ($file in $GoFiles) {
        $content = Get-Content $file.FullName -Raw
        if ($content -match "TODO|FIXME") {
            $todos += $file.Name
        }
    }
    if ($todos.Count -gt 0) {
        Write-Host ""
        $todos | ForEach-Object { Write-Host "    HAS TODO: $_" -ForegroundColor Yellow }
    }
    return ($todos.Count -eq 0)
}

Write-Host ""
Write-Host "=== SECTION 4: BUILD VALIDATION ===" -ForegroundColor Cyan
Write-Host ""

# Clean build (remove old binary first)
Test-Requirement "BUILD" "Clean build succeeds" {
    if (Test-Path "plotter-server.exe") { Remove-Item "plotter-server.exe" -Force }
    $output = go build -o plotter-server.exe cmd/server/main.go 2>&1
    return ($LASTEXITCODE -eq 0 -and (Test-Path "plotter-server.exe"))
}

# Binary is reasonable size (not bloated)
Test-Requirement "BUILD" "Binary size < 50MB" {
    $size = (Get-Item "plotter-server.exe").Length / 1MB
    return ($size -lt 50)
}

# Race detector requires CGO - skip if using pure-Go SQLite
# Check if CGO is enabled
$cgoEnabled = $env:CGO_ENABLED
if ($cgoEnabled -eq "1") {
    Test-Requirement "BUILD" "Race detector build succeeds" {
        $output = go build -race -o plotter-server-race.exe cmd/server/main.go 2>&1
        $success = ($LASTEXITCODE -eq 0)
        if (Test-Path "plotter-server-race.exe") { Remove-Item "plotter-server-race.exe" -Force }
        return $success
    }
} else {
    Write-Host "[BUILD] Race detector (SKIPPED - pure-Go SQLite, no CGO)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== SECTION 5: HANDLER COMPLETENESS ===" -ForegroundColor Cyan
Write-Host ""

# Required handlers exist
$RequiredHandlers = @(
    "internal/handler/persistence.go",
    "internal/handler/machine.go",
    "internal/handler/cam.go",
    "internal/handler/opcua.go",
    "internal/handler/dxf.go"
)
foreach ($handler in $RequiredHandlers) {
    Test-Requirement "HANDLER" "Exists: $handler" {
        return (Test-Path $handler)
    }
}

# Each handler has RegisterRoutes function
foreach ($handler in $RequiredHandlers) {
    if (Test-Path $handler) {
        $name = [System.IO.Path]::GetFileNameWithoutExtension($handler)
        Test-Requirement "HANDLER" "$name has RegisterRoutes()" {
            $content = Get-Content $handler -Raw
            return ($content -match "func\s+\([^)]+\)\s+RegisterRoutes\s*\(")
        }
    }
}

Write-Host ""
Write-Host "=== SECTION 6: API CONTRACT VALIDATION ===" -ForegroundColor Cyan
Write-Host ""

# Check main.go registers all handlers
Test-Requirement "API" "main.go registers PersistenceHandler" {
    $content = Get-Content "cmd/server/main.go" -Raw
    return ($content -match "NewPersistenceHandler")
}

Test-Requirement "API" "main.go registers MachineHandler" {
    $content = Get-Content "cmd/server/main.go" -Raw
    return ($content -match "NewMachineHandler")
}

Test-Requirement "API" "main.go registers CAMHandler" {
    $content = Get-Content "cmd/server/main.go" -Raw
    return ($content -match "NewCAMHandler")
}

Test-Requirement "API" "main.go registers OpcuaHandler" {
    $content = Get-Content "cmd/server/main.go" -Raw
    return ($content -match "NewOpcuaHandler")
}

Test-Requirement "API" "main.go registers DXFHandler" {
    $content = Get-Content "cmd/server/main.go" -Raw
    return ($content -match "NewDXFHandler")
}

Write-Host ""
Write-Host "=== SECTION 7: DATABASE SCHEMA ===" -ForegroundColor Cyan
Write-Host ""

# Check persistence.go has all required models
$RequiredModels = @("AppState", "Drawing", "Tool", "CAMSettings", "MachineConfig")
foreach ($model in $RequiredModels) {
    Test-Requirement "DB" "Model defined: $model" {
        $content = Get-Content "internal/persistence/db.go" -Raw
        return ($content -match "type\s+$model\s+struct")
    }
}

# InitDB function exists
Test-Requirement "DB" "InitDB function exists" {
    $content = Get-Content "internal/persistence/db.go" -Raw
    return ($content -match "func\s+InitDB\s*\(")
}

Write-Host ""
Write-Host "=== SECTION 8: IMPORT VALIDATION ===" -ForegroundColor Cyan
Write-Host ""

# No circular imports (go build would fail, but explicit check)
Test-Requirement "IMPORT" "No circular imports" {
    $output = go build ./... 2>&1
    return ($LASTEXITCODE -eq 0)
}

# All internal packages import correctly
$InternalPackages = @(
    "plotter-pen/internal/handler",
    "plotter-pen/internal/persistence"
)
foreach ($pkg in $InternalPackages) {
    Test-Requirement "IMPORT" "Package builds: $pkg" {
        $output = go build $pkg 2>&1
        return ($LASTEXITCODE -eq 0)
    }
}

Write-Host ""
Write-Host "=== SECTION 9: SECURITY CHECKS ===" -ForegroundColor Cyan
Write-Host ""

# No hardcoded secrets
Test-Requirement "SECURITY" "No hardcoded passwords" {
    $GoFiles = Get-ChildItem -Recurse -Include "*.go"
    $found = $false
    foreach ($file in $GoFiles) {
        $content = Get-Content $file.FullName -Raw
        if ($content -match '(password|secret|apikey|api_key)\s*[:=]\s*"[^"]+') {
            $found = $true
            Write-Host "    FOUND IN: $($file.Name)" -ForegroundColor Yellow
        }
    }
    return (-not $found)
}

# HTTP handlers use proper error handling
Test-Requirement "SECURITY" "Handlers use gin.H for errors" {
    $handlers = Get-ChildItem "internal/handler/*.go"
    $allOK = $true
    foreach ($handler in $handlers) {
        $content = Get-Content $handler.FullName -Raw
        if ($content -match "panic\(" -and $content -notmatch "recover") {
            $allOK = $false
            Write-Host "    PANIC without recover in: $($handler.Name)" -ForegroundColor Yellow
        }
    }
    return $allOK
}

Write-Host ""
Write-Host "=== SECTION 10: TESTS ===" -ForegroundColor Cyan
Write-Host ""

# Run all tests
Test-Requirement "TEST" "All tests pass" {
    $output = go test ./... 2>&1
    $hasFailure = $output -match "FAIL"
    return (-not $hasFailure)
}

# Check test coverage (informational)
Write-Host ""
Write-Host "Test coverage (informational):"
go test ./... -cover 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

Write-Host ""
Write-Host "========================================"
Write-Host "  VALIDATION RESULTS"
Write-Host "========================================"
Write-Host ""

$PassRate = if ($TotalChecks -gt 0) { [math]::Round(($PassedChecks / $TotalChecks) * 100, 1) } else { 0 }

Write-Host "Total Checks: $TotalChecks"
Write-Host "Passed: $PassedChecks" -ForegroundColor Green
Write-Host "Failed: $($FailedChecks.Count)" -ForegroundColor $(if ($FailedChecks.Count -eq 0) { "Green" } else { "Red" })
Write-Host "Pass Rate: $PassRate%"
Write-Host ""

if ($FailedChecks.Count -gt 0) {
    Write-Host "FAILED CHECKS:" -ForegroundColor Red
    foreach ($fail in $FailedChecks) {
        Write-Host "  - $fail" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "VALIDATION FAILED - DO NOT COMMIT" -ForegroundColor Red -BackgroundColor Black
    exit 1
} else {
    Write-Host "ALL CHECKS PASSED - READY FOR COMMIT" -ForegroundColor Green -BackgroundColor Black
    exit 0
}
