# Regole operative — Plotter-Pen

Istruzioni per tutta la repository, adattate dai principi di Aura al codice di Plotter-Pen verificato il 2026-09-10. Le istruzioni di sistema e le richieste esplicite dell'utente hanno precedenza.

## Fonti e metodo

- Leggere il codice prima di modificarlo; rileggere i file dopo cambiamenti concorrenti. Controllare `git status` e preservare le modifiche altrui.
- Consultare `README.md`, `IMPLEMENTATION_ROADMAP.md` e `docs/`, verificando le affermazioni nel codice. Una roadmap non dimostra che una funzione sia completata.
- Versioni e dipendenze: `go.mod`, `go.sum`, `package.json`, `package-lock.json`. Build e runtime: `webpack.config.cjs`, `Dockerfile`, Compose e `internal/system/config.go`.
- Misurare prima di affermare: registrare riproduzione, risultato e limiti della prova. Aggiornare la documentazione pertinente quando diverge dal comportamento verificato.
- Non importare stack, percorsi, variabili, milestone o misure storiche di Aura. Postgres, ArcadeDB, PRD e workflow GSD non sono requisiti impliciti di questa repo.

## Architettura

| Area | Responsabilità |
| --- | --- |
| `cmd/server/` | Avvio e registrazione delle route Gin |
| `internal/handler/` | Contratti HTTP, richieste e WebSocket |
| `internal/service/import/` | DXF/SVG/STL, spline e trasformazioni |
| `internal/service/plc/` | Estrazione comandi, fitting e ottimizzazione percorsi |
| `internal/service/opcua/` | Configurazione, connessione, trasferimenti e posizione PLC |
| `internal/persistence/` | Modelli e persistenza SQLite tramite GORM |
| `internal/system/`, `internal/middleware/` | Configurazione runtime e middleware HTTP |
| `pkg/geom/`, `pkg/plc/`, `pkg/gcode/`, `pkg/clipper/` | Geometria, generatori e adattamento Clipper2 |
| `src/app/`, `src/services/` | Stato CAD, controller e comunicazione backend |
| `src/geometry/`, `src/tools/` | Primitive, operazioni geometriche e strumenti |
| `src/ui/`, `src/styles/`, `src/plc/` | Interfaccia, stili e simulazione Three.js |

Backend Go con Gin/GORM; frontend JavaScript ES modules con Webpack/Babel. Rispettare le separazioni e i pattern esistenti.

## Implementazione

- Fare quanto richiesto, senza funzionalità o refactor estranei. Correggere i difetti direttamente coinvolti; segnalare quelli indipendenti senza ampliare silenziosamente il lavoro.
- Prima di usare API esterne leggere la documentazione della versione effettiva. Prima di scrivere wrapper o componenti custom inventariare API esportate, codice e funzionalità già disponibili; riutilizzare quanto esiste e motivare con evidenza le lacune.
- Procedere autonomamente nelle scelte reversibili autorizzate. Chiedere chiarimenti solo quando una decisione sostanziale o un contratto non è ricavabile dalle fonti.
- Dopo tre tentativi falliti dello stesso approccio, interrompere la ripetizione, raccogliere evidenza e cambiare strategia. Coinvolgere l'utente se manca un dato indispensabile.
- Preferire codice semplice, esplicito e leggibile; evitare duplicazioni, parametri inutilizzati, codice morto e TODO senza seguito definito.
- Nuovi file di codice: massimo 600 righe. Nei file esistenti più grandi estrarre responsabilità coerenti quando necessario alla modifica, senza trasformare una correzione puntuale in una riscrittura.
- Commentare vincoli e motivazioni non ovvi. Aggiornare commenti resi obsoleti dalla modifica.
- Non nascondere errori né alterare test per ottenere un verde. Correggere un test solo se il contratto atteso è errato o cambiato, motivandolo.
- Rispettare cancellazione, timeout e chiusura delle risorse; evitare goroutine, subscription e connessioni WebSocket abbandonate.

## Geometria, PLC e OPC UA

- Preservare unità, precisione, tolleranze, orientamento degli archi, ordine dei percorsi e quote Z. Verificare i valori nel codice, senza copiarli da tabelle storiche.
- Il formato PLC J/L/A/WAIT ha semantica propria: negli archi PLC I/J indicano un punto di passaggio. Non confonderlo con gli offset del centro del G-code; controllare entrambi i generatori quando interessati.
- Per importazione e fitting verificare fixture rappresentative e casi degeneri: segmenti nulli, punti coincidenti, archi quasi lineari, percorsi aperti/chiusi e scale differenti.
- Nei trasferimenti OPC UA preservare tipi dei nodi, payload, chunking, ACK, timeout, reset e fine file. Verificare errori, disconnessioni e chunk finale parziale.
- Usare mock e simulatori nello sviluppo. Un invio a un PLC reale può muovere una macchina: scritture, trigger e test fisici richiedono un perimetro esplicitamente autorizzato dall'utente.
- Prima dei test di integrazione leggere endpoint e flag: alcuni test usano `192.168.0.1` o configurazioni locali. Non abilitarli indiscriminatamente.
- Il simulatore S7 è in `tools/s7sim/` e non fa parte del Compose applicativo. Una prova sul simulatore non dimostra il comportamento della macchina fisica.

