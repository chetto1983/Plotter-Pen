/**
 * ClipperWrapper - Interface for clipper2-wasm
 * Handles polygon offsetting and boolean operations.
 *
 * IMPORTANT: This uses clipper2-wasm which requires async initialization.
 * All methods are async and must be awaited.
 */

import { SCALE } from './constants.js';

let clipper2 = null;
let initPromise = null;
let initError = null;

/**
 * Initialize clipper2-wasm module
 * @returns {Promise<Object>} The initialized clipper2 module
 */
async function initClipper() {
    if (clipper2) return clipper2;
    if (initError) throw initError;
    if (initPromise) return initPromise;

    try {
        // Dynamic import for ES modules
        const module = await import('clipper2-wasm');
        const factory = module.default || module;

        initPromise = factory({
            locateFile: (file) => {
                // Try multiple paths for WASM file
                if (typeof window !== 'undefined') {
                    return `/node_modules/clipper2-wasm/dist/${file}`;
                }
                return file;
            }
        });

        clipper2 = await initPromise;
        return clipper2;
    } catch (err) {
        initError = new Error(`Failed to initialize clipper2-wasm: ${err.message}`);
        throw initError;
    }
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

        // Create scaled path
        const scaledPoints = points.map(p => ({
            x: BigInt(Math.round(p.x * scale)),
            y: BigInt(Math.round(p.y * scale))
        }));

        try {
            // Use InflatePaths for offsetting
            const result = lib.InflatePaths64(
                [scaledPoints],
                delta * scale,
                jt,
                et
            );

            return this.pathsToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.offsetPolygon error:', err);
            return [];
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

        const scaledPoints = points.map(p => ({
            x: BigInt(Math.round(p.x * scale)),
            y: BigInt(Math.round(p.y * scale))
        }));

        try {
            const result = lib.InflatePaths64(
                [scaledPoints],
                delta * scale,
                jt,
                et
            );

            return this.pathsToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.offsetPolyline error:', err);
            return [];
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

        const scaledPaths = paths
            .filter(path => Array.isArray(path) && path.length >= 3)
            .map(path => path.map(p => ({
                x: BigInt(Math.round(p.x * scale)),
                y: BigInt(Math.round(p.y * scale))
            })));

        if (scaledPaths.length === 0) {
            return [];
        }

        try {
            const result = lib.InflatePaths64(
                scaledPaths,
                delta * scale,
                jt,
                et
            );

            return this.pathsToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.offsetPaths error:', err);
            return [];
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

        const scaledSubject = subjectPaths
            .filter(path => Array.isArray(path) && path.length >= 3)
            .map(path => path.map(p => ({
                x: BigInt(Math.round(p.x * scale)),
                y: BigInt(Math.round(p.y * scale))
            })));

        const scaledClip = Array.isArray(clipPaths)
            ? clipPaths
                .filter(path => Array.isArray(path) && path.length >= 3)
                .map(path => path.map(p => ({
                    x: BigInt(Math.round(p.x * scale)),
                    y: BigInt(Math.round(p.y * scale))
                })))
            : [];

        try {
            const result = lib.Difference64(
                scaledSubject,
                scaledClip,
                lib.FillRule.NonZero
            );

            return this.pathsToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.difference error:', err);
            return [];
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

        const scaledPaths = paths
            .filter(path => Array.isArray(path) && path.length >= 3)
            .map(path => path.map(p => ({
                x: BigInt(Math.round(p.x * scale)),
                y: BigInt(Math.round(p.y * scale))
            })));

        try {
            const result = lib.Union64(
                scaledPaths,
                lib.FillRule.NonZero
            );

            return this.pathsToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.union error:', err);
            return [];
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

        const scaledSubject = subjectPaths
            .filter(path => Array.isArray(path) && path.length >= 3)
            .map(path => path.map(p => ({
                x: BigInt(Math.round(p.x * scale)),
                y: BigInt(Math.round(p.y * scale))
            })));

        const scaledClip = Array.isArray(clipPaths)
            ? clipPaths
                .filter(path => Array.isArray(path) && path.length >= 3)
                .map(path => path.map(p => ({
                    x: BigInt(Math.round(p.x * scale)),
                    y: BigInt(Math.round(p.y * scale))
                })))
            : [];

        try {
            const result = lib.Intersect64(
                scaledSubject,
                scaledClip,
                lib.FillRule.NonZero
            );

            return this.pathsToPoints(result, scale);
        } catch (err) {
            console.error('ClipperWrapper.intersection error:', err);
            return [];
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

    /**
     * Convert clipper2 paths to simple point arrays
     */
    static pathsToPoints(paths, scale) {
        if (!paths || !Array.isArray(paths)) return [];

        return paths.map(path => {
            if (!path || !Array.isArray(path)) return [];
            return path.map(pt => ({
                x: Number(pt.x) / scale,
                y: Number(pt.y) / scale
            }));
        }).filter(path => path.length > 0);
    }
}
