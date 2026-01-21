/**
 * PrimitiveRenderer3D - Renders CAD primitives on 3D work surface
 * Supports line, circle, arc, rectangle, polygon, polyline
 */

export class PrimitiveRenderer3D {
    constructor(THREE, scene) {
        this.THREE = THREE;
        this.scene = scene;
        this.group = new THREE.Group();
        // Dim blue color for "uncut" paths - will be overlaid by bright trail when cut
        this.material = new THREE.LineBasicMaterial({ color: 0x334466, linewidth: 1 });
        scene.add(this.group);
    }

    /**
     * Draw CAD primitives on 3D work surface (Z=0)
     * @param {Array} primitives - Array of primitive objects from CAD
     */
    draw(primitives) {
        this.clear();
        if (!primitives || primitives.length === 0) return;

        const THREE = this.THREE;

        for (const p of primitives) {
            let geometry;

            if (p.type === 'line') {
                geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(p.x1, p.y1, 0),
                    new THREE.Vector3(p.x2, p.y2, 0)
                ]);
            } else if (p.type === 'circle') {
                const cx = p.center?.x ?? p.cx;
                const cy = p.center?.y ?? p.cy;
                const radius = p.radius ?? p._radius;
                const curve = new THREE.EllipseCurve(cx, cy, radius, radius, 0, 2 * Math.PI);
                const points = curve.getPoints(64).map(pt => new THREE.Vector3(pt.x, pt.y, 0));
                geometry = new THREE.BufferGeometry().setFromPoints(points);
            } else if (p.type === 'arc') {
                // Support both Go backend (centerX/centerY/startX/startY/endX/endY)
                // and frontend primitives (cx/cy/x1/y1/x2/y2)
                const cx = p.centerX ?? p.cx;
                const cy = p.centerY ?? p.cy;
                const startX = p.startX ?? p.x1;
                const startY = p.startY ?? p.y1;
                const endX = p.endX ?? p.x2;
                const endY = p.endY ?? p.y2;

                if (cx === undefined || cy === undefined) continue;

                const radius = p.radius ?? Math.sqrt((startX - cx) ** 2 + (startY - cy) ** 2);
                const startAngle = Math.atan2(startY - cy, startX - cx);
                const endAngle = Math.atan2(endY - cy, endX - cx);

                // Determine sweep direction using throughPoint/sweep/isClockwise if available
                let clockwise = false;
                const throughPoint = p.throughPoint ?? p._throughPoint;
                const throughX = throughPoint?.x ?? p.throughX;
                const throughY = throughPoint?.y ?? p.throughY;
                if (throughX !== undefined && throughY !== undefined) {
                    const throughAngle = Math.atan2(throughY - cy, throughX - cx);
                    const TWO_PI = Math.PI * 2;

                    const normStart = ((startAngle % TWO_PI) + TWO_PI) % TWO_PI;
                    const normEnd = ((endAngle % TWO_PI) + TWO_PI) % TWO_PI;
                    const normThrough = ((throughAngle % TWO_PI) + TWO_PI) % TWO_PI;

                    const throughRelToStart = ((normThrough - normStart) % TWO_PI + TWO_PI) % TWO_PI;
                    const endRelToStart = ((normEnd - normStart) % TWO_PI + TWO_PI) % TWO_PI;

                    // If through is "before" end in positive direction, use CCW
                    const ccw = (throughRelToStart < endRelToStart && throughRelToStart > 0);
                    clockwise = !ccw;
                } else {
                    // Fallback: use sweep or isClockwise flag if available
                    if (Number.isFinite(p.sweep)) {
                        clockwise = p.sweep < 0;
                    } else if (typeof p.isClockwise === 'boolean') {
                        clockwise = p.isClockwise;
                    }
                }

                const curve = new THREE.EllipseCurve(cx, cy, radius, radius, startAngle, endAngle, clockwise);
                const points = curve.getPoints(32).map(pt => new THREE.Vector3(pt.x, pt.y, 0));
                geometry = new THREE.BufferGeometry().setFromPoints(points);
            } else if (p.type === 'rectangle') {
                const pts = [
                    new THREE.Vector3(p.x, p.y, 0),
                    new THREE.Vector3(p.x + p.width, p.y, 0),
                    new THREE.Vector3(p.x + p.width, p.y + p.height, 0),
                    new THREE.Vector3(p.x, p.y + p.height, 0),
                    new THREE.Vector3(p.x, p.y, 0)
                ];
                geometry = new THREE.BufferGeometry().setFromPoints(pts);
            } else if ((p.type === 'polygon' || p.type === 'polyline') && p.points) {
                const pts = p.points.map(pt => new THREE.Vector3(pt.x, pt.y, 0));
                if (p.closed && pts.length > 0) pts.push(pts[0].clone());
                geometry = new THREE.BufferGeometry().setFromPoints(pts);
            }

            if (geometry) {
                const line = new THREE.Line(geometry, this.material);
                this.group.add(line);
            }
        }
    }

    /**
     * Clear all primitives
     */
    clear() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            child.geometry?.dispose();
            this.group.remove(child);
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        this.clear();
        this.scene.remove(this.group);
        this.material.dispose();
    }
}

export default PrimitiveRenderer3D;
