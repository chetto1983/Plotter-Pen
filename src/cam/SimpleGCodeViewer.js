/**
 * Simple G-Code Viewer
 * Renders basic G-Code (G0, G1, G2, G3) to an HTML5 Canvas.
 */
export class SimpleGCodeViewer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.paths = []; // Array of {type: 'G0'|'G1'|'G2'|'G3', x1,y1, x2,y2, ...params}
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        // Style config
        this.style = {
            rapidColor: 'rgba(255, 100, 100, 0.5)',
            cutColor: 'rgba(0, 100, 255, 0.8)',
            lineWidth: 1.5,
            rapidDash: [5, 5]
        };
    }

    setGCode(gcode) {
        this.paths = this.parseGCode(gcode);
        this.calculateBounds();
        this.fitToCanvas();
        this.render();
    }

    parseGCode(gcode) {
        const lines = gcode.split('\n');
        const paths = [];
        let curX = 0, curY = 0, curZ = 0;
        let mode = 'G0'; // Default to rapid

        for (const line of lines) {
            const cleanLine = line.split(';')[0].split('(')[0].trim().toUpperCase();
            if (!cleanLine) continue;

            // Simple parsing of G0/G1/G2/G3
            // Note: This matches standard G-code, logic below needs to adapt if GCodeGenerator format is different
            // Our Generator produces: G1 X10.0 Y10.0 ...

            // Extract tokens
            const tokens = cleanLine.split(/\s+/);
            const cmd = tokens[0];

            // Update mode if explicit
            if (['G0', 'G1', 'G00', 'G01', 'G2', 'G02', 'G3', 'G03'].includes(cmd)) {
                mode = cmd.replace('0', ''); // Normalize G00->G0
            } else if (cleanLine.startsWith('X') || cleanLine.startsWith('Y') || cleanLine.startsWith('Z')) {
                // Continuation of previous mode
            } else {
                continue; // Skip non-motion commands for visualization
            }

            // Extract coordinates
            const getVal = (char) => {
                const token = tokens.find(t => t.startsWith(char));
                return token ? parseFloat(token.substring(1)) : null;
            };

            const x = getVal('X');
            const y = getVal('Y');
            const z = getVal('Z');
            const i = getVal('I');
            const j = getVal('J');
            // const r = getVal('R'); // R support if needed

            const destX = x !== null ? x : curX;
            const destY = y !== null ? y : curY;
            const destZ = z !== null ? z : curZ;

            if (mode === 'G0' || mode === 'G1') {
                if (destX !== curX || destY !== curY) {
                    paths.push({
                        type: mode,
                        x1: curX, y1: curY,
                        x2: destX, y2: destY,
                        z: destZ
                    });
                }
            } else if (mode === 'G2' || mode === 'G3') {
                // Arc
                // G2/G3 X Y I J
                // I, J are relative to current X,Y
                if (i !== null && j !== null) {
                    const centerX = curX + i;
                    const centerY = curY + j;
                    const radius = Math.sqrt(i * i + j * j);

                    const startAngle = Math.atan2(curY - centerY, curX - centerX);
                    const endAngle = Math.atan2(destY - centerY, destX - centerX);

                    paths.push({
                        type: mode,
                        centerX, centerY, radius,
                        startAngle, endAngle,
                        x1: curX, y1: curY,
                        x2: destX, y2: destY
                    });
                }
            }

            curX = destX;
            curY = destY;
            curZ = destZ;
        }
        return paths;
    }

    calculateBounds() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        if (this.paths.length === 0) {
            this.bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
            return;
        }

        for (const p of this.paths) {
            // Simplified bounds for arcs (using start/end/center/radius broadly)
            const pts = p.type.startsWith('G2') || p.type.startsWith('G3')
                ? [p.x1, p.x2, p.centerX - p.radius, p.centerX + p.radius]
                : [p.x1, p.x2];
            const ys = p.type.startsWith('G2') || p.type.startsWith('G3')
                ? [p.y1, p.y2, p.centerY - p.radius, p.centerY + p.radius]
                : [p.y1, p.y2];

            // Note: Exact arc bounds are harder, using bounding box of circle is safe enough for "fit"

            for (const val of pts) {
                if (val !== undefined) {
                    if (val < minX) minX = val;
                    if (val > maxX) maxX = val;
                }
            }
            for (const val of ys) {
                if (val !== undefined) {
                    if (val < minY) minY = val;
                    if (val > maxY) maxY = val;
                }
            }
        }
        this.bounds = { minX, minY, maxX, maxY };
    }

    fitToCanvas() {
        const padding = 20;
        const availW = this.canvas.width - padding * 2;
        const availH = this.canvas.height - padding * 2;

        const dataW = this.bounds.maxX - this.bounds.minX;
        const dataH = this.bounds.maxY - this.bounds.minY;

        if (dataW <= 0 || dataH <= 0) return;

        const scaleX = availW / dataW;
        const scaleY = availH / dataH;

        this.scale = Math.min(scaleX, scaleY);

        // Center it
        const contentW = dataW * this.scale;
        const contentH = dataH * this.scale;

        this.offsetX = padding + (availW - contentW) / 2 - this.bounds.minX * this.scale;
        this.offsetY = padding + (availH - contentH) / 2 - this.bounds.minY * this.scale; // Y is usually flipped in canvas vs CAD, check this

        // Standard CNC: Y+ is Up. Canvas: Y+ is Down.
        // We need to invert Y.
        // Transformation: CanvasY = Height - (WorldY * scale + offsetY)
        // Let's handle Y flip in render
    }

    // Convert World Y to Canvas Y (Flip)
    toCanvasY(y) {
        return this.canvas.height - (y * this.scale + this.offsetY);
    }

    toCanvasX(x) {
        return x * this.scale + this.offsetX;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Origin
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#ccc';
        this.ctx.moveTo(this.toCanvasX(0), this.toCanvasY(0));
        this.ctx.lineTo(this.toCanvasX(10), this.toCanvasY(0)); // X axis
        this.ctx.moveTo(this.toCanvasX(0), this.toCanvasY(0));
        this.ctx.lineTo(this.toCanvasX(0), this.toCanvasY(10)); // Y axis
        this.ctx.stroke();

        this.ctx.lineWidth = this.style.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        for (const p of this.paths) {
            this.ctx.beginPath();

            if (p.type === 'G0') {
                this.ctx.strokeStyle = this.style.rapidColor;
                this.ctx.setLineDash(this.style.rapidDash);
            } else {
                this.ctx.strokeStyle = this.style.cutColor;
                this.ctx.setLineDash([]);
            }

            const x1 = this.toCanvasX(p.x1);
            const y1 = this.toCanvasY(p.y1);
            const x2 = this.toCanvasX(p.x2);
            const y2 = this.toCanvasY(p.y2);

            if (p.type === 'G0' || p.type === 'G1') {
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
            } else {
                // Arc
                // Canvas arc angles are clockwise? 
                // Context is inverted Y... this gets tricky.
                // Simpler: Draw segments for arcs to avoid Y-flip headache with native Arc
                this.drawApproxArc(p);
                continue; // Skip the stroke below
            }
            this.ctx.stroke();
        }
    }

    drawApproxArc(p) {
        const segments = 20;
        // Need to handle the angles correctly given the flip? 
        // Actually, let's just use the parametric equation which is easier with flip

        let startAngle = p.startAngle;
        let endAngle = p.endAngle;

        // Normalize angles
        if (p.type === 'G3') { // Counter Clockwise
            if (endAngle <= startAngle) endAngle += Math.PI * 2;
        } else { // G2 Clockwise
            if (startAngle <= endAngle) startAngle += Math.PI * 2;
        }

        // G2 is CW, sweep is negative? 
        // Let's keep it simple: Interpolate from Start to End

        // G2 (CW) means angle decreases? G3 (CCW) means angle increases?
        // Standard Trig: CCW is positive direction.
        // G3 is CCW => Angle increases from Start to End.
        // G2 is CW => Angle decreases from Start to End.

        // Re-calc sweep
        let sweep = endAngle - startAngle;
        if (p.type === 'G3') {
            // Ensure sweep is positive [0, 2PI]
            if (sweep <= 0) sweep += Math.PI * 2;
        } else {
            // Ensure sweep is negative [-2PI, 0]
            if (sweep >= 0) sweep -= Math.PI * 2;
        }

        // Draw segments
        this.ctx.beginPath();
        this.ctx.moveTo(this.toCanvasX(p.x1), this.toCanvasY(p.y1));


        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const angle = startAngle + sweep * t;
            const rx = p.centerX + p.radius * Math.cos(angle);
            const ry = p.centerY + p.radius * Math.sin(angle);
            this.ctx.lineTo(this.toCanvasX(rx), this.toCanvasY(ry));
        }

        this.ctx.stroke();
    }
}
