package system

import "testing"

func TestBrowserCommandRejectsNonHTTPURLs(t *testing.T) {
	for _, rawURL := range []string{"", "--help", "relative/path", "file:///tmp/example", "javascript:alert(1)", "http://", "https://localhost/\n"} {
		t.Run(rawURL, func(t *testing.T) {
			if _, err := browserCommand(rawURL, "browser"); err == nil {
				t.Fatal("invalid URL accepted")
			}
		})
	}
}

func TestBrowserCommandKeepsURLAsOneArgument(t *testing.T) {
	const rawURL = "http://localhost:8000/?a=1&b=two;three"
	cmd, err := browserCommand(rawURL, "browser")
	if err != nil {
		t.Fatal(err)
	}
	if len(cmd.Args) != 2 || cmd.Args[0] != "browser" || cmd.Args[1] != rawURL {
		t.Fatalf("unexpected browser arguments: %q", cmd.Args)
	}
}
