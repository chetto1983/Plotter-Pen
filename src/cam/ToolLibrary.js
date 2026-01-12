/**
 * Tool Library
 * Manages CNC tool definitions and parameters.
 */
export class ToolLibrary {
    constructor() {
        this.tools = new Map();
        this.activeToolId = null;
        this.initDefaultTools();
    }

    initDefaultTools() {
        this.addTool({
            id: '1',
            name: 'Endmill 3mm',
            type: 'endmill',
            diameter: 3.0,
            units: 'mm',
            defaults: {
                feedXY: 800,
                feedZ: 200,
                spindleRPM: 12000,
                stepDown: 1.0,
                stepOver: 40 // %
            }
        });

        this.addTool({
            id: '2',
            name: 'V-Bit 60deg',
            type: 'vbit',
            diameter: 6.0,
            angle: 60,
            units: 'mm',
            defaults: {
                feedXY: 500,
                feedZ: 100,
                spindleRPM: 15000,
                stepDown: 0.5
            }
        });

        this.addTool({
            id: '99',
            name: 'Pen Marker',
            type: 'pen',
            diameter: 0.5,
            units: 'mm',
            defaults: {
                feedXY: 2000,
                feedZ: 5000, // Rapid up/down
                spindleRPM: 0,
                stepDown: 0 // Surface only
            }
        });
    }

    addTool(tool) {
        if (!tool.id) {
            tool.id = Date.now().toString(36);
        }
        this.tools.set(tool.id, tool);
        return tool.id;
    }

    getTool(id) {
        return this.tools.get(id);
    }

    getAllTools() {
        return Array.from(this.tools.values());
    }

    setActiveTool(id) {
        if (this.tools.has(id)) {
            this.activeToolId = id;
        }
    }

    getActiveTool() {
        return this.tools.get(this.activeToolId);
    }
}
