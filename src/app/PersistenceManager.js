/**
 * PersistenceManager - Fast async state persistence with Web Worker
 * Uses streaming approach for large datasets
 */

export class PersistenceManager {
    constructor(app) {
        this.app = app;
        this.autoSaveTimer = null;
        this.autoSaveDelay = 1000;
        this.saveQueue = Promise.resolve();
    }

    triggerAutoSave() {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => this.queueSave(), this.autoSaveDelay);
    }

    queueSave() {
        // Chain saves to prevent concurrent requests; errors are handled in saveState()
        this.saveQueue = this.saveQueue
            .then(() => this.saveState())
            .catch(() => { /* Errors handled in saveState() */ });
    }

    async saveState() {
        try {
            const stateJson = this.app.state.serializeState();

            const response = await fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: stateJson })
            });

            if (!response.ok) throw new Error('Server returned ' + response.status);
        } catch {
            this.app.ui.updateStatus('Errore salvataggio automatico');
        }
    }

    /**
     * Load state with Web Worker for non-blocking parsing
     */
    async loadState() {
        try {
            const response = await fetch('/api/state');
            if (!response.ok) throw new Error('Server returned ' + response.status);

            const result = await response.json();

            if (result.data) {
                this.app.ui.updateStatus('Caricamento sessione...');

                // Use Web Worker for large data, sync for small
                const dataSize = result.data.length;
                if (dataSize > 100000) { // > 100KB use worker
                    await this.loadWithWorker(result.data);
                } else {
                    this.app.state.restoreState(result.data, true);
                }

                // Update managers
                if (this.app.snapManager) {
                    this.app.snapManager.setPrimitives(this.app.primitives);
                }

                if (this.app.renderer) {
                    this.app.renderer.resizeCanvas();
                    this.app.renderer.invalidateCache();
                }

                // Refresh PLC output with loaded settings
                if (this.app.plcOutputManager) {
                    this.app.plcOutputManager.refreshPLCOutput();
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

    /**
     * Load using Web Worker for non-blocking JSON parse
     */
    loadWithWorker(jsonString) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(
                new URL('../workers/stateLoaderWorker.js', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = (e) => {
                const msg = e.data;

                if (msg.type === 'metadata') {
                    // Restore layers and settings first
                    if (msg.layers && this.app.layerManager) {
                        this.app.layerManager.deserialize(msg.layers);
                    }
                    if (this.app.state?.applyViewSettings) {
                        this.app.state.applyViewSettings(msg);
                    }
                    // Clear primitives for new data
                    this.app.primitives = [];
                    this.app.selectedPrimitives.clear();
                }

                if (msg.type === 'primitives') {
                    // Deserialize chunk and add to app
                    for (const item of msg.items) {
                        const prim = this.app.state.deserializeSinglePrimitive(item);
                        if (prim) this.app.primitives.push(prim);
                    }
                    // Update progress
                    this.app.ui.updateStatus(`Caricamento ${msg.progress}%...`);
                    // Progressive render every 25%
                    if (msg.progress % 25 === 0 && this.app.renderer) {
                        this.app.renderer.invalidateCache();
                        this.app.render();
                    }
                }

                if (msg.type === 'done') {
                    worker.terminate();
                    resolve();
                }

                if (msg.type === 'error') {
                    worker.terminate();
                    reject(new Error(msg.message));
                }
            };

            worker.onerror = (e) => {
                worker.terminate();
                reject(e);
            };

            // Start worker
            worker.postMessage({ jsonString });
        });
    }
}

export default PersistenceManager;
