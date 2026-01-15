export class Footer {
    constructor() {
        this.element = this.create();
    }

    create() {
        const docFrag = document.createDocumentFragment();

        // Command Bar
        const cmdBar = document.createElement('div');
        cmdBar.className = 'cad-command-bar';
        cmdBar.id = 'commandBar';
        cmdBar.innerHTML = `
    <div class="cad-command-autocomplete" id="commandAutocomplete"></div>
    <div class="cad-command-prompt">
      <span class="cad-prompt-symbol">&gt;</span>
      <input type="text" id="commandInput" class="cad-command-input" placeholder="Digita comando o coordinate..." autocomplete="off" spellcheck="false">
    </div>
    <div class="cad-command-hint" id="commandHint">Digita un comando (es: LINE, CIRCLE) o premi TAB</div>
        `;

        // Status Bar
        const status = document.createElement('footer');
        status.className = 'cad-statusbar';
        status.innerHTML = `
    <div class="cad-status-left">
      <span class="cad-status-tool" id="statusTool">Nessuno strumento</span>
      <span class="cad-status-divider">|</span>
      <span class="cad-status-mode" id="statusMode">Ortho: OFF</span>
    </div>
    <div class="cad-status-center">
      <span id="statusMessage">Pronto</span>
    </div>
    <div class="cad-status-right">
      <span class="cad-status-zoom" id="statusZoom">100%</span>
      <span class="cad-status-divider">|</span>
      <span class="cad-status-coords">
        <span id="statusX">X: 0.00</span>
        <span id="statusY">Y: 0.00</span>
      </span>
    </div>
        `;

        docFrag.appendChild(cmdBar);
        docFrag.appendChild(status);

        return docFrag;
    }
}
