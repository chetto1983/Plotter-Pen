export class SidebarRight {
    constructor() {
        this.element = this.create();
    }

    create() {
        const aside = document.createElement('aside');
        aside.className = 'cad-panel cad-panel-right';
        aside.id = 'rightPanel';

        aside.innerHTML = `
      <!-- PLC PANEL -->
      <div class="cad-panel-section cad-panel-fill" id="plcPanel">
        <div class="cad-panel-header">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="8" x2="8" y2="16" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="16" y1="8" x2="16" y2="16" /></svg>
           <span>Output PLC</span>
           <div class="cad-panel-actions">
              <button type="button" class="cad-icon-btn-sm" id="btn3DToggle" title="Vista 3D"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnSimulate" title="Simula 3D"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnCopyOutput" title="Copia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnDownloadOutput" title="Scarica"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></button>
           </div>
        </div>
        <div class="cad-panel-content cad-output-content">
          <div class="cad-output-grid" id="outputGrid">
            <div class="cad-output-empty">Disegna primitive per generare i comandi PLC</div>
          </div>
        </div>
        <div class="cad-simulation-controls" id="simulationControls">
          <div class="cad-speed-controls">
            <div class="cad-speed-group">
              <label for="simWorkSpeed" class="cad-speed-label">Work:</label>
              <input type="number" id="simWorkSpeed" class="cad-number-input" min="10" max="1000" step="10" value="100" placeholder="100"><span class="cad-speed-unit">mm/s</span>
            </div>
            <div class="cad-speed-group">
              <label for="simRapidSpeed" class="cad-speed-label">Rapid:</label>
              <input type="number" id="simRapidSpeed" class="cad-number-input" min="10" max="5000" step="100" value="1000" placeholder="1000"><span class="cad-speed-unit">mm/s</span>
            </div>
            <div class="cad-speed-group">
              <label for="simSafeZ" class="cad-speed-label">SafeZ:</label>
              <input type="number" id="simSafeZ" class="cad-number-input" min="0" max="100" step="1" value="5" placeholder="5"><span class="cad-speed-unit">mm</span>
            </div>
            <div class="cad-speed-group">
              <label for="simWorkZ" class="cad-speed-label">WorkZ:</label>
              <input type="number" id="simWorkZ" class="cad-number-input" min="-50" max="0" step="0.5" value="-2" placeholder="-2"><span class="cad-speed-unit">mm</span>
            </div>
            <div class="cad-speed-group">
              <label for="simWaitTime" class="cad-speed-label">Wait:</label>
              <input type="number" id="simWaitTime" class="cad-number-input" min="0" max="5000" step="50" value="0" placeholder="0"><span class="cad-speed-unit">ms</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CAM PANEL (Initially Hidden via switch logic) -->
      <div class="cad-panel-section cad-panel-fill cam-panel-container" id="camPanel" style="display:none">
        <div class="cad-panel-header">
           <span class="cad-header-label">CAM Output</span>
        </div>
        <div class="cad-panel-content cam-panel-content-flex">
           <!-- Content injected by CAMManager -->
           <div id="camOperationsList"></div>
           
           <div class="cad-tabs-small cam-tabs-bottom">
             <button class="cad-tab-sm active" data-subtab="preview">3D Preview</button>
             <button class="cad-tab-sm" data-subtab="code">G-Code</button>
           </div>
           
           <div id="cam-subtab-preview" class="cam-subtab-sm active">
             <div class="cad-cam-preview-container-sm" style="position:relative;">
                <canvas id="camPreviewCanvas"></canvas>
                <button type="button" id="btnCamExpandPreview" title="Schermo Intero" style="position:absolute; top:8px; right:8px; z-index:10; background:rgba(0,0,0,0.6); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:4px; cursor:pointer; padding:4px; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px;"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                </button>
             </div>
           </div>
           <div id="cam-subtab-code" class="cam-subtab-sm" hidden>
              <div id="gcodeContainer" class="cad-gcode-editor-sm cad-gcode-fancy-container"></div>
           </div>
        </div>
      </div>
        `;
        return aside;
    }
}
