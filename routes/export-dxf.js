/**
 * DXF Export Route - Export drawings to DXF format
 * Uses dxf-writer library for proper DXF generation
 */

import express from 'express';
import Drawing from 'dxf-writer';

const router = express.Router();

// AutoCAD Color Index mapping from hex
const ACI_COLORS = {
    '#ff0000': Drawing.ACI.RED,
    '#ffff00': Drawing.ACI.YELLOW,
    '#00ff00': Drawing.ACI.GREEN,
    '#00ffff': Drawing.ACI.CYAN,
    '#0000ff': Drawing.ACI.BLUE,
    '#ff00ff': Drawing.ACI.MAGENTA,
    '#ffffff': Drawing.ACI.WHITE,
};

function hexToACI(hex) {
    if (!hex) return Drawing.ACI.WHITE;
    return ACI_COLORS[hex.toLowerCase()] || Drawing.ACI.WHITE;
}

function hexToTrueColor(hex) {
    if (!hex || typeof hex !== 'string') return 0xFFFFFF;
    const clean = hex.replace('#', '');
    const parsed = parseInt(clean, 16);
    return isNaN(parsed) ? 0xFFFFFF : parsed;
}

function radToDeg(rad) {
    return rad * (180 / Math.PI);
}

function normalizeAngle(deg) {
    while (deg < 0) deg += 360;
    while (deg >= 360) deg -= 360;
    return deg;
}

/**
 * POST /api/export-dxf
 * Body: { primitives: [...], layers: [...] }
 * Returns: DXF file content as text
 */
router.post('/export-dxf', (req, res) => {
    try {
        const { primitives = [], layers = [] } = req.body;

        if (!Array.isArray(primitives)) {
            return res.status(400).json({ status: 'error', message: 'primitives must be an array' });
        }

        const d = new Drawing();
        d.setUnits('Millimeters');

        // Add layers
        const layerMap = new Map();
        for (const layer of layers) {
            const name = sanitizeLayerName(layer.name || 'Layer');
            const color = hexToACI(layer.color);
            d.addLayer(name, color, 'CONTINUOUS');
            layerMap.set(layer.id, name);
        }

        // Convert primitives
        for (const prim of primitives) {
            const layerName = layerMap.get(prim.layerId) || '0';
            d.setActiveLayer(layerName);

            // Set true color if available
            if (prim.style?.strokeColor) {
                d.setTrueColor(hexToTrueColor(prim.style.strokeColor));
            }

            switch (prim.type) {
                case 'line':
                    convertLine(d, prim);
                    break;
                case 'circle':
                    convertCircle(d, prim);
                    break;
                case 'arc':
                    convertArc(d, prim);
                    break;
                case 'rectangle':
                    convertRectangle(d, prim);
                    break;
                case 'polygon':
                case 'polyline':
                    convertPolygon(d, prim);
                    break;
                // Skip dimensions and other unsupported types
            }
        }

        const dxfContent = d.toDxfString();

        res.setHeader('Content-Type', 'application/dxf');
        res.setHeader('Content-Disposition', 'attachment; filename="drawing.dxf"');
        res.send(dxfContent);

    } catch (error) {
        console.error('DXF export error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

function sanitizeLayerName(name) {
    if (!name) return '0';
    return name.replace(/[<>/\\:"|?*]/g, '_').substring(0, 255);
}

function convertLine(d, prim) {
    // Line has a.x, a.y, b.x, b.y OR x1, y1, x2, y2
    const x1 = prim.a?.x ?? prim.x1;
    const y1 = prim.a?.y ?? prim.y1;
    const x2 = prim.b?.x ?? prim.x2;
    const y2 = prim.b?.y ?? prim.y2;
    d.drawLine(x1, y1, x2, y2);
}

function convertCircle(d, prim) {
    const cx = prim.center?.x ?? prim.cx;
    const cy = prim.center?.y ?? prim.cy;
    const r = prim._radius ?? prim.radius;
    d.drawCircle(cx, cy, r);
}

function convertArc(d, prim) {
    // Arc stores a (start), b (end), c (center)
    const cx = prim.c?.x ?? prim.cx;
    const cy = prim.c?.y ?? prim.cy;
    const ax = prim.a?.x ?? prim.ax;
    const ay = prim.a?.y ?? prim.ay;
    const bx = prim.b?.x ?? prim.bx;
    const by = prim.b?.y ?? prim.by;

    const radius = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2);

    let startAngle = Math.atan2(ay - cy, ax - cx);
    let endAngle = Math.atan2(by - cy, bx - cx);

    startAngle = normalizeAngle(radToDeg(startAngle));
    endAngle = normalizeAngle(radToDeg(endAngle));

    // Handle arc direction - DXF arcs are always CCW
    const sweep = prim.sweep ?? prim._sweep;
    if (sweep !== undefined && sweep < 0) {
        const temp = startAngle;
        startAngle = endAngle;
        endAngle = temp;
    }

    d.drawArc(cx, cy, radius, startAngle, endAngle);
}

function convertRectangle(d, prim) {
    const x = prim._x ?? prim.x;
    const y = prim._y ?? prim.y;
    const w = prim._width ?? prim.width;
    const h = prim._height ?? prim.height;

    // Draw as closed polyline
    const points = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
    ];
    d.drawPolyline(points, true);
}

function convertPolygon(d, prim) {
    if (!prim.points || prim.points.length < 2) return;

    const points = prim.points.map(p => [p.x, p.y]);
    const closed = prim._closed ?? prim.closed ?? (prim.type === 'polygon');
    d.drawPolyline(points, closed);
}

export { router as exportDxfRouter };
