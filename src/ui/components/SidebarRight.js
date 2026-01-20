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
              <input type="number" id="simWorkZ" class="cad-number-input" min="-50" max="50" step="0.5" value="0" placeholder="0"><span class="cad-speed-unit">mm</span>
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
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
           <span>CAM Output</span>
           <div class="cad-panel-actions">
              <button type="button" class="cad-icon-btn-sm" id="btnCamSimulate" title="Simula 3D"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnCamCopyPLC" title="Copia PLC"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnCamDownloadPLC" title="Scarica PLC"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnCamSendPLC" title="Invia PLC"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
           </div>
        </div>
        <div class="cad-panel-content cam-panel-content-flex">
           <!-- Operations List -->
           <div id="camOperationsList" class="cam-ops-list"></div>

           <!-- Tabs: Preview / G-Code / PLC -->
           <div class="cad-tabs-small cam-tabs-bottom">
             <button class="cad-tab-sm active" data-subtab="preview">3D</button>
             <button class="cad-tab-sm" data-subtab="code">G-Code</button>
             <button class="cad-tab-sm" data-subtab="plc">PLC</button>
           </div>

           <!-- 3D Preview Tab -->
           <div id="cam-subtab-preview" class="cam-subtab-sm active">
             <div class="cad-cam-preview-container-sm" style="position:relative;">
                <canvas id="camPreviewCanvas"></canvas>
                <!-- Playback Controls -->
                <div class="cad-3d-controls cam-3d-controls" style="position:absolute; bottom:8px; left:50%; transform:translateX(-50%); display:flex; gap:4px; background:rgba(0,0,0,0.7); padding:4px 8px; border-radius:4px;">
                   <button type="button" class="cad-3d-btn" id="btnCam3DPlay" title="Play/Pause">▶</button>
                   <button type="button" class="cad-3d-btn" id="btnCam3DStep" title="Step">⏭</button>
                   <button type="button" class="cad-3d-btn" id="btnCam3DReset" title="Reset">⏮</button>
                   <input type="range" id="camSim3DSpeed" min="0.1" max="10" step="0.1" value="1" style="width:60px;">
                   <span id="camSim3DSpeedLabel" style="color:#fff; font-size:11px; min-width:30px;">1.0x</span>
                </div>
                <!-- Expand Button -->
                <button type="button" id="btnCamExpandPreview" title="Schermo Intero" style="position:absolute; top:8px; right:8px; z-index:10; background:rgba(0,0,0,0.6); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:4px; cursor:pointer; padding:4px; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px;"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                </button>
                <!-- Progress Bar -->
                <div class="cad-3d-progress" style="position:absolute; bottom:0; left:0; right:0; height:3px; background:rgba(0,0,0,0.5);">
                   <div class="cad-3d-progress-bar cam-3d-progress-bar" style="height:100%; width:0%; background:var(--accent, #3b82f6);"></div>
                </div>
             </div>
           </div>

           <!-- G-Code Tab -->
           <div id="cam-subtab-code" class="cam-subtab-sm" hidden>
              <div id="gcodeContainer" class="cad-gcode-editor-sm cad-gcode-fancy-container"></div>
           </div>

           <!-- PLC Output Tab -->
           <div id="cam-subtab-plc" class="cam-subtab-sm" hidden>
              <div class="cad-output-grid" id="camPLCOutput">
                <div class="cad-output-empty">Genera CAM per vedere i comandi PLC</div>
              </div>
           </div>
        </div>

        <!-- CAM Settings Controls -->
        <div class="cad-simulation-controls" id="camSettingsControls">
          <div class="cad-speed-controls">
            <div class="cad-speed-group">
              <label for="camFeedXY" class="cad-speed-label">Feed:</label>
              <input type="number" id="camFeedXY" class="cad-number-input" min="10" max="5000" step="50" value="1000" placeholder="1000"><span class="cad-speed-unit">mm/m</span>
            </div>
            <div class="cad-speed-group">
              <label for="camFeedZ" class="cad-speed-label">FeedZ:</label>
              <input type="number" id="camFeedZ" class="cad-number-input" min="10" max="1000" step="10" value="200" placeholder="200"><span class="cad-speed-unit">mm/m</span>
            </div>
            <div class="cad-speed-group">
              <label for="camSafeZ" class="cad-speed-label">SafeZ:</label>
              <input type="number" id="camSafeZ" class="cad-number-input" min="0" max="100" step="1" value="5" placeholder="5"><span class="cad-speed-unit">mm</span>
            </div>
            <div class="cad-speed-group">
              <label for="camToolDia" class="cad-speed-label">Tool:</label>
              <input type="number" id="camToolDia" class="cad-number-input" min="0.1" max="50" step="0.1" value="3" placeholder="3"><span class="cad-speed-unit">mm</span>
            </div>
          </div>
        </div>
      </div>
        `;
        return aside;
    }
}
