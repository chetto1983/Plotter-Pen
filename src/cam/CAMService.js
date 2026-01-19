/**
 * CAMService
 * Centralizes API interactions for CAM operations and settings.
 */
export class CAMService {
    constructor() {
        this.baseUrl = '/api/cam';
    }

    /**
     * Generate G-Code from primitives
     * @param {Array} primitives - Array of primitives
     * @param {string} type - 'profile' or 'pocket'
     * @param {Object} settings - Job settings
     */
    async process(primitives, type, settings) {
        const payload = {
            primitives,
            type,
            settings
        };
        const res = await fetch(`${this.baseUrl}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => 'Request failed');
            throw new Error(errText || `CAM Process Failed (${res.status})`);
        }
        const json = await res.json();
        if (json.status !== 'ok') {
            throw new Error(json.message || 'CAM Process Failed');
        }
        return json;
    }

    /**
     * Parse G-Code for preview
     * @param {string} gcode 
     */
    async parse(gcode) {
        const res = await fetch(`${this.baseUrl}/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gcode })
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => 'Parse failed');
            throw new Error(errText || `Parse Failed (${res.status})`);
        }
        const json = await res.json();
        if (json.status === 'error') {
            throw new Error(json.message);
        }
        return json.data || json;
    }

    /**
     * Load persisted CAM settings
     */
    async loadSettings() {
        try {
            const res = await fetch('/api/cam/settings');
            if (!res.ok) return null;
            const json = await res.json();
            // Backend returns { data: "..." }
            if (json.data) {
                return typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
            }
            return null;
        } catch (e) {
            console.error('Failed to load CAM settings', e);
            return null;
        }
    }

    /**
     * Save CAM settings
     * @param {Object} settings 
     */
    async saveSettings(settings) {
        try {
            const data = typeof settings === 'string'
                ? settings
                : JSON.stringify(settings ?? {});
            await fetch('/api/cam/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data })
            });
        } catch (e) {
            console.error('Failed to save CAM settings', e);
        }
    }
}
