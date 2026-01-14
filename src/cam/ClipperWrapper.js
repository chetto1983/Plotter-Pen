/**
 * ClipperWrapper - Interface for clipper2-wasm
 * Handles polygon offsetting and boolean operations.
 *
 * IMPORTANT: This uses clipper2-wasm which requires async initialization.
 * All methods are async and must be awaited.
 */

import { SCALE } from './constants.js';
import { isMainThread } from 'worker_threads';

let clipper2 = null;
let initPromise = null;
let initError = null;

// Track which thread initialized clipper
let initThreadId = null;

/**
 * Initialize clipper2-wasm module
 * @returns {Promise<Object>} The initialized clipper2 module
 */
async function initClipper() {
    // In worker threads, always reinitialize (don't share state with main thread)
    const currentThread = isMainThread ? 'main' : 'worker';

    if (initThreadId && initThreadId !== currentThread) {
        // Reset cached state when switching thread contexts
        clipper2 = null;
        initPromise = null;
        initError = null;
    }
    initThreadId = currentThread;

    if (clipper2) return clipper2;
    if (initError) throw initError;
    if (initPromise) return initPromise;

    try {
        // Dynamic import for ES modules
        const module = await import('clipper2-wasm');
        const factory = module.default || module;

        const isNode = typeof window === 'undefined' && typeof process !== 'undefined';

        let factoryOptions = {};

        if (isNode) {
            // Node.js: load WASM binary directly since fetch doesn't work for local files
            const { createRequire } = await import('node:module');
            const path = await import('node:path');
            const fs = await import('node:fs');
            const require = createRequire(import.meta.url);
            const clipperPath = require.resolve('clipper2-wasm');
            const wasmPath = path.join(path.dirname(clipperPath), 'clipper2z.wasm');
            const wasmBinary = fs.readFileSync(wasmPath);
            factoryOptions.wasmBinary = wasmBinary;
        } else {
            // Browser: use locateFile to find WASM in node_modules (ES module path)
            factoryOptions.locateFile = (file) => `/node_modules/clipper2-wasm/dist/es/${file}`;
        }

        initPromise = factory(factoryOptions);
        clipper2 = await initPromise;
        return clipper2;
    } catch (err) {
        initError = new Error(`Failed to initialize clipper2-wasm: ${err.message}`);
        throw initError;
    }
}

/**
 * Convert JS points array to clipper2-wasm Path64
 * @param {Object} lib - clipper2-wasm module
 * @param {Array<{x,y}>} points - Array of points
 * @param {number} scale - Scale factor
 * @returns {Object} Path64 object (must be deleted after use)
 */
function pointsToPath64(lib, points, scale) {
    const flatArray = [];
    for (const p of points) {
        flatArray.push(BigInt(Math.round(p.x * scale)));
        flatArray.push(BigInt(Math.round(p.y * scale)));
    }
    return lib.MakePath64(flatArray);
}

/**
 * Convert clipper2-wasm Paths64 to JS points array
 * @param {Object} paths64 - Paths64 object
 * @param {number} scale - Scale factor
 * @returns {Array<Array<{x,y}>>} Array of point arrays
 */
function paths64ToPoints(paths64, scale) {
    const result = [];
    const numPaths = paths64.size();

    for (let i = 0; i < numPaths; i++) {
        const path = paths64.get(i);
        const numPoints = path.size();
        const points = [];

        for (let j = 0; j < numPoints; j++) {
            const pt = path.get(j);
            points.push({
                x: Number(pt.x) / scale,
                y: Number(pt.y) / scale
            });
        }

        if (points.length > 0) {
            result.push(points);
        }
    }

    return result;
}

export class ClipperWrapper {
    static get scale() {
        return SCALE.CLIPPER;
    }

    /**
     * Initialize the Clipper library (must be called before other methods)
     * @returns {Promise<void>}
     */
    static async init() {
        await initClipper();
    }

    /**
     * Check if Clipper is initialized
     * @returns {boolean}
     */
    static isInitialized() {
        return clipper2 !== null;
    }

