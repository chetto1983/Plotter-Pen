package i18n

// Messages shared by every handler and by the middleware: requests the server cannot read or will
// not serve, and the lead of an error that has no message of its own.
var commonTexts = [][2]string{
	{unexpected, "errore imprevisto: %v"},
	{"invalid request: %w", "richiesta non valida: %v"},
	{"invalid id", "id non valido"},
	{"failed to read body", "impossibile leggere il contenuto inviato"},
	{"too many requests, try again shortly", "troppe richieste, riprova fra poco"},
	{"internal server error", "errore interno del server"},
}

func init() { load(commonTexts) }
