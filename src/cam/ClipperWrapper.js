/**
 * Clipper Wrapper
 * Interface for the Clipper.js library to handle polygon offsetting.
 */

// import '../lib/clipper.js'; // Loaded via script tag in HTML

export class ClipperWrapper {
    static get lib() {
        if (typeof window !== 'undefined') return window.ClipperLib;
        if (typeof self !== 'undefined') return self.ClipperLib; // Worker support
        return global.ClipperLib;
    }

    static get scale() {
        return 10000; // Higher precision
    }

    /**
     * Offset a polygon (closed loop)
     * @param {Array<{x,y}>} points - Array of points
     * @param {number} delta - Offset distance (Standard: + for out, - for in)
     * @param {string} joinType - 'Square', 'Round', 'Miter'
     * @returns {Array<Array<{x,y}>>} - Array of offset paths (polygons)
     */
    static offsetPolygon(points, delta, joinType = 'Round') {
        if (!this.lib) {
            console.error('ClipperLib not loaded');
            return [];
        }

        const scale = this.scale;
        const paths = [points.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }))];
        const offsetter = new this.lib.ClipperOffset();

        const jt = this.getJoinType(joinType);

        offsetter.AddPaths(paths, jt, this.lib.EndType.etClosedPolygon);

        const solution = new this.lib.Paths();
        offsetter.Execute(solution, delta * scale);

        return this.solutionToPoints(solution);
    }

    /**
     * Offset an open path (polyline)
     * @param {Array<{x,y}>} points 
     * @param {number} delta 
     * @param {string} joinType
     * @param {string} endType - 'Round', 'Square', 'Butt'
     */
    static offsetPolyline(points, delta, joinType = 'Round', endType = 'Round') {
        if (!this.lib) {
            console.error('ClipperLib not loaded');
            return [];
        }

        const scale = this.scale;
        const paths = [points.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }))];
        const offsetter = new this.lib.ClipperOffset();

        const jt = this.getJoinType(joinType);
        const et = this.getEndType(endType);

        offsetter.AddPaths(paths, jt, et);

        const solution = new this.lib.Paths();
        offsetter.Execute(solution, delta * scale);

        return this.solutionToPoints(solution);
    }

    static offsetPaths(paths, delta, joinType = 'Round') {
        if (!this.lib) {
            console.error('ClipperLib not loaded');
            return [];
        }
        if (!Array.isArray(paths) || paths.length === 0) {
            return [];
        }

        const scale = this.scale;
        const clipperPaths = paths.map(path => this.toClipperPath(path, scale)).filter(Boolean);
        if (clipperPaths.length === 0) {
            return [];
        }

        const offsetter = new this.lib.ClipperOffset();
        const jt = this.getJoinType(joinType);
        offsetter.AddPaths(clipperPaths, jt, this.lib.EndType.etClosedPolygon);

        const solution = new this.lib.Paths();
        offsetter.Execute(solution, delta * scale);

        return this.solutionToPoints(solution);
    }

    static difference(subjectPaths, clipPaths) {
        if (!this.lib) {
            console.error('ClipperLib not loaded');
            return [];
        }
        if (!Array.isArray(subjectPaths) || subjectPaths.length === 0) {
            return [];
        }

        const scale = this.scale;
        const subject = subjectPaths.map(path => this.toClipperPath(path, scale)).filter(Boolean);
        const clip = Array.isArray(clipPaths)
            ? clipPaths.map(path => this.toClipperPath(path, scale)).filter(Boolean)
            : [];

        const clipper = new this.lib.Clipper();
        clipper.AddPaths(subject, this.lib.PolyType.ptSubject, true);
        if (clip.length > 0) {
            clipper.AddPaths(clip, this.lib.PolyType.ptClip, true);
        }

        const solution = new this.lib.Paths();
        clipper.Execute(
            this.lib.ClipType.ctDifference,
            solution,
            this.lib.PolyFillType.pftNonZero,
            this.lib.PolyFillType.pftNonZero
        );

        return this.solutionToPoints(solution);
    }

    static getJoinType(type) {
        switch (type.toLowerCase()) {
            case 'square': return this.lib.JoinType.jtSquare;
            case 'miter': return this.lib.JoinType.jtMiter;
            default: return this.lib.JoinType.jtRound;
        }
    }

    static getEndType(type) {
        switch (type.toLowerCase()) {
            case 'square': return this.lib.EndType.etOpenSquare;
            case 'butt': return this.lib.EndType.etOpenButt;
            default: return this.lib.EndType.etOpenRound;
        }
    }

    static toClipperPath(points, scale) {
        if (!Array.isArray(points) || points.length < 2) {
            return null;
        }
        return points.map(p => ({
            X: Math.round(p.x * scale),
            Y: Math.round(p.y * scale)
        }));
    }

    static solutionToPoints(solution) {
        if (!solution || !Array.isArray(solution) || solution.length === 0) return [];
        const scale = this.scale;
        return solution.map(path => {
            return path.map(pt => ({
                x: pt.X / scale,
                y: pt.Y / scale
            }));
        });
    }
}
