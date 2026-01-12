// CAM Worker Core (ES Module)
// ClipperLib is expected to be loaded in global scope (self.ClipperLib) by the loader.

import { ToolpathGenerator } from './ToolpathGenerator.js';
import { MachineConfig } from './MachineConfig.js';
import { ToolLibrary } from './ToolLibrary.js';

self.onmessage = function (e) {
    const { command, data } = e.data;

    if (command === 'generate') {
        try {
            const { job, settings, toolsData } = data;

            console.log('WORKER: Starting generation...', job);

            // Hydrate ToolLibrary
            const toolLibrary = new ToolLibrary();
            if (toolsData) {
                // toolsData is { id: tool }
                Object.values(toolsData).forEach(tool => {
                    toolLibrary.addTool(tool);
                });
            }

            const machine = new MachineConfig();
            if (settings) {
                machine.update(settings);
            }

            const generator = new ToolpathGenerator(machine, toolLibrary);
            const gcode = generator.generateJob(job);

            self.postMessage({
                status: 'success',
                gcode: gcode
            });

        } catch (err) {
            console.error('WORKER Error:', err);
            self.postMessage({
                status: 'error',
                message: err.message,
                stack: err.stack
            });
        }
    }
}


// Notify main thread that we are ready
self.postMessage({ status: 'ready' });
