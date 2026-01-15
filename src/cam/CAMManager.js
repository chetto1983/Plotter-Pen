/**
 * CAM Manager (Refactored)
 * Coordinator for CAM operations, managing state and sub-managers.
 */
import { MachineConfig } from './MachineConfig.js';
import { getModalManager } from '../ui/ModalManager.js';
import { ToolService } from './ToolService.js';
import { CAMService } from './CAMService.js';
import { CAMSettingsManager } from './CAMSettingsManager.js';
import { ToolLibraryManager } from './ToolLibraryManager.js';

export class CAMManager {
    constructor(app) {
        console.log('CAMManager: Initializing...');
        this.app = app;
        this.machine = new MachineConfig();

        // Services
        this.toolService = new ToolService();
        this.camService = new CAMService();

        // State
        this.operations = [];
        this.jobSettings = {
            safeZ: this.machine.getSafetyHeight?.() ?? 5,
            startZ: 0,
            units: this.machine.units,
            profileSide: 'outside',
            tolerance: 0.01,
            gcode: {
                precision: this.machine.gcode?.precision ?? 3
            },
            toolDiameter: 3.0,
            stepOver: 40,
            stepDown: 1.0
        };
        this.gcode = '';
        this.gcodeSource = '';
        this.gcodeDirty = false;
        this.gcodeEditing = false;
        this.previewData = null;
        this.parseRequestId = 0;

        // Sub-Managers
        this.settingsManager = new CAMSettingsManager(this, this.camService);
        this.toolLibraryManager = new ToolLibraryManager(this, this.toolService);

        // Initialize Viewer
        this.viewer = null;
        try {
            this.initViewer();
        } catch (e) {
            console.error('CAMManager: initViewer failed', e);
        }

        setTimeout(() => this.bindEvents(), 100);
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

    bindEvents() {
        // Main CAM UI Events (Original Ribbon + New Wizard)
        const bind = (id, handler) => document.getElementById(id)?.addEventListener('click', handler);

        // Settings
        bind('btnCamSettings', () => this.settingsManager.openCamSettings());
        bind('btnCamWizardSettings', () => this.settingsManager.openCamSettings());

        // Generation & Output
        bind('btnCamGenerate', () => this.handleGenerateClick());
        bind('btnCamWizardGenerate', () => this.handleGenerateClick());

        bind('btnCamDownload', () => this.downloadGCode());
        bind('btnCamWizardDownload', () => this.downloadGCode());

        // Operation Buttons
        bind('btnCamProfile', () => this.createOperationFromSelection('profile'));
        bind('btnCamWizardAddProfile', () => this.createOperationFromSelection('profile'));

        bind('btnCamPocket', () => this.createOperationFromSelection('pocket'));
        bind('btnCamWizardAddPocket', () => this.createOperationFromSelection('pocket'));

        // Clear
        bind('btnCamClearOps', () => this.clearOperations());
        bind('btnCamWizardClearOps', () => this.clearOperations());
    }

    selectAllPrimitives() {
        // User Request: Use the interactive Selection Tool instead of "Select All".
        // This mimics the Home Tab "Select" behavior.
        if (this.app && this.app.selectTool) {
            this.app.selectTool('select');
            this.app.ui.updateStatus('Modalità Selezione CAM attivata. Seleziona le geometrie.');
        }
    }

    createOperationFromSelection(type) {
        const selection = this.app.selectedPrimitives;
        if (!selection || selection.size === 0) {
            getModalManager().alert({ title: 'Attenzione', message: 'Nessuna geometria selezionata.' });
            return null;
        }

        const validTypes = ['line', 'circle', 'arc', 'polyline', 'spline', 'rectangle', 'ellipse'];
        const primitives = [];
        let ignoredType = 0;

        // Double-check selection validness
        for (const p of selection) {
            if (validTypes.includes(p.type)) {
                primitives.push(p);
            } else {
                ignoredType++;
            }
        }

        if (primitives.length === 0) {
            getModalManager().alert({ title: 'Errore', message: 'La selezione contiene solo elementi non validi per il CAM.' });
            return null;
        }

        if (ignoredType > 0) {
            getModalManager().toast('Warning', `${ignoredType} elementi ignorati (tipo non valido).`);
        }

        // Create an Operation Object
        // We group selection into ONE operation for cleaner UI
        const op = {
            id: Date.now().toString(36), // Simple ID
            type: type,
            name: `${type === 'profile' ? 'Profilo' : 'Tasca'} (${primitives.length} elem.)`,
            primitives: primitives,
            enabled: true
        };

        this.operations.push(op);
        this.renderOperationsList();
        this.app.ui.updateStatus(`Operazione ${op.name} aggiunta.`);

        // Optional: Deselect after adding?
        // this.app.clearSelection();
    }

    removeOperation(id) {
        this.operations = this.operations.filter(op => op.id !== id);
        this.renderOperationsList();
    }

    clearOperations() {
        this.operations = [];
        this.gcode = '';
        this.updatePreview(null);
        this.renderOperationsList();
        this.app.ui.updateStatus('Operazioni CAM cancellate.');
    }

    renderOperationsList() {
        const container = document.getElementById('camOperationsList');
        if (!container) return; // Hooked element might not exist yet (HTML update pending)

        if (this.operations.length === 0) {
            container.innerHTML = '<div class="cam-op-empty">Nessuna operazione.<br><small style="opacity:0.6">Seleziona geometrie e aggiungi Profilo (+)</small></div>';
            return;
        }

        container.innerHTML = '';
        this.operations.forEach(op => {
            const el = document.createElement('div');
            el.className = 'cam-op-item';
            el.innerHTML = `
                <div class="cam-op-info">
                    <span class="cam-op-type ${op.type}">${op.type.toUpperCase()}</span>
                    <span class="cam-op-name">${op.name}</span>
                </div>
                <button class="cam-op-delete" data-id="${op.id}" title="Rimuovi">&times;</button>
            `;
            // Bind delete
            el.querySelector('.cam-op-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeOperation(op.id);
            });
            container.appendChild(el);
        });
    }

