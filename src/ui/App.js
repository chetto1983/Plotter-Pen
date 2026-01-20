import { Header } from './components/Header.js';
import { Ribbon } from './components/Ribbon.js';
import { SidebarLeft } from './components/SidebarLeft.js';
import { SidebarRight } from './components/SidebarRight.js';
import { CanvasArea } from './components/CanvasArea.js';
import { Footer } from './components/Footer.js';
import { Modals } from './modals/Modals.js'; // We will put all static modals here for now
import { log } from '../lib/logger.js';

export class App {
    constructor(root) {
        this.root = root;
        // Bound handlers for cleanup
        this._boundHandlers = null;
        this.init();
    }

    init() {
        log('App: Initializing Refactored UI...');
        this.root.className = 'cad-app';
        this.root.innerHTML = ''; // Clear loading message

        // 1. Header
        this.header = new Header();
        this.root.appendChild(this.header.element);

        // 2. Ribbon
        this.ribbon = new Ribbon();
        this.root.appendChild(this.ribbon.element);

        // 3. Main Content (Sidebars + Canvas)
        this.main = document.createElement('main');
        this.main.className = 'cad-main';

        this.sidebarLeft = new SidebarLeft();
        this.main.appendChild(this.sidebarLeft.element);

        this.canvasArea = new CanvasArea();
        this.main.appendChild(this.canvasArea.element);

        this.sidebarRight = new SidebarRight();
        this.main.appendChild(this.sidebarRight.element);

        this.root.appendChild(this.main);

        // 4. Footer (CommandBar + StatusBar)
        this.footer = new Footer();
        this.root.appendChild(this.footer.element);

        // 5. Modals (Static HTML injection)
        this.modals = new Modals();
        this.root.appendChild(this.modals.element);


        // Store bound handlers for cleanup
        this._boundHandlers = {
            tabChange: (e) => {
                const tab = e.detail.tab;
                this.handleTabChange(tab);
            },
            resize: () => {
                window.dispatchEvent(new Event('cad-resize'));
            }
        };

        // Event Binding (Tab Switching)
        this.root.addEventListener('tab-change', this._boundHandlers.tabChange);

        // Add Resize Listener
        window.addEventListener('resize', this._boundHandlers.resize);
    }

    /**
     * Cleanup event listeners to prevent memory leaks
     */
    destroy() {
        if (!this._boundHandlers) return;

        this.root.removeEventListener('tab-change', this._boundHandlers.tabChange);
        window.removeEventListener('resize', this._boundHandlers.resize);
        this._boundHandlers = null;
    }

    handleTabChange() {
        // Tab change handler - PLC panel always visible
        const plcPanel = document.getElementById('plcPanel');
        if (plcPanel) plcPanel.style.display = 'flex';
    }
}
