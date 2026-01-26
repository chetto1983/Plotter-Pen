/**
 * Branding utilities for 3D viewer
 * Extracted from polar3d-viewer bundle to avoid Three.js duplication
 */

export const BRANDING_CSS = `
.polar3d-branding {
    position: absolute;
    bottom: 8px;
    left: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
    user-select: none;
    z-index: 10;
}
`;

/**
 * Inject branding element into container
 * @param {HTMLElement} container - Parent container element
 */
export function injectBranding(container) {
    if (!container) return;

    // Check if branding already exists
    if (container.querySelector('.polar3d-branding')) return;

    const branding = document.createElement('div');
    branding.className = 'polar3d-branding';
    branding.textContent = 'Sacchi Plotter Pen';
    container.appendChild(branding);
}
