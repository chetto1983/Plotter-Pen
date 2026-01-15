/**
 * ToolLibraryManager
 * Handles the Tool Library UI, listing, selection, and modification of tools.
 */
import { getModalManager } from '../ui/ModalManager.js';

export class ToolLibraryManager {
    constructor(camManager, toolService) {
        this.camManager = camManager;
        this.toolService = toolService;
        this.selectedLibTool = null;

        this.bindEvents();
    }

    bindEvents() {
        // "Manage Tools" button in CAM Settings (delegated if button exists)
        document.addEventListener('click', async (e) => {
            if (e.target.closest('#btnManageTools')) {
                const modal = document.getElementById('toolLibraryModal');
                if (modal) {
                    modal.classList.add('open');
                    await this.loadToolsList();
                }
            }
            if (e.target.closest('#btnCloseToolLibrary')) {
                document.getElementById('toolLibraryModal')?.classList.remove('open');
            }
            // Save New Tool
            if (e.target.closest('#btnSaveTool')) {
                await this.handleSaveTool();
            }
            // Delete Tool
            if (e.target.closest('#btnDeleteTool')) {
                await this.handleDeleteTool();
            }
            // Select Tool from list
            if (e.target.closest('.tool-item')) {
                const item = e.target.closest('.tool-item');
                this.selectToolItem(item);
            }
            // Use Selected Tool
            if (e.target.closest('#btnSelectToolFromLib')) {
                this.useSelectedTool();
            }
        });
    }

    async loadToolsList() {
        const container = document.getElementById('toolListContainer');
        if (!container) return;

        container.innerHTML = '<div class="tool-lib-empty">Caricamento...</div>';
        try {
            const tools = await this.toolService.getTools();
            if (tools.length === 0) {
                container.innerHTML = '<div class="tool-lib-empty">Nessun utensile salvato.</div>';
                return;
            }

            container.innerHTML = '';
            tools.forEach(tool => {
                const div = document.createElement('div');
                div.className = 'tool-lib-item tool-item';
                div.dataset.id = tool.id;
                div.dataset.json = JSON.stringify(tool);
                div.innerHTML = `
                    <div class="tool-lib-item-name">${tool.name}</div>
                    <div class="tool-lib-item-meta">
                        <span>${tool.type || 'Fresa'}</span>
                        <span>${tool.diameter}mm</span>
                    </div>
                `;
                container.appendChild(div);
            });
        } catch (err) {
            container.innerHTML = `<div class="tool-lib-empty" style="color:var(--error)">Errore: ${err.message}</div>`;
        }
    }

    selectToolItem(element) {
        // Clear previous active
        document.querySelectorAll('.tool-lib-item').forEach(el => el.classList.remove('active'));

        // precise target styling
        element.classList.add('active');

        const tool = JSON.parse(element.dataset.json);

        // Populate form
        document.getElementById('toolName').value = tool.name;
        document.getElementById('toolType').value = tool.type || 'endmill';
        document.getElementById('toolDiameter').value = tool.diameter;

        // Enable delete
        const delBtn = document.getElementById('btnDeleteTool');
        if (delBtn) {
            delBtn.disabled = false;
            delBtn.dataset.id = tool.id;
        }
        this.selectedLibTool = tool;
    }

    async handleSaveTool() {
        const name = document.getElementById('toolName').value;
        const type = document.getElementById('toolType').value;
        const diam = parseFloat(document.getElementById('toolDiameter').value);

        if (!name || isNaN(diam)) {
            getModalManager().alert({ title: 'Errore', message: 'Nome e Diametro sono obbligatori.' });
            return;
        }

        const btn = document.getElementById('btnSaveTool');
        btn.disabled = true;

        const toolData = { name, type, diameter: diam };

        // FIX: Include ID to update existing tool
        if (this.selectedLibTool && this.selectedLibTool.id) {
            toolData.id = this.selectedLibTool.id;
        }

        const success = await this.toolService.saveTool(toolData);
        if (success) {
            await this.loadToolsList();
            // Clear form
            document.getElementById('toolName').value = '';
            document.getElementById('toolDiameter').value = '3.0';
            document.getElementById('btnDeleteTool').disabled = true;
            this.selectedLibTool = null; // Reset selection
        } else {
            getModalManager().alert({ title: 'Errore', message: 'Salvataggio fallito.' });
        }
        btn.disabled = false;
    }

    async handleDeleteTool() {
        const btn = document.getElementById('btnDeleteTool');
        const id = btn.dataset.id;
        if (!id) return;

        if (!confirm('Eliminare questo utensile?')) return;

        await this.toolService.deleteTool(id);
        await this.loadToolsList();

        document.getElementById('toolName').value = '';
        btn.disabled = true;
        this.selectedLibTool = null;
    }

    useSelectedTool() {
        if (!this.selectedLibTool) {
            getModalManager().alert({ title: 'Info', message: 'Seleziona un utensile dalla lista.' });
            return;
        }

        // Apply to CAM Settings
        const diamInput = document.getElementById('camToolDiameter');
        if (diamInput) {
            diamInput.value = this.selectedLibTool.diameter;
            // Also update the active settings object if manager is available
            if (this.camManager.jobSettings) {
                this.camManager.jobSettings.toolDiameter = parseFloat(this.selectedLibTool.diameter);
            }
        }

        // Close Tool Library
        document.getElementById('toolLibraryModal')?.classList.remove('open');
        this.selectedLibTool = null; // Clean up
    }
}
