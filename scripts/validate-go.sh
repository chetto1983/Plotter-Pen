#!/bin/bash
# Go Backend Validation Script
# Run this after any Go code changes

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo "  Go Backend Validation"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to report status
report() {
    local status=$1
    local message=$2
    if [ "$status" = "OK" ]; then
        echo -e "${GREEN}[OK]${NC} $message"
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}[WARN]${NC} $message"
        ((WARNINGS++))
    else
        echo -e "${RED}[FAIL]${NC} $message"
        ((ERRORS++))
    fi
}

# 1. Check Go version
echo "1. Checking Go version..."
GO_VERSION=$(go version 2>/dev/null | grep -oP 'go\d+\.\d+' || echo "not found")
if [[ "$GO_VERSION" =~ go1\.(2[2-9]|[3-9][0-9]) ]]; then
    report "OK" "Go version: $GO_VERSION"
else
    report "FAIL" "Go version $GO_VERSION < 1.22 required"
fi

# 2. Check go.mod exists
echo ""
echo "2. Checking go.mod..."
if [ -f "go.mod" ]; then
    report "OK" "go.mod exists"
else
    report "FAIL" "go.mod not found"
fi

# 3. Run go mod tidy
echo ""
echo "3. Running go mod tidy..."
if go mod tidy 2>&1; then
    report "OK" "Dependencies resolved"
else
    report "FAIL" "go mod tidy failed"
fi

# 4. Run go vet
echo ""
echo "4. Running go vet..."
VET_OUTPUT=$(go vet ./... 2>&1 || true)
if [ -z "$VET_OUTPUT" ]; then
    report "OK" "No vet issues"
else
    report "WARN" "Vet issues found:"
    echo "$VET_OUTPUT"
fi

# 5. Run go fmt check
echo ""
echo "5. Checking go fmt..."
FMT_OUTPUT=$(gofmt -l . 2>/dev/null || true)
if [ -z "$FMT_OUTPUT" ]; then
    report "OK" "All files formatted"
else
    report "WARN" "Files need formatting:"
    echo "$FMT_OUTPUT"
fi

# 6. Build check
echo ""
echo "6. Building binary..."
if go build -o plotter-server.exe cmd/server/main.go 2>&1; then
    report "OK" "Build successful"
    SIZE=$(ls -lh plotter-server.exe | awk '{print $5}')
    echo "    Binary size: $SIZE"
else
    report "FAIL" "Build failed"
fi

# 7. Run tests
echo ""
echo "7. Running tests..."
TEST_OUTPUT=$(go test ./... 2>&1 || true)
if echo "$TEST_OUTPUT" | grep -q "FAIL"; then
    report "FAIL" "Tests failed"
    echo "$TEST_OUTPUT"
elif echo "$TEST_OUTPUT" | grep -q "no test files"; then
    report "WARN" "No test files found"
else
    report "OK" "Tests passed"
fi

# 8. Check handler completeness
echo ""
echo "8. Checking handler coverage..."
HANDLERS=$(ls internal/handler/*.go 2>/dev/null | wc -l)
report "OK" "Found $HANDLERS handler files"

# 9. Check required directories
echo ""
echo "9. Checking directory structure..."
REQUIRED_DIRS=("cmd/server" "internal/handler" "internal/persistence" "internal/service" "internal/machine")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        report "OK" "$dir exists"
    else
        report "WARN" "$dir missing"
    fi
done

# Summary
echo ""
echo "========================================"
echo "  Summary"
echo "========================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}Passed with $WARNINGS warning(s)${NC}"
    exit 0
else
    echo -e "${RED}Failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    exit 1
fi
