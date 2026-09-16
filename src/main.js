/**
 * Sacchi Plotter Pen - CAD Application
 * Main entry point
 */
import { App } from './ui/App.js';
import { PLCConfigManager } from './app/PLCConfigManager.js';
import { ToolLibraryManager } from './app/ToolLibraryManager.js';
import { log } from './lib/logger.js';
log('MAIN: Loading main.js...');


// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // 1. Mount Refactored UI
  const root = document.getElementById('app');
  if (root) {
    new App(root);
  } else {
    console.error('Root element #app not found!');
  }

  // 2. Initialize Standalone Managers
  new PLCConfigManager();
  new ToolLibraryManager();
});

