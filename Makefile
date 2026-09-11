# Plotter-Pen developer tasks. Toolchain and git hooks are set up like D:\Aura's.
# Recipes run in bash (Git Bash on Windows); the Go tools must be on PATH ($GOPATH/bin).

SHELL := bash
GO_PACKAGES = $(shell bash scripts/go_packages.sh)

.PHONY: help tools hooks vet lint deadcode vuln test test-race tagged-tier-compile file-size web-lint web-build quality

help:
	@echo "make tools               - go install the quality toolchain (same list as D:\\Aura)"
	@echo "make hooks               - lefthook install (git pre-commit/pre-push hooks)"
	@echo "make vet                 - go vet on the tracked packages"
	@echo "make lint                - golangci-lint on the tracked packages (full sweep)"
	@echo "make deadcode            - unreachable functions (tests count as roots)"
	@echo "make vuln                - govulncheck (known vulnerabilities in dependencies)"
	@echo "make test                - go test"
	@echo "make test-race           - go test -race (needs cgo and a 64-bit C compiler)"
	@echo "make tagged-tier-compile - compile the integration/s7sim test files without running them"
	@echo "make file-size           - list code files over 600 lines"
	@echo "make web-lint            - eslint on src/"
	@echo "make web-build           - webpack bundle"
	@echo "make quality             - vet lint deadcode tagged-tier-compile test vuln web-lint"

tools:
	go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.13.2
	go install honnef.co/go/tools/cmd/staticcheck@latest
	go install golang.org/x/vuln/cmd/govulncheck@latest
	go install github.com/mibk/dupl@latest
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/deadcode@latest
	go install golang.org/x/tools/cmd/goimports@latest
	go install github.com/avito-tech/go-mutesting/cmd/go-mutesting@latest
	GOEXPERIMENT=nojsonv2 go install github.com/evilmartians/lefthook@latest
	@echo "now run: make hooks"

hooks:
	lefthook install

vet:
	go vet $(GO_PACKAGES)

lint:
	golangci-lint run $(GO_PACKAGES)

deadcode:
	bash scripts/deadcode_gate.sh deadcode -test $(GO_PACKAGES)

vuln:
	govulncheck $(GO_PACKAGES)

test:
	go test $(GO_PACKAGES)

test-race:
	go test -race $(GO_PACKAGES)

tagged-tier-compile:
	bash scripts/tagged_tier_compile.sh

file-size:
	bash scripts/check-file-size.sh

web-lint:
	npm run lint

web-build:
	npm run build

quality: vet lint deadcode tagged-tier-compile test vuln web-lint
