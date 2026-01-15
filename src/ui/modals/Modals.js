export class Modals {
    constructor() {
        this.element = this.create();
    }

    create() {
        const container = document.createElement('div');
        container.id = 'modals-container'; // Wrapper

        container.innerHTML = `
<!-- ====================
     SHORTCUTS MODAL
     ==================== -->
<div class="cad-modal" id="shortcutsModal" hidden>
  <div class="cad-modal-content">
    <div class="cad-modal-header">
      <h2>Scorciatoie da Tastiera</h2>
      <button type="button" class="cad-modal-close" id="closeShortcuts">&times;</button>
    </div>
    <div class="cad-modal-body">
      <div class="cad-shortcuts-grid">
        <div class="cad-shortcut"><kbd>L</kbd> Linea</div>
        <div class="cad-shortcut"><kbd>A</kbd> Arco</div>
        <div class="cad-shortcut"><kbd>C</kbd> Cerchio</div>
        <div class="cad-shortcut"><kbd>R</kbd> Rettangolo</div>
        <div class="cad-shortcut"><kbd>P</kbd> Poligono</div>
        <div class="cad-shortcut"><kbd>S</kbd> Seleziona</div>
        <div class="cad-shortcut"><kbd>DEL</kbd> Elimina selezione</div>
        <div class="cad-shortcut"><kbd>Frecce</kbd> Sposta selezione</div>
        <div class="cad-shortcut"><kbd>Shift+Frecce</kbd> Sposta 10mm</div>
        <div class="cad-shortcut"><kbd>ESC</kbd> Annulla</div>
        <div class="cad-shortcut"><kbd>Ctrl+S</kbd> Salva disegno</div>
        <div class="cad-shortcut"><kbd>Ctrl+O</kbd> Apri disegno</div>
        <div class="cad-shortcut"><kbd>Ctrl+Z</kbd> Annulla azione</div>
        <div class="cad-shortcut"><kbd>Ctrl+Y</kbd> Ripeti azione</div>
        <div class="cad-shortcut"><kbd>+/-</kbd> Zoom In/Out</div>
        <div class="cad-shortcut"><kbd>F</kbd> Adatta vista</div>
        <div class="cad-shortcut"><kbd>G</kbd> Griglia On/Off</div>
        <div class="cad-shortcut"><kbd>F1</kbd> Aiuto</div>
      </div>
    </div>
  </div>
</div>

<!-- ====================
     CAM SETTINGS MODAL
     ==================== -->
<div class="cad-modal-overlay" id="camSettingsModal">
  <div class="cad-modal cad-modal-config">
    <div class="cad-modal-header">
      <h2 class="cad-modal-title">Impostazioni CAM</h2>
      <button type="button" class="cad-modal-close" id="btnCloseCamSettings">&times;</button>
    </div>
    <div class="cad-modal-body">
      <form id="camSettingsForm" novalidate class="cad-modal-form">
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full">
            <label for="camSafeZ">Safe Z (mm)</label>
            <input type="number" id="camSafeZ" name="camSafeZ" step="0.1" class="cad-modal-input" />
          </div>
          <div class="cad-input-row cad-col-full">
            <label for="camStartZ">Start Z (mm)</label>
            <input type="number" id="camStartZ" name="camStartZ" step="0.1" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full">
            <label for="camUnits">Unità</label>
            <select id="camUnits" name="camUnits" class="cad-modal-select">
              <option value="mm">mm</option>
              <option value="in">in</option>
            </select>
          </div>
          <div class="cad-input-row cad-col-full">
            <label for="camPrecision">Precisione</label>
            <input type="number" id="camPrecision" name="camPrecision" min="0" max="6" step="1" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full">
            <label for="camStepOver">Step Over (%)</label>
            <input type="number" id="camStepOver" name="camStepOver" min="1" max="100" step="1" value="40" class="cad-modal-input" />
          </div>
          <div class="cad-input-row cad-col-full">
            <label for="camStepDown">Step Down (mm)</label>
            <input type="number" id="camStepDown" name="camStepDown" step="0.1" value="1.0" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full">
            <label for="camProfileSide">Lato profilo</label>
            <select id="camProfileSide" name="camProfileSide" class="cad-modal-select">
              <option value="outside">Esterno</option>
              <option value="inside">Interno</option>
              <option value="online">In linea</option>
            </select>
          </div>
          <div class="cad-input-row cad-col-full">
            <label for="camTolerance">Tolleranza (mm)</label>
            <input type="number" id="camTolerance" name="camTolerance" min="0.01" max="10" step="0.01" class="cad-modal-input" title="Tolleranza unione segmenti" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full cam-tool-row">
            <div class="cam-tool-input-wrapper">
              <label for="camToolDiameter">Diametro Utensile (mm)</label>
              <input type="number" id="camToolDiameter" name="camToolDiameter" min="0.1" max="50" step="0.1" class="cad-modal-input" value="3.0" />
            </div>
            <button type="button" class="cad-btn-outline btn-manage-tools" id="btnManageTools" title="Gestisci Libreria Utensili"><span class="icon">&#9881;</span></button>
          </div>
        </div>
        <div class="cad-modal-actions-right">
          <button type="button" class="cad-primary-btn cad-btn-outline" id="btnCamSettingsCancel">Annulla</button>
          <button type="button" class="cad-primary-btn" id="btnCamSettingsApply">Applica</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- ====================
     TOOL LIBRARY MODAL
     ==================== -->
<div class="cad-modal-overlay" id="toolLibraryModal">
  <div class="cad-modal">
    <div class="tool-lib-header">
      <div class="tool-lib-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg> Libreria Utensili</div>
      <button type="button" class="tool-lib-close" id="btnCloseToolLibrary">&times;</button>
    </div>
    <div class="tool-lib-body">
      <div class="tool-lib-sidebar">
        <div class="tool-lib-list" id="toolListContainer"><div class="tool-lib-empty">Caricamento...</div></div>
      </div>
      <div class="tool-lib-main">
        <div>
          <div class="tool-lib-section-title">Dettagli Utensile</div>
          <div class="tool-form-grid">
            <div class="tool-input-group full-width">
              <label for="toolName">Nome Utensile</label>
              <input type="text" id="toolName" class="tool-input" placeholder="Es. 0.5mm Endmill">
            </div>
            <div class="tool-input-group">
              <label for="toolType">Tipo</label>
              <select id="toolType" class="tool-input tool-select">
                <option value="endmill">Fresa Piana (Endmill)</option>
                <option value="ballnose">Fresa Sferica (Ballnose)</option>
                <option value="vbit">Bulino (V-Bit)</option>
              </select>
            </div>
            <div class="tool-input-group">
              <label for="toolDiameter">Diametro (mm)</label>
              <input type="number" id="toolDiameter" class="tool-input" step="0.1" value="3.0">
            </div>
          </div>
        </div>
        <div class="tool-actions">
          <button type="button" class="btn-tool-delete" id="btnDeleteTool" disabled>Elimina</button>
          <button type="button" class="btn-tool-save" id="btnSaveTool">Salva Modifiche</button>
        </div>
        <button type="button" class="btn-tool-use" id="btnSelectToolFromLib">Usa Utensile Selezionato</button>
      </div>
    </div>
  </div>
</div>

<!-- ====================
     PLC CONFIG MODAL
     ==================== -->
<div class="cad-modal-overlay" id="plcConfigModal">
  <div class="cad-modal cad-modal-config">
    <div class="cad-modal-header">
      <h2 class="cad-modal-title">Parametri OPC UA</h2>
      <button type="button" class="cad-modal-close" id="btnClosePLCConfig">&times;</button>
    </div>
    <div class="cad-modal-body">
      <form id="plcConfigForm" novalidate class="cad-modal-form">
        <div class="cad-input-row cad-col-full">
          <label for="endpoint">Endpoint OPC UA</label>
          <input type="text" id="endpoint" name="endpoint" required placeholder="opc.tcp://192.168.1.100:4840" class="cad-modal-input" />
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full">
            <label for="nodeId">Node ID Target</label>
            <input type="text" id="nodeId" name="nodeId" required placeholder="ns=4;i=12" class="cad-modal-input" />
          </div>
          <div class="cad-input-row cad-col-full">
            <label for="triggerNodeId">Node ID Trigger</label>
            <input type="text" id="triggerNodeId" name="triggerNodeId" placeholder="ns=4;i=535" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row cad-col-full">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="admin" autocomplete="username" class="cad-modal-input" />
          </div>
          <div class="cad-input-row cad-col-full">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="••••••••" autocomplete="current-password" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
           <div class="cad-input-row cad-col-full">
              <label for="valueType">Tipo Valore</label>
              <select id="valueType" name="valueType" class="cad-modal-select">
                <option value="string_array">String Array</option>
                <option value="string">String</option>
                <option value="int_array">Int Array</option>
                <option value="float_array">Float Array</option>
                <option value="bool_array">Bool Array</option>
              </select>
           </div>
           <div class="cad-input-row cad-col-full">
              <label for="triggerResetDelayMs">Delay (ms)</label>
              <input type="number" id="triggerResetDelayMs" name="triggerResetDelayMs" placeholder="500" class="cad-modal-input" />
           </div>
        </div>
        <input type="hidden" name="arrayLength" value="100">
        <div id="configStatus" class="cad-modal-status" hidden></div>
        <div class="cad-modal-actions-right">
          <button type="button" class="cad-primary-btn cad-btn-outline" id="reloadConfigBtn">Ricarica</button>
          <button type="submit" class="cad-primary-btn">Salva Configurazione</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- ====================
     RESTORED SAVE MODAL
     ==================== -->
<div class="cad-modal-overlay" id="saveModal" hidden>
  <div class="cad-modal">
    <div class="cad-modal-header">
      <h2 class="cad-modal-title">Salva Disegno</h2>
      <button type="button" class="cad-modal-close" id="closeSaveModal">&times;</button>
    </div>
    <div class="cad-modal-body">
      <div class="cad-input-row">
         <label for="saveNameInput">Nome del Disegno</label>
         <input type="text" id="saveNameInput" class="cad-modal-input" placeholder="Il mio disegno">
      </div>
      <div class="cad-modal-actions-right" style="gap:10px; margin-top:20px;">
         <button type="button" class="cad-primary-btn cad-btn-outline" id="btnSaveFile">Scarica File (.json)</button>
         <button type="button" class="cad-primary-btn" id="btnSaveDb">Salva nel Database</button>
      </div>
    </div>
  </div>
</div>

<!-- ====================
     RESTORED LOAD MODAL
     ==================== -->
<div class="cad-modal-overlay" id="loadModal" hidden>
  <div class="cad-modal" style="min-width:500px">
    <div class="cad-modal-header">
      <h2 class="cad-modal-title">Apri Disegno</h2>
      <button type="button" class="cad-modal-close" id="closeLoadModal">&times;</button>
    </div>
    <div class="cad-modal-body">
       <div class="cad-tabs-small">
          <button class="cad-modal-tab active" data-tab="db">Database</button>
          <button class="cad-modal-tab" data-tab="file">File Locale</button>
       </div>
       
       <div id="loadTabDb" class="cad-tab-content" style="margin-top:10px; max-height:300px; overflow-y:auto; border:1px solid var(--border); border-radius:4px;">
          <div id="drawingList" class="cad-list"></div>
          <div id="drawingListEmpty" style="padding:20px; text-align:center; color:var(--muted); display:none">Nessun disegno salvato.</div>
       </div>
       
       <div id="loadTabFile" class="cad-tab-content" style="display:none; margin-top:10px; padding:20px; text-align:center; border:1px dashed var(--border); border-radius:4px;">
           <button type="button" class="cad-primary-btn" id="btnPickFile">Scegli File (.json / .dxf)</button>
           <p style="margin-top:10px; color:var(--muted); font-size:0.9em">Supporta JSON proprietario e DXF standard</p>
       </div>
    </div>
  </div>
</div>
        `;
        return container;
    }
}
