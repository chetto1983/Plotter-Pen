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
      <div class="cad-panel-section cad-panel-fill cad-panel-collapsible" id="plcPanel">
        <div class="cad-panel-header cad-panel-header-collapsible" id="plcPanelHeader">
           <div class="cad-panel-header-title">
              <button type="button" class="cad-panel-collapse-btn" id="btnCollapsePLC" title="Espandi/Comprimi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="8" x2="8" y2="16" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="16" y1="8" x2="16" y2="16" /></svg>
              <span>Output PLC</span>
           </div>
           <div class="cad-panel-actions">
              <button type="button" class="cad-icon-btn-sm" id="btnPLCSettings" title="Impostazioni">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
              <button type="button" class="cad-icon-btn-sm" id="btn3DToggle" title="Vista 3D"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnSimulate" title="Simula 3D"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnCopyOutput" title="Copia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button>
              <button type="button" class="cad-icon-btn-sm" id="btnDownloadOutput" title="Scarica"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></button>
           </div>
        </div>
        <div class="cad-panel-body-collapsible" id="plcPanelBody">
          <!-- The job and the operation of its active step (JobManager, CAMOperationManager) -->
          <div class="cam-op" id="camOperation">
            <!-- The job being run: one step at a time, sent when the operator says so (JobRunner) -->
            <div class="cam-run" id="camRun" hidden>
              <div class="cam-run-title" id="camRunTitle"></div>
              <div class="cam-run-text" id="camRunText"></div>
              <label class="cam-run-mounted" id="camRunMountedField" hidden><input type="checkbox" id="camRunMounted"> <span id="camRunMountedLabel"></span></label>
              <div class="cam-run-actions">
                <button type="button" class="cam-run-primary" id="camRunSend" hidden></button>
                <button type="button" class="cam-run-primary" id="camRunDone" hidden></button>
                <button type="button" class="cam-run-primary" id="camRunRetry" hidden>Riprova</button>
                <button type="button" class="cam-run-secondary" id="camRunClose" hidden>Chiudi</button>
                <button type="button" class="cam-run-stop" id="camRunStop" hidden>Ferma</button>
              </div>
              <div class="cam-run-note" id="camRunNote">Ferma chiude il lavoro nell'app ma non arresta la macchina: per quello usa l'arresto della macchina.</div>
            </div>
            <div class="cam-job" id="camJob">
              <div class="cam-job-bar">
                <span class="cam-job-title">Lavoro</span>
                <div class="cam-job-actions">
                  <button type="button" class="cam-job-btn cam-job-run" id="camJobRun" title="Esegui lavoro">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  </button>
                  <div class="cam-job-add">
                    <button type="button" class="cam-job-btn" id="camJobAdd" title="Aggiungi passo" aria-haspopup="menu" aria-expanded="false">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <div class="cam-job-menu" id="camJobMenu" role="menu" hidden>
                      <button type="button" role="menuitem" data-operation="drill">Foratura</button>
                      <button type="button" role="menuitem" data-operation="profile">Profilo</button>
                      <button type="button" role="menuitem" data-operation="pen">Penna</button>
                    </div>
                  </div>
                  <button type="button" class="cam-job-btn" id="camJobDuplicate" title="Duplica passo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                  <button type="button" class="cam-job-btn" id="camJobUp" title="Sposta su">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button type="button" class="cam-job-btn" id="camJobDown" title="Sposta giù">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <button type="button" class="cam-job-btn cam-job-remove" id="camJobRemove" title="Elimina passo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
              <!-- One row per step, in cutting order; the active one is edited below -->
              <ol class="cam-job-steps" id="camJobSteps" aria-label="Passi del lavoro"></ol>
            </div>
            <label class="cam-op-field cam-op-layer">Livello
              <select id="camStepLayer"></select>
            </label>
            <div class="cam-op-bar">
              <div class="cam-op-tabs" role="radiogroup" aria-label="Operazione">
                <button type="button" class="cam-op-tab" role="radio" data-operation="pen">Penna</button>
                <button type="button" class="cam-op-tab" role="radio" data-operation="profile">Profilo</button>
                <button type="button" class="cam-op-tab" role="radio" data-operation="drill">Foratura</button>
              </div>
              <button type="button" class="cam-op-toggle" id="camParamsToggle" aria-expanded="true" title="Mostra/Nascondi parametri" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
            <!-- What the operation works on: the selection, or the visible layers -->
            <div class="cam-op-area" id="camOperationArea" hidden></div>
            <!-- While the parameters are collapsed: one line with their values, touched to open them -->
            <button type="button" class="cam-op-summary" id="camParamsSummary" title="Mostra parametri" hidden></button>
            <!-- The piece on the bed; Passante and Profondità belong to the active operation -->
            <div class="cam-op-params" data-operation="profile drill" hidden>
              <label class="cam-op-field">Spessore
                <span class="cam-op-input"><input type="number" id="camThickness" min="0.1" max="200" step="0.1"><span>mm</span></span>
              </label>
              <label class="cam-op-field" id="camOvercutField" title="Quanto il taglio passante scende sotto il pezzo, nel piano martire">Sfondamento
                <span class="cam-op-input"><input type="number" id="camOvercut" min="0" max="5" step="0.1"><span>mm</span></span>
              </label>
              <label class="cam-op-field" id="camDepthField" title="Dalla superficie del pezzo" hidden>Profondità
                <span class="cam-op-input"><input type="number" id="camDepth" min="0.1" max="200" step="0.1"><span>mm</span></span>
              </label>
              <label class="cam-op-check" title="Attraversa il pezzo e scende dello sfondamento nel piano"><input type="checkbox" id="camThrough"> Passante</label>
            </div>
            <div class="cam-op-params" data-operation="profile" hidden>
              <label class="cam-op-field">Fresa Ø
                <span class="cam-op-input"><input type="number" id="camToolDiameter" min="0.1" max="50" step="0.1"><span>mm</span><button type="button" class="cam-op-tools" data-diameter="toolDiameter" title="Libreria utensili">&#9881;</button></span>
              </label>
              <label class="cam-op-field">Lato
                <select id="camSide"><option value="outside">Esterno</option><option value="inside">Interno</option><option value="on">Sulla linea</option></select>
              </label>
              <label class="cam-op-field">Verso
                <select id="camDirection"><option value="conventional">Discorde</option><option value="climb">Concorde</option></select>
              </label>
              <label class="cam-op-field" title="Chiude i contorni dove gli estremi distano fino a questa larghezza; 0 unisce solo quelli che si toccano">Chiudi aperture
                <span class="cam-op-input"><input type="number" id="camCloseGap" min="0" max="1" step="0.01"><span>mm</span></span>
              </label>
            </div>
            <div class="cam-op-params" data-operation="drill" hidden>
              <label class="cam-op-field">Punta Ø
                <span class="cam-op-input"><input type="number" id="camDrillDiameter" min="0.1" max="50" step="0.1"><span>mm</span><button type="button" class="cam-op-tools" data-diameter="drillDiameter" title="Libreria utensili">&#9881;</button></span>
              </label>
              <label class="cam-op-field" title="0 = un solo affondo">Scarico
                <span class="cam-op-input"><input type="number" id="camPeckDepth" min="0" max="50" step="0.1"><span>mm</span></span>
              </label>
              <label class="cam-op-field">Angolo
                <span class="cam-op-input"><input type="number" id="camTipAngle" min="1" max="180" step="1"><span>°</span></span>
              </label>
              <label class="cam-op-field">Fori da Ø
                <span class="cam-op-input"><input type="number" id="camMinHoleDiameter" min="0.01" max="100" step="0.1"><span>mm</span></span>
              </label>
              <label class="cam-op-field">a Ø
                <span class="cam-op-input"><input type="number" id="camMaxHoleDiameter" min="0.01" max="100" step="0.1"><span>mm</span></span>
              </label>
              <label class="cam-op-check" title="La punta scende della sua lunghezza, così il diametro pieno arriva al fondo del foro"><input type="checkbox" id="camTipThrough"> Compensa punta</label>
            </div>
            <div class="cam-op-message" id="camOperationMessage" hidden></div>
          </div>
          <div class="cad-panel-content cad-output-content">
            <div class="cad-output-grid" id="outputGrid">
              <div class="cad-output-empty">Disegna primitive per generare i comandi PLC</div>
            </div>
          </div>
        </div>
        <!-- Hidden inputs that store current values (for backward compatibility) -->
        <input type="hidden" id="simWorkSpeed" value="100">
        <input type="hidden" id="simRapidSpeed" value="1000">
        <input type="hidden" id="simSafeZ" value="5">
        <input type="hidden" id="simWorkZ" value="0">
        <input type="hidden" id="simWaitTime" value="0">
        <input type="hidden" id="simStepDown" value="0.5">
        <input type="hidden" id="simPlungeSpeed" value="5">
        <input type="hidden" id="simRampAngle" value="3">
        <input type="hidden" id="simRetractClearance" value="1">
      </div>
        `;
        return aside;
    }
}
