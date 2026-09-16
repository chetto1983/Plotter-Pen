// Package i18n says the errors the user reads in Italian, while the logs and the tests keep them in
// English. A message is made with Errorf, like fmt.Errorf: its English format is also the key of
// its Italian text in the catalog (golang.org/x/text/message), which formats the numbers the
// Italian way, 0,04 and 1.000.
package i18n

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"golang.org/x/text/language"
	"golang.org/x/text/message"
	"golang.org/x/text/message/catalog"
)

var (
	builder = catalog.NewBuilder(catalog.Fallback(language.English))
	// texts are the Italian texts of the catalog by their English format, plurals the formats
	// whose Italian depends on a number.
	texts   = map[string]string{}
	plurals = map[string]bool{}
	// the printer is made on first use, once every catalog file has loaded its texts
	printer = sync.OnceValue(func() *message.Printer {
		return message.NewPrinter(language.Italian, message.Catalog(builder))
	})
)

// unexpected leads an error that has no message of the catalog in it.
const unexpected = "unexpected error: %v"

// load adds Italian texts to the catalog, each after its English format. Called from the init of
// the catalog files: a format given twice, or a text the catalog refuses, is a mistake in the code,
// so it panics.
func load(pairs [][2]string) {
	for _, pair := range pairs {
		key, it := pair[0], pair[1]
		if _, dup := texts[key]; dup {
			panic(fmt.Sprintf("i18n: %q is in the catalog twice", key))
		}
		if err := builder.SetString(language.Italian, key, it); err != nil {
			panic(fmt.Sprintf("i18n: %q: %v", key, err))
		}
		texts[key] = it
	}
}

// loadPlural adds an Italian text that changes with a number, made with plural.Selectf.
func loadPlural(key string, msg catalog.Message) {
	if err := builder.Set(language.Italian, key, msg); err != nil {
		panic(fmt.Sprintf("i18n: %q: %v", key, err))
	}
	plurals[key] = true
}

func has(key string) bool {
	_, ok := texts[key]
	return ok || plurals[key]
}

// Error is a message the user reads. Error() is the English, as fmt.Errorf makes it; Italian says
// it in Italian.
type Error struct {
	format  string
	args    []any
	english error
}

// Errorf makes a message as fmt.Errorf does, %w included. The format must be a literal with an
// Italian text in the catalog; a test reads the sources to check it.
func Errorf(format string, args ...any) error {
	return &Error{format: format, args: args, english: fmt.Errorf(format, args...)}
}

func (e *Error) Error() string { return e.english.Error() }

// Unwrap gives the errors wrapped with %w, for errors.Is and errors.As.
func (e *Error) Unwrap() []error {
	switch u := e.english.(type) {
	case interface{ Unwrap() error }:
		return []error{u.Unwrap()}
	case interface{ Unwrap() []error }:
		return u.Unwrap()
	}
	return nil
}

func (e *Error) italian() string {
	args := make([]any, len(e.args))
	for i, arg := range e.args {
		if err, ok := arg.(error); ok {
			args[i] = inline(err)
		} else {
			args[i] = arg
		}
	}
	// the catalog writes %v where the English wraps with %w
	return printer().Sprintf(e.format, args...)
}

// Note is a message the page shows that is not an error, like a warning: String is the English,
// the JSON is the Italian.
type Note struct{ msg error }

// Notef makes a note as Errorf makes a message.
func Notef(format string, args ...any) Note {
	return Note{msg: Errorf(format, args...)}
}

func (n Note) String() string { return n.msg.Error() }

// MarshalJSON writes the Italian.
func (n Note) MarshalJSON() ([]byte, error) { return json.Marshal(Italian(n.msg)) }

// joined is a list of problems said one after the other.
type joined struct{ errs []error }

// Join lists several problems in one error, separated by "; "; nil when there are none.
func Join(errs []error) error {
	if len(errs) == 0 {
		return nil
	}
	return &joined{errs: errs}
}

func (j *joined) say(one func(error) string) string {
	parts := make([]string, len(j.errs))
	for i, err := range j.errs {
		parts[i] = one(err)
	}
	return strings.Join(parts, "; ")
}

func (j *joined) Error() string   { return j.say(error.Error) }
func (j *joined) Unwrap() []error { return j.errs }

// Italian says an error in Italian: the outermost message of the catalog in it, since a plain
// wrapper around a message adds nothing the user could read. An error with no message of the
// catalog is said with an Italian lead and its own text. Nil says nothing.
func Italian(err error) string {
	if err == nil {
		return ""
	}
	if s, ok := find(err); ok {
		return s
	}
	return printer().Sprintf(unexpected, err.Error())
}

// inline says an error inside another message: an error of a library keeps its own text there.
func inline(err error) string {
	if s, ok := find(err); ok {
		return s
	}
	return err.Error()
}

func find(err error) (string, bool) {
	switch e := err.(type) {
	case *Error:
		return e.italian(), true
	case *joined:
		return e.say(inline), true
	case interface{ Unwrap() error }:
		if inner := e.Unwrap(); inner != nil {
			return find(inner)
		}
	case interface{ Unwrap() []error }:
		for _, inner := range e.Unwrap() {
			if s, ok := find(inner); ok {
				return s, true
			}
		}
	}
	return "", false
}