    async handleGenerateClick() {
        if (this.operations.length === 0) {
            getModalManager().alert({
                title: 'Info',
                message: 'Nessuna operazione definita.\n\n1. Seleziona le geometrie col mouse.\n2. Clicca su "Profilo" o "Tasca" per creare l\'operazione.\n3. Clicca su Genera.'
            });
            return;
        }

        this.app.ui.updateStatus('Generazione G-Code...');
        try {
            await this.generateGCode();
        } catch (error) {
            console.error('Generation Error:', error);
            getModalManager().alert({ title: 'Errore', message: error.message });
            this.app.ui.updateStatus('Errore generazione');
        }
    }

    async generateGCode() {
        // Senior Dev Audit: 
        // The backend `process` endpoint takes ONE set of settings and ONE type.
        // But we have a list of user-defined operations, possibly mixed types (Pocket + Profile),
        // and ideally we might want different settings per operation (e.g., Tool Diameter).
        // For THIS version, we assume Global Settings (Job Settings) apply to all, 
        // BUT we must batch by Type to respect the backend signature.

        // Actually, we should iterate and generate sequentially to ensure correct order.

        let fullGCode = `(Generated by Plotter-Pen CAM)\n`;
        fullGCode += `(Date: ${new Date().toLocaleString()})\n`;
        fullGCode += `(Settings: SafeZ=${this.jobSettings.safeZ}, Tool=${this.jobSettings.toolDiameter}mm)\n\n`;

        // Header
        fullGCode += `G21 ; Millimeters\n`;
        fullGCode += `G90 ; Absolute positioning\n`;
        fullGCode += `G0 Z${this.jobSettings.safeZ} ; Safe Z\n\n`;

        for (const op of this.operations) {
            if (!op.enabled) continue;

            fullGCode += `(Operation: ${op.name})\n`;

            // Call Backend for this specific operation
            // We pass the GLOBAL settings for now. 
            // Future improvement: Op-specific settings.
            const result = await this.camService.process(op.primitives, op.type, this.jobSettings);

            if (result.gcode) {
                // Strip Header/Footer lines to avoid resetting machine state mid-program
                // (e.g. M30, G90 repeated)
                let fragment = result.gcode
                    .replace(/M30\n?/g, '') // Remove Program End
                    .replace(/M5\n?/g, '')  // Remove Spindle Stop (we handle it at end)
                    .replace(/G90\n?/g, '') // Remove Absolute Mode (set at start)
                    .replace(/G21\n?/g, '') // Remove Units (set at start)
                    .replace(/G17\n?/g, ''); // Remove Plane (set at start)

                fullGCode += fragment + '\n\n';
            }
        }

        // Footer
        fullGCode += `M5 ; Spindle off\n`;
        fullGCode += `M30 ; End of program\n`;

        this.gcode = fullGCode;
        this.gcodeSource = 'cam';
        this.gcodeDirty = false;

        this.displayGCode(this.gcode);
        this.updatePreviewFromServer();
        this.app.ui.updateStatus(`G-Code generato (${this.operations.length} operazioni)`);
    }

    displayGCode(gcode) {
        const container = document.getElementById('gcodeContainer');
        if (!container) return;

        container.innerHTML = '';
        const lines = gcode.split('\n');

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            const el = document.createElement('div');
            el.className = 'gcode-card-item'; // Use Card style

            // Simple highlighting logic
            if (trimmed.startsWith('(')) {
                el.classList.add('gcode-comment');
                el.textContent = trimmed;
            } else if (trimmed.startsWith('G0 ')) {
                el.classList.add('gcode-rapid');
                el.innerHTML = `<span class="cmd">G0</span> <span class="args">${trimmed.substring(3)}</span>`;
            } else if (trimmed.startsWith('G1 ')) {
                el.classList.add('gcode-linear');
                el.innerHTML = `<span class="cmd">G1</span> <span class="args">${trimmed.substring(3)}</span>`;
            } else if (trimmed.startsWith('G2 ') || trimmed.startsWith('G3 ')) {
                el.classList.add('gcode-arc');
                const cmd = trimmed.substring(0, 2);
                el.innerHTML = `<span class="cmd">${cmd}</span> <span class="args">${trimmed.substring(3)}</span>`;
            } else {
                el.textContent = trimmed;
            }

            // Visual cue for Safe Z
            if (trimmed.includes('Z5.000')) {
                el.classList.add('gcode-safe-z');
            }

            container.appendChild(el);
        });
    }

    async updatePreviewFromServer() {
        if (!this.gcode) return;

        this.app.ui.updateStatus('Analisi preview...');
        try {
            const parsed = await this.camService.parse(this.gcode);
            this.previewData = parsed;
            this.updatePreview(parsed);
            this.app.ui.updateStatus('Preview aggiornata');
        } catch (error) {
            console.error('Preview Error', error);
            this.app.ui.updateStatus('Errore Preview');
        }
    }

    updatePreview(parsed) {
        if (this.viewer && parsed) {
            this.viewer.setParsedData(parsed);
        } else if (this.viewer && !parsed) {
            // clear
            // viewer has no clear method exposed in adapter?
        }
    }

    downloadGCode() {
        if (!this.gcode) {
            getModalManager().alert({ title: 'Info', message: 'Nessun G-Code da scaricare.' });
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
