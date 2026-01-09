/**
 * Layer Panel UI Component
 * Renders and manages the layer panel in the sidebar
 */

/**
 * LayerPanel class - renders layer panel UI
 */
export class LayerPanel {
    /**
     * @param {Object} layerManager - Reference to LayerManager
     * @param {string} containerId - ID of container element
     */
    constructor(layerManager, containerId = 'layerPanel') {
        this.layerManager = layerManager;
        this.container = document.getElementById(containerId);

        // Listen for layer changes
        document.addEventListener('layersChanged', () => this.render());
        document.addEventListener('selectionChanged', () => {
            this.checkSelection();
            this.render();
        });

        this.checkSelection();

        // Initial render
        if (this.container) {
            this.render();
        }
    }

    checkSelection() {
        this.hasSelection = this.layerManager.app.selectedPrimitives && this.layerManager.app.selectedPrimitives.size > 0;
    }

    /**
     * Render the layer panel
     */
    render() {
        if (!this.container) return;

        const layers = this.layerManager.getAllLayers();
        const activeId = this.layerManager.activeLayerId;

        let html = `
      <div class="cad-layer-header">
        <span class="cad-layer-title">Livelli</span>
        <button class="cad-layer-btn cad-layer-add" title="Nuovo livello">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>
      <div class="cad-layer-list">
    `;

        for (const layer of layers) {
            const isActive = layer.id === activeId;
            const visIcon = layer.visible ? 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' : 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24';
            const lockIcon = layer.locked ? 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4' : 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM8 11V7a4 4 0 0 1 8 0v4';

            html += `
        <div class="cad-layer-item ${isActive ? 'active' : ''} ${layer.locked ? 'locked' : ''}" data-layer-id="${layer.id}">
          <div class="cad-layer-controls">
            <button class="cad-layer-btn cad-layer-visibility ${layer.visible ? '' : 'off'}" data-action="visibility" title="${layer.visible ? 'Nascondi' : 'Mostra'}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="${visIcon}"/>
                ${layer.visible ? '<circle cx="12" cy="12" r="3"/>' : '<path d="M1 1l22 22"/>'}
              </svg>
            </button>
            <button class="cad-layer-btn cad-layer-lock ${layer.locked ? 'on' : ''}" data-action="lock" title="${layer.locked ? 'Sblocca' : 'Blocca'}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="${lockIcon}"/>
              </svg>
            </button>
            <span class="cad-layer-color" style="background-color: ${layer.color}" data-action="color" title="Cambia colore"></span>
          </div>
          <span class="cad-layer-name" data-action="select">${layer.name}</span>
          <div class="cad-layer-actions">
            ${this.hasSelection ? `
            <button class="cad-layer-btn cad-layer-move-here" data-action="move-here" title="Sposta selezione qui">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 9l7 7 7-7"/>
                <line x1="12" y1="16" x2="12" y2="2"/>
              </svg>
            </button>` : ''}
            <button class="cad-layer-btn cad-layer-delete" data-action="delete" title="Elimina">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
        }

        html += '</div>';
        this.container.innerHTML = html;

        // Attach event handlers
        this.attachEventHandlers();
    }

    /**
     * Attach event handlers to layer panel elements
     */
    attachEventHandlers() {
        if (!this.container) return;

        // Add layer button
        this.container.querySelector('.cad-layer-add')?.addEventListener('click', () => {
            const name = prompt('Nome del nuovo livello:', `Layer ${this.layerManager.layers.size}`);
            if (name !== null) {
                const layer = this.layerManager.createLayer(name);
                this.layerManager.setActiveLayer(layer.id);
            }
        });

        // Layer item actions
        this.container.querySelectorAll('.cad-layer-item').forEach(item => {
            const layerId = item.dataset.layerId;

            // Visibility toggle
            item.querySelector('[data-action="visibility"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.layerManager.toggleVisibility(layerId);
            });

            // Lock toggle
            item.querySelector('[data-action="lock"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.layerManager.toggleLock(layerId);
            });

            // Color picker
            item.querySelector('[data-action="color"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showColorPicker(layerId, e.target);
            });

            // Select layer (click on name or item)
            item.querySelector('[data-action="select"]')?.addEventListener('click', () => {
                this.layerManager.setActiveLayer(layerId);
            });

            // Double-click to rename
            item.querySelector('[data-action="select"]')?.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.startRename(layerId, e.target);
            });

            // Delete layer
            item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Eliminare questo livello? Le primitive verranno spostate al livello predefinito.')) {
                    this.layerManager.deleteLayer(layerId);
                }
            });

            // Move selection here
            item.querySelector('[data-action="move-here"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const primitives = Array.from(this.layerManager.app.selectedPrimitives);
                if (primitives.length > 0) {
                    this.layerManager.movePrimitivesToLayer(primitives, layerId);
                    this.layerManager.app.ui.updateStatus(`Spostati ${primitives.length} elementi su ${this.layerManager.layers.get(layerId).name}`);
                    this.layerManager.app.render(); // Ensure canvas updates
                }
            });
        });
    }

    /**
     * Show inline color picker
     * @param {string} layerId - Layer ID
     * @param {HTMLElement} target - Color swatch element
     */
    showColorPicker(layerId, target) {
        // Create hidden color input
        const input = document.createElement('input');
        input.type = 'color';
        input.value = this.layerManager.layers.get(layerId)?.color || '#00ff00';
        input.style.position = 'absolute';
        input.style.opacity = '0';
        input.style.pointerEvents = 'none';

        input.addEventListener('input', (e) => {
            this.layerManager.setLayerColor(layerId, e.target.value);
            target.style.backgroundColor = e.target.value;
        });

        input.addEventListener('blur', () => input.remove());

        document.body.appendChild(input);
        input.click();
    }

    /**
     * Start inline rename
     * @param {string} layerId - Layer ID
     * @param {HTMLElement} nameEl - Name element
     */
    startRename(layerId, nameEl) {
        const layer = this.layerManager.layers.get(layerId);
        if (!layer) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = layer.name;
        input.className = 'cad-layer-rename-input';

        const finishRename = () => {
            const newName = input.value.trim();
            if (newName && newName !== layer.name) {
                this.layerManager.renameLayer(layerId, newName);
            }
            this.render(); // Re-render to restore name element
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishRename();
            } else if (e.key === 'Escape') {
                this.render(); // Cancel and re-render
            }
        });

        nameEl.replaceWith(input);
        input.focus();
        input.select();
    }
}

export default LayerPanel;
