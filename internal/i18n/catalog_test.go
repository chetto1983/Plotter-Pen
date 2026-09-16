package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// verb matches a formatting verb of fmt, flags, width and precision included.
var verb = regexp.MustCompile(`%[-+# 0]*(?:\[\d+\])?(?:\d+|\*)?(?:\.(?:\d+|\*))?[a-zA-Z%]`)

// verbs lists the verbs of a format in order, %w read as %v, since the Italian prints the wrapped
// message as text.
func verbs(format string) []string {
	var out []string
	for _, v := range verb.FindAllString(format, -1) {
		if v == "%%" {
			continue
		}
		out = append(out, strings.Replace(v, "w", "v", 1))
	}
	return out
}

// Every translation formats the same arguments the same way, in the same order.
func TestCatalog_TranslationsKeepTheVerbs(t *testing.T) {
	if len(texts) == 0 {
		t.Fatal("the catalog is empty")
	}
	for key, it := range texts {
		if !slices.Equal(verbs(key), verbs(it)) {
			t.Errorf("%q\n  has verbs %v, its Italian %q has %v", key, verbs(key), it, verbs(it))
		}
		if strings.TrimSpace(it) == "" || it == key {
			t.Errorf("%q has no Italian", key)
		}
	}
}

// Every message the code can make has its Italian: the sources are read for the calls to
// i18n.Errorf and i18n.Notef, whose format must be a literal of the catalog.
func TestCatalog_CoversEveryMessageOfTheCode(t *testing.T) {
	root := filepath.Join("..", "..")
	found := 0
	for _, dir := range []string{"internal", "cmd", "pkg"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return err
			}
			file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
			if err != nil {
				return err
			}
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || (sel.Sel.Name != "Errorf" && sel.Sel.Name != "Notef") || len(call.Args) == 0 {
					return true
				}
				if pkg, ok := sel.X.(*ast.Ident); !ok || pkg.Name != "i18n" {
					return true
				}
				found++
				lit, ok := call.Args[0].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					t.Errorf("%s: the format of i18n.%s is not a literal", path, sel.Sel.Name)
					return true
				}
				key, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Errorf("%s: %v", path, err)
					return true
				}
				if !has(key) {
					t.Errorf("%s: %q has no Italian in the catalog", path, key)
				}
				return true
			})
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if found == 0 {
		t.Fatal("no message found: the walk looked in the wrong place")
	}
}
