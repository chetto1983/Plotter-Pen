export const UI_DPI = 96;

export const MIN_PRIMITIVE_LENGTH = 0.8;

export const SNAP_DISTANCE_MM = 1.5;
export const MAGNET_SNAP_DISTANCE_MM = 2.8;
export const COLLISION_TOLERANCE_MM = 0.25;

export const SNAP_LABELS = {
  none: 'Nessuno',
  grid: 'Griglia',
  'line-start': 'Linea inizio',
  'line-mid': 'Linea centro',
  'line-end': 'Linea fine',
  'arc-start': 'Arco inizio',
  'arc-center': 'Arco centro',
  'arc-end': 'Arco fine',
  'magnet-edge': 'Magnete bordo',
  'magnet-arc': 'Magnete arco',
  intersection: 'Intersezione',
  collision: 'Collisione'
};

export const EXTRACTOR_DEFAULTS = { epsLine: 0.35, epsArc: 0.9 };

export const TOOL_HINTS = {
  freehand: 'Disegna a mano libera. Mouse o touch.',
  line: 'Clicca per iniziare la linea, trascina per definire la fine.',
  arc: 'Clicca per fissare inizio e fine, poi muovi il mouse per la curvatura e clicca di nuovo per confermare.',
  rectangle: 'Clicca per iniziare il rettangolo, trascina per la dimensione.',
  polygon: 'Clicca per aggiungere punti, doppio clic per chiudere.',
  delete: 'Cancella primitive: clic sinistro per selezionare, destro per rimuovere.'
};