## Dati e configurazione

- SQLite e GORM sono la persistenza effettiva. Le modifiche ai modelli devono considerare `AutoMigrate` in `internal/persistence/db.go` e la compatibilità dei database esistenti.
- Usare database temporanei e configurazioni isolate nei test. Non sovrascrivere `plotter_pen.db`, `state.json`, `last_run_input.json`, configurazioni macchina o certificati per una verifica.
- Non stampare né includere nei commit credenziali, token o chiavi private.
- Leggere nomi e precedenze delle variabili nei rispettivi loader. Per il server consultare `internal/system/config.go`; non introdurre il prefisso `AURA_*`.
- I default del loader includono `DB_PATH=plotter_pen.db`, porta 8000 e `GIN_MODE=release`; `SERVER_PORT` prevale su `PORT`. Verificare nuovamente prima di documentare modifiche a questi contratti.
- Mantenere coerenti configurazione applicativa, documentazione e container. Il Compose principale espone attualmente la porta host 41880 verso la 8000 del container.

## Frontend e HMI

- Preservare identità visiva dell'app CAD, leggibilità e spazio per il disegno; adattare le modifiche agli stili esistenti.
- Garantire interazioni mouse, tastiera e touch; controllare zoom, pan, selezione e simulazione quando interessati.
- Conservare il target Firefox 78 dichiarato in `webpack.config.cjs`, inclusa la trasformazione delle dipendenze Three.js. Il successo su un browser recente non dimostra compatibilità HMI.
- La configurazione Babel è inline in Webpack: se viene spostata aggiornare anche gli input copiati dal Dockerfile.
- Modificare i sorgenti, non `dist/bundle.js` o `node_modules/`. Rigenerare il bundle con `npm run build`.
- Verificare console, ridimensionamento e flussi WebSocket. Rilasciare le risorse Three.js quando si sostituiscono scene o oggetti.

## Verifiche e completamento

Prima di implementare definire comportamento atteso, file coinvolti e prova riproducibile. Per un bug partire dalla riproduzione; per una funzione coprire contratto e casi limite pertinenti.

| Modifica | Verifiche richieste |
| --- | --- |
| Go | `gofmt` sui file toccati, `go vet ./...`, `go build ./...`, test dei package interessati e `go test ./...` prima della chiusura |
| Concorrenza, OPC UA o WebSocket Go | Anche `go test -race` sui package interessati con toolchain compatibile; dichiarare eventuali impedimenti |
| JavaScript/CSS/UI | `npm run lint`, `npm run build` e verifica nel browser del flusso interessato |
| Trasferimento S7 | Con simulatore avviato e destinazione verificata: `go test -tags=s7sim -run S7Sim -v ./internal/service/opcua/`; endpoint configurabile con `S7SIM_ENDPOINT` |
| Database | Test su SQLite temporaneo e compatibilità dei dati interessati |
| Docker/build | Build dell'immagine e smoke test del servizio isolato quando cambia il packaging |
| Sola documentazione | Verificare percorsi, comandi e coerenza con il codice; non eseguire suite applicative senza motivo |

- Non esiste uno script `npm test` in `package.json`: non dichiarare test frontend automatici inesistenti.
- Un test saltato non è una verifica riuscita. Riportare prove eseguite e prove che richiedono servizi o hardware non disponibili.
- Lint può segnalare warning senza fallire: esaminare anche quelli introdotti dalla modifica.
- Per modifiche funzionali completare una prova del flusso reale interessato nell'ambiente di test, oltre ai test unitari. Per CAD/PLC può includere importazione, generazione, anteprima, salvataggio e trasferimento al simulatore, secondo lo scope.
- Distinguere unit test, simulazione, browser e hardware reale. Non dichiarare validazione E2E o compatibilità HMI se non misurate.
- Misurare coverage e regressioni quando pertinente, indicando comando e perimetro. Non attribuire alla repo soglie, score E2E o gate CI di Aura che qui non sono implementati.
- Alla consegna riportare cosa è cambiato, perché, verifiche effettive e limiti residui. Un impedimento va dichiarato, non trasformato in successo.

## Git e strumenti

- Preservare lavoro non correlato, dati locali e modifiche concorrenti. Non usare reset, clean, checkout o restore per eliminare modifiche altrui.
- Se il task include commit, creare commit atomici con oggetto imperativo e motivazione; seguire le convenzioni effettive della repo senza inventare trailer.
- Merge, push e pubblicazione seguono lo scope autorizzato. Non assumere il branch `master` né applicare automatismi di chiusura provenienti da Aura.
- Dopo un push controllare gli eventuali job CI disponibili e riportarne lo stato effettivo.
- Usare skill pertinenti quando richieste o utili. Non imporre bootstrap GSD, milestone o agenti paralleli a modifiche ordinarie.
- Su Windows usare PowerShell con percorsi espliciti e verificare i target prima di cancellazioni o spostamenti. Scegliere Windows, WSL o container secondo la toolchain verificata, senza assumere installazioni di Aura.
