package system

import (
	"fmt"
	"log"
	"net/url"
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
	cmd, err := browserCommand(url, browser)
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to open browser: %w", err)
	}
	// Reap the launcher without blocking server startup on the browser lifetime.
	go func() {
		if err := cmd.Wait(); err != nil {
			log.Printf("Browser launcher failed: %v", err)
		}
	}()
	return nil
}

func browserCommand(rawURL, browser string) (*exec.Cmd, error) {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return nil, fmt.Errorf("browser URL must be an absolute HTTP or HTTPS URL")
	}
	args := []string{rawURL}
	if browser == "" {
		switch runtime.GOOS {
		case "windows":
			browser = "rundll32"
			args = append([]string{"url.dll,FileProtocolHandler"}, args...)
		case "darwin":
			browser = "open"
		case "linux", "freebsd", "openbsd", "netbsd":
			browser = "xdg-open"
		default:
			return nil, fmt.Errorf("unsupported platform: %s", runtime.GOOS)
		}
	}
	// #nosec G204 -- Executable is trusted local BrowserConfig, never HTTP input; the validated URL is one argument, without a shell.
	return exec.Command(browser, args...), nil
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