    /**
     * Offset a polygon (closed loop)
     * @param {Array<{x,y}>} points - Array of points
     * @param {number} delta - Offset distance (+ for out, - for in)
     * @param {string} joinType - 'Square', 'Round', 'Miter'
     * @returns {Promise<Array<Array<{x,y}>>>} - Array of offset paths
     */
    static async offsetPolygon(points, delta, joinType = 'Round') {
        const lib = await initClipper();

        if (!Array.isArray(points) || points.length < 3) {
            return [];
        }

        const scale = this.scale;
        const jt = this.getJoinType(lib, joinType);
        const et = lib.EndType.Polygon;

        let path64 = null;
        let paths64 = null;
        let result = null;

        try {
            path64 = pointsToPath64(lib, points, scale);
            paths64 = new lib.Paths64();
            paths64.push_back(path64);

            result = lib.InflatePaths64(paths64, delta * scale, jt, et);
            return paths64ToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.offsetPolygon error:', err);
            return [];
        } finally {
            if (path64) path64.delete();
            if (paths64) paths64.delete();
            if (result) result.delete();
        }
    }

    /**
     * Offset an open path (polyline)
     * @param {Array<{x,y}>} points
     * @param {number} delta
     * @param {string} joinType
     * @param {string} endType - 'Round', 'Square', 'Butt'
     * @returns {Promise<Array<Array<{x,y}>>>}
     */
    static async offsetPolyline(points, delta, joinType = 'Round', endType = 'Round') {
        const lib = await initClipper();

        if (!Array.isArray(points) || points.length < 2) {
            return [];
        }

        const scale = this.scale;
        const jt = this.getJoinType(lib, joinType);
        const et = this.getEndType(lib, endType);

        let path64 = null;
        let paths64 = null;
        let result = null;

        try {
            path64 = pointsToPath64(lib, points, scale);
            paths64 = new lib.Paths64();
            paths64.push_back(path64);

            result = lib.InflatePaths64(paths64, delta * scale, jt, et);
            return paths64ToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.offsetPolyline error:', err);
            return [];
        } finally {
            if (path64) path64.delete();
            if (paths64) paths64.delete();
            if (result) result.delete();
        }
    }

    /**
     * Offset multiple paths
     * @param {Array<Array<{x,y}>>} paths
     * @param {number} delta
     * @param {string} joinType
     * @returns {Promise<Array<Array<{x,y}>>>}
     */
    static async offsetPaths(paths, delta, joinType = 'Round') {
        const lib = await initClipper();

        if (!Array.isArray(paths) || paths.length === 0) {
            return [];
        }

        const scale = this.scale;
        const jt = this.getJoinType(lib, joinType);
        const et = lib.EndType.Polygon;

        const path64List = [];
        let paths64 = null;
        let result = null;

        try {
            paths64 = new lib.Paths64();

            for (const path of paths) {
                if (!Array.isArray(path) || path.length < 3) continue;
                const p64 = pointsToPath64(lib, path, scale);
                path64List.push(p64);
                paths64.push_back(p64);
            }

            if (paths64.size() === 0) {
                return [];
            }

            result = lib.InflatePaths64(paths64, delta * scale, jt, et);
            return paths64ToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.offsetPaths error:', err);
            return [];
        } finally {
            for (const p of path64List) p.delete();
            if (paths64) paths64.delete();
            if (result) result.delete();
        }
    }

