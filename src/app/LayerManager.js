/**
 * Layer Manager - Manages drawing layers
 * Provides layer CRUD, visibility, locking, and primitive assignment
 */

/**
 * @typedef {Object} Layer
 * @property {string} id - Unique layer identifier
 * @property {string} name - Display name
 * @property {string} color - Layer color (hex)
 * @property {boolean} visible - Whether primitives on this layer are visible
 * @property {boolean} locked - Whether primitives on this layer can be edited
 * @property {number} order - Layer order (0 = bottom)
 * @property {number} lineWeight - Line weight in pixels (default: 1)
 * @property {number} fontSize - Font size for dimensions/text (default: 12)
 * @property {number} textOffset - Text offset from line (default: 5)
 */

/**
 * Default layer configuration
 */
const DEFAULT_LAYER = {
    id: 'layer_0',
    name: 'Layer 0',
    color: '#00ff00',
    visible: true,
    locked: false,
    order: 0,
    lineWeight: 1,
    fontSize: 12,
    textOffset: 5
};

/**
 * LayerManager class - manages all layer operations
 */
export class LayerManager {
    /**
     * @param {Object} app - Reference to main application
     */
    constructor(app) {
        this.app = app;

        /** @type {Map<string, Layer>} */
        this.layers = new Map();

        /** @type {string} */
        this.activeLayerId = DEFAULT_LAYER.id;

        // Create default layer
        this.layers.set(DEFAULT_LAYER.id, { ...DEFAULT_LAYER });
    }

    /**
     * Get the active layer
     * @returns {Layer}
     */
    getActiveLayer() {
        return this.layers.get(this.activeLayerId) || this.layers.values().next().value;
    }

    /**
     * Set the active layer
     * @param {string} layerId - Layer ID to activate
     * @returns {boolean} - Success
     */
    setActiveLayer(layerId) {
        if (!this.layers.has(layerId)) return false;
        this.activeLayerId = layerId;
        this.notifyChange();
        return true;
    }

    /**
     * Create a new layer
     * @param {string} [name] - Layer name (auto-generated if not provided)
     * @param {string} [color] - Layer color
     * @returns {Layer} - The created layer
     */
    createLayer(name, color) {
        const id = `layer_${Date.now()}`;
        const order = this.layers.size;

        const layer = {
            id,
            name: name || `Layer ${order}`,
            color: color || this.generateColor(order),
            visible: true,
            locked: false,
            order,
            lineWeight: 1,
            fontSize: 12,
            textOffset: 5
        };

        this.layers.set(id, layer);
        this.notifyChange();
        return layer;
    }

    /**
     * Delete a layer (moves primitives to default layer)
     * @param {string} layerId - Layer ID to delete
     * @returns {boolean} - Success
     */
    deleteLayer(layerId) {
        // Cannot delete last layer
        if (this.layers.size <= 1) return false;

        // Cannot delete if it doesn't exist
        if (!this.layers.has(layerId)) return false;

        // Move all primitives from this layer to default layer
        const defaultLayerId = this.getDefaultLayerId();
        for (const prim of this.app.primitives) {
            if (prim.layerId === layerId) {
                prim.layerId = defaultLayerId;
            }
        }

        // Delete the layer
        this.layers.delete(layerId);

        // If active layer was deleted, switch to default
        if (this.activeLayerId === layerId) {
            this.activeLayerId = defaultLayerId;
        }

        this.notifyChange();
        return true;
    }

