import { parentPort } from 'worker_threads';
import { GCodeParser } from '@polar3d/gcode-viewer';

import { generatePLCFromGCode } from '../../src/cam/GCodePostProcessor.js';
import { linearizeGCode } from '../../src/cam/linearizeGCode.js';

const DEFAULT_BOUNDS = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0, y: 0, z: 0 }
};

function preparePreviewGCode(gcodeText) {
    if (typeof gcodeText !== 'string') {
        return '';
    }

    const lines = gcodeText.split('\n');
    const motionRegex = /^\s*G0?([0123])\b/i;
    const hasXYRegex = /\b[XY][-+]?\d*\.?\d+/i;
    const hasERegex = /\bE[-+]?\d*\.?\d+/i;
    const coordStartRegex = /^\s*[XYZIJR]/i;
    let extrusionCounter = 0;
    let currentMotion = null;

    return lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('(') || trimmed.startsWith(';')) {
            return line;
        }

        const commentIndex = line.indexOf(';');
        let codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
        const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : '';

        const motionMatch = codePart.match(motionRegex);
        if (motionMatch) {
            currentMotion = `G${motionMatch[1]}`;
        } else if (coordStartRegex.test(codePart) && currentMotion) {
            codePart = `${currentMotion} ${codePart.trimStart()}`;
        }

        if (!motionRegex.test(codePart)) {
            return line;
        }

        if (hasERegex.test(codePart)) {
            return line;
        }

        if (!hasXYRegex.test(codePart)) {
            return line;
        }

        if (currentMotion === 'G0') {
            return line;
        }

        extrusionCounter += 1;
        const trimmedCode = codePart.replace(/\s+$/, '');
        return `${trimmedCode} E${extrusionCounter}${commentPart}`;
    }).join('\n');
}

function isFiniteNumber(value) {
    return Number.isFinite(value);
}

function normalizeBounds(bounds) {
    if (!bounds || !bounds.min || !bounds.max) {
        return DEFAULT_BOUNDS;
    }

    const min = bounds.min;
    const max = bounds.max;

    if (!isFiniteNumber(min.x) || !isFiniteNumber(min.y) || !isFiniteNumber(min.z) ||
        !isFiniteNumber(max.x) || !isFiniteNumber(max.y) || !isFiniteNumber(max.z)) {
        return DEFAULT_BOUNDS;
    }

    return {
        min: { x: min.x, y: min.y, z: min.z },
        max: { x: max.x, y: max.y, z: max.z }
    };
}

function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return {};
    }

    return {
        ...metadata,
        thumbnails: {}
    };
}

function handleParse(data) {
    const gcodeText = data?.gcode;
    if (typeof gcodeText !== 'string' || gcodeText.trim().length === 0) {
        throw new Error('G-code text is required.');
    }

    const parser = new GCodeParser();

    // Linearize arcs for preview ONLY to avoid viewer interpretation issues
    // This decouples the "perfect" export G-code from the "safe" preview G-code
    const linearizedGcode = linearizeGCode(gcodeText);
    const previewGcode = preparePreviewGCode(linearizedGcode);
    const result = parser.parse(previewGcode);

    const payload = {
        status: 'ok',
        layers: Array.isArray(result.layers) ? result.layers : [],
        boundingBox: normalizeBounds(result.boundingBox),
        metadata: sanitizeMetadata(result.metadata)
    };

    return { type: 'success', data: JSON.stringify(payload) };
}

function handlePostprocess(data) {
    const gcodeText = data?.gcode;
    if (typeof gcodeText !== 'string' || gcodeText.trim().length === 0) {
        throw new Error('G-code text is required.');
    }

    const options = data?.options && typeof data.options === 'object'
        ? data.options
        : {};
    const result = generatePLCFromGCode(gcodeText, options);

    const payload = {
        status: 'ok',
        commands: result.commands,
        output: result.output
    };

    return { type: 'success', data: JSON.stringify(payload) };
}

if (!parentPort) {
    throw new Error('Worker must be started with a parent port.');
}

async function processMessage(message) {
    const command = message?.command;
    const data = message?.data;

    if (command === 'parse') {
        return handleParse(data);
    }

    if (command === 'postprocess') {
        return handlePostprocess(data);
    }

    throw new Error(`Unknown CAM worker command: ${command}`);
}

parentPort.on('message', (message) => {
    processMessage(message)
        .then((result) => {
            parentPort.postMessage(result);
        })
        .catch((error) => {
            console.error('CAM Worker Error:', error);
            parentPort.postMessage({
                type: 'error',
                message: error?.message ?? 'Unknown error',
                stack: error?.stack
            });
        });
});
