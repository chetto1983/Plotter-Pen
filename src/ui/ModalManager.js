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
        // Create overlay if not exists
        if (!document.getElementById('modalOverlay')) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'modalOverlay';
            this.overlay.className = 'cad-modal-overlay';
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close(null);
                }
            });
            document.body.appendChild(this.overlay);
        } else {
            this.overlay = document.getElementById('modalOverlay');
        }
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
