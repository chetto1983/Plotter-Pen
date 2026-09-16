package i18n

// Messages shared by every handler: requests the server cannot read, and the lead of an error that
// has no message of its own.
var commonTexts = [][2]string{
	{unexpected, "errore imprevisto: %v"},
	{"invalid request: %w", "richiesta non valida: %v"},
	{"invalid id", "id non valido"},
	{"failed to read body", "impossibile leggere il contenuto inviato"},
}

func init() { load(commonTexts) }
