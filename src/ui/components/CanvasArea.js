export class CanvasArea {
    constructor() {
        this.element = this.create();
    }

    create() {
        const div = document.createElement('div');
        div.className = 'cad-canvas-container';

        div.innerHTML = `
      <canvas id="cadCanvas"></canvas>
      <div class="cad-canvas-overlay" id="canvasOverlay"></div>
      <div class="cad-selection-box" id="selectionBox"></div>

      <!-- Floating Edit Toolbar -->
      <div class="cad-float-toolbar" id="floatToolbar">
        <!-- Rotate -->
        <div class="cad-float-group">
          <button type="button" class="cad-float-btn" id="ftRotateCCW" title="Ruota CCW (Q)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 2v6h6"/><path d="M2.5 8C5 4 9 2 13.5 2a9.5 9.5 0 110 19c-4 0-7-2-9-5"/></svg></button>
          <div class="cad-float-input-wrap"><input type="number" id="ftRotateAngle" class="cad-float-input" value="90" min="1" max="360" step="1"><span class="cad-float-unit">°</span></div>
          <button type="button" class="cad-float-btn" id="ftRotateCW" title="Ruota CW"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M21.5 8C19 4 15 2 10.5 2A9.5 9.5 0 1010.5 21c4 0 7-2 9-5"/></svg></button>
        </div>
        <div class="cad-float-divider"></div>
        <!-- Mirror -->
        <button type="button" class="cad-float-btn" id="ftMirrorX" title="Specchia X"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M17 7l4 5-4 5"/><path d="M7 7l-4 5 4 5"/></svg></button>
        <button type="button" class="cad-float-btn" id="ftMirrorY" title="Specchia Y"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="M7 7l5-4 5 4"/><path d="M7 17l5 4 5-4"/></svg></button>
        <div class="cad-float-divider"></div>
        <!-- Scale -->
        <div class="cad-float-group">
          <button type="button" class="cad-float-btn" id="ftScaleDown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
          <div class="cad-float-input-wrap"><input type="number" id="ftScaleFactor" class="cad-float-input" value="1.5" min="0.1" max="10" step="0.1"><span class="cad-float-unit">x</span></div>
          <button type="button" class="cad-float-btn" id="ftScaleUp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
        </div>
        <div class="cad-float-divider"></div>
        <!-- Move -->
        <div class="cad-float-group">
            <span class="cad-float-label">Sposta</span>
            <div class="cad-float-input-wrap"><input type="number" id="ftMoveX" class="cad-float-input cad-float-input-sm" value="0"><span class="cad-float-unit">X</span></div>
            <div class="cad-float-input-wrap"><input type="number" id="ftMoveY" class="cad-float-input cad-float-input-sm" value="0"><span class="cad-float-unit">Y</span></div>
            <button type="button" class="cad-float-btn cad-float-btn-sm" id="ftMoveApply"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
        </div>
         <div class="cad-float-divider"></div>
         <!-- Actions -->
         <button type="button" class="cad-float-btn" id="ftCopy" title="Copia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
         <button type="button" class="cad-float-btn cad-float-btn-danger" id="ftDelete" title="Elimina"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
      </div>
        `;
        return div;
    }
}
