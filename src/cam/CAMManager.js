/**
 * CAM Manager
 * Handles the high-level CAM workflow, state management, and UI interaction.
 */
import { MachineConfig } from './MachineConfig.js';
import { ToolLibrary } from './ToolLibrary.js';
import { getModalManager } from '../ui/ModalManager.js';

export class CAMManager {
    constructor(app) {
        console.log('CAMManager: Initializing...');
        this.app = app; // Reference to main application
        this.machine = new MachineConfig();
        this.toolLibrary = new ToolLibrary();

        this.operations = [];
        this.jobSettings = {
            safeZ: this.machine.getSafetyHeight?.() ?? 5,
            startZ: 0,
            units: this.machine.units,
            gcode: {
                precision: this.machine.gcode?.precision ?? 3
            }
        };
        this.gcode = '';
        this.gcodeSource = '';
        this.gcodeDirty = false;
        this.gcodeEditing = false;
        this.previewData = null;
        this.parseRequestId = 0;
        this.plcRequestId = 0;

        // Initialize Viewer
        this.viewer = null;
        try {
            this.initViewer();
        } catch (e) {
            console.error('CAMManager: initViewer failed', e);
        }

        setTimeout(() => this.bindEvents(), 100); // Async bind to ensure DOM ready
    }

    initViewer() {
        const canvas = document.getElementById('camPreviewCanvas');
        if (!canvas || this.viewer) {
            return;
        }

        import('./Polar3DViewerAdapter.js')
            .then(module => {
                this.viewer = new module.Polar3DViewerAdapter(canvas);
                if (this.previewData) {
                    this.viewer.setParsedData(this.previewData);
                }
            })
            .catch((error) => {
                console.error('CAMManager: Failed to load Polar3D viewer', error);
            });
    }

    /**
     * Create operations from selected primitives
     * Uses PLC-style direct primitive access (no intermediate point extraction)
     * @param {string} type - 'profile' or 'pocket'
     */
    createOperationFromSelection(type) {
        const selection = this.app.selectedPrimitives;
        console.log('CAM Selection:', selection);
        if (!selection || selection.size === 0) {
            getModalManager().alert({ title: 'Attenzione', message: 'Nessuna geometria selezionata.' });
            return null;
        }

        const primitives = Array.from(selection);
        const newOps = [];
        const warnings = [];
        const unsupportedTypes = new Set();

        for (const prim of primitives) {
            if (!prim || !prim.type) continue;

            const op = this.primitiveToOperation(prim, type);
            if (op) {
                this.operations.push(op);
                newOps.push(op);
            } else {
                unsupportedTypes.add(prim.type);
            }
        }

        if (newOps.length === 0) {
            if (unsupportedTypes.size > 0) {
                const types = Array.from(unsupportedTypes).join(', ');
                getModalManager().alert({
                    title: 'Tipo non supportato',
                    message: `Al momento il CAM supporta: Poligoni, Rettangoli, Cerchi, Linee e Archi.\nIgnorati: ${types}`
                });
            } else {
                getModalManager().alert({
                    title: 'Geometria non valida',
                    message: 'Impossibile estrarre geometria valida dalla selezione.'
                });
            }
            return null;
        }

        if (unsupportedTypes.size > 0) {
            warnings.push(`Ignorati: ${Array.from(unsupportedTypes).join(', ')}`);
        }

        if (warnings.length > 0) {
            this.app.ui.updateStatus(warnings.join(' '));
        }

        return newOps;
    }

