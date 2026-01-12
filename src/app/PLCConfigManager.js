export class PLCConfigManager {
    constructor() {
        this.modal = document.getElementById('plcConfigModal'); // This should be the .cad-modal-overlay
        this.form = document.getElementById('plcConfigForm');
        this.statusBox = document.getElementById('configStatus');
        this.openBtn = document.getElementById('btnOpenPLCConfig'); // The button in the ribbon
        this.closeBtn = document.getElementById('btnClosePLCConfig'); // The X button in modal
        this.reloadBtn = document.getElementById('reloadConfigBtn');

        this.cachedConfig = null;

        this.init();
    }

    init() {
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.open());
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                // Close if clicking the overlay (outside the modal content)
                if (e.target === this.modal) this.close();
            });
        }
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.saveConfig(e));
        }
        if (this.reloadBtn) {
            this.reloadBtn.addEventListener('click', () => this.loadConfig());
        }
    }

    open() {
        if (this.modal) {
            this.modal.classList.add('open');
            this.loadConfig(); // Reload fresh on open
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.remove('open');
            this.clearStatus();
        }
    }

    showStatus(message, tone = "info") {
        if (!this.statusBox) return;
        this.statusBox.textContent = message;
        this.statusBox.dataset.tone = tone;
        this.statusBox.hidden = false;
    }

    clearStatus() {
        if (!this.statusBox) return;
        this.statusBox.hidden = true;
        this.statusBox.textContent = "";
        delete this.statusBox.dataset.tone;
    }

    setFormDisabled(disabled) {
        if (!this.form) return;
        Array.from(this.form.elements).forEach((element) => {
            element.disabled = disabled;
        });
        if (this.reloadBtn) {
            this.reloadBtn.disabled = disabled;
        }
    }

    populateForm(data) {
        if (!this.form || !data) return;
        this.cachedConfig = { ...data };
        if (this.form.endpoint) this.form.endpoint.value = data.endpoint ?? "";
        if (this.form.nodeId) this.form.nodeId.value = data.nodeId ?? "";
        if (this.form.username) this.form.username.value = data.username ?? "";
        if (this.form.password) this.form.password.value = data.password ?? "";
        if (this.form.triggerNodeId) this.form.triggerNodeId.value = data.triggerNodeId ?? "";
        if (this.form.triggerResetDelayMs) this.form.triggerResetDelayMs.value =
            typeof data.triggerResetDelayMs === "number" ? data.triggerResetDelayMs : "";
        if (this.form.valueType) this.form.valueType.value = data.valueType ?? "";
        if (this.form.arrayLength) this.form.arrayLength.value =
            typeof data.arrayLength === "number" ? data.arrayLength : "";
    }

    readForm() {
        if (!this.form) return null;
        const formData = new FormData(this.form);
        const base = this.cachedConfig ? { ...this.cachedConfig } : {};

        const result = {
            ...base,
            endpoint: formData.get('endpoint')?.trim() || "",
            nodeId: formData.get('nodeId')?.trim() || "",
            username: formData.get('username')?.trim() || "",
            password: formData.get('password'),
            triggerNodeId: formData.get('triggerNodeId')?.trim() || "",
            valueType: formData.get('valueType')?.trim() || "",
        };

        const delay = Number.parseInt(formData.get('triggerResetDelayMs'), 10);
        result.triggerResetDelayMs = (!Number.isNaN(delay) && delay >= 0) ? delay : (base.triggerResetDelayMs ?? 0);

        const length = Number.parseInt(formData.get('arrayLength'), 10);
        result.arrayLength = (!Number.isNaN(length) && length >= 0) ? length : (base.arrayLength ?? 0);

        return result;
    }

    async loadConfig() {
        this.setFormDisabled(true);
        this.clearStatus();
        try {
            const response = await fetch("/api/opcua/config", {
                headers: { "Accept": "application/json" },
            });
            if (!response.ok) throw new Error(`Status ${response.status}`);

            const payload = await response.json();
            if (payload?.data) {
                this.populateForm(payload.data);
            } else {
                throw new Error("Invalid response");
            }
        } catch (error) {
            console.error("Load config failed:", error);
            this.showStatus("Errore caricamento configurazione.", "error");
        } finally {
            this.setFormDisabled(false);
        }
    }

    async saveConfig(event) {
        event.preventDefault();
        const payload = this.readForm();
        if (!payload?.endpoint || !payload?.nodeId) {
            this.showStatus("Campi obbligatori mancanti (Endpoint, Node ID).", "error");
            return;
        }

        this.setFormDisabled(true);
        this.showStatus("Salvataggio...", "info");

        try {
            const response = await fetch("/api/opcua/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || "Salvataggio fallito.");
            }

            this.populateForm(result.data);
            this.showStatus("Salvataggio completato.", "success");
            setTimeout(() => this.close(), 1000);
        } catch (error) {
            console.error("Save config failed:", error);
            this.showStatus(error.message || "Errore sconosciuto.", "error");
        } finally {
            this.setFormDisabled(false);
        }
    }
}

// Auto-initialize
new PLCConfigManager();
