import { errorText, responseError } from "../services/serverError.js";

export class PLCConfigManager {
    constructor() {
        this.modal = document.getElementById('plcConfigModal');
        this.form = document.getElementById('plcConfigForm');
        this.statusBox = document.getElementById('configStatus');
        this.openBtn = document.getElementById('btnOpenPLCConfig');
        this.closeBtn = document.getElementById('btnClosePLCConfig');
        this.reloadBtn = document.getElementById('reloadConfigBtn');
        this.testBtn = document.getElementById('btnTestConnection');
        this.combos = [...document.querySelectorAll('.cad-combo')];
        this.variables = [];

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
        if (this.testBtn) {
            this.testBtn.addEventListener('click', () => this.testConnection());
        }
        this.initCombos();
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
            this.loadVariables();
        }
    }

    // Every node field is a combo box: the button opens the variables read from the PLC,
    // clicking one writes its path in the field, and the field stays free to type in.
    initCombos() {
        for (const combo of this.combos ?? []) {
            const input = combo.querySelector("input");
            const toggle = combo.querySelector(".cad-combo-toggle");
            const list = combo.querySelector(".cad-combo-list");
            if (!input || !toggle || !list) continue;

            toggle.addEventListener("click", () => {
                const wasOpen = !list.hidden;
                this.closeCombos();
                // the button shows everything: a field already holding a variable would
                // otherwise offer only itself
                if (!wasOpen) this.openCombo(combo, false);
            });
            input.addEventListener("input", () => {
                input.title = input.value;
                if (!list.hidden) this.openCombo(combo, true);
            });
            list.addEventListener("click", (event) => {
                const item = event.target.closest("li");
                if (!item || item.classList.contains("empty")) return;
                input.value = item.dataset.path;
                input.title = item.dataset.path;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                this.closeCombos();
            });
        }

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".cad-combo")) this.closeCombos();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") this.closeCombos();
        });
    }

    closeCombos() {
        for (const combo of this.combos ?? []) {
            const list = combo.querySelector(".cad-combo-list");
            if (list) list.hidden = true;
        }
    }

    // Show what the PLC exposes, narrowed by what is being typed when it is the typing
    // that opens the list
    openCombo(combo, narrow = false) {
        const input = combo.querySelector("input");
        const list = combo.querySelector(".cad-combo-list");
        const typed = narrow ? input.value.trim().toLowerCase() : "";
        const shown = this.variables.filter((v) => !typed || v.path.toLowerCase().includes(typed));

        list.innerHTML = "";
        if (this.variables.length === 0) {
            list.appendChild(this.comboMessage("Nessuna variabile letta: usa Prova connessione."));
        } else if (shown.length === 0) {
            list.appendChild(this.comboMessage(`Nessuna variabile contiene "${input.value.trim()}".`));
        } else {
            // every variable of one PLC starts with the same interface: showing that prefix
            // in each row would push the part that tells them apart out of sight
            const prefix = this.commonPrefix(this.variables.map((v) => v.path));
            for (const variable of shown) {
                const item = document.createElement("li");
                item.dataset.path = variable.path;
                item.textContent = variable.path.slice(prefix.length);
                item.title = `${variable.path} (${variable.nodeId})`;
                const nodeId = document.createElement("span");
                nodeId.className = "node-id";
                nodeId.textContent = variable.nodeId;
                item.appendChild(nodeId);
                list.appendChild(item);
            }
        }
        list.hidden = false;
    }

    // The part every path starts with, cut at the last separator
    commonPrefix(paths) {
        if (paths.length < 2) return "";
        let prefix = paths[0];
        for (const path of paths.slice(1)) {
            while (prefix && !path.startsWith(prefix)) prefix = prefix.slice(0, -1);
        }
        return prefix.slice(0, prefix.lastIndexOf("/") + 1);
    }

    comboMessage(text) {
        const item = document.createElement("li");
        item.className = "empty";
        item.textContent = text;
        return item;
    }

    // Keep the variables the PLC answered with, for every combo to offer
    fillVariables(variables) {
        this.variables = variables ?? [];
        this.closeCombos();
        return this.variables.length;
    }

    // Variables of the PLC the app is already connected to. It never opens a connection:
    // opening the window must not reach for the machine by itself.
    async loadVariables() {
        try {
            const response = await fetch("/api/opcua/variables", { headers: { "Accept": "application/json" } });
            if (!response.ok) return;
            const payload = await response.json();
            if (payload?.connected) this.fillVariables(payload.variables);
        } catch {
            // the list is a convenience: without it the fields still take a name or a NodeID
        }
    }

    // Try the settings on screen, without saving them and without touching the connection
    // the app is working on, and fill the lists with what the PLC answers.
    async testConnection() {
        const payload = this.readForm();
        if (!payload?.endpoint) {
            this.showStatus("Endpoint mancante.", "error");
            return;
        }

        this.setFormDisabled(true);
        this.showStatus("Prova connessione in corso...", "info");
        try {
            const response = await fetch("/api/opcua/test", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.connected) {
                this.showStatus(`Connessione fallita: ${errorText(result, response)}`, "error");
                return;
            }
            const count = this.fillVariables(result.variables);
            if (result.error) {
                this.showStatus(`Collegato a ${result.endpoint}, variabili non leggibili: ${result.error}`, "error");
            } else {
                this.showStatus(`Collegato a ${result.endpoint} — ${count} variabili trovate`, "success");
            }
        } catch (error) {
            this.showStatus(`Connessione fallita: ${error.message}`, "error");
        } finally {
            this.setFormDisabled(false);
        }
    }

    // Load all PLCs and populate dropdown
    async loadPLCList() {
        this.setFormDisabled(true);
        this.clearStatus();
        try {
            const response = await fetch("/api/opcua/plcs");
            if (!response.ok) throw await responseError(response);
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
        } catch (error) {
            this.showStatus(`Errore caricamento lista PLC: ${error.message}`, "error");
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
            if (!response.ok) throw await responseError(response);
            const payload = await response.json();
            this.populateForm(payload.data);
            this.showStatus("PLC attivato.", "success");
        } catch (error) {
            this.showStatus(`Errore attivazione PLC: ${error.message}`, "error");
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
            if (!response.ok) throw await responseError(response);
            this.showStatus("PLC creato.", "success");
            await this.loadPLCList();
        } catch (error) {
            this.showStatus(`Errore creazione PLC: ${error.message}`, "error");
        }
    }

    async deletePLC() {
        const id = parseInt(this.plcSelector.value, 10);
        if (!id) return;
        const plc = this.plcList.find(p => p.id === id);
        if (!confirm(`Eliminare "${plc?.name}"?`)) return;
        try {
            const response = await fetch(`/api/opcua/plcs/${id}`, { method: "DELETE" });
            if (!response.ok) throw await responseError(response);
            this.showStatus("PLC eliminato.", "success");
            await this.loadPLCList();
        } catch (error) {
            this.showStatus(`Errore eliminazione PLC: ${error.message}`, "error");
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
            if (!response.ok) throw await responseError(response);
            const result = await response.json();
            if (this.certStatus) {
                this.certStatus.textContent = "Generati";
                this.certStatus.style.color = "var(--success)";
            }
            this.enableDownloadButtons(true);
            this.showStatus(result.message || "Certificati generati.", "success");
        } catch (error) {
            this.showStatus(`Errore generazione certificati: ${error.message}`, "error");
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
        // the fields are narrower than a path: hovering one shows it whole
        for (const combo of this.combos ?? []) {
            const input = combo.querySelector("input");
            if (input) input.title = input.value;
        }
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
                throw new Error(errorText(result, response));
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