    /**
     * Convert a primitive directly to a CAM operation
     * Same approach as PLCOutputGenerator - read coordinates from primitive
     */
    primitiveToOperation(prim, type) {
        const baseOp = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} Op`,
            type: type,
            toolId: '1',
            startZ: this.jobSettings.startZ,
            targetZ: -1,
            stepDown: 1,
            side: type === 'profile' ? 'outside' : undefined
        };

        switch (prim.type) {
            case 'circle': {
                // Read directly from primitive (like PLC does)
                const cx = prim.center?.x ?? prim.cx;
                const cy = prim.center?.y ?? prim.cy;
                const radius = prim.radius ?? prim._radius;
                return {
                    ...baseOp,
                    circleData: { cx, cy, radius },
                    closed: true,
                    disableArcFit: false,
                    points: [] // Empty - circleData is primary
                };
            }

            case 'arc': {
                // Read directly from primitive
                return {
                    ...baseOp,
                    arc: {
                        x1: prim.x1,
                        y1: prim.y1,
                        x2: prim.x2,
                        y2: prim.y2,
                        cx: prim.cx,
                        cy: prim.cy,
                        clockwise: prim.isClockwise === true
                    },
                    closed: false,
                    disableArcFit: false,
                    points: []
                };
            }

            case 'line': {
                // Line as 2-point path
                return {
                    ...baseOp,
                    points: [
                        { x: prim.x1, y: prim.y1 },
                        { x: prim.x2, y: prim.y2 }
                    ],
                    closed: false,
                    disableArcFit: true
                };
            }

            case 'polygon': {
                // Read points directly from primitive
                if (!prim.points || prim.points.length < 3) return null;
                return {
                    ...baseOp,
                    points: prim.points.map(p => ({ x: p.x, y: p.y })),
                    closed: true,
                    disableArcFit: type === 'pocket'
                };
            }

            case 'polyline': {
                // Read points directly from primitive
                if (!prim.points || prim.points.length < 2) return null;
                return {
                    ...baseOp,
                    points: prim.points.map(p => ({ x: p.x, y: p.y })),
                    closed: prim.closed === true,
                    disableArcFit: type === 'pocket'
                };
            }

            case 'rectangle': {
                // Convert rectangle to polygon points
                const pts = [
                    { x: prim.x, y: prim.y },
                    { x: prim.x + prim.width, y: prim.y },
                    { x: prim.x + prim.width, y: prim.y + prim.height },
                    { x: prim.x, y: prim.y + prim.height }
                ];
                return {
                    ...baseOp,
                    points: pts,
                    closed: true,
                    disableArcFit: type === 'pocket'
                };
            }

            default:
                return null;
        }
    }

    removeOperation(id) {
        this.operations = this.operations.filter(op => op.id !== id);
    }

    /**
     * Select all primitives (like Ctrl+A in main tab)
     */
    selectAllPrimitives() {
        if (!this.app || !this.app.primitives) {
            console.warn('CAMManager: No primitives to select');
            return;
        }

        // Clear current selection
        if (this.app.selectedPrimitives) {
            this.app.selectedPrimitives.clear();
        } else {
            this.app.selectedPrimitives = new Set();
        }

        // Select all non-dimension primitives
        for (const prim of this.app.primitives) {
            if (prim && prim.type &&
                prim.type !== 'dimension' &&
                prim.type !== 'angularDimension' &&
                prim.type !== 'radiusDimension') {
                this.app.selectedPrimitives.add(prim);
            }
        }

        // Update UI and redraw (same as SelectionManager)
        const count = this.app.selectedPrimitives.size;
        if (this.app.renderer) this.app.renderer.invalidateCache();
        this.app.render();
        if (this.app.ui?.updateStatus) {
            this.app.ui.updateStatus(`Selezionati ${count} elementi`);
        }
        console.log(`CAMManager: Selected ${count} primitives`);
    }

    async generateGCode() {
        // Get selected primitives directly (like PLC does)
        const primitives = Array.from(this.app.selectedPrimitives || []);

        if (primitives.length === 0) {
            throw new Error('Nessuna geometria selezionata.');
        }

        // Check if we have pocket operations
        const hasPocket = this.operations.some(op => op.type === 'pocket');
        const type = hasPocket ? 'pocket' : 'profile';

        // Get tool info
        const tool = this.toolLibrary?.getTool?.('1') ?? { diameter: 3 };

        // Serialize primitives for worker (extract raw data like PLC does)
        const serializedPrimitives = primitives.map(prim => {
            if (!prim || !prim.type) return null;
            const data = { type: prim.type };

            // Copy relevant properties based on type
            switch (prim.type) {
                case 'circle':
                    data.cx = prim.center?.x ?? prim.cx;
                    data.cy = prim.center?.y ?? prim.cy;
                    data.radius = prim.radius ?? prim._radius;
                    break;
                case 'arc':
                    data.cx = prim.cx;
                    data.cy = prim.cy;
                    data.radius = prim.radius;
                    data.startAngle = prim.startAngle;
                    data.sweep = prim.sweep;
                    data.x1 = prim.x1;
                    data.y1 = prim.y1;
                    data.x2 = prim.x2;
                    data.y2 = prim.y2;
                    break;
                case 'line':
                    data.x1 = prim.x1;
                    data.y1 = prim.y1;
                    data.x2 = prim.x2;
                    data.y2 = prim.y2;
                    break;
                case 'rectangle':
                    data.x = prim.x;
                    data.y = prim.y;
                    data.width = prim.width;
                    data.height = prim.height;
                    break;
                case 'polygon':
                case 'polyline':
                    data.points = prim.points?.map(p => ({ x: p.x, y: p.y }));
                    data.closed = prim.closed;
                    break;
                default:
                    return null;
            }
            return data;
        }).filter(Boolean);

        // Log primitive types being sent
        const typeCounts = serializedPrimitives.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {});
        console.log(`CAMManager: Sending ${serializedPrimitives.length} primitives (${type}):`, typeCounts);

        // Serialize to JSON - do this BEFORE fetch to see if this is where it freezes
        console.log('CAMManager: Serializing JSON...');
        const payload = JSON.stringify({
            primitives: serializedPrimitives,
            type,
            settings: {
                safeZ: this.jobSettings.safeZ ?? 5,
                targetZ: this.jobSettings.targetZ ?? -1,
                stepDown: this.jobSettings.stepDown ?? 1,
                toolId: '1'
            },
            tools: [tool]
        });
        console.log(`CAMManager: Payload size: ~${Math.round(payload.length / 1024)}KB`);

        // Use backend worker for heavy computation (segment connection, pocket generation)
        console.log('CAMManager: Sending fetch request...');
        const fetchStart = performance.now();
        const response = await fetch('/api/cam/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        console.log('CAMManager: Waiting for response...');
        const result = await response.json();
        console.log(`CAMManager: Fetch completed in ${Math.round(performance.now() - fetchStart)}ms, status=${response.status}`);

        if (!response.ok || result?.status !== 'ok') {
            console.error('CAMManager: Error response:', result);
            throw new Error(result?.message ?? 'Errore generazione G-Code.');
        }

        console.log(`CAMManager: Worker returned ${result.stats?.gcodeLines ?? 0} lines, ${result.stats?.loops ?? 0} loops`);
        return result.gcode;
    }

    async parseGCodePreview(gcodeText) {
        const response = await fetch('/api/cam/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ gcode: gcodeText })
        });

        const result = await response.json();

        if (!response.ok || result?.status !== 'ok') {
            throw new Error(result?.message ?? 'Errore parsing G-Code.');
        }

        return result;
    }

    getPLCOptions() {
        const options = {};
        const workInput = document.getElementById('simWorkSpeed');
        const rapidInput = document.getElementById('simRapidSpeed');

        const defaultSpeed = workInput ? parseFloat(workInput.value) : NaN;
        const rapidSpeed = rapidInput ? parseFloat(rapidInput.value) : NaN;

        if (Number.isFinite(defaultSpeed)) {
            options.defaultSpeed = defaultSpeed;
        }

        if (Number.isFinite(rapidSpeed)) {
            options.rapidSpeed = rapidSpeed;
        }

        return options;
    }

    async postProcessGCode(gcodeText) {
        const response = await fetch('/api/cam/postprocess', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                gcode: gcodeText,
                options: this.getPLCOptions()
            })
        });

        const result = await response.json();

        if (!response.ok || result?.status !== 'ok') {
            throw new Error(result?.message ?? 'Errore post-process PLC.');
        }

        return result;
    }

    applyPLCOutput(commands) {
        const plcCommands = Array.isArray(commands) ? commands : [];
        this.app.plcCommands = plcCommands;
        this.app.plcOutput = plcCommands.map(cmd => cmd.command).filter(Boolean);

        const displayCommands = plcCommands.length > 2000
            ? plcCommands.slice(0, 2000).concat([{ command: `... (${plcCommands.length - 2000} more commands)` }])
            : plcCommands;

        this.app.ui.displayPLCOutput(displayCommands, this.app);
    }

    async updatePLCFromServer() {
        if (!this.gcode) {
            return;
        }

        const requestId = ++this.plcRequestId;
        this.app.ui.updateStatus('Post-process PLC in corso...');

        try {
            const result = await this.postProcessGCode(this.gcode);
            if (requestId !== this.plcRequestId) {
                return;
            }

            this.applyPLCOutput(result?.commands);
            this.app.ui.updateStatus(`PLC aggiornato: ${this.app.plcOutput.length} comandi`);
        } catch (error) {
            console.error('CAMManager: PLC postprocess failed', error);
            this.app.ui.updateStatus('Errore post-process PLC');
        }
    }

    setGCode(gcode, { source = false } = {}) {
        this.gcode = gcode ?? '';
        if (source) {
            this.gcodeSource = this.gcode;
        }

        this.renderGCodeList(this.gcode);
        this.updateGCodeEditor({ reset: true });
    }

    updateGCodeEditor({ reset = false } = {}) {
        const editor = document.getElementById('gcodeEditor');
        const status = document.getElementById('gcodeStatus');
        const applyBtn = document.getElementById('btnGCodeApply');
        const revertBtn = document.getElementById('btnGCodeRevert');

        if (editor && reset) {
            editor.value = this.gcode || '';
        }

        const editorValue = editor ? editor.value : (this.gcode || '');
        const appliedValue = this.gcode || '';
        const sourceValue = this.gcodeSource || '';
        const hasContent = editorValue.trim().length > 0;
        const isDirty = hasContent && editorValue !== appliedValue;
        const isRevertable = sourceValue && editorValue !== sourceValue;

        if (applyBtn) {
            applyBtn.disabled = !isDirty;
        }

        if (revertBtn) {
            revertBtn.disabled = !isRevertable;
        }

        this.gcodeDirty = isDirty;

        if (status) {
            if (!appliedValue && !hasContent) {
                status.textContent = 'G-Code: nessun file';
            } else {
                const lines = editorValue.split('\n').filter(line => line.trim().length > 0).length;
                status.textContent = `G-Code: ${lines} linee${this.gcodeDirty ? ' (modificato)' : ''}`;
            }
        }
    }

    toggleGCodeEditor() {
        const editorWrap = document.getElementById('gcodeEditorWrap');
        const outputList = document.getElementById('gcodeOutputList');
        const toggleBtn = document.getElementById('btnGCodeEdit');
        const editor = document.getElementById('gcodeEditor');

        if (!editorWrap || !outputList || !toggleBtn) {
            return;
        }

        this.gcodeEditing = !this.gcodeEditing;

        if (this.gcodeEditing) {
            editorWrap.hidden = false;
            outputList.style.display = 'none';
            toggleBtn.textContent = 'Visualizza';
            if (editor) {
                editor.value = this.gcode || '';
                editor.focus();
            }
        } else {
            editorWrap.hidden = true;
            outputList.style.display = '';
            toggleBtn.textContent = 'Modifica';
        }

        this.updateGCodeEditor();
    }

    async applyGCodeEdits() {
        const editor = document.getElementById('gcodeEditor');
        if (!editor) {
            return;
        }

        const updated = editor.value;
        if (!updated.trim()) {
            getModalManager().alert({
                title: 'G-Code vuoto',
                message: 'Inserisci un G-Code valido prima di applicare.'
            });
            return;
        }

        this.gcode = updated;
        this.renderGCodeList(this.gcode);
        this.updateGCodeEditor();

        await this.updatePreviewFromServer();
        await this.updatePLCFromServer();
    }

    async revertGCodeEdits() {
        if (!this.gcodeSource) {
            return;
        }

        const editor = document.getElementById('gcodeEditor');
        this.gcode = this.gcodeSource;

        if (editor) {
            editor.value = this.gcodeSource;
        }

        this.renderGCodeList(this.gcode);
        this.updateGCodeEditor();
        await this.updatePreviewFromServer();
        await this.updatePLCFromServer();
    }

    getOperations() {
        return this.operations;
    }

    /**
     * Bind UI buttons to actions
     */
    bindEvents() {
        console.log('CAMManager: Binding events (Delegated Method)...');

        // Use document-level delegation to handle dynamic button existence
        document.addEventListener('click', (e) => {
            const target = e.target;

            // --- SELECTION ---
            if (target.closest('#btnCamSelectAll')) {
                console.log('CAMManager: Select All button clicked');
                this.selectAllPrimitives();
                return;
            }

            // --- OPERATIONS ---
            if (target.closest('#btnCamProfile')) {
                console.log('CAMManager: Profile button clicked');
                const ops = this.createOperationFromSelection('profile');
                if (ops) {
                    this.renderOperationsList();
                    this.app.ui.updateStatus(`Creata operazione Profilo (${ops.length})`);
                }
                return;
            }

            if (target.closest('#btnCamPocket')) {
                console.log('CAMManager: Pocket button clicked');
                const ops = this.createOperationFromSelection('pocket');
                if (ops) {
                    this.renderOperationsList();
                    this.app.ui.updateStatus(`Creata operazione Tasca (${ops.length})`);
                }
                return;
            }

            // --- GENERATION ---
            if (target.closest('#btnCamGenerate')) {
                const btn = target.closest('#btnCamGenerate');
                this.handleGenerateClick(btn);
                return;
            }

            if (target.closest('#btnCamSettings')) {
                this.openCamSettings();
                return;
            }

            if (target.closest('#btnCamSettingsCancel') || target.closest('#btnCloseCamSettings')) {
                this.closeCamSettings();
                return;
            }

            // --- OUTPUT ---
            if (target.closest('#btnCamDownload')) {
                this.downloadGCode();
                return;
            }

            if (target.closest('#btnCamPreviewToggle')) {
                const preview = document.querySelector('.cad-cam-preview');
                if (preview) {
                    preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
                }
                return;
            }

            if (target.closest('#btnGCodeEdit')) {
                this.toggleGCodeEditor();
                return;
            }

            if (target.closest('#btnGCodeApply')) {
                this.applyGCodeEdits();
                return;
            }

            if (target.closest('#btnGCodeRevert')) {
                this.revertGCodeEdits();
                return;
            }

            if (target.closest('.cad-tab-btn[data-subtab="preview"]')) {
                if (this.viewer && typeof this.viewer.resize === 'function') {
                    setTimeout(() => this.viewer.resize(), 0);
                }
                return;
            }
        });

        document.addEventListener('input', (event) => {
            if (event.target && event.target.id === 'gcodeEditor') {
                this.updateGCodeEditor();
            }
        });

        const camSettingsForm = document.getElementById('camSettingsForm');
        if (camSettingsForm && !camSettingsForm.dataset.bound) {
            camSettingsForm.dataset.bound = 'true';
            camSettingsForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.applyCamSettings();
            });
        }

        const camSettingsModal = document.getElementById('camSettingsModal');
        if (camSettingsModal && !camSettingsModal.dataset.bound) {
            camSettingsModal.dataset.bound = 'true';
            camSettingsModal.addEventListener('click', (event) => {
                if (event.target === camSettingsModal) {
                    this.closeCamSettings();
                }
            });
        }
    }

    async handleGenerateClick(button) {
        if (this.operations.length === 0) {
            getModalManager().alert({
                title: 'Attenzione',
                message: 'Aggiungi almeno una operazione CAM prima di generare.'
            });
            return;
        }

        if (button) {
            button.disabled = true;
        }

        this.app.ui.updateStatus('Generazione G-Code in corso...');

        try {
            const gcode = await this.generateGCode();
            if (!gcode) {
                throw new Error('G-Code vuoto.');
            }

            this.setGCode(gcode, { source: true });
            this.app.ui.updateStatus(`G-Code generato: ${this.gcode.split('\n').length} linee`);

            await this.updatePreviewFromServer();
            await this.updatePLCFromServer();
        } catch (error) {
            console.error('CAMManager: G-Code generation failed', error);
            getModalManager().alert({
                title: 'Errore Generazione',
                message: error?.message ?? 'Errore durante la generazione.'
            });
            this.app.ui.updateStatus('Errore Generazione');
        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    }

    getCamSettingsElements() {
        return {
            modal: document.getElementById('camSettingsModal'),
            safeZInput: document.getElementById('camSafeZ'),
            startZInput: document.getElementById('camStartZ'),
            unitsSelect: document.getElementById('camUnits'),
            precisionInput: document.getElementById('camPrecision')
        };
    }

    openCamSettings() {
        const { modal, safeZInput, startZInput, unitsSelect, precisionInput } = this.getCamSettingsElements();
        if (!modal) {
            console.warn('CAMManager: CAM settings modal not found.');
            return;
        }

        if (safeZInput) {
            const value = Number.isFinite(this.jobSettings.safeZ)
                ? this.jobSettings.safeZ
                : this.machine.getSafetyHeight?.() ?? 5;
            safeZInput.value = value;
        }

        if (startZInput) {
            startZInput.value = Number.isFinite(this.jobSettings.startZ) ? this.jobSettings.startZ : 0;
        }

        if (unitsSelect) {
            unitsSelect.value = this.jobSettings.units ?? this.machine.units ?? 'mm';
        }

        if (precisionInput) {
            const precision = this.jobSettings.gcode?.precision ?? this.machine.gcode?.precision ?? 3;
            precisionInput.value = Number.isFinite(precision) ? precision : 3;
        }

        modal.classList.add('open');
    }

    closeCamSettings() {
        const { modal } = this.getCamSettingsElements();
        modal?.classList.remove('open');
    }

    applyCamSettings() {
        const { modal, safeZInput, startZInput, unitsSelect, precisionInput } = this.getCamSettingsElements();
        if (!modal) {
            return;
        }

        const nextSafeZ = safeZInput ? parseFloat(safeZInput.value) : NaN;
        const nextStartZ = startZInput ? parseFloat(startZInput.value) : NaN;
        const nextUnits = unitsSelect ? unitsSelect.value : null;
        const nextPrecision = precisionInput ? parseInt(precisionInput.value, 10) : NaN;
        const previousStartZ = this.jobSettings.startZ;

        if (Number.isFinite(nextSafeZ)) {
            this.jobSettings.safeZ = nextSafeZ;
        }

        if (Number.isFinite(nextStartZ)) {
            this.jobSettings.startZ = nextStartZ;
            if (Number.isFinite(previousStartZ)) {
                this.operations.forEach(op => {
                    if (op && typeof op.startZ === 'number' && Math.abs(op.startZ - previousStartZ) < 1e-6) {
                        op.startZ = nextStartZ;
                    }
                });
            }
        }

        if (nextUnits) {
            this.jobSettings.units = nextUnits;
        }

        if (Number.isFinite(nextPrecision)) {
            this.jobSettings.gcode = {
                ...(this.jobSettings.gcode || {}),
                precision: nextPrecision
            };
        }

        this.machine.update({
            safeZ: this.jobSettings.safeZ,
            units: this.jobSettings.units,
            gcode: this.jobSettings.gcode
        });

        this.closeCamSettings();
        this.app.ui.updateStatus('Impostazioni CAM aggiornate.');
    }

    renderOperationsList() {
        const list = document.getElementById('camOperationsList');
        if (!list) return;

        if (this.operations.length === 0) {
            list.innerHTML = '<li style="padding: 8px; text-align: center; color: #999; font-size: 12px;">Nessuna operazione</li>';
            return;
        }

        list.innerHTML = '';
        this.operations.forEach((op, _index) => {
            const li = document.createElement('li');
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.innerHTML = `
                <span style="font-size:12px; font-weight:500;">${op.name}</span>
                <button class="delete-op" data-id="${op.id}" style="background:none; border:none; color:#f55; cursor:pointer;">&times;</button>
            `;

            li.querySelector('.delete-op').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeOperation(op.id);
                this.renderOperationsList();
            });

            list.appendChild(li);
        });
    }

    renderGCodeList(gcode) {
        const list = document.getElementById('gcodeOutputList');
        if (!list) return;

        // Cancel any pending render
        if (this._gcodeRenderRAF) {
            cancelAnimationFrame(this._gcodeRenderRAF);
            this._gcodeRenderRAF = null;
        }

        list.innerHTML = '';
        if (!gcode || !gcode.trim()) {
            list.innerHTML = '<div class="cad-output-empty">G-Code non ancora generato</div>';
            return;
        }

        const lines = gcode.split('\n').filter(l => l.trim());
        const totalLines = lines.length;
        const CHUNK_SIZE = 100; // Lines per frame
        const MAX_RENDER = 5000; // Max lines to render (virtualization lite)
        let currentIndex = 0;

        // Show truncation warning if needed
        if (totalLines > MAX_RENDER) {
            const warn = document.createElement('div');
            warn.className = 'cad-output-warning';
            warn.style.cssText = 'padding:8px;background:#553;color:#ffa;font-size:11px;';
            warn.textContent = `Visualizzate ${MAX_RENDER} di ${totalLines} linee. Usa il download per il file completo.`;
            list.appendChild(warn);
        }

        const linesToRender = lines.slice(0, MAX_RENDER);
        const tokenRegex = /\([^)]+\)|G\d+|M\d+|[XYZIJ][-+]?\d*\.?\d+|F[-+]?\d*\.?\d+|S[-+]?\d*\.?\d+/gi;

        const renderChunk = () => {
            const fragment = document.createDocumentFragment();
            const endIndex = Math.min(currentIndex + CHUNK_SIZE, linesToRender.length);

            for (let i = currentIndex; i < endIndex; i++) {
                const line = linesToRender[i];
                const div = document.createElement('div');
                div.className = 'cad-output-item';
                div.style.cssText = "padding:4px 8px;font-family:'Consolas',monospace;";

                if (line.startsWith('(')) {
                    div.style.color = '#6a9955';
                    div.textContent = line;
                } else {
                    this._renderHighlightedLine(line, div, tokenRegex);
                }
                fragment.appendChild(div);
            }

            list.appendChild(fragment);
            currentIndex = endIndex;

            if (currentIndex < linesToRender.length) {
                this._gcodeRenderRAF = requestAnimationFrame(renderChunk);
            } else {
                this._gcodeRenderRAF = null;
                // Add delegated click handler once (not per line)
                if (!list.dataset.clickBound) {
                    list.dataset.clickBound = 'true';
                    list.addEventListener('click', (e) => {
                        const item = e.target.closest('.cad-output-item');
                        if (item) {
                            list.querySelectorAll('.cad-output-item.selected').forEach(d => d.classList.remove('selected'));
                            item.classList.add('selected');
                        }
                    });
                }
            }
        };

        // Start chunked rendering
        this._gcodeRenderRAF = requestAnimationFrame(renderChunk);
        list.scrollTop = 0;
    }

    _renderHighlightedLine(line, container, tokenRegex) {
        let lastIndex = 0;
        let match;
        tokenRegex.lastIndex = 0;

        while ((match = tokenRegex.exec(line)) !== null) {
            const start = match.index;
            if (start > lastIndex) {
                container.appendChild(document.createTextNode(line.slice(lastIndex, start)));
            }

            const token = match[0];
            const upper = token[0]?.toUpperCase();
            const span = document.createElement('span');

            if (token.startsWith('(')) {
                span.style.color = '#6a9955';
                span.textContent = token;
            } else if (upper === 'G') {
                span.style.cssText = 'color:#569cd6;font-weight:bold';
                span.textContent = token;
            } else if (upper === 'M') {
                span.style.cssText = 'color:#c586c0;font-weight:bold';
                span.textContent = token;
            } else if (upper && 'XYZIJ'.includes(upper)) {
                span.style.color = '#9cdcfe';
                span.textContent = token[0];
                container.appendChild(span);
                const valSpan = document.createElement('span');
                valSpan.style.color = '#b5cea8';
                valSpan.textContent = token.slice(1);
                container.appendChild(valSpan);
                lastIndex = start + token.length;
                continue;
            } else if (upper === 'F' || upper === 'S') {
                span.style.color = '#dcdcaa';
                span.textContent = token;
            } else {
                span.textContent = token;
            }
            container.appendChild(span);
            lastIndex = start + token.length;
        }

        if (lastIndex < line.length) {
            container.appendChild(document.createTextNode(line.slice(lastIndex)));
        }
    }

    async updatePreviewFromServer() {
        if (!this.gcode) {
            return;
        }

        const requestId = ++this.parseRequestId;
        this.app.ui.updateStatus('Analisi preview in corso...');

        try {
            const parsed = await this.parseGCodePreview(this.gcode);
            if (requestId !== this.parseRequestId) {
                return;
            }

            this.previewData = parsed;
            this.updatePreview(parsed);
            this.app.ui.updateStatus('Preview aggiornata');
        } catch (error) {
            console.error('CAMManager: Preview parse failed', error);
            getModalManager().alert({
                title: 'Errore Preview',
                message: error?.message ?? 'Errore durante il parsing.'
            });
            this.app.ui.updateStatus('Errore Preview');
        }
    }

    updatePreview(parsed = this.previewData) {
        if (this.viewer && parsed) {
            this.viewer.setParsedData(parsed);
        }
    }

    downloadGCode() {
        if (!this.gcode) {
            getModalManager().alert({
                title: 'Nessun G-Code',
                message: 'Genera prima il G-Code.'
            });
            return;
        }
        const blob = new Blob([this.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'output.nc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
