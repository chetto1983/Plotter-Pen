package system

import (
	"fmt"
	"os/exec"
	"runtime"
	"time"
)

// BrowserConfig holds browser launch settings
type BrowserConfig struct {
	Enabled bool
	Delay   time.Duration
	Browser string // Empty for default browser
}

// DefaultBrowserConfig returns default browser configuration
func DefaultBrowserConfig() BrowserConfig {
	return BrowserConfig{
		Enabled: true,
		Delay:   500 * time.Millisecond,
		Browser: "",
	}
}

// OpenBrowserWithConfig opens browser with custom configuration
func OpenBrowserWithConfig(url string, cfg BrowserConfig) error {
	if !cfg.Enabled {
		return nil
	}

	if cfg.Delay > 0 {
		time.Sleep(cfg.Delay)
	}

	return openURL(url, cfg.Browser)
}

// openURL opens a URL in the browser
func openURL(url, browser string) error {
	var cmd *exec.Cmd

	if browser != "" {
		cmd = exec.Command(browser, url)
	} else {
		switch runtime.GOOS {
		case "windows":
			cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		case "darwin":
			cmd = exec.Command("open", url)
		case "linux":
			cmd = exec.Command("xdg-open", url)
		case "freebsd", "openbsd", "netbsd":
			cmd = exec.Command("xdg-open", url)
		default:
			return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
		}
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to open browser: %w", err)
	}

	return nil
}

// GetDefaultBrowser returns the detected default browser name
func GetDefaultBrowser() string {
	switch runtime.GOOS {
	case "windows":
		return "system default (via rundll32)"
	case "darwin":
		return "system default (via open)"
	case "linux":
		return "system default (via xdg-open)"
	default:
		return "unknown"
	}
}

// IsBrowserAvailable checks if xdg-open or equivalent is available
func IsBrowserAvailable() bool {
	switch runtime.GOOS {
	case "windows", "darwin":
		return true // Always available on Windows/macOS
	default:
		_, err := exec.LookPath("xdg-open")
		return err == nil
	}
}
