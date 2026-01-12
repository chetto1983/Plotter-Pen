/**
 * Modal Manager - Handles custom modals for the CAD application
 * Replaces native prompt() and confirm() dialogs
 */

export class ModalManager {
    constructor() {
        this.activeModal = null;
        this.overlay = null;
        this.init();
    }

    /**
     * Initialize modal overlay container
     */
    init() {
        // Remove existing overlay if any
        const existing = document.getElementById('modalOverlay');
        if (existing) {
            existing.remove();
        }

        // Create fresh overlay and append to body
        this.overlay = document.createElement('div');
        this.overlay.id = 'modalOverlay';
        this.overlay.className = 'cad-modal-overlay';
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close(null);
            }
        });
        document.body.appendChild(this.overlay);
    }

    /**
     * Show an input modal (replaces prompt)
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string} options.message - Message/label for input
     * @param {string} options.defaultValue - Default input value
     * @param {string} options.placeholder - Input placeholder
     * @param {string} options.confirmText - Confirm button text
     * @param {string} options.cancelText - Cancel button text
     * @returns {Promise<string|null>} - User input or null if canceled
     */
    prompt(options = {}) {
        const {
            title = 'Input',
            message = '',
            defaultValue = '',
            placeholder = '',
            confirmText = 'OK',
            cancelText = 'Annulla'
        } = options;

        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div class="cad-modal-header">
                    <h3 class="cad-modal-title">${title}</h3>
                    <button type="button" class="cad-modal-close" data-action="close">&times;</button>
                </div>
                <div class="cad-modal-body">
                    ${message ? `<p class="cad-modal-message">${message}</p>` : ''}
                    <input type="text" class="cad-modal-input" value="${defaultValue}" placeholder="${placeholder}" autofocus>
                </div>
                <div class="cad-modal-footer">
                    <button type="button" class="cad-modal-btn cad-modal-btn-secondary" data-action="cancel">${cancelText}</button>
                    <button type="button" class="cad-modal-btn cad-modal-btn-primary" data-action="confirm">${confirmText}</button>
                </div>
            `);

            const input = modal.querySelector('.cad-modal-input');
            const closeBtn = modal.querySelector('[data-action="close"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const confirmBtn = modal.querySelector('[data-action="confirm"]');

            const handleConfirm = () => {
                const value = input.value.trim();
                this.close(value);
                resolve(value || null);
            };

            const handleCancel = () => {
                this.close(null);
                resolve(null);
            };

            closeBtn.addEventListener('click', handleCancel);
            cancelBtn.addEventListener('click', handleCancel);
            confirmBtn.addEventListener('click', handleConfirm);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') handleCancel();
            });

            this.show(modal);
            setTimeout(() => input.focus(), 50);
        });
    }

    /**
     * Show a confirm modal (replaces confirm)
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string} options.message - Confirmation message
     * @param {string} options.confirmText - Confirm button text
     * @param {string} options.cancelText - Cancel button text
     * @param {boolean} options.danger - If true, shows danger styling
     * @returns {Promise<boolean>} - true if confirmed, false if canceled
     */
    confirm(options = {}) {
        const {
            title = 'Conferma',
            message = 'Sei sicuro?',
            confirmText = 'Conferma',
            cancelText = 'Annulla',
            danger = false
        } = options;

        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div class="cad-modal-header">
                    <h3 class="cad-modal-title">${title}</h3>
                    <button type="button" class="cad-modal-close" data-action="close">&times;</button>
                </div>
                <div class="cad-modal-body">
                    <p class="cad-modal-message">${message}</p>
                </div>
                <div class="cad-modal-footer">
                    <button type="button" class="cad-modal-btn cad-modal-btn-secondary" data-action="cancel">${cancelText}</button>
                    <button type="button" class="cad-modal-btn ${danger ? 'cad-modal-btn-danger' : 'cad-modal-btn-primary'}" data-action="confirm">${confirmText}</button>
                </div>
            `);

            const closeBtn = modal.querySelector('[data-action="close"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const confirmBtn = modal.querySelector('[data-action="confirm"]');

            const handleConfirm = () => {
                this.close(true);
                resolve(true);
            };

            const handleCancel = () => {
                this.close(false);
                resolve(false);
            };

            closeBtn.addEventListener('click', handleCancel);
            cancelBtn.addEventListener('click', handleCancel);
            confirmBtn.addEventListener('click', handleConfirm);

            // Keyboard handling
            const handleKeydown = (e) => {
                if (e.key === 'Escape') handleCancel();
                if (e.key === 'Enter') handleConfirm();
            };
            document.addEventListener('keydown', handleKeydown);
            modal._keydownHandler = handleKeydown;

            this.show(modal);
            confirmBtn.focus();
        });
    }

    /**
     * Show an alert modal (replaces alert)
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string} options.message - Alert message
     * @param {string} options.confirmText - Confirm button text
     * @returns {Promise<void>}
     */
    alert(options = {}) {
        const {
            title = 'Avviso',
            message = '',
            confirmText = 'OK'
        } = options;

        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div class="cad-modal-header">
                    <h3 class="cad-modal-title">${title}</h3>
                    <button type="button" class="cad-modal-close" data-action="close">&times;</button>
                </div>
                <div class="cad-modal-body">
                    <p class="cad-modal-message">${message}</p>
                </div>
                <div class="cad-modal-footer">
                    <button type="button" class="cad-modal-btn cad-modal-btn-primary" data-action="confirm">${confirmText}</button>
                </div>
            `);

            const closeBtn = modal.querySelector('[data-action="close"]');
            const confirmBtn = modal.querySelector('[data-action="confirm"]');

            const handleClose = () => {
                this.close();
                resolve();
            };

            closeBtn.addEventListener('click', handleClose);
            confirmBtn.addEventListener('click', handleClose);

            // Keyboard
            const handleKeydown = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') handleClose();
            };
            document.addEventListener('keydown', handleKeydown);
            modal._keydownHandler = handleKeydown;

            this.show(modal);
            confirmBtn.focus();
        });
    }

    /**
     * Show a color picker modal
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string} options.currentColor - Currently selected color
     * @returns {Promise<string|null>} - Selected color or null if canceled
     */
    colorPicker(options = {}) {
        const {
            title = 'Scegli Colore',
            currentColor = '#00ff00'
        } = options;

        // Predefined color palette (CAD-friendly)
        const colors = [
            '#ff0000', '#ff6b6b', '#ff9500', '#ffc107',
            '#00ff00', '#4ade80', '#00ffff', '#22d3ee',
            '#0088ff', '#3b82f6', '#8b5cf6', '#a855f7',
            '#ff00ff', '#ec4899', '#ffffff', '#94a3b8',
            '#64748b', '#475569', '#1e293b', '#000000'
        ];

        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div class="cad-modal-header">
                    <h3 class="cad-modal-title">${title}</h3>
                    <button type="button" class="cad-modal-close" data-action="close">&times;</button>
                </div>
                <div class="cad-modal-body">
                    <div class="cad-color-grid">
                        ${colors.map(c => `
                            <button type="button" 
                                class="cad-color-swatch ${c === currentColor ? 'active' : ''}" 
                                data-color="${c}" 
                                style="background-color: ${c}"
                                title="${c}">
                            </button>
                        `).join('')}
                    </div>
                    <div class="cad-color-custom">
                        <label class="cad-color-custom-label">Colore personalizzato:</label>
                        <div class="cad-color-custom-input-wrap">
                            <input type="color" class="cad-color-custom-input" value="${currentColor}">
                            <span class="cad-color-hex">${currentColor}</span>
                        </div>
                    </div>
                </div>
                <div class="cad-modal-footer">
                    <button type="button" class="cad-modal-btn cad-modal-btn-secondary" data-action="cancel">Annulla</button>
                    <button type="button" class="cad-modal-btn cad-modal-btn-primary" data-action="confirm">Applica</button>
                </div>
            `);

            let selectedColor = currentColor;
            const swatches = modal.querySelectorAll('.cad-color-swatch');
            const customInput = modal.querySelector('.cad-color-custom-input');
            const hexDisplay = modal.querySelector('.cad-color-hex');
            const closeBtn = modal.querySelector('[data-action="close"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const confirmBtn = modal.querySelector('[data-action="confirm"]');

            // Swatch click
            swatches.forEach(swatch => {
                swatch.addEventListener('click', () => {
                    swatches.forEach(s => s.classList.remove('active'));
                    swatch.classList.add('active');
                    selectedColor = swatch.dataset.color;
                    customInput.value = selectedColor;
                    hexDisplay.textContent = selectedColor;
                });
            });

            // Custom color input
            customInput.addEventListener('input', (e) => {
                selectedColor = e.target.value;
                hexDisplay.textContent = selectedColor;
                swatches.forEach(s => s.classList.remove('active'));
            });

            const handleConfirm = () => {
                this.close(selectedColor);
                resolve(selectedColor);
            };

            const handleCancel = () => {
                this.close(null);
                resolve(null);
            };

            closeBtn.addEventListener('click', handleCancel);
            cancelBtn.addEventListener('click', handleCancel);
            confirmBtn.addEventListener('click', handleConfirm);

            // Keyboard handling
            const handleKeydown = (e) => {
                if (e.key === 'Escape') handleCancel();
                if (e.key === 'Enter') handleConfirm();
            };
            document.addEventListener('keydown', handleKeydown);
            modal._keydownHandler = handleKeydown;

            this.show(modal);
        });
    }

    /**
     * Create modal element
     */
    createModal(content) {
        const modal = document.createElement('div');
        modal.className = 'cad-modal';
        modal.innerHTML = content;
        return modal;
    }

    /**
     * Show modal
     */
    show(modal) {
        this.activeModal = modal;
        this.overlay.innerHTML = '';
        this.overlay.appendChild(modal);
        this.overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Show array tool configuration modal
     * @returns {Promise<Object|null>} - Array configuration or null if canceled
     */
    arrayDialog() {
        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div class="cad-modal-header">
                    <h3 class="cad-modal-title">Crea Serie (Array)</h3>
                    <button type="button" class="cad-modal-close" data-action="close">&times;</button>
                </div>
                <div class="cad-modal-body">
                    <div class="cad-tabs">
                        <button class="cad-tab-btn active" data-tab="rectangular">Rettangolare</button>
                        <button class="cad-tab-btn" data-tab="polar">Polare</button>
                    </div>
                    
                    <div id="rectangular-tab" class="cad-tab-content active">
                        <div class="cad-form-group">
                            <label>Righe:</label>
                            <input type="number" id="array-rows" class="cad-modal-input" value="3" min="1">
                        </div>
                        <div class="cad-form-group">
                            <label>Colonne:</label>
                            <input type="number" id="array-cols" class="cad-modal-input" value="4" min="1">
                        </div>
                        <div class="cad-form-group">
                            <label>Spaziatura X (mm):</label>
                            <input type="number" id="array-space-x" class="cad-modal-input" value="10">
                        </div>
                        <div class="cad-form-group">
                            <label>Spaziatura Y (mm):</label>
                            <input type="number" id="array-space-y" class="cad-modal-input" value="10">
                        </div>
                    </div>

                    <div id="polar-tab" class="cad-tab-content" style="display:none;">
                        <div class="cad-form-group">
                            <label>Numero Elementi:</label>
                            <input type="number" id="array-count" class="cad-modal-input" value="6" min="2">
                        </div>
                        <div class="cad-form-group">
                            <label>Angolo Totale (gradi):</label>
                            <input type="number" id="array-angle" class="cad-modal-input" value="360">
                        </div>
                        <div class="cad-form-group">
                            <label class="cad-checkbox-label">
                                <input type="checkbox" id="array-rotate-items" checked>
                                Ruota elementi
                            </label>
                        </div>
                    </div>
                </div>
                <div class="cad-modal-footer">
                    <button type="button" class="cad-modal-btn cad-modal-btn-secondary" data-action="cancel">Annulla</button>
                    <button type="button" class="cad-modal-btn cad-modal-btn-primary" data-action="confirm">Crea</button>
                </div>
            `);

            // Tab handling
            const rectBtn = modal.querySelector('[data-tab="rectangular"]');
            const polarBtn = modal.querySelector('[data-tab="polar"]');
            const rectTab = modal.querySelector('#rectangular-tab');
            const polarTab = modal.querySelector('#polar-tab');
            let activeType = 'rectangular';

            rectBtn.addEventListener('click', () => {
                activeType = 'rectangular';
                rectBtn.classList.add('active');
                polarBtn.classList.remove('active');
                rectTab.style.display = 'block';
                polarTab.style.display = 'none';
            });

            polarBtn.addEventListener('click', () => {
                activeType = 'polar';
                polarBtn.classList.add('active');
                rectBtn.classList.remove('active');
                polarTab.style.display = 'block';
                rectTab.style.display = 'none';
            });

            const closeBtn = modal.querySelector('[data-action="close"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const confirmBtn = modal.querySelector('[data-action="confirm"]');

            const handleConfirm = () => {
                const result = { type: activeType };

                if (activeType === 'rectangular') {
                    result.rows = parseInt(modal.querySelector('#array-rows').value);
                    result.cols = parseInt(modal.querySelector('#array-cols').value);
                    result.spacingX = parseFloat(modal.querySelector('#array-space-x').value);
                    result.spacingY = parseFloat(modal.querySelector('#array-space-y').value);
                } else {
                    result.count = parseInt(modal.querySelector('#array-count').value);
                    result.angle = parseFloat(modal.querySelector('#array-angle').value);
                    result.rotateItems = modal.querySelector('#array-rotate-items').checked;
                }

                this.close(result);
                resolve(result);
            };

            const handleCancel = () => {
                this.close(null);
                resolve(null);
            };

            closeBtn.addEventListener('click', handleCancel);
            cancelBtn.addEventListener('click', handleCancel);
            confirmBtn.addEventListener('click', handleConfirm);

            this.show(modal);
        });
    }

    /**
     * Close modal
     */
    close() {
        if (this.activeModal && this.activeModal._keydownHandler) {
            document.removeEventListener('keydown', this.activeModal._keydownHandler);
        }
        this.overlay.classList.remove('open');
        this.activeModal = null;
        document.body.style.overflow = '';
    }
}

// Singleton instance
let instance = null;

export function getModalManager() {
    if (!instance) {
        instance = new ModalManager();
    }
    return instance;
}

export default ModalManager;
