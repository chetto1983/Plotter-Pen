export class PLCConfigManager {
    constructor() {
        this.modal = document.getElementById('plcConfigModal');
        this.form = document.getElementById('plcConfigForm');
        this.statusBox = document.getElementById('configStatus');
        this.openBtn = document.getElementById('btnOpenPLCConfig');
        this.closeBtn = document.getElementById('btnClosePLCConfig');
        this.reloadBtn = document.getElementById('reloadConfigBtn');

        // Multi-PLC elements
        this.plcSelector = document.getElementById('plcSelector');
        this.plcNameInput = document.getElementById('plcName');
        this.btnNewPLC = document.getElementById('btnNewPLC');
        this.btnDeletePLC = document.getElementById('btnDeletePLC');
        this.btnGenerateCert = document.getElementById('btnGenerateCert');
        this.certStatus = document.getElementById('certStatus');

        // Certificate download buttons
        this.btnDownloadPem = document.getElementById('btnDownloadPem');
        this.btnDownloadKey = document.getElementById('btnDownloadKey');
        this.btnDownloadDer = document.getElementById('btnDownloadDer');

        this.cachedConfig = null;
        this.plcList = [];

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
                if (e.target === this.modal) this.close();
            });
        }
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.saveConfig(e));
        }
        if (this.reloadBtn) {
            this.reloadBtn.addEventListener('click', () => this.loadPLCList());
        }
        // Multi-PLC handlers
        if (this.plcSelector) {
            this.plcSelector.addEventListener('change', () => this.onPLCSelect());
        }
        if (this.btnNewPLC) {
            this.btnNewPLC.addEventListener('click', () => this.createNewPLC());
        }
        if (this.btnDeletePLC) {
            this.btnDeletePLC.addEventListener('click', () => this.deletePLC());
        }
        if (this.btnGenerateCert) {
            this.btnGenerateCert.addEventListener('click', () => this.generateCertificates());
        }
        // Certificate download handlers
        if (this.btnDownloadPem) {
            this.btnDownloadPem.addEventListener('click', () => this.downloadCert('pem'));
        }
        if (this.btnDownloadKey) {
            this.btnDownloadKey.addEventListener('click', () => this.downloadCert('key'));
        }
        if (this.btnDownloadDer) {
            this.btnDownloadDer.addEventListener('click', () => this.downloadCert('der'));
        }
    }

    open() {
        if (this.modal) {
            this.modal.classList.add('open');
            this.loadPLCList();
            this.checkCertificates();
        }
    }

    // Load all PLCs and populate dropdown
    async loadPLCList() {
        this.setFormDisabled(true);
        this.clearStatus();
        try {
            const response = await fetch("/api/opcua/plcs");
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const payload = await response.json();
            this.plcList = payload?.data || [];
            this.populatePLCSelector();
            // Load active PLC config
            const activePLC = this.plcList.find(p => p.isActive);
            if (activePLC) {
                this.plcSelector.value = activePLC.id;
                this.populateForm(activePLC);
            } else if (this.plcList.length > 0) {
                this.plcSelector.value = this.plcList[0].id;
                this.populateForm(this.plcList[0]);
            }
        } catch {
            this.showStatus("Errore caricamento lista PLC.", "error");
        } finally {
            this.setFormDisabled(false);
        }
    }

    populatePLCSelector() {
        if (!this.plcSelector) return;
        this.plcSelector.innerHTML = this.plcList.map(plc =>
            `<option value="${plc.id}"${plc.isActive ? ' selected' : ''}>${plc.name}</option>`
        ).join('');
    }

    async onPLCSelect() {
        const id = parseInt(this.plcSelector.value, 10);
        if (!id) return;
        // Activate selected PLC
        try {
            const response = await fetch(`/api/opcua/plcs/${id}/activate`, { method: "POST" });
            if (!response.ok) throw new Error("Activation failed");
            const payload = await response.json();
            this.populateForm(payload.data);
            this.showStatus("PLC attivato.", "success");
        } catch {
            this.showStatus("Errore attivazione PLC.", "error");
        }
    }

    async createNewPLC() {
        const name = prompt("Nome del nuovo PLC:", "Nuovo PLC");
        if (!name) return;
        try {
            const response = await fetch("/api/opcua/plcs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, endpoint: "opc.tcp://192.168.0.1:4840" })
            });
            if (!response.ok) throw new Error("Creation failed");
            this.showStatus("PLC creato.", "success");
            await this.loadPLCList();
        } catch {
            this.showStatus("Errore creazione PLC.", "error");
        }
    }

    async deletePLC() {
        const id = parseInt(this.plcSelector.value, 10);
        if (!id) return;
        const plc = this.plcList.find(p => p.id === id);
        if (!confirm(`Eliminare "${plc?.name}"?`)) return;
        try {
            const response = await fetch(`/api/opcua/plcs/${id}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Cannot delete active PLC");
            this.showStatus("PLC eliminato.", "success");
            await this.loadPLCList();
        } catch {
            this.showStatus("Impossibile eliminare PLC attivo.", "error");
        }
    }

    async generateCertificates() {
        this.showStatus("Generazione certificati...", "info");
        try {
            const response = await fetch("/api/opcua/certificates/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            });
            if (!response.ok) throw new Error("Generation failed");
            const result = await response.json();
            if (this.certStatus) {
                this.certStatus.textContent = "Generati";
                this.certStatus.style.color = "var(--success)";
            }
            this.enableDownloadButtons(true);
            this.showStatus(result.message || "Certificati generati.", "success");
        } catch {
            this.showStatus("Errore generazione certificati.", "error");
        }
    }

    async checkCertificates() {
        try {
            const response = await fetch("/api/opcua/certificates/status");
            if (!response.ok) {
                this.enableDownloadButtons(false);
                return;
            }
            const result = await response.json();
            if (result.exists) {
                this.enableDownloadButtons(true);
                if (this.certStatus) {
                    this.certStatus.textContent = "Disponibili";
                    this.certStatus.style.color = "var(--success)";
                }
            } else {
                this.enableDownloadButtons(false);
            }
        } catch {
            this.enableDownloadButtons(false);
        }
    }

    enableDownloadButtons(enabled) {
        if (this.btnDownloadPem) this.btnDownloadPem.disabled = !enabled;
        if (this.btnDownloadKey) this.btnDownloadKey.disabled = !enabled;
        if (this.btnDownloadDer) this.btnDownloadDer.disabled = !enabled;
    }

    downloadCert(type) {
        window.open(`/api/opcua/certificates/download/${type}`, '_blank');
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
        // PLC name
        if (this.plcNameInput) this.plcNameInput.value = data.name ?? "";
        // Connection
        if (this.form.endpoint) this.form.endpoint.value = data.endpoint ?? "";
        if (this.form.securityMode) this.form.securityMode.value = data.securityMode ?? "None";
        if (this.form.securityPolicy) this.form.securityPolicy.value = data.securityPolicy ?? "None";
        if (this.form.username) this.form.username.value = data.username ?? "";
        if (this.form.password) this.form.password.value = data.password ?? "";
        // Position nodes
        if (this.form.positionXNode) this.form.positionXNode.value = data.positionXNode ?? "";
        if (this.form.positionYNode) this.form.positionYNode.value = data.positionYNode ?? "";
        if (this.form.positionZNode) this.form.positionZNode.value = data.positionZNode ?? "";
        // Chunked transfer nodes
        if (this.form.pointArrayNode) this.form.pointArrayNode.value = data.pointArrayNode ?? "";
        if (this.form.endOfFileNode) this.form.endOfFileNode.value = data.endOfFileNode ?? "";
        if (this.form.triggerWriteNode) this.form.triggerWriteNode.value = data.triggerWriteNode ?? "";
        if (this.form.readDoneNode) this.form.readDoneNode.value = data.readDoneNode ?? "";
        if (this.form.chunkSize) this.form.chunkSize.value = data.chunkSize ?? 20;
        if (this.form.ackTimeout) this.form.ackTimeout.value = data.ackTimeout ?? 5000;
        if (this.form.pollInterval) this.form.pollInterval.value = data.pollInterval ?? 100;
    }

    readForm() {
        if (!this.form) return null;
        const formData = new FormData(this.form);
        const base = this.cachedConfig ? { ...this.cachedConfig } : {};

        const pointArr = formData.get('pointArrayNode')?.trim() || "";
        const triggerWrite = formData.get('triggerWriteNode')?.trim() || "";

        return {
            ...base,
            // PLC name
            name: this.plcNameInput?.value?.trim() || base.name || "PLC",
            // Connection
            endpoint: formData.get('endpoint')?.trim() || "",
            securityMode: formData.get('securityMode') || "None",
            securityPolicy: formData.get('securityPolicy') || "None",
            username: formData.get('username')?.trim() || "",
            password: formData.get('password') || "",
            // Position nodes
            positionXNode: formData.get('positionXNode')?.trim() || "",
            positionYNode: formData.get('positionYNode')?.trim() || "",
            positionZNode: formData.get('positionZNode')?.trim() || "",
            // Chunked transfer nodes (Com)
            pointArrayNode: pointArr,
            triggerWriteNode: triggerWrite,
            readDoneNode: formData.get('readDoneNode')?.trim() || "",
            endOfFileNode: formData.get('endOfFileNode')?.trim() || "",
            chunkSize: parseInt(formData.get('chunkSize'), 10) || 20,
            ackTimeout: parseInt(formData.get('ackTimeout'), 10) || 5000,
            pollInterval: parseInt(formData.get('pollInterval'), 10) || 100,
            // Legacy fields (map to chunked transfer)
            dataNode: pointArr,
            dataType: "string_array",
            triggerNode: triggerWrite,
            resetNode: triggerWrite,
        };
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
        } catch {
            this.showStatus("Errore caricamento configurazione.", "error");
        } finally {
            this.setFormDisabled(false);
        }
    }

    async saveConfig(event) {
        event.preventDefault();
        const payload = this.readForm();
        if (!payload?.endpoint || !payload?.pointArrayNode) {
            this.showStatus("Campi obbligatori mancanti (Endpoint, Point).", "error");
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
            this.showStatus(error.message || "Errore sconosciuto.", "error");
        } finally {
            this.setFormDisabled(false);
        }
    }
}

// Auto-init removed. Main app will instantiate.
// new PLCConfigManager();
