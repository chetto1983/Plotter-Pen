/**
 * CAMSettingsManager
 * Handles the CAM Settings modal, form population, and persistence.
 */
import { getModalManager } from '../ui/ModalManager.js';

export class CAMSettingsManager {
    /**
     * @param {CAMManager} camManager 
     * @param {CAMService} camService 
     */
    constructor(camManager, camService) {
        this.camManager = camManager;
        this.camService = camService;

        this.bindEvents();
    }

    bindEvents() {
        // Open is handled by CAMManager now

        // Close
        document.getElementById('btnCloseCamSettings')?.addEventListener('click', () => this.close());
        document.getElementById('btnCamSettingsCancel')?.addEventListener('click', () => this.close());

        // Apply
        const applyBtn = document.getElementById('btnCamSettingsApply');
        if (applyBtn) {
            applyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.apply();
            });
        }
    }

    async openCamSettings() {
        const modal = document.getElementById('camSettingsModal');
        if (!modal) return;

        // Try to load persisted settings
        let settings = await this.camService.loadSettings();

        // If no persisted settings, use current defaults from CAMManager
        if (!settings) {
            settings = this.camManager.jobSettings;
        } else {
            // Update manager with loaded settings immediately? 
            // Better to only update on Apply, or if we trust the DB as source of truth.
            // Let's treat DB as source of truth for "User Preferences".
            // So we populate form with DB values.
        }

        // Access form elements
        const els = this.getElements();
        if (!els.safeZ) return;

        // Populate Form
        els.safeZ.value = settings.safeZ;
        els.startZ.value = settings.startZ;
        els.units.value = settings.units;
        els.profileSide.value = settings.profileSide;
        els.gcodePrecision.value = settings.gcode?.precision ?? 3;
        els.toolDiameter.value = settings.toolDiameter ?? 3.0; // Default 3.0
        els.tolerance.value = settings.tolerance ?? 0.01;

        // New Fields
        els.stepOver.value = settings.stepOver ?? 40;
        els.stepDown.value = settings.stepDown ?? 1.0;

        modal.classList.add('open');
    }

    close() {
        document.getElementById('camSettingsModal')?.classList.remove('open');
    }

    async apply() {
        const els = this.getElements();

        const settings = {
            safeZ: parseFloat(els.safeZ.value) || 5,
            startZ: parseFloat(els.startZ.value) || 0,
            units: els.units.value,
            profileSide: els.profileSide.value,
            tolerance: parseFloat(els.tolerance.value) || 0.01,
            toolDiameter: parseFloat(els.toolDiameter.value) || 3.0,
            stepOver: parseFloat(els.stepOver.value) || 40,
            stepDown: parseFloat(els.stepDown.value) || 1.0,
            gcode: {
                precision: parseInt(els.gcodePrecision.value) || 3
            }
        };

        // Basic Validation
        if (settings.toolDiameter <= 0) {
            getModalManager().alert({ title: 'Errore', message: 'Il diametro utensile deve essere > 0.' });
            return;
        }

        // Persist
        await this.camService.saveSettings(settings);

        // Update Manager
        this.camManager.jobSettings = settings;

        // Close
        this.close();

        // Optional: Trigger refresh?
        // this.camManager.app.ui.updateStatus('Impostazioni CAM salvate');
    }

    getElements() {
        return {
            safeZ: document.getElementById('camSafeZ'),
            startZ: document.getElementById('camStartZ'),
            units: document.getElementById('camUnits'),
            profileSide: document.getElementById('camProfileSide'),
            gcodePrecision: document.getElementById('camPrecision'),
            toolDiameter: document.getElementById('camToolDiameter'),
            tolerance: document.getElementById('camTolerance'),
            stepOver: document.getElementById('camStepOver'),
            stepDown: document.getElementById('camStepDown')
        };
    }
}
