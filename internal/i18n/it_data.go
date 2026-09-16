package i18n

// The data the page keeps on the server: the drawing it autosaves, the named drawings, the tool
// library and the PLC settings.
var dataTexts = [][2]string{
	// requests
	{"the field %s is required", "il campo %s è obbligatorio"},
	{"the field %s is not valid", "il campo %s non è valido"},

	// the autosaved state
	{"failed to load the state: %w", "lettura dello stato non riuscita: %v"},
	{"failed to save the state: %w", "salvataggio dello stato non riuscito: %v"},

	// the drawings
	{"failed to list the drawings: %w", "lettura dei disegni non riuscita: %v"},
	{"drawing not found", "disegno non trovato"},
	{"a drawing named %q already exists", "esiste già un disegno chiamato %q"},
	{"failed to save the drawing: %w", "salvataggio del disegno non riuscito: %v"},
	{"failed to delete: %w", "eliminazione non riuscita: %v"},

	// the tools
	{"failed to list the tools: %w", "lettura degli utensili non riuscita: %v"},
	{"failed to save the tool: %w", "salvataggio dell'utensile non riuscito: %v"},
	{"feed must not be negative, 0 takes the global setting", "l'avanzamento non può essere negativo: 0 usa quello globale"},
	{"plunge must not be negative, 0 takes the global setting", "la velocità di affondo non può essere negativa: 0 usa quella globale"},
	{"stepDown must not be negative, 0 takes the global setting", "la passata non può essere negativa: 0 usa quella globale"},

	// the PLC settings
	{"failed to load the PLC settings: %w", "lettura delle impostazioni PLC non riuscita: %v"},
	{"failed to save the PLC settings: %w", "salvataggio delle impostazioni PLC non riuscito: %v"},
}

func init() { load(dataTexts) }
