export class Ribbon {
    constructor() {
        this.element = this.create();
        this.bindEvents();
    }

    create() {
        const div = document.createElement('div');
        div.className = 'cad-ribbon';
        div.innerHTML = `
    <div class="cad-ribbon-tabs">
      <button class="ribbon-tab active" data-tab="home">Home</button>
      <button class="ribbon-tab" data-tab="view">Vista & File</button>
    </div>

    <div class="cad-ribbon-content">
      <!-- HOME TAB -->
      <div id="tab-home" class="ribbon-panel active">
        <!-- DRAW GROUP -->
        <div class="cad-toolbar-group">
          <div class="cad-toolbar-buttons">
            <button type="button" class="cad-tool-btn" data-tool="line" title="Linea (L)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4" /></svg>
              <span>Linea</span>
            </button>
            
            <div class="cad-tool-dropdown">
              <button type="button" class="cad-tool-btn" data-tool="arc" title="Arco (A)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18 A 10 10 0 0 1 20 18" /></svg>
                <span>Arco</span>
                <svg class="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div class="cad-dropdown-menu">
                <button type="button" class="cad-dropdown-item" data-arc-mode="3p"><span>3 Punti</span></button>
                <button type="button" class="cad-dropdown-item" data-arc-mode="cse"><span>Centro, Inizio, Fine</span></button>
                <button type="button" class="cad-dropdown-item" data-arc-mode="seb"><span>Inizio, Fine, Bulge</span></button>
              </div>
            </div>

            <button type="button" class="cad-tool-btn" data-tool="circle" title="Cerchio (C)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
              <span>Cerchio</span>
            </button>
            <button type="button" class="cad-tool-btn" data-tool="rectangle" title="Rettangolo (R)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" /></svg>
              <span>Rettangolo</span>
            </button>
            <button type="button" class="cad-tool-btn" data-tool="polygon" title="Poligono (P)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,3 21,9 18,20 6,20 3,9" /></svg>
              <span>Poligono</span>
            </button>
          </div>
          <span class="cad-toolbar-label">Disegno</span>
        </div>

        <!-- MODIFY GROUP -->
        <div class="cad-toolbar-group">
          <div class="cad-toolbar-buttons">
            <button type="button" class="cad-tool-btn" data-tool="select" title="Seleziona (S)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3 L 10 21 L 13 13 L 21 10 Z" /></svg>
              <span>Seleziona</span>
            </button>
            <div class="cad-toolbar-divider"></div>
            <button type="button" class="cad-tool-btn" data-tool="fillet" title="Raccordo (F)">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20v-8a8 8 0 018-8h8" /></svg>
               <span>Raccordo</span>
            </button>
            <button type="button" class="cad-tool-btn" data-tool="chamfer" title="Cimatura">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20v-6l6-6h10" /></svg>
               <span>Cimatura</span>
            </button>
            <button type="button" class="cad-tool-btn" data-tool="trim" title="Taglia (T)">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-dasharray="4 4" /><path d="M21 21L15 15" stroke="red" stroke-width="3" /></svg>
               <span>Taglia</span>
            </button>
             <button type="button" class="cad-tool-btn" data-tool="array" title="Serie">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></svg>
              <span>Serie</span>
            </button>
             <div class="cad-toolbar-divider"></div>
            <button type="button" class="cad-tool-btn" data-tool="delete" title="Elimina (DEL)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              <span>Elimina</span>
            </button>
          </div>
          <span class="cad-toolbar-label">Modifica</span>
        </div>

        <!-- ANNOTATE GROUP -->
        <div class="cad-toolbar-group">
            <div class="cad-toolbar-buttons">
                <button type="button" class="cad-tool-btn" data-tool="dimension" title="Lineare">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M4 12v-3M20 12v-3M7 7l-3 5 3 5M17 7l3 5-3 5" /></svg>
                   <span>Lineare</span>
                </button>
                <button type="button" class="cad-tool-btn" data-tool="angular_dimension" title="Angolare">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 19H5V5" stroke-dasharray="2 2" /><path d="M5 12a7 7 0 0 1 7 7" /></svg>
                    <span>Angolare</span>
                </button>
                <button type="button" class="cad-tool-btn" data-tool="radius_dimension" title="Raggio">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7" /><path d="M12 12l5-5" /></svg>
                    <span>Raggio</span>
                </button>
            </div>
             <span class="cad-toolbar-label">Annotazioni</span>
        </div>
        
         <!-- Output -->
         <div class="cad-toolbar-group">
            <div class="cad-toolbar-buttons">
                <button type="button" class="cad-tool-btn" id="btnSendPLC" title="Invia a PLC">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    <span>PLC</span>
                </button>
                <button type="button" class="cad-tool-btn" id="btnOpenPLCConfig" title="Config PLC/OPC UA">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>
                    <span>Config</span>
                </button>
            </div>
            <span class="cad-toolbar-label">Output</span>
         </div>
      </div>

      <!-- VIEW TAB -->
      <div id="tab-view" class="ribbon-panel">
         <div class="cad-toolbar-group">
             <div class="cad-toolbar-buttons">
                <button type="button" class="cad-tool-btn" id="btnZoomIn" title="Zoom In"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg><span>Zoom In</span></button>
                <button type="button" class="cad-tool-btn" id="btnZoomOut" title="Zoom Out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg><span>Zoom Out</span></button>
                <button type="button" class="cad-tool-btn" id="btnZoomFit" title="Estensioni"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg><span>Estensioni</span></button>
                <div class="cad-toolbar-divider"></div>
                <button type="button" class="cad-tool-btn" id="btnUndo" title="Annulla"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a5 5 0 015 5v2" /><polyline points="3 10 8 5 3 10 8 15" /></svg><span>Annulla</span></button>
                <button type="button" class="cad-tool-btn" id="btnRedo" title="Ripeti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H11a5 5 0 00-5 5v2" /><polyline points="21 10 16 5 21 10 16 15" /></svg><span>Ripeti</span></button>
             </div>
             <span class="cad-toolbar-label">Vista</span>
         </div>
         <div class="cad-toolbar-separator"></div>
         <div class="cad-toolbar-group">
            <div class="cad-toolbar-buttons">
                <button type="button" class="cad-tool-btn" id="btnSave" title="Salva"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg><span>Salva</span></button>
                <label for="fileInput" class="cad-tool-btn" title="Apri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg><span>Apri</span></label>
                <input type="file" id="fileInput" accept=".dxf,.svg,.json" style="display:none">
                <button type="button" class="cad-tool-btn" id="btnExportDXF" title="Esporta DXF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg><span>Esporta</span></button>
                <button type="button" class="cad-tool-btn" id="btnClear" title="Pulisci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg><span>Pulisci</span></button>
            </div>
            <span class="cad-toolbar-label">File</span>
         </div>
      </div>
    </div>
        `;
        return div;
    }

    bindEvents() {
        // Tab Switching Logic Internal (or external)
        this.element.querySelectorAll('.ribbon-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;

                // Active Tab Class
                this.element.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Active Panel
                this.element.querySelectorAll('.ribbon-panel').forEach(p => {
                    p.classList.remove('active');
                    p.style.display = ''; // Reset display
                });
                const panel = this.element.querySelector(`#tab-${tabId}`);
                if (panel) panel.classList.add('active');

                // Dispatch Custom Event for Panel Switching (e.g. for App to toggle RightSidebar)
                this.element.dispatchEvent(new CustomEvent('tab-change', { detail: { tab: tabId }, bubbles: true }));
            });
        });
    }
}
