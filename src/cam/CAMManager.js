/**
 * CAM Manager (Refactored)
 * Coordinator for CAM operations, managing state and sub-managers.
 * Now includes PLC output display and 3D simulation like main PLC panel.
 */
import { MachineConfig } from './MachineConfig.js';
import { getModalManager } from '../ui/ModalManager.js';
import { ToolService } from './ToolService.js';
import { CAMService } from './CAMService.js';
import { CAMSettingsManager } from './CAMSettingsManager.js';
import { ToolLibraryManager } from './ToolLibraryManager.js';
import { PLCSimulator3D } from '../plc/PLCSimulator3D.js';
import { PLC3DAnimator } from '../plc/PLC3DAnimator.js';
import { log } from '../lib/logger.js';

export class CAMManager {
    constructor(app) {
        log('CAMManager: Initializing...');
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
            stepDown: 1.0,
            feedXY: 1000,
            feedZ: 200
        };
        this.gcode = '';
        this.plcOutput = [];  // PLC output lines
        this.gcodeSource = '';
        this.gcodeDirty = false;
        this.gcodeEditing = false;
        this.previewData = null;
        this.parseRequestId = 0;

        // Sub-Managers
        this.settingsManager = new CAMSettingsManager(this, this.camService);
        this.toolLibraryManager = new ToolLibraryManager(this, this.toolService);

        // 3D Simulation (same as main PLC)
        this.simulator3D = null;
        this.animator3D = null;
        this._is3DInitialized = false;