    /**
     * Boolean difference operation
     * @param {Array<Array<{x,y}>>} subjectPaths
     * @param {Array<Array<{x,y}>>} clipPaths
     * @returns {Promise<Array<Array<{x,y}>>>}
     */
    static async difference(subjectPaths, clipPaths) {
        const lib = await initClipper();

        if (!Array.isArray(subjectPaths) || subjectPaths.length === 0) {
            return [];
        }

        const scale = this.scale;
        const subjectPath64List = [];
        const clipPath64List = [];
        let subjects = null;
        let clips = null;
        let result = null;

        try {
            subjects = new lib.Paths64();
            clips = new lib.Paths64();

            for (const path of subjectPaths) {
                if (!Array.isArray(path) || path.length < 3) continue;
                const p64 = pointsToPath64(lib, path, scale);
                subjectPath64List.push(p64);
                subjects.push_back(p64);
            }

            if (Array.isArray(clipPaths)) {
                for (const path of clipPaths) {
                    if (!Array.isArray(path) || path.length < 3) continue;
                    const p64 = pointsToPath64(lib, path, scale);
                    clipPath64List.push(p64);
                    clips.push_back(p64);
                }
            }

            result = lib.Difference64(subjects, clips, lib.FillRule.NonZero);
            return paths64ToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.difference error:', err);
            return [];
        } finally {
            for (const p of subjectPath64List) p.delete();
            for (const p of clipPath64List) p.delete();
            if (subjects) subjects.delete();
            if (clips) clips.delete();
            if (result) result.delete();
        }
    }

    /**
     * Boolean union operation
     * @param {Array<Array<{x,y}>>} paths
     * @returns {Promise<Array<Array<{x,y}>>>}
     */
    static async union(paths) {
        const lib = await initClipper();

        if (!Array.isArray(paths) || paths.length === 0) {
            return [];
        }

        const scale = this.scale;
        const path64List = [];
        let paths64 = null;
        let result = null;

        try {
            paths64 = new lib.Paths64();

            for (const path of paths) {
                if (!Array.isArray(path) || path.length < 3) continue;
                const p64 = pointsToPath64(lib, path, scale);
                path64List.push(p64);
                paths64.push_back(p64);
            }

            result = lib.Union64(paths64, lib.FillRule.NonZero);
            return paths64ToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.union error:', err);
            return [];
        } finally {
            for (const p of path64List) p.delete();
            if (paths64) paths64.delete();
            if (result) result.delete();
        }
    }

    /**
     * Boolean intersection operation
     * @param {Array<Array<{x,y}>>} subjectPaths
     * @param {Array<Array<{x,y}>>} clipPaths
     * @returns {Promise<Array<Array<{x,y}>>>}
     */
    static async intersection(subjectPaths, clipPaths) {
        const lib = await initClipper();

        if (!Array.isArray(subjectPaths) || subjectPaths.length === 0) {
            return [];
        }

        const scale = this.scale;
        const subjectPath64List = [];
        const clipPath64List = [];
        let subjects = null;
        let clips = null;
        let result = null;

        try {
            subjects = new lib.Paths64();
            clips = new lib.Paths64();

            for (const path of subjectPaths) {
                if (!Array.isArray(path) || path.length < 3) continue;
                const p64 = pointsToPath64(lib, path, scale);
                subjectPath64List.push(p64);
                subjects.push_back(p64);
            }

            if (Array.isArray(clipPaths)) {
                for (const path of clipPaths) {
                    if (!Array.isArray(path) || path.length < 3) continue;
                    const p64 = pointsToPath64(lib, path, scale);
                    clipPath64List.push(p64);
                    clips.push_back(p64);
                }
            }

            result = lib.Intersect64(subjects, clips, lib.FillRule.NonZero);
            return paths64ToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.intersection error:', err);
            return [];
        } finally {
            for (const p of subjectPath64List) p.delete();
            for (const p of clipPath64List) p.delete();
            if (subjects) subjects.delete();
            if (clips) clips.delete();
            if (result) result.delete();
        }
    }

    /**
     * Get JoinType enum from string
     */
    static getJoinType(lib, type) {
        switch ((type || '').toLowerCase()) {
            case 'square': return lib.JoinType.Square;
            case 'miter': return lib.JoinType.Miter;
            default: return lib.JoinType.Round;
        }
    }

    /**
     * Get EndType enum from string
     */
    static getEndType(lib, type) {
        switch ((type || '').toLowerCase()) {
            case 'square': return lib.EndType.Square;
            case 'butt': return lib.EndType.Butt;
            case 'joined': return lib.EndType.Joined;
            default: return lib.EndType.Round;
        }
    }
}
