/**
 * CAD Icons Module - SVG icons for tools and UI
 * Professional CAD-style icons
 */

export const ICONS = {
  // Drawing Tools
  line: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="19" x2="19" y2="5"/>
    <circle cx="5" cy="19" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="5" r="1.5" fill="currentColor"/>
  </svg>`,

  arc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 18 A 10 10 0 0 1 20 18"/>
    <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
    <circle cx="20" cy="18" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="8" r="1" fill="currentColor" opacity="0.5"/>
  </svg>`,

  arc3Point: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 18 A 10 10 0 0 1 20 18"/>
    <circle cx="4" cy="18" r="1.5" fill="#4CAF50"/>
    <circle cx="12" cy="8" r="1.5" fill="#FF9800"/>
    <circle cx="20" cy="18" r="1.5" fill="#F44336"/>
  </svg>`,

  arcCenter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 16 A 8 8 0 0 1 18 16"/>
    <circle cx="12" cy="16" r="1.5" fill="#2196F3"/>
    <line x1="12" y1="16" x2="6" y2="16" stroke-dasharray="2,2" opacity="0.5"/>
    <circle cx="6" cy="16" r="1.5" fill="#4CAF50"/>
    <circle cx="18" cy="16" r="1.5" fill="#F44336"/>
  </svg>`,

  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="8"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <line x1="12" y1="12" x2="20" y2="12" stroke-dasharray="2,2" opacity="0.5"/>
  </svg>`,

  rectangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="6" width="16" height="12"/>
    <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
    <circle cx="20" cy="18" r="1.5" fill="currentColor"/>
  </svg>`,

  polygon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12,3 21,9 18,20 6,20 3,9"/>
    <circle cx="12" cy="3" r="1.5" fill="currentColor"/>
    <circle cx="21" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="18" cy="20" r="1.5" fill="currentColor"/>
    <circle cx="6" cy="20" r="1.5" fill="currentColor"/>
    <circle cx="3" cy="9" r="1.5" fill="currentColor"/>
  </svg>`,

  freehand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 17 C 8 10, 10 20, 14 12 S 18 8, 20 8"/>
  </svg>`,

  // Actions
  select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3 L 10 21 L 13 13 L 21 10 Z"/>
  </svg>`,

  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/>
    <path d="M8 6V4h8v2"/>
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>`,

  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 10h10a5 5 0 015 5v2"/>
    <polyline points="3 10 8 5 3 10 8 15"/>
  </svg>`,

  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10h-10a5 5 0 00-5 5v2"/>
    <polyline points="21 10 16 5 21 10 16 15"/>
  </svg>`,

  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
  </svg>`,

  // View
  zoomIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>`,

  zoomOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>`,

  zoomFit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 3h6v6"/>
    <path d="M9 21H3v-6"/>
    <path d="M21 3l-7 7"/>
    <path d="M3 21l7-7"/>
  </svg>`,

  pan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L12 22"/>
    <path d="M2 12L22 12"/>
    <polyline points="8 6 12 2 16 6"/>
    <polyline points="8 18 12 22 16 18"/>
    <polyline points="6 8 2 12 6 16"/>
    <polyline points="18 8 22 12 18 16"/>
  </svg>`,

  resetView: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="3" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="21"/>
    <line x1="3" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="21" y2="12"/>
  </svg>`,

  // Snap
  snapGrid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <line x1="4" y1="4" x2="4" y2="20"/>
    <line x1="9" y1="4" x2="9" y2="20"/>
    <line x1="14" y1="4" x2="14" y2="20"/>
    <line x1="19" y1="4" x2="19" y2="20"/>
    <line x1="4" y1="4" x2="20" y2="4"/>
    <line x1="4" y1="9" x2="20" y2="9"/>
    <line x1="4" y1="14" x2="20" y2="14"/>
    <line x1="4" y1="19" x2="20" y2="19"/>
    <circle cx="14" cy="14" r="2" fill="#4CAF50"/>
  </svg>`,

  snapEndpoint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="4" y1="18" x2="20" y2="6"/>
    <rect x="17" y="3" width="6" height="6" fill="#4CAF50" stroke="none"/>
  </svg>`,

  snapMidpoint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="4" y1="18" x2="20" y2="6"/>
    <polygon points="12,12 15,9 15,15 9,15 9,9" fill="#FF9800" stroke="none"/>
  </svg>`,

  snapCenter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="8"/>
    <circle cx="12" cy="12" r="3" fill="#2196F3"/>
    <line x1="12" y1="4" x2="12" y2="7" stroke-width="1"/>
    <line x1="12" y1="17" x2="12" y2="20" stroke-width="1"/>
    <line x1="4" y1="12" x2="7" y2="12" stroke-width="1"/>
    <line x1="17" y1="12" x2="20" y2="12" stroke-width="1"/>
  </svg>`,

  snapIntersection: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="4" y1="4" x2="20" y2="20"/>
    <line x1="4" y1="20" x2="20" y2="4"/>
    <circle cx="12" cy="12" r="2.5" fill="#F44336"/>
  </svg>`,

  // Output
  extract: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="16" y2="17"/>
  </svg>`,

  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>`,

  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`,

  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`,

  // Settings
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>`,

  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
  </svg>`,

  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>`,

  // Navigation
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,

  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`,

  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`,

  // Status
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,

  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,

  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`,

  // Coordinates
  crosshair: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="22" y1="12" x2="18" y2="12"/>
    <line x1="6" y1="12" x2="2" y2="12"/>
    <line x1="12" y1="6" x2="12" y2="2"/>
    <line x1="12" y1="22" x2="12" y2="18"/>
  </svg>`,

  ruler: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.5 9.5L9.5 21.5c-.78.78-2.05.78-2.83 0L2.5 17.33c-.78-.78-.78-2.05 0-2.83L14.5 2.5c.78-.78 2.05-.78 2.83 0l4.17 4.17c.78.78.78 2.05 0 2.83z"/>
    <line x1="12" y1="6" x2="6" y2="12"/>
    <line x1="17" y1="11" x2="11" y2="17"/>
  </svg>`,

  // PLC
  plc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <line x1="8" y1="8" x2="8" y2="16"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="16" y1="8" x2="16" y2="16"/>
    <circle cx="8" cy="10" r="1" fill="currentColor"/>
    <circle cx="12" cy="12" r="1" fill="currentColor"/>
    <circle cx="16" cy="14" r="1" fill="currentColor"/>
  </svg>`
};

/**
 * Create icon element
 */
export function createIcon(name, size = 20, className = '') {
  const svg = ICONS[name];
  if (!svg) {
    console.warn(`Icon not found: ${name}`);
    return document.createTextNode('');
  }

  const container = document.createElement('span');
  container.className = `icon ${className}`.trim();
  container.innerHTML = svg;
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
  container.style.display = 'inline-flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';

  const svgElement = container.querySelector('svg');
  if (svgElement) {
    svgElement.style.width = '100%';
    svgElement.style.height = '100%';
  }

  return container;
}

/**
 * Get icon SVG string
 */
export function getIconSvg(name) {
  return ICONS[name] || '';
}

/**
 * Apply icons to existing elements
 */
export function applyIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const iconName = el.dataset.icon;
    const size = parseInt(el.dataset.iconSize) || 20;
    const icon = createIcon(iconName, size);
    el.prepend(icon);
  });
}

export default ICONS;