        // Initialize Viewer and 3D Simulator
        this.viewer = null;
        setTimeout(() => {
            this.init3DSimulator();
            this.bindEvents();
            this.loadSettingsFromUI();
        }, 100);
    }

    /**
     * Initialize 3D simulator using PLCSimulator3D (same as main PLC)
     */
    init3DSimulator() {
        const canvas = document.getElementById('camPreviewCanvas');
        if (!canvas || this._is3DInitialized) return;

        try {
            this.simulator3D = new PLCSimulator3D(canvas);
            this.animator3D = new PLC3DAnimator(this.simulator3D);
            this.viewer = this.simulator3D; // Alias for compatibility
            log('CAMManager: 3D Simulator initialized');

            // Wire progress callback
            this.animator3D.onUpdate = (currentIndex, total) => {
                const progressBar = document.querySelector('.cam-3d-progress-bar');
                if (progressBar && total > 0) {
                    const percent = Math.round((currentIndex / total) * 100);
                    progressBar.style.width = `${percent}%`;
                }
            };

            this.animator3D.onComplete = () => {
                const btnPlay = document.getElementById('btnCam3DPlay');
                if (btnPlay) {
                    btnPlay.textContent = '▶';
                    btnPlay.classList.remove('playing');
                }
                const progressBar = document.querySelector('.cam-3d-progress-bar');
                if (progressBar) progressBar.style.width = '100%';
            };

            this._is3DInitialized = true;
        } catch (err) {
            console.error('CAMManager: Failed to create 3D simulator:', err);
        }
    }

    /**
     * Load settings from UI inputs
     */
    loadSettingsFromUI() {
        const feedXY = document.getElementById('camFeedXY');
        const feedZ = document.getElementById('camFeedZ');
        const safeZ = document.getElementById('camSafeZ');
        const toolDia = document.getElementById('camToolDia');

        if (feedXY) this.jobSettings.feedXY = parseFloat(feedXY.value) || 1000;
        if (feedZ) this.jobSettings.feedZ = parseFloat(feedZ.value) || 200;
        if (safeZ) this.jobSettings.safeZ = parseFloat(safeZ.value) || 5;
        if (toolDia) this.jobSettings.toolDiameter = parseFloat(toolDia.value) || 3;
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

        // Preview Expand
        bind('btnCamExpandPreview', () => this.toggleFullscreenPreview());

        // ===== NEW: PLC Output Buttons =====
        bind('btnCamSimulate', () => this.simulatePath());
        bind('btnCamCopyPLC', () => this.copyPLCOutput());
        bind('btnCamDownloadPLC', () => this.downloadPLCOutput());
        bind('btnCamSendPLC', () => this.sendToPLC());

        // ===== NEW: 3D Playback Controls =====
        const btnPlay = document.getElementById('btnCam3DPlay');
        const btnStep = document.getElementById('btnCam3DStep');
        const btnReset = document.getElementById('btnCam3DReset');
        const speedSlider = document.getElementById('camSim3DSpeed');
        const speedLabel = document.getElementById('camSim3DSpeedLabel');

        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                if (!this.animator3D) return;
                if (this.animator3D.isPlaying) {
                    this.animator3D.pause();
                    btnPlay.textContent = '▶';
                    btnPlay.classList.remove('playing');
                } else {
                    this.animator3D.play();
                    btnPlay.textContent = '⏸';
                    btnPlay.classList.add('playing');
                }
            });
        }

        if (btnStep) {
            btnStep.addEventListener('click', () => this.animator3D?.step());
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this.animator3D?.stop();
                if (btnPlay) {
                    btnPlay.textContent = '▶';
                    btnPlay.classList.remove('playing');
                }
            });
        }

        if (speedSlider) {
            speedSlider.addEventListener('input', () => {
                const speed = parseFloat(speedSlider.value);
                this.animator3D?.setSpeed(speed);
                if (speedLabel) speedLabel.textContent = `${speed.toFixed(1)}x`;
            });
        }

        // ===== NEW: Settings Input Changes =====
        const settingsInputs = ['camFeedXY', 'camFeedZ', 'camSafeZ', 'camToolDia'];
        settingsInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', () => this.loadSettingsFromUI());
            }
        });

        // Tab Switching Logic (updated to include 'plc' tab)
        const camPanel = document.getElementById('camPanel');
        if (camPanel) {
            const tabs = camPanel.querySelectorAll('.cad-tab-sm');
            tabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    // Remove active from all tabs in CAM panel only
                    tabs.forEach(t => t.classList.remove('active'));
                    // Add active to clicked
                    e.target.classList.add('active');

                    // Hide all subtabs in CAM panel
                    camPanel.querySelectorAll('.cam-subtab-sm').forEach(el => {
                        el.hidden = true;
                        el.classList.remove('active');
                    });

                    // Show target subtab
                    const targetId = `cam-subtab-${e.target.dataset.subtab}`;
                    const target = document.getElementById(targetId);
                    if (target) {
                        target.hidden = false;
                        target.classList.add('active');
                    }

                    // If switching to preview, resize viewer
                    if (e.target.dataset.subtab === 'preview' && this.simulator3D) {
                        requestAnimationFrame(() => this.simulator3D?.resize());
                    }
                });
            });
        }
    }

    toggleFullscreenPreview() {
        if (!this.viewer || !this.viewer.canvas) return;

        if (this.isFullscreen) {
            this.closeFullscreenPreview();
            return;
        }

        const canvas = this.viewer.canvas;
        this.originalParent = canvas.parentElement;

        // Create Overlay
        const overlay = document.createElement('div');
        overlay.id = 'cam-preview-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: #0f1115; z-index: 10000; display: flex;
            align-items: center; justify-content: center;
        `;

        // Move canvas
        overlay.appendChild(canvas);

        // Controls Container
        const controls = document.createElement('div');
        controls.style.cssText = `position: absolute; top: 20px; right: 20px; display: flex; gap: 10px;`;

        // Close Button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); 
            color: white; border-radius: 50%; width: 40px; height: 40px; 
            cursor: pointer; display: flex; align-items: center; justify-content: center;
        `;
        closeBtn.onclick = () => this.closeFullscreenPreview();
        controls.appendChild(closeBtn);
        overlay.appendChild(controls);

        document.body.appendChild(overlay);
        this.isFullscreen = true;

        // Trigger Resize
        requestAnimationFrame(() => {
            if (this.viewer) this.viewer.resize();
        });
    }

    closeFullscreenPreview() {
        const overlay = document.getElementById('cam-preview-overlay');
        const canvas = this.viewer.canvas;

        if (this.originalParent && canvas) {
            // Re-insert before the button (which is last child usually, or we can just append and CSS handles 100%)
            // The container has relative positioning.
            this.originalParent.insertBefore(canvas, this.originalParent.firstChild);
        }

        if (overlay) document.body.removeChild(overlay);
        this.isFullscreen = false;

        // Trigger Resize back to small
        requestAnimationFrame(() => {
            if (this.viewer) this.viewer.resize();
        });
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

    editOperation(op) {
        // Simple edit: toggle operation type between profile/pocket
        const newType = op.type === 'profile' ? 'pocket' : 'profile';
        const typeName = newType === 'profile' ? 'Profilo' : 'Tasca';

        getModalManager().confirm({
            title: 'Modifica Operazione',
            message: `Cambiare "${op.name}" in ${typeName}?`,
            confirmText: 'Cambia',
            cancelText: 'Annulla'
        }).then(confirmed => {
            if (confirmed) {
                op.type = newType;
                op.name = `${typeName} (${op.primitives.length} elem.)`;
                this.renderOperationsList();
                this.app.ui.updateStatus(`Operazione cambiata in ${typeName}.`);
            }
        });
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
        if (!container) return;

        if (this.operations.length === 0) {
            container.innerHTML = '<div class="cam-op-empty">Nessuna operazione.<br><small style="opacity:0.6">Seleziona geometrie e aggiungi Profilo (+)</small></div>';
            return;
        }

        container.innerHTML = '';
        this.operations.forEach(op => {
            const el = document.createElement('div');
            el.className = 'cam-op-item';

            // Info info
            const info = document.createElement('div');
            info.className = 'cam-op-info';
            info.innerHTML = `
                <span class="cam-op-type ${op.type}">${op.type.toUpperCase()}</span>
                <span class="cam-op-name">${op.name}</span>
            `;
            el.appendChild(info);

            // Actions container
            const actions = document.createElement('div');
            actions.className = 'cam-op-actions';
            actions.style.display = 'flex';
            actions.style.gap = '5px';

            // Edit Button (Unified Modal)
            const editBtn = document.createElement('button');
            editBtn.className = 'cam-op-btn edit';
            editBtn.textContent = '✎';
            editBtn.title = 'Modifica';
            editBtn.style.background = 'none';
            editBtn.style.border = 'none';
            editBtn.style.color = 'var(--accent, #3b82f6)';
            editBtn.style.cursor = 'pointer';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this.editOperation(op);
            };
            actions.appendChild(editBtn);

            // Delete Button
            const delBtn = document.createElement('button');
            delBtn.className = 'cam-op-btn delete';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Rimuovi';
            delBtn.style.background = 'none';
            delBtn.style.border = 'none';
            delBtn.style.color = 'var(--muted, #666)';
            delBtn.style.cursor = 'pointer';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeOperation(op.id);
            };
            actions.appendChild(delBtn);

            el.appendChild(actions);
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
