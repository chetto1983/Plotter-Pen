package i18n

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"testing"

	"golang.org/x/text/feature/plural"
)

// Messages that only the tests use, kept apart from the catalog of the app.
func init() {
	load([][2]string{
		{"test: gap of %.3f mm at (%.3f, %.3f)", "prova: apertura di %.3f mm in (%.3f; %.3f)"},
		{"test: step %d: %w", "prova: passo %d: %v"},
		{"test: connection failed: %w", "prova: connessione non riuscita: %v"},
		{"test: layer %q not found", "prova: livello %q non trovato"},
		{"test: at most %d passes", "prova: al massimo %d passate"},
		{"test: first", "prova: primo"},
		{"test: second", "prova: secondo"},
	})
	loadPlural("test: %d open contour(s)", plural.Selectf(1, "%d",
		"=1", "prova: %d contorno aperto",
		"other", "prova: %d contorni aperti"))
}

func expect(t *testing.T, what, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %q, want %q", what, got, want)
	}
}

// The log keeps the English, formatted as fmt formats it; the page gets the Italian, with a decimal
// comma.
func TestErrorf_EnglishForTheLogItalianForThePage(t *testing.T) {
	err := Errorf("test: gap of %.3f mm at (%.3f, %.3f)", 0.04, 80.0, 20.0)

	expect(t, "English", err.Error(), "test: gap of 0.040 mm at (80.000, 20.000)")
	expect(t, "Italian", Italian(err), "prova: apertura di 0,040 mm in (80,000; 20,000)")
}

// A message inside another is said in Italian too, and stays reachable with errors.Is and As.
func TestItalian_SaysTheWrappedMessage(t *testing.T) {
	inner := Errorf("test: gap of %.3f mm at (%.3f, %.3f)", 0.04, 80.0, 20.0)
	err := Errorf("test: step %d: %w", 2, inner)

	expect(t, "English", err.Error(), "test: step 2: test: gap of 0.040 mm at (80.000, 20.000)")
	expect(t, "Italian", Italian(err), "prova: passo 2: prova: apertura di 0,040 mm in (80,000; 20,000)")
	if !errors.Is(err, inner) {
		t.Error("errors.Is does not find the wrapped message")
	}
}

// An error of a library has no Italian: inside a message it keeps its own text, and errors.Is
// still finds it.
func TestItalian_KeepsTheTextOfALibraryError(t *testing.T) {
	err := Errorf("test: connection failed: %w", io.EOF)

	expect(t, "Italian", Italian(err), "prova: connessione non riuscita: EOF")
	if !errors.Is(err, io.EOF) {
		t.Error("errors.Is does not find io.EOF")
	}
}

// A plain wrapper adds nothing the page can read: the message under it is said.
func TestItalian_LooksUnderAPlainWrapper(t *testing.T) {
	err := fmt.Errorf("while saving: %w", Errorf("test: layer %q not found", "FORI"))

	expect(t, "Italian", Italian(err), `prova: livello "FORI" non trovato`)
}

// An error with no message of the catalog anywhere in it is still said, with an Italian lead.
func TestItalian_UnexpectedError(t *testing.T) {
	expect(t, "plain error", Italian(errors.New("boom")), "errore imprevisto: boom")
	expect(t, "nil", Italian(nil), "")
}

func TestItalian_NumbersAndPlurals(t *testing.T) {
	expect(t, "thousands", Italian(Errorf("test: at most %d passes", 1000)), "prova: al massimo 1.000 passate")
	expect(t, "one", Italian(Errorf("test: %d open contour(s)", 1)), "prova: 1 contorno aperto")
	expect(t, "many", Italian(Errorf("test: %d open contour(s)", 3)), "prova: 3 contorni aperti")
	expect(t, "English", Errorf("test: %d open contour(s)", 3).Error(), "test: 3 open contour(s)")
}

// Several problems at once are said one after the other, in both languages.
func TestJoin(t *testing.T) {
	err := Join([]error{Errorf("test: first"), Errorf("test: second"), io.EOF})

	expect(t, "English", err.Error(), "test: first; test: second; EOF")
	expect(t, "Italian", Italian(err), "prova: primo; prova: secondo; EOF")
	expect(t, "wrapped", Italian(Errorf("test: step %d: %w", 1, err)), "prova: passo 1: prova: primo; prova: secondo; EOF")
	if !errors.Is(err, io.EOF) {
		t.Error("errors.Is does not find a joined error")
	}
	if Join(nil) != nil {
		t.Error("Join of nothing is not nil")
	}
}

// A note is a message the page shows that is not an error, like a warning: the tests read its
// English, the JSON carries its Italian.
func TestNote_JSONIsItalian(t *testing.T) {
	n := Notef("test: gap of %.3f mm at (%.3f, %.3f)", 0.04, 80.0, 20.0)
	b, err := json.Marshal([]Note{n})
	if err != nil {
		t.Fatal(err)
	}

	expect(t, "English", n.String(), "test: gap of 0.040 mm at (80.000, 20.000)")
	expect(t, "formatted", fmt.Sprintf("%q", []Note{n}), `["test: gap of 0.040 mm at (80.000, 20.000)"]`)
	expect(t, "JSON", string(b), `["prova: apertura di 0,040 mm in (80,000; 20,000)"]`)
	expect(t, "Italian", n.Italian(), "prova: apertura di 0,040 mm in (80,000; 20,000)")
}
