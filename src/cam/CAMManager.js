/**
 * CAM Manager
 * Handles the high-level CAM workflow, state management, and UI interaction.
 */
import { MachineConfig } from './MachineConfig.js';
import { ToolLibrary } from './ToolLibrary.js';
import { ToolpathGenerator } from './ToolpathGenerator.js';
import { getModalManager } from '../ui/ModalManager.js';

export class CAMManager {
    constructor(app) {
        console.log('CAMManager: Initializing...');
        this.app = app; // Reference to main application
        this.machine = new MachineConfig();
        this.toolLibrary = new ToolLibrary();
        this.generator = new ToolpathGenerator(this.machine, this.toolLibrary);

        this.operations = [];
        this.jobSettings = {
            safeZ: 5,
            startZ: 0
        };

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
        if (canvas) {
            // Adjust canvas resolution for HiDPI
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;

            import('./SimpleGCodeViewer.js').then(module => {
                this.viewer = new module.SimpleGCodeViewer(canvas);
            });
        }
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

        const pointsList = [];
        let unsupportedCount = 0;
        let unsupportedTypes = new Set();

        for (const prim of selection) {
            console.log('Processing primitive:', prim.type, prim);
            if (prim.type === 'polygon' || prim.type === 'polyline') {
                if (prim.points) pointsList.push({ points: prim.points, closed: prim.type === 'polygon' });
            } else if (prim.type === 'rectangle') {
                pointsList.push({
                    points: [
                        { x: prim.x, y: prim.y },
                        { x: prim.x + prim.width, y: prim.y },
                        { x: prim.x + prim.width, y: prim.y + prim.height },
                        { x: prim.x, y: prim.y + prim.height }
                    ],
                    closed: true
                });
            } else if (prim.type === 'circle') {
                pointsList.push({ points: this.circleToPolygon(prim), closed: true });
            } else if (prim.type === 'line') {
                // Support for single lines (treated as open paths)
                pointsList.push({
                    points: [{ x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 }],
                    closed: false
                });
            } else if (prim.type === 'arc') {
                console.log('CAMManager: Processing ARC primitive', prim);
                pointsList.push({
                    points: this.arcToPolygon(prim),
                    closed: false
                });
            } else {
                console.warn('CAMManager: Unsupported primitive type:', prim.type);
                unsupportedCount++;
                unsupportedTypes.add(prim.type);
            }
        }

        if (pointsList.length === 0) {
            if (unsupportedCount > 0) {
                const types = Array.from(unsupportedTypes).join(', ');
                getModalManager().alert({
                    title: 'Tipo non supportato',
                    message: `Al momento il CAM supporta: Poligoni, Rettangoli, Cerchi, Linee e Archi.\nIgnorati: ${types}`
                });
                if (unsupportedCount === selection.size) return null; // If EVERYTHING was unsupported, stop.
            } else {
                getModalManager().alert({
                    title: 'Geometria non valida',
                    message: 'Impossibile estrarre geometria valida dalla selezione.'
                });
                return null;
            }
        }

        const newOps = [];
        for (const item of pointsList) {
            const op = {
                id: Date.now() + Math.random().toString(36).substr(2, 5),
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} Op`,
                type: type,
                toolId: '1', // Default to 3mm Endmill
                points: item.points, // Data for the strategy
                closed: item.closed, // NEW: Track if it's closed
                // Default params
                startZ: this.jobSettings.startZ,
                targetZ: -1,
                stepDown: 1,
                side: type === 'profile' ? 'outside' : undefined
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

    handleWorkerMessage(e) {
        const { status, gcode, message } = e.data;
        const btn = document.getElementById('btnCamGenerate');
        if (btn) btn.disabled = false;

        if (status === 'success') {
            console.log('CAMManager: Worker returned success');
            this.gcode = gcode;
            this.updatePreview();

            // Populate List
            this.renderGCodeList(this.gcode);

            this.app.ui.updateStatus(`G-Code generato: ${this.gcode.split('\n').length} linee`);
        } else {
            console.error('CAMManager: Worker returned error', message);
            getModalManager().alert({
                title: 'Errore Generazione (Worker)',
                message: 'Errore: ' + message
            });
            this.app.ui.updateStatus('Errore Generazione');
        }
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

    removeOperation(id) {
        this.operations = this.operations.filter(op => op.id !== id);
    }

    generateGCode() {
        if (this.operations.length === 0) return '';

        const job = {
            operations: this.operations
        };

        try {
            return this.generator.generateJob(job);
        } catch (e) {
            console.error('G-Code Generation failed:', e);
            throw e;
        }
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
                console.log('CAMManager: Generate button clicked (Async Worker)');
                this.app.ui.updateStatus('Generazione G-Code in corso...');

                // Disable button to prevent double click
                const btn = target.closest('#btnCamGenerate');
                btn.disabled = true;

                // Prepare Data for Worker
                // Convert ToolLibrary to plain map for transfer because Class methods don't transfer
                const toolsData = {};
                // Assuming ToolLibrary has a list of tools. 
                // Check ToolLibrary.js structure. Step 671 doesn't show it.
                // Assuming simple object is safer. 
                // But ToolpathGenerator expects `toolLibrary.getTool(id)`.
                // In worker I mocked getTool.
                // I need to send the DATA.
                if (this.toolLibrary && this.toolLibrary.tools) {
                    this.toolLibrary.tools.forEach(t => toolsData[t.id] = t);
                }

                const job = {
                    operations: this.operations
                };

                // Instantiate Worker if not exists (lazy load)
                // Instantiate Worker if not exists (lazy load)
                if (!this.worker) {
                    this.workerReady = false;
                    this.pendingMessage = null;

                    // Use Classic worker loader (which loads modules dynamically)
                    this.worker = new Worker('./src/cam/cam.worker.js');

                    this.worker.onmessage = (e) => {
                        if (e.data.status === 'ready') {
                            console.log('CAMManager: Worker is ready.');
                            this.workerReady = true;
                            if (this.pendingMessage) {
                                console.log('CAMManager: Sending pending message to worker...');
                                this.worker.postMessage(this.pendingMessage);
                                this.pendingMessage = null;
                            }
                            return;
                        }
                        this.handleWorkerMessage(e);
                    };

                    this.worker.onerror = (e) => {
                        console.error('WORKER ERROR:', e);
                        this.app.ui.updateStatus('Errore Worker!');
                        const btn = document.getElementById('btnCamGenerate');
                        if (btn) btn.disabled = false;
                    };
                }

                const message = {
                    command: 'generate',
                    data: {
                        job: job,
                        settings: this.jobSettings,
                        toolsData: toolsData
                    }
                };

                if (this.workerReady) {
                    this.worker.postMessage(message);
                } else {
                    console.log('CAMManager: Worker not ready, queueing message...');
                    this.pendingMessage = message;
                }
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
        });
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
        const lines = gcode.split('\n');

        lines.forEach((line) => {
            if (!line.trim()) return;

            const div = document.createElement('div');
            div.className = 'cad-output-item';
            div.style.padding = '4px 8px'; // Slightly more compact
            div.style.fontFamily = "'Consolas', monospace";

            // Simple Syntax Highlighting
            let formattedHtml = line
                .replace(/\(/g, '<span style="color:#6a9955">(') // Comments
                .replace(/\)/g, ')</span>');

            if (line.startsWith('(')) {
                // Entire line comment
                div.style.color = '#6a9955';
                div.innerHTML = line;
            } else {
                // Commands
                formattedHtml = formattedHtml
                    .replace(/(G\d+)/g, '<span style="color:#569cd6; font-weight:bold;">$1</span>')
                    .replace(/(M\d+)/g, '<span style="color:#c586c0; font-weight:bold;">$1</span>')
                    .replace(/([XYZIJ])([\d.-]+)/g, '<span style="color:#9cdcfe">$1</span><span style="color:#b5cea8">$2</span>')
                    .replace(/(F\d+)/g, '<span style="color:#dcdcaa">$1</span>')
                    .replace(/(S\d+)/g, '<span style="color:#dcdcaa">$1</span>');

                div.innerHTML = formattedHtml;
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

    updatePreview() {
        if (this.viewer && this.gcode) {
            this.viewer.setGCode(this.gcode);
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