    /**
     * Rename a layer
     * @param {string} layerId - Layer ID
     * @param {string} newName - New name
     * @returns {boolean} - Success
     */
    renameLayer(layerId, newName) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.name = newName.trim() || layer.name;
        this.notifyChange();
        return true;
    }

    /**
     * Set layer color
     * @param {string} layerId - Layer ID
     * @param {string} color - New color (hex)
     * @returns {boolean} - Success
     */
    setLayerColor(layerId, color) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.color = color;
        this.notifyChange();
        return true;
    }

    /**
     * Set layer line weight
     * @param {string} layerId - Layer ID
     * @param {number} lineWeight - Line weight in pixels
     * @returns {boolean} - Success
     */
    setLayerLineWeight(layerId, lineWeight) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.lineWeight = Math.max(0.1, Math.min(10, lineWeight));
        this.notifyChange();
        this.app.render();
        return true;
    }

    /**
     * Set layer font size
     * @param {string} layerId - Layer ID
     * @param {number} fontSize - Font size in points
     * @returns {boolean} - Success
     */
    setLayerFontSize(layerId, fontSize) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.fontSize = Math.max(6, Math.min(72, fontSize));
        this.notifyChange();
        this.app.render();
        return true;
    }

    /**
     * Set layer text offset
     * @param {string} layerId - Layer ID
     * @param {number} offset - Text offset in points
     * @returns {boolean} - Success
     */
    setLayerTextOffset(layerId, offset) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.textOffset = Math.max(0, Math.min(50, offset));
        this.notifyChange();
        this.app.render();
        return true;
    }

    /**
     * Toggle layer visibility
     * @param {string} layerId - Layer ID
     * @returns {boolean} - New visibility state
     */
    toggleVisibility(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.visible = !layer.visible;
        this.notifyChange();
        this.app.render();
        return layer.visible;
    }

    /**
     * Toggle layer lock
     * @param {string} layerId - Layer ID
     * @returns {boolean} - New lock state
     */
    toggleLock(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return false;

        layer.locked = !layer.locked;
        this.notifyChange();
        return layer.locked;
    }

    /**
     * Check if a primitive is on a visible layer
     * @param {Object} primitive - The primitive to check
     * @returns {boolean}
     */
    isPrimitiveVisible(primitive) {
        const layerId = primitive.layerId || DEFAULT_LAYER.id;
        const layer = this.layers.get(layerId);
        return layer ? layer.visible : true;
    }

    /**
     * Check if a primitive is on a locked layer
     * @param {Object} primitive - The primitive to check
     * @returns {boolean}
     */
    isPrimitiveLocked(primitive) {
        const layerId = primitive.layerId || DEFAULT_LAYER.id;
        const layer = this.layers.get(layerId);
        return layer ? layer.locked : false;
    }

    /**
     * Move primitive(s) to a layer
     * @param {Object|Object[]} primitives - Primitive(s) to move
     * @param {string} layerId - Target layer ID
     */
    movePrimitivesToLayer(primitives, layerId) {
        if (!this.layers.has(layerId)) return;

        const prims = Array.isArray(primitives) ? primitives : [primitives];
        for (const prim of prims) {
            prim.layerId = layerId;
        }

        this.notifyChange();
    }

    /**
     * Get all layers as array (sorted by order)
     * @returns {Layer[]}
     */
    getAllLayers() {
        return Array.from(this.layers.values()).sort((a, b) => a.order - b.order);
    }

    /**
     * Get primitives on a specific layer
     * @param {string} layerId - Layer ID
     * @returns {Object[]}
     */
    getPrimitivesOnLayer(layerId) {
        return this.app.primitives.filter(p => (p.layerId || DEFAULT_LAYER.id) === layerId);
    }

    /**
     * Get the default layer ID
     * @returns {string}
     */
    getDefaultLayerId() {
        // Return the first layer's ID (layer with order 0)
        for (const layer of this.layers.values()) {
            if (layer.order === 0) return layer.id;
        }
        return this.layers.keys().next().value;
    }

    /**
     * Generate a color based on index
     * @param {number} index - Layer index
     * @returns {string} - Hex color
     */
    generateColor(index) {
        const colors = [
            '#00ff00', '#ff0000', '#0080ff', '#ffff00',
            '#ff00ff', '#00ffff', '#ff8000', '#8000ff'
        ];
        return colors[index % colors.length];
    }

    /**
     * Serialize layers for save/load
     * @returns {Object[]}
     */
    /**
     * Serialize layers for save/load
     * @returns {Object}
     */
    serialize() {
        return {
            layers: this.getAllLayers(),
            activeLayerId: this.activeLayerId
        };
    }

    /**
     * Deserialize layers from save data
     * @param {Object|Array} data - Serialized layer data
     */
    deserialize(data) {
        let layersData = [];
        let activeId = null;

        if (Array.isArray(data)) {
            // Legacy format (just array of layers)
            layersData = data;
        } else if (data && typeof data === 'object') {
            // New format
            layersData = data.layers || [];
            activeId = data.activeLayerId;
        }

        if (layersData.length === 0) {
            // Reset to default if no valid data
            this.layers.clear();
            this.layers.set(DEFAULT_LAYER.id, { ...DEFAULT_LAYER });
            this.activeLayerId = DEFAULT_LAYER.id;
            this.notifyChange();
            return;
        }

        this.layers.clear();
        for (const layer of layersData) {
            this.layers.set(layer.id, { ...layer });
        }

        // Restore active layer if it exists
        if (activeId && this.layers.has(activeId)) {
            this.activeLayerId = activeId;
        } else if (!this.layers.has(this.activeLayerId)) {
            // Fallback to default/first layer
            this.activeLayerId = this.getDefaultLayerId();
        }

        this.notifyChange();
    }

    /**
     * Notify UI of layer changes
     */
    notifyChange() {
        // Dispatch custom event for UI updates
        document.dispatchEvent(new CustomEvent('layersChanged', {
            detail: { layers: this.getAllLayers(), activeId: this.activeLayerId }
        }));
    }
}

export default LayerManager;
