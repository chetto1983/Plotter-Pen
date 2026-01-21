export class SidebarLeft {
    constructor() {
        this.element = this.create();
    }

    create() {
        const aside = document.createElement('aside');
        aside.className = 'cad-panel cad-panel-left';
        aside.id = 'leftPanel';

        aside.innerHTML = `
      <!-- Layer Panel -->
      <div class="cad-panel-section" id="layerPanel">
        <!-- Content rendered by LayerPanel.js -->
      </div>

      <!-- Workspace Panel - Collapsible -->
      <div class="cad-panel-section cad-panel-collapsible" id="workspacePanel">
        <div class="cad-panel-header cad-panel-header-collapsible" data-panel="workspacePanel">
          <div class="cad-panel-header-title">
            <button type="button" class="cad-panel-collapse-btn" title="Espandi/Comprimi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
            <span>Area di Lavoro</span>
          </div>
        </div>
        <div class="cad-panel-body-collapsible">
          <div class="cad-panel-content">
            <div class="cad-input-row">
              <label for="workspaceWidth">Larghezza (mm)</label>
              <input type="number" id="workspaceWidth" value="600" min="10" max="2000">
            </div>
            <div class="cad-input-row">
              <label for="workspaceHeight">Altezza (mm)</label>
              <input type="number" id="workspaceHeight" value="600" min="10" max="2000">
            </div>
          </div>
        </div>
      </div>

      <!-- Grid & Snap - Collapsible -->
      <div class="cad-panel-section cad-panel-collapsible" id="gridSnapPanel">
        <div class="cad-panel-header cad-panel-header-collapsible" data-panel="gridSnapPanel">
          <div class="cad-panel-header-title">
            <button type="button" class="cad-panel-collapse-btn" title="Espandi/Comprimi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v16H4zM4 9h16M4 14h16M9 4v16M14 4v16" /></svg>
            <span>Griglia & Snap</span>
          </div>
        </div>
        <div class="cad-panel-body-collapsible">
          <div class="cad-panel-content">
            <div class="cad-toggle-row">
              <label class="cad-toggle cad-toggle-touch">
                <input type="checkbox" id="showGrid" checked>
                <span class="cad-toggle-slider"></span>
                <span class="cad-toggle-label">Mostra griglia</span>
              </label>
            </div>
            <div class="cad-toggle-row">
              <label class="cad-toggle cad-toggle-touch">
                <input type="checkbox" id="snapGrid">
                <span class="cad-toggle-slider"></span>
                <span class="cad-toggle-label">Snap griglia</span>
              </label>
            </div>
            <div class="cad-toggle-row">
              <label class="cad-toggle cad-toggle-touch">
                <input type="checkbox" id="snapObjects" checked>
                <span class="cad-toggle-slider"></span>
                <span class="cad-toggle-label">Snap oggetti</span>
              </label>
            </div>
            <div class="cad-input-row">
              <label for="gridSpacing">Passo griglia (mm)</label>
              <input type="number" id="gridSpacing" value="10" min="1" max="100">
            </div>
          </div>
        </div>
      </div>

      <!-- Coordinates - Always visible (essential for CAD) -->
      <div class="cad-panel-section cad-panel-essential" id="coordPanel">
        <div class="cad-panel-header">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L12 22" /><path d="M2 12L22 12" /></svg>
           <span>Coordinate</span>
        </div>
        <div class="cad-panel-content">
           <div class="cad-coord-display">
             <div class="cad-coord-item"><span class="cad-coord-label">X</span><span class="cad-coord-value" id="coordX">0.00</span><span class="cad-coord-unit">mm</span></div>
             <div class="cad-coord-item"><span class="cad-coord-label">Y</span><span class="cad-coord-value" id="coordY">0.00</span><span class="cad-coord-unit">mm</span></div>
           </div>
           <div class="cad-snap-info" id="snapInfo"><span class="cad-snap-type">-</span></div>
        </div>
      </div>

      <!-- Stats - Collapsible (less essential) -->
      <div class="cad-panel-section cad-panel-collapsible cad-panel-secondary" id="statsPanel">
        <div class="cad-panel-header cad-panel-header-collapsible" data-panel="statsPanel">
          <div class="cad-panel-header-title">
            <button type="button" class="cad-panel-collapse-btn" title="Espandi/Comprimi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            <span>Statistiche</span>
          </div>
        </div>
        <div class="cad-panel-body-collapsible">
          <div class="cad-panel-content">
            <div class="cad-stats-grid">
              <div class="cad-stat-item"><span class="cad-stat-value" id="statLines">0</span><span class="cad-stat-label">Linee</span></div>
              <div class="cad-stat-item"><span class="cad-stat-value" id="statArcs">0</span><span class="cad-stat-label">Archi</span></div>
              <div class="cad-stat-item"><span class="cad-stat-value" id="statTotal">0</span><span class="cad-stat-label">Totale</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- OPC UA Status - Collapsible with config button -->
      <div class="cad-panel-section cad-panel-collapsible cad-opcua-section" id="opcuaPanel">
        <div class="cad-panel-header cad-panel-header-collapsible" data-panel="opcuaPanel">
          <div class="cad-panel-header-title">
            <button type="button" class="cad-panel-collapse-btn" title="Espandi/Comprimi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
            <span>OPC UA / PLC</span>
          </div>
          <div class="cad-panel-actions">
            <button type="button" class="cad-icon-btn-sm" id="btnOpenPLCConfig" title="Configurazione OPC UA">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>
        <div class="cad-panel-body-collapsible">
          <div class="cad-panel-content">
            <div class="cad-opcua-status" id="opcuaStatus">Disconnesso</div>
            <div class="cad-plc-position" id="plcPosition">X: 0.00 Y: 0.00 Z: 0.00</div>
            <div id="transferProgress" class="transfer-progress hidden">
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
              <span class="progress-text">0%</span>
              <button id="cancelTransfer" class="btn-cancel" title="Annulla trasferimento">✕</button>
            </div>
          </div>
        </div>
      </div>
        `;
        return aside;
    }
}
