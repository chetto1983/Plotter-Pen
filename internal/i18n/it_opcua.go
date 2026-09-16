package i18n

// The PLC: connection, reads and writes of the nodes, the chunked transfer, the settings and the
// certificates. "Server" is the OPC UA server of the PLC.
var opcuaTexts = [][2]string{
	// the client
	{"not connected to OPC UA server", "non c'è collegamento con il server OPC UA"},
	{"failed to get endpoints: %w", "gli endpoint del server non si possono leggere: %v"},
	{"failed to create client: %w", "il client OPC UA non si può creare: %v"},
	// the callers say what the connection was for
	{"failed to connect: %w", "%v"},
	{"failed to build variant: %w", "il valore da scrivere non si può preparare: %v"},
	{"write failed: %w", "scrittura non riuscita: %v"},
	{"write status: %v", "il server ha rifiutato la scrittura: %v"},
	{"%s node: %w", "nodo %s: %v"},
	{"%s write failed: %w", "scrittura di %s non riuscita: %v"},
	{"%s write status: %v", "il server ha rifiutato la scrittura di %s: %v"},
	{"cannot convert %T to bool", "un valore %T non si può convertire in booleano"},
	{"cannot convert %T to string array", "un valore %T non si può convertire in elenco di stringhe"},
	{"cannot convert %T to int32", "un valore %T non si può convertire in int32"},
	{"cannot convert %T to float", "un valore %T non si può convertire in numero decimale"},
	{"failed to write data: %w", "i dati non si possono scrivere: %v"},
	{"failed to set trigger: %w", "il trigger non si può attivare: %v"},
	{"read failed: %w", "lettura non riuscita: %v"},
	{"read status: %v", "il server ha rifiutato la lettura: %v"},
	{"expected bool, got %T", "il server ha dato un valore %T invece di un booleano"},
	{"expected NodeID, got %T", "il server ha dato un valore %T invece di un NodeID"},
	{"expected uint8, got %T", "il server ha dato un valore %T invece di un uint8"},
	{"browse failed: %w", "la navigazione dei nodi non è riuscita: %v"},
	{"failed to read the position %s: %w", "la posizione %s non si può leggere: %v"},

	// the node addresses
	{"invalid node ID %q: %w", "ID di nodo %q non valido: %v"},
	{"empty node address", "l'indirizzo del nodo è vuoto"},
	{"node address %q: %w", "indirizzo del nodo %q: %v"},
	{"browsing %s failed: %w", "la lettura dei nodi dentro %s non è riuscita: %v"},
	{"%s has no %q and no other child", "%s non contiene %q né altri nodi"},
	{"%s has no %q, only %s", "%s non contiene %q, solo %s"},

	// the chunked transfer
	{"a transfer is already in progress", "c'è già un trasferimento in corso"},
	{"failed to reset %s: %w", "%s non si può riportare a FALSE: %v"},
	{"failed to set %s: %w", "%s non si può portare a TRUE: %v"},
	{"transfer interrupted", "trasferimento interrotto"},
	{"transfer cancelled", "trasferimento annullato"},
	{"chunk %d of %d: %w", "blocco %d di %d: %v"},
	{"failed to write the lines: %w", "le righe non si possono scrivere: %v"},
	{"the PLC did not acknowledge within %d ms", "il PLC non ha confermato entro %d ms"},
	{"failed to read the acknowledgement: %w", "la conferma del PLC non si può leggere: %v"},

	// the connection and the settings
	{"failed to connect to the PLC: %w", "collegamento al PLC non riuscito: %v"},
	{"failed to disconnect from the PLC: %w", "scollegamento dal PLC non riuscito: %v"},
	{"failed to send the data: %w", "invio dei dati non riuscito: %v"},
	{"failed to save the connection settings: %w", "le impostazioni di collegamento non si possono salvare: %v"},
	{"failed to list the PLCs: %w", "l'elenco dei PLC non si può leggere: %v"},
	{"name and endpoint are required", "nome ed endpoint sono obbligatori"},
	{"failed to save the PLC: %w", "il PLC non si può salvare: %v"},
	{"PLC %s does not exist", "il PLC %s non esiste"},
	{"failed to read PLC %s: %w", "il PLC %s non si può leggere: %v"},
	{"the active PLC cannot be deleted", "il PLC attivo non si può eliminare"},
	{"failed to delete PLC %s: %w", "il PLC %s non si può eliminare: %v"},
	{"failed to activate PLC %s: %w", "il PLC %s non si può attivare: %v"},

	// the certificates
	{"the certificate directory must be within certs", "la cartella dei certificati deve stare dentro certs"},
	{"the certificate directory must be within the certificate root", "la cartella dei certificati deve stare dentro la cartella radice dei certificati"},
	{"failed to generate the certificates: %w", "i certificati non si possono generare: %v"},
	{"Certificates generated. Import the .der file into the trusted certificates of the PLC.", "Certificati generati. Importa il file .der fra i certificati attendibili del PLC."},
	{"invalid certificate type", "tipo di certificato non valido"},
	{"certificate not found", "certificato non trovato"},

	// the WebSocket
	{"too many WebSocket connections from this address", "troppe connessioni WebSocket da questo indirizzo"},
	{"invalid subscribe request", "richiesta di lettura della posizione non valida"},
	{"position streaming is not available with this client", "la lettura continua della posizione non è disponibile con questo client"},
	{"invalid command request", "richiesta di comando non valida"},
	{"unknown action: %s", "azione sconosciuta: %s"},
	{"connected", "collegato"},
	{"disconnected", "scollegato"},
	{"no commands to send", "nessun comando da inviare"},
	{"commands sent", "comandi inviati"},
	{"invalid transfer request", "richiesta di trasferimento non valida"},
	{"no commands to transfer", "nessun comando da trasferire"},
	{"chunked transfer is not available with this client", "il trasferimento a blocchi non è disponibile con questo client"},
	{"no transfer in progress", "nessun trasferimento in corso"},
}

func init() { load(opcuaTexts) }
