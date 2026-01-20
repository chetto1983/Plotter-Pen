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
        <!-- PLC Selection -->
        <fieldset class="cad-fieldset"><legend>Seleziona PLC</legend>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row" style="flex:2">
            <label for="plcSelector">PLC Attivo</label>
            <select id="plcSelector" name="plcSelector" class="cad-modal-select"></select>
          </div>
          <div class="cad-input-row" style="flex:1; align-self:flex-end">
            <div style="display:flex;gap:4px">
              <button type="button" class="cad-btn-outline" id="btnNewPLC" title="Nuovo PLC">+</button>
              <button type="button" class="cad-btn-outline" id="btnDeletePLC" title="Elimina PLC">&times;</button>
            </div>
          </div>
        </div>
        <div class="cad-input-row">
          <label for="plcName">Nome PLC</label>
          <input type="text" id="plcName" name="plcName" placeholder="Siemens S7-1500" class="cad-modal-input" />
        </div>
        </fieldset>
        <!-- Connection Section -->
        <fieldset class="cad-fieldset"><legend>Connessione</legend>
        <div class="cad-input-row">
          <label for="endpoint">Endpoint OPC UA</label>
          <input type="text" id="endpoint" name="endpoint" required placeholder="opc.tcp://192.168.1.100:4840" class="cad-modal-input" />
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row">
            <label for="securityMode">Sicurezza</label>
            <select id="securityMode" name="securityMode" class="cad-modal-select">
              <option value="None">Nessuna</option>
              <option value="Sign">Sign</option>
              <option value="SignAndEncrypt">SignAndEncrypt</option>
            </select>
          </div>
          <div class="cad-input-row">
            <label for="securityPolicy">Policy</label>
            <select id="securityPolicy" name="securityPolicy" class="cad-modal-select">
              <option value="None">Nessuna</option>
              <option value="Basic256">Basic256</option>
              <option value="Basic256Sha256">Basic256Sha256</option>
            </select>
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="admin" autocomplete="username" class="cad-modal-input" />
          </div>
          <div class="cad-input-row">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="••••••••" autocomplete="current-password" class="cad-modal-input" />
          </div>
        </div>
        </fieldset>
        <!-- Position Nodes Section -->
        <fieldset class="cad-fieldset"><legend>Nodi Posizione (Lettura)</legend>
        <div class="cad-modal-cols-3">
          <div class="cad-input-row">
            <label for="positionXNode">Pos.X</label>
            <input type="text" id="positionXNode" name="positionXNode" placeholder="ns=4;i=80" class="cad-modal-input" />
          </div>
          <div class="cad-input-row">
            <label for="positionYNode">Pos.Y</label>
            <input type="text" id="positionYNode" name="positionYNode" placeholder="ns=4;i=81" class="cad-modal-input" />
          </div>
          <div class="cad-input-row">
            <label for="positionZNode">Pos.Z</label>
            <input type="text" id="positionZNode" name="positionZNode" placeholder="ns=4;i=82" class="cad-modal-input" />
          </div>
        </div>
        </fieldset>
        <!-- Chunked Transfer Nodes Section -->
        <fieldset class="cad-fieldset"><legend>Nodi Trasferimento Chunk (Db_Punti)</legend>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row">
            <label for="pointArrayNode">PointArr (String[20])</label>
            <input type="text" id="pointArrayNode" name="pointArrayNode" required placeholder="ns=4;i=93" class="cad-modal-input" />
          </div>
          <div class="cad-input-row">
            <label for="triggerWriteNode">TriggerWrite</label>
            <input type="text" id="triggerWriteNode" name="triggerWriteNode" placeholder="ns=4;i=12" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row">
            <label for="readDoneNode">Trigger_read_done</label>
            <input type="text" id="readDoneNode" name="readDoneNode" placeholder="ns=4;i=23" class="cad-modal-input" />
          </div>
          <div class="cad-input-row">
            <label for="endOfFileNode">End_Of_File</label>
            <input type="text" id="endOfFileNode" name="endOfFileNode" placeholder="ns=4;i=34" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-modal-cols-2">
          <div class="cad-input-row">
            <label for="chunkSize">Chunk Size</label>
            <input type="number" id="chunkSize" name="chunkSize" min="1" max="100" value="20" class="cad-modal-input" />
          </div>
          <div class="cad-input-row">
            <label for="ackTimeout">ACK Timeout (ms)</label>
            <input type="number" id="ackTimeout" name="ackTimeout" min="100" max="30000" value="5000" class="cad-modal-input" />
          </div>
        </div>
        <div class="cad-input-row">
          <label for="pollInterval">Poll Interval (ms)</label>
          <input type="number" id="pollInterval" name="pollInterval" min="10" max="1000" value="100" class="cad-modal-input" />
        </div>
        </fieldset>
        <!-- Security Certificates -->
        <fieldset class="cad-fieldset"><legend>Certificati (per SignAndEncrypt)</legend>
        <div class="cad-input-row">
          <label>Stato</label>
          <span id="certStatus" style="color:var(--muted)">Non generati</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="cad-primary-btn" id="btnGenerateCert">Genera</button>
          <button type="button" class="cad-primary-btn cad-btn-outline" id="btnDownloadPem" disabled>PEM</button>
          <button type="button" class="cad-primary-btn cad-btn-outline" id="btnDownloadKey" disabled>KEY</button>
          <button type="button" class="cad-primary-btn cad-btn-outline" id="btnDownloadDer" disabled>DER (PLC)</button>
        </div>
        <p style="font-size:0.8em;color:var(--muted);margin-top:6px">
          Importare il file <code>.der</code> nella trust list del PLC.
        </p>
        </fieldset>
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
