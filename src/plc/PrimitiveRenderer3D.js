/**
 * PrimitiveRenderer3D - Renders CAD primitives on 3D work surface
 * Supports line, circle, arc, rectangle, polygon, polyline
 */

export class PrimitiveRenderer3D {
    constructor(THREE, scene) {
        this.THREE = THREE;
        this.scene = scene;
        this.group = new THREE.Group();
        this.material = new THREE.LineBasicMaterial({ color: 0x4488ff, linewidth: 1 });
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
                const cx = p.cx, cy = p.cy;
                const radius = Math.sqrt((p.x1 - cx) ** 2 + (p.y1 - cy) ** 2);
                const startAngle = Math.atan2(p.y1 - cy, p.x1 - cx);
                const endAngle = Math.atan2(p.y2 - cy, p.x2 - cx);
                const ccw = !p.isClockwise;
                const curve = new THREE.EllipseCurve(cx, cy, radius, radius, startAngle, endAngle, ccw);
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
