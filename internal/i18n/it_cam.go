package i18n

import "golang.org/x/text/feature/plural"

// The CAM: the profile, the drilling, the piece they cut and the job that holds them.
var camTexts = [][2]string{
	// primitives the chaining cannot read
	{"line %q: missing end points", "linea %q: mancano gli estremi"},
	{"arc %q: needs start, end, centre and sweep", "arco %q: servono inizio, fine, centro e ampiezza"},
	{"circle %q: needs centre and radius", "cerchio %q: servono centro e raggio"},
	{"rectangle %q: needs corner, width and height", "rettangolo %q: servono angolo, larghezza e altezza"},
	{"primitive %q: unsupported type %q", "primitiva %q: tipo %q non gestito"},

	// the piece
	{"thickness must be positive", "lo spessore deve essere maggiore di zero"},
	{"overcut must not be negative", "lo sfondamento non può essere negativo"},
	{"a cut that does not go through needs a depth above 0 and at most the thickness", "un taglio non passante richiede una profondità maggiore di zero e non oltre lo spessore"},
	{"safe Z must be above the top of the piece, work Z + thickness", "la Z di sicurezza deve stare sopra il pezzo, cioè sopra Z di lavoro + spessore"},
	{"wait time must not be negative", "l'attesa non può essere negativa"},

	// the profile
	{"tool diameter must be positive", "il diametro della fresa deve essere maggiore di zero"},
	{"side must be %q, %q or %q", "il lato deve essere %q, %q o %q"},
	{"direction must be %q or %q", "il verso deve essere %q o %q"},
	{"step-down must be at least 0.001 mm", "la passata deve essere di almeno 0,001 mm"},
	{"depth and step-down must make at most 1000 passes", "profondità e passata devono dare al massimo 1000 passate"},
	{"cutting, rapid and plunge speeds must be positive", "le velocità di taglio, di rapido e di affondo devono essere maggiori di zero"},
	{"ramp angle must be above 0° and at most 90°", "l'angolo della rampa deve essere maggiore di 0° e al massimo 90°"},
	{"closing gap must be between 0 and %g mm", "l'apertura da chiudere deve essere fra 0 e %g mm"},
	{"nothing to cut: the drawing has no closed contours", "niente da tagliare: il disegno non ha contorni chiusi"},
	{"a %.3f mm tool does not fit inside any contour", "una fresa da %.3f mm non entra in nessun contorno"},
	{"a %g° ramp would go round the ring from (%.3f, %.3f) to (%.3f, %.3f) %.0f times to go down %.3f mm, at most %d: use a steeper ramp angle or a smaller step-down", "una rampa di %g° girerebbe attorno al contorno da (%.3f; %.3f) a (%.3f; %.3f) %.0f volte per scendere di %.3f mm, al massimo %d: usa una rampa più ripida o una passata più sottile"},
	{"a %.3f mm tool cannot reach the contour from (%.3f, %.3f) to (%.3f, %.3f): it is not cut, %v", "una fresa da %.3f mm non raggiunge il contorno da (%.3f; %.3f) a (%.3f; %.3f): non viene tagliato, %v"},
	{"the widest tool that fits it is %.3f mm", "ci entra al massimo una fresa da %.3f mm"},
	{"no tool fits it", "non ci entra nessuna fresa"},

	// open contours
	{"nothing to cut: the drawing has no closed contour, only %d open contour(s); no closing gap up to %g mm closes them", "niente da tagliare: il disegno ha solo contorni aperti (%d) e nessuna apertura fino a %g mm li chiude"},
	{"the open contour from (%.3f, %.3f) to (%.3f, %.3f) is not cut: %v", "il contorno aperto da (%.3f; %.3f) a (%.3f; %.3f) non viene tagliato: %v"},
	{"a closing gap of %.3f mm closes it", "chiudendo aperture fino a %.3f mm si chiude"},
	{"it is an open line", "è una linea aperta"},

	// the drilling
	{"nothing to drill: the drawing has no round hole from %.3f to %.3f mm across", "niente da forare: il disegno non ha fori tondi da %.3f a %.3f mm di diametro"},
	{"nothing to drill: the drawing has no round hole from %.3f to %.3f mm across; 1 closed contour of that width is not round: cut it with a profile", "niente da forare: il disegno non ha fori tondi da %.3f a %.3f mm di diametro; 1 contorno chiuso di quella misura non è tondo: va tagliato con un profilo"},
	{"nothing to drill: the drawing has no round hole from %.3f to %.3f mm across; %d closed contours of that width are not round: cut them with a profile", "niente da forare: il disegno non ha fori tondi da %.3f a %.3f mm di diametro; %d contorni chiusi di quella misura non sono tondi: vanno tagliati con un profilo"},
	{"drill diameter must be positive", "il diametro della punta deve essere maggiore di zero"},
	{"the smallest hole diameter must be positive and not above the largest", "il diametro minimo dei fori deve essere maggiore di zero e non oltre il massimo"},
	{"peck depth must be 0 or at least 0.001 mm", "lo scarico deve essere 0 o almeno 0,001 mm"},
	{"depth and peck depth must make at most 1000 pecks", "profondità e scarico devono dare al massimo 1000 affondi"},
	{"tip angle must be above 0° and at most 180°, or 0 for 118°", "l'angolo della punta deve essere maggiore di 0° e al massimo 180°, oppure 0 per 118°"},
	{"rapid and plunge speeds must be positive", "le velocità di rapido e di affondo devono essere maggiori di zero"},
	{"the retract plane must be above the top of the piece and not above safe Z", "il piano di risalita deve stare sopra il pezzo e non sopra la Z di sicurezza"},
	{"the closed contour from (%.3f, %.3f) to (%.3f, %.3f) is not round: it is not drilled, cut it with a profile", "il contorno chiuso da (%.3f; %.3f) a (%.3f; %.3f) non è tondo: non viene forato, va tagliato con un profilo"},

	// the operation and the job
	{"operation must be one of %q", "l'operazione deve essere una fra %q"},
	{"%s must be one of %q", "%s deve essere uno fra %q"},
	{"toolId and drillId must not be negative, 0 is no tool", "toolId e drillId non possono essere negativi, 0 è nessun utensile"},
	{"closeGap must be between 0 and %g mm", "l'apertura da chiudere deve essere fra 0 e %g mm"},
	{"step %d: %w", "passo %d: %v"},
	{"failed to load the operation: %w", "lettura dell'operazione non riuscita: %v"},
	{"failed to save the operation: %w", "salvataggio dell'operazione non riuscito: %v"},
	{"failed to load the job: %w", "lettura del lavoro non riuscita: %v"},
	{"failed to save the job: %w", "salvataggio del lavoro non riuscito: %v"},
	{"failed to generate the program: %w", "generazione del programma non riuscita: %v"},
}

func init() {
	load(camTexts)
	// the number of contours that the gap closes, the third argument, decides the verb
	loadPlural("nothing to cut: the drawing has no closed contour, only %d open contour(s); a closing gap of %.3f mm closes %d of them",
		plural.Selectf(3, "%d",
			"=1", "niente da tagliare: il disegno ha solo contorni aperti (%d); con aperture fino a %.3f mm se ne chiude %d",
			"other", "niente da tagliare: il disegno ha solo contorni aperti (%d); con aperture fino a %.3f mm se ne chiudono %d"))
}
