/**
 * CAM Manager
 * Handles the high-level CAM workflow, state management, and UI interaction.
 */
import { MachineConfig } from './MachineConfig.js';
import { ToolLibrary } from './ToolLibrary.js';
import { getModalManager } from '../ui/ModalManager.js';
import { buildSelectionPaths, groupLoopsByContainment } from './selectionUtils.js';

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
     * Create an operation from selected primitives
     * @param {string} type - 'profile' or 'pocket'
     */
    createOperationFromSelection(type) {
        const selection = this.app.selectedPrimitives;
        console.log('CAM Selection:', selection);
        if (!selection || selection.size === 0) {
            getModalManager().alert({ title: 'Attenzione', message: 'Nessuna geometria selezionata.' });
            return null;
        }

        const selectionList = Array.from(selection);
        const {
            loops,
            openPaths,
            unsupportedTypes,
            unsupportedCount
        } = buildSelectionPaths(selectionList);
        const pointsList = [];
        const warnings = [];

        if (type === 'pocket') {
            const groups = groupLoopsByContainment(loops);
            groups.forEach(group => {
                const holePoints = Array.isArray(group.holes)
                    ? group.holes.map(hole => hole.points).filter(Boolean)
                    : [];
                pointsList.push({
                    points: group.outer,
                    holes: holePoints,
                    closed: true,
                    sourceType: group.sourceType,
                    sourceCount: group.sourceCount,
                    disableArcFit: true
                });
            });

            if (openPaths.length > 0) {
                warnings.push(`Ignorate ${openPaths.length} geometrie aperte per la tasca.`);
            }
        } else {
            const groups = groupLoopsByContainment(loops);
            groups.forEach(group => {
                pointsList.push({
                    points: group.outer,
                    closed: true,
                    sourceType: group.sourceType,
                    sourceCount: group.sourceCount,
                    disableArcFit: false,
                    side: 'outside'
                });

                if (Array.isArray(group.holes) && group.holes.length > 0) {
                    group.holes.forEach(hole => {
                        pointsList.push({
                            points: hole.points,
                            closed: true,
                            sourceType: hole.sourceType,
                            sourceCount: hole.sourceCount,
                            disableArcFit: false,
                            side: 'inside'
                        });
                    });
                }
            });

            openPaths.forEach(path => {
                const arcSegment = Array.isArray(path.segments) && path.segments.length === 1 && path.segments[0].sourceType === 'arc'
                    ? path.segments[0]
                    : null;
                const disableArcFit = arcSegment === null;

                pointsList.push({
                    points: path.points,
                    arc: arcSegment?.arcData ?? null,
                    closed: false,
                    sourceType: 'open',
                    sourceCount: path.segments?.length ?? 0,
                    disableArcFit
                });
            });
        }

        if (pointsList.length === 0) {
            if (unsupportedCount > 0) {
                const types = Array.from(unsupportedTypes).join(', ');
                const ignored = types ? `\nIgnorati: ${types}` : '';
                getModalManager().alert({
                    title: 'Tipo non supportato',
                    message: `Al momento il CAM supporta: Poligoni, Rettangoli, Cerchi, Linee e Archi.${ignored}`
                });
                if (unsupportedCount >= selectionList.length) return null; // If EVERYTHING was unsupported, stop.
            } else if (type === 'pocket' && openPaths.length > 0) {
                getModalManager().alert({
                    title: 'Geometria non valida',
                    message: 'La tasca richiede contorni chiusi. Le geometrie selezionate sono aperte.'
                });
                return null;
            } else {
                getModalManager().alert({
                    title: 'Geometria non valida',
                    message: 'Impossibile estrarre geometria valida dalla selezione.'
                });
                return null;
            }
        }

        if (unsupportedTypes.size > 0) {
            const types = Array.from(unsupportedTypes).join(', ');
            warnings.push(`Ignorati: ${types}`);
        }

        if (warnings.length > 0) {
            this.app.ui.updateStatus(warnings.join(' '));
        }

        const newOps = [];
        for (const item of pointsList) {
            const disableArcFit = item.disableArcFit === true;
            const op = {
                id: Date.now() + Math.random().toString(36).substr(2, 5),
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} Op`,
                type: type,
                toolId: '1', // Default to 3mm Endmill
                points: item.points, // Data for the strategy
                arc: item.arc,
                holes: item.holes,
                closed: item.closed, // NEW: Track if it's closed
                disableArcFit,
                // Default params
                startZ: this.jobSettings.startZ,
                targetZ: -1,
                stepDown: 1,
                side: item.side ?? (type === 'profile' ? 'outside' : undefined)
            };
            this.operations.push(op);
            newOps.push(op);
        }

        return newOps;
    }

    circleToPolygon(circle, segments = 64) {
        const points = [];
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({
                x: circle.center.x + Math.cos(angle) * circle.radius,
                y: circle.center.y + Math.sin(angle) * circle.radius
            });
        }
        return points;
    }

    arcToPolygon(arc, segments = 32) {
        // arc properties: radius, cx, cy, startAngle, sweep
        const points = [];
        const start = arc.startAngle;
        const sweep = arc.sweep;
        // Dynamic resolution based on arc length/size? For now fixed segments or simple adaptive
        const totalAngle = Math.abs(sweep);
        // Ensure at least enough segments for the angle
        const steps = Math.max(segments, Math.ceil(totalAngle / (Math.PI / 18)));

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = start + sweep * t;
            points.push({
                x: arc.cx + arc.radius * Math.cos(angle),
                y: arc.cy + arc.radius * Math.sin(angle)
            });
        }
        return points;
    }

    serializeArc(arc) {
        if (!arc) {
            return null;
        }

        return {
            x1: arc.x1,
            y1: arc.y1,
            x2: arc.x2,
            y2: arc.y2,
            cx: arc.cx,
            cy: arc.cy,
            radius: arc.radius,
            clockwise: arc.isClockwise === true
        };
    }

    removeOperation(id) {
        this.operations = this.operations.filter(op => op.id !== id);
    }

    async generateGCode() {
        if (this.operations.length === 0) {
            return '';
        }

        const job = {
            operations: this.operations
        };

        const tools = this.toolLibrary?.getAllTools?.() ?? [];
        const payload = {
            job,
            settings: this.jobSettings,
            tools
        };

        const response = await fetch('/api/cam/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || result?.status !== 'ok') {
            throw new Error(result?.message ?? 'Errore generazione G-Code.');
        }

        return result?.gcode ?? '';
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

        list.innerHTML = '';
        if (!gcode || !gcode.trim()) {
            list.innerHTML = '<div class="cad-output-empty">G-Code non ancora generato</div>';
            return;
        }

        const lines = gcode.split('\n');
        const tokenRegex = /\([^)]+\)|G\d+|M\d+|[XYZIJ][-+]?\d*\.?\d+|F[-+]?\d*\.?\d+|S[-+]?\d*\.?\d+/gi;

        const appendText = (container, text) => {
            if (text) {
                container.appendChild(document.createTextNode(text));
            }
        };

        const appendSpan = (container, text, style) => {
            const span = document.createElement('span');
            span.textContent = text;
            if (style) Object.assign(span.style, style);
            container.appendChild(span);
        };

        const renderHighlightedLine = (line, container) => {
            let lastIndex = 0;
            let match;
            tokenRegex.lastIndex = 0;

            while ((match = tokenRegex.exec(line)) !== null) {
                const start = match.index;
                if (start > lastIndex) {
                    appendText(container, line.slice(lastIndex, start));
                }

                const token = match[0];
                const upper = token[0]?.toUpperCase();

                if (token.startsWith('(')) {
                    appendSpan(container, token, { color: '#6a9955' });
                } else if (upper === 'G') {
                    appendSpan(container, token, { color: '#569cd6', fontWeight: 'bold' });
                } else if (upper === 'M') {
                    appendSpan(container, token, { color: '#c586c0', fontWeight: 'bold' });
                } else if (upper && 'XYZIJ'.includes(upper)) {
                    appendSpan(container, token[0], { color: '#9cdcfe' });
                    appendSpan(container, token.slice(1), { color: '#b5cea8' });
                } else if (upper === 'F' || upper === 'S') {
                    appendSpan(container, token, { color: '#dcdcaa' });
                } else {
                    appendText(container, token);
                }

                lastIndex = start + token.length;
            }

            if (lastIndex < line.length) {
                appendText(container, line.slice(lastIndex));
            }
        };

        lines.forEach((line) => {
            if (!line.trim()) return;

            const div = document.createElement('div');
            div.className = 'cad-output-item';
            div.style.padding = '4px 8px'; // Slightly more compact
            div.style.fontFamily = "'Consolas', monospace";

            if (line.startsWith('(')) {
                div.style.color = '#6a9955';
                div.textContent = line;
            } else {
                renderHighlightedLine(line, div);
            }

            // Click to highlight in preview? (Future feature)
            div.addEventListener('click', () => {
                document.querySelectorAll('#gcodeOutputList .cad-output-item').forEach(d => d.classList.remove('selected'));
                div.classList.add('selected');
                // TODO: Sync with viewer
            });

            list.appendChild(div);
        });

        // Auto scroll to top
        list.scrollTop = 0;
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
