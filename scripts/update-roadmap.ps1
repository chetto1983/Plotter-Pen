# Roadmap Status Update Script
# Automatically updates GO_MIGRATION_ROADMAP.md based on code state

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "========================================"
Write-Host "  Roadmap Status Checker"
Write-Host "========================================"
Write-Host ""

# Phase checks
$PhaseStatus = @{}

# Helper function to check files
function Check-PhaseFiles {
    param($PhaseName, $Files)

    Write-Host "Checking $PhaseName..."
    $complete = 0
    $total = $Files.Count

    foreach ($file in $Files) {
        if (Test-Path $file) {
            Write-Host "  [OK] $file" -ForegroundColor Green
            $complete++
        } else {
            Write-Host "  [--] $file" -ForegroundColor Gray
        }
    }

    return @{ Complete = $complete; Total = $total }
}

# Phase 1: Core Infrastructure
$Phase1Files = @(
    "cmd/server/main.go",
    "internal/persistence/db.go",
    "internal/handler/persistence.go"
)
$PhaseStatus["Phase 1"] = Check-PhaseFiles "Phase 1: Core Infrastructure" $Phase1Files

# Phase 2: OPC UA Integration
Write-Host ""
$Phase2Files = @(
    "internal/handler/opcua.go",
    "internal/service/opcua/client.go",
    "internal/service/opcua/config.go"
)
$PhaseStatus["Phase 2"] = Check-PhaseFiles "Phase 2: OPC UA Integration" $Phase2Files

# Phase 3: DXF Import/Export
Write-Host ""
$Phase3Files = @(
    "internal/handler/dxf.go",
    "internal/service/import/dxf.go"
)
$PhaseStatus["Phase 3"] = Check-PhaseFiles "Phase 3: DXF Import/Export" $Phase3Files

# Phase 4: SVG & STL Support
Write-Host ""
$Phase4Files = @(
    "internal/service/import/svg.go",
    "internal/service/import/stl.go"
)
$PhaseStatus["Phase 4"] = Check-PhaseFiles "Phase 4: SVG & STL Support" $Phase4Files

# Phase 5: CAM Integration
Write-Host ""
$Phase5Files = @(
    "internal/handler/cam.go",
    "internal/service/cam/profile.go",
    "internal/service/cam/pocket.go",
    "pkg/geom/types.go",
    "pkg/gcode/generator.go",
    "pkg/plc/generator.go"
)
$PhaseStatus["Phase 5"] = Check-PhaseFiles "Phase 5: CAM Integration" $Phase5Files

# Phase 6: System Utils
Write-Host ""
$Phase6Files = @(
    "internal/system/port.go",
    "internal/system/browser.go",
    "internal/machine/config.go"
)
$PhaseStatus["Phase 6"] = Check-PhaseFiles "Phase 6: System Utils" $Phase6Files

# Build check
Write-Host ""
Write-Host "Checking build status..."
$BuildOK = $false
try {
    $null = go build -o plotter-server.exe cmd/server/main.go 2>&1
    if ($LASTEXITCODE -eq 0) {
        $BuildOK = $true
        Write-Host "  [OK] Build successful" -ForegroundColor Green
    }
} catch {
    Write-Host "  [FAIL] Build failed" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "========================================"
Write-Host "  Migration Progress"
Write-Host "========================================"
Write-Host ""

$TotalComplete = 0
$TotalFiles = 0

$SortedPhases = $PhaseStatus.Keys | Sort-Object
foreach ($phase in $SortedPhases) {
    $complete = $PhaseStatus[$phase].Complete
    $total = $PhaseStatus[$phase].Total
    $TotalComplete += $complete
    $TotalFiles += $total

    $pct = if ($total -gt 0) { [math]::Round(($complete / $total) * 100) } else { 0 }
    $bar = "[" + ("=" * [math]::Floor($pct / 10)) + (" " * (10 - [math]::Floor($pct / 10))) + "]"

    $status = if ($complete -eq $total) { "Complete" } elseif ($complete -gt 0) { "In Progress" } else { "Pending" }
    $color = if ($complete -eq $total) { "Green" } elseif ($complete -gt 0) { "Yellow" } else { "Gray" }

    Write-Host "$phase $bar $pct% ($complete/$total) - $status" -ForegroundColor $color
}

$OverallPct = if ($TotalFiles -gt 0) { [math]::Round(($TotalComplete / $TotalFiles) * 100) } else { 0 }
Write-Host ""
Write-Host "Overall Progress: $OverallPct% ($TotalComplete/$TotalFiles files)" -ForegroundColor Cyan

# Output JSON for automation
$StatusJson = @{
    timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    buildOK = $BuildOK
    phases = @{}
    overall = @{ complete = $TotalComplete; total = $TotalFiles; percent = $OverallPct }
}

foreach ($phase in $SortedPhases) {
    $StatusJson.phases[$phase] = @{
        complete = $PhaseStatus[$phase].Complete
        total = $PhaseStatus[$phase].Total
        percent = if ($PhaseStatus[$phase].Total -gt 0) {
            [math]::Round(($PhaseStatus[$phase].Complete / $PhaseStatus[$phase].Total) * 100)
        } else { 0 }
    }
}

$StatusJson | ConvertTo-Json -Depth 3 | Out-File "scripts/migration-status.json" -Encoding UTF8
Write-Host ""
Write-Host "Status saved to scripts/migration-status.json"
