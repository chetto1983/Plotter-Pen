
export class PersistenceManager {
    /**
     * @param {Object} app - Reference to main application
     */
    constructor(app) {
        this.app = app;
        this.autoSaveTimer = null;
        this.autoSaveDelay = 1000; // 1 second debounce
        this.saveQueue = Promise.resolve();
    }

    /**
     * Trigger auto-save request (debounced)
     */
    triggerAutoSave() {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => this.queueSave(), this.autoSaveDelay);
    }

    queueSave() {
        this.saveQueue = this.saveQueue
            .then(() => this.saveState())
            .catch(() => { });
    }

    /**
     * Save current state to backend
     */
    async saveState() {
        try {
            // Get serialized state from StateManager
            const stateJson = this.app.state.serializeState();

            // Backend expects { data: "<json-string>" }
            const response = await fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: stateJson })
            });

            if (!response.ok) throw new Error('Server returned ' + response.status);

            // console.log('Auto-save successful'); 
            // Optional: update specific UI indicator for "Saved"
        } catch (e) {
            console.error('Auto-save error:', e);
            this.app.ui.updateStatus('Errore salvataggio automatico');
        }
    }

    /**
     * Load state from backend
     */
    async loadState() {
        try {
            const response = await fetch('/api/state');
            if (!response.ok) throw new Error('Server returned ' + response.status);

            const result = await response.json();

            if (result.data) {
                // Restore state with View settings enabled (true)
                this.app.state.restoreState(result.data, true);

                // Update snap manager with restored primitives
                if (this.app.snapManager) {
                    this.app.snapManager.setPrimitives(this.app.primitives);
                }

                // Force renderer update
                if (this.app.renderer) {
                    this.app.renderer.resizeCanvas(); // Ensure correct size
                    this.app.renderer.invalidateCache();
                }

                this.app.render();
                this.app.ui.updateStats();
                this.app.ui.updateStatus('Sessione ripristinata');
                return true;
            }
        } catch (e) {
            console.error('Load state error:', e);
            this.app.ui.updateStatus('Errore caricamento sessione');
        }
        return false;
    }
}

export default PersistenceManager;
