package i18n

// The import of DXF, SVG and STL files.
var importTexts = [][2]string{
	// the handlers
	{"the content is not a valid %s file", "il contenuto non è un file %s valido"},
	{"the DXF could not be imported: %w", "il DXF non si può importare: %v"},
	{"the SVG could not be imported: %w", "lo SVG non si può importare: %v"},
	{"the STL could not be imported: %w", "lo STL non si può importare: %v"},
	// the handler already names the file: in Italian these leads would say it twice
	{"failed to parse DXF: %w", "%v"},
	{"failed to parse STL: %w", "%v"},
	{"failed to read STL file: %w", "%v"},

	// the DXF reader
	{"binary DXF is not supported: save the drawing as ASCII DXF", "il DXF binario non è gestito: salva il disegno come DXF ASCII"},
	{"the DXF could not be read: %v", "il DXF non si può leggere: %v"},
	{"the DXF has no complete ENTITIES section: the file is truncated or has a line that is not a group code", "il DXF non ha una sezione ENTITIES completa: il file è troncato o ha una riga che non è un codice di gruppo"},
	{"an LWPOLYLINE does not declare how many vertices it has (group code 90): the DXF is damaged", "una LWPOLYLINE non dichiara quanti vertici ha (codice di gruppo 90): il DXF è danneggiato"},
	{"an LWPOLYLINE declares %d vertices but writes %d: the DXF is damaged", "una LWPOLYLINE dichiara %d vertici ma ne scrive %d: il DXF è danneggiato"},

	// the SVG reader
	{"no svg root element found", "nel file non c'è l'elemento svg"},
	{"svg path: move missing %s", "percorso SVG: al comando M (spostamento) manca %s"},
	{"svg path: line missing %s", "percorso SVG: al comando L (linea) manca %s"},
	{"svg path: cubic missing %s", "percorso SVG: al comando C (curva cubica) manca %s"},
	{"svg path: smooth cubic missing %s", "percorso SVG: al comando S (curva cubica continua) manca %s"},
	{"svg path: quadratic missing %s", "percorso SVG: al comando Q (curva quadratica) manca %s"},
	{"svg path: smooth quadratic missing %s", "percorso SVG: al comando T (curva quadratica continua) manca %s"},
	{"svg path: arc missing %s", "percorso SVG: al comando A (arco) manca %s"},
}

func init() { load(importTexts) }
