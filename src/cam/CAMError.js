/**
 * CAM Error Class
 * Provides contextual error information for CAM operations.
 */

export class CAMError extends Error {
    /**
     * @param {string} message - Error message
     * @param {Object} options - Error context
     * @param {number} [options.line] - G-code line number
     * @param {string} [options.file] - Source file
     * @param {string} [options.context] - Additional context (e.g., G-code snippet)
     * @param {string} [options.operation] - CAM operation type
     */
    constructor(message, { line, file, context, operation } = {}) {
        super(message);
        this.name = 'CAMError';
        this.line = line;
        this.file = file;
        this.context = context;
        this.operation = operation;
    }

    toString() {
        let str = `${this.name}: ${this.message}`;
        if (this.line !== undefined) str += ` (line ${this.line})`;
        if (this.file) str += ` in ${this.file}`;
        if (this.context) str += `\nContext: ${this.context}`;
        return str;
    }
}
