package importservice

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/hschendel/stl"
)

func TestParseSTLFileMatchesContent(t *testing.T) {
	solid, err := stl.ReadAll(bytes.NewReader(testSTLCube))
	if err != nil {
		t.Fatal(err)
	}
	solid.SetASCII(false)
	var binary bytes.Buffer
	if err := solid.WriteAll(&binary); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string][]byte{"ascii": testSTLCube, "binary": binary.Bytes()} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "cube.stl")
			if err := os.WriteFile(path, content, 0600); err != nil {
				t.Fatal(err)
			}
			fromFile, err := ParseSTLFile(path)
			if err != nil {
				t.Fatal(err)
			}
			fromContent, err := ParseSTL(content)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(fromFile, fromContent) {
				t.Fatal("file and content parsing differ in mesh, bounds or statistics")
			}
		})
	}
}
