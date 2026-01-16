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


        // Event Binding (Tab Switching)
        this.root.addEventListener('tab-change', (e) => {
            const tab = e.detail.tab;
            this.handleTabChange(tab);
        });

        // Add Resize Listener
        window.addEventListener('resize', () => {
            // Dispatch resize event for Canvas logic to catch
            window.dispatchEvent(new Event('cad-resize'));
        });
    }

    handleTabChange(tab) {
        // Legacy Logic from plotter_pen.html
        const plcPanel = document.getElementById('plcPanel');
        const camPanel = document.getElementById('camPanel');

        if (tab === 'cam') {
            if (plcPanel) plcPanel.style.display = 'none';
            if (camPanel) camPanel.style.display = 'flex';
        } else {
            if (plcPanel) plcPanel.style.display = 'flex';
            if (camPanel) camPanel.style.display = 'none';
        }
    }
}
