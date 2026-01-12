/**
 * PLC Output Generator - Generate PLC command strings
 * Generates human-readable PLC commands for plotter
 */

export class PLCOutputGenerator {
    constructor(config = {}) {
        this.precision = config.precision ?? 3;
        this.includeZMovements = config.includeZMovements ?? true;
        this.defaultSpeed = config.defaultSpeed ?? 100.0;
        this.rapidSpeed = config.rapidSpeed ?? 1000.0;
    }

    generate(primitives) {
        const commands = [];
        let lastPoint = { x: 0, y: 0 };

        const pushCommand = (cmdObj) => {
            // Check for duplicates
            if (commands.length > 0) {
                const lastCmd = commands[commands.length - 1];
                if (lastCmd.command === cmdObj.command) {
                    return; // Skip duplicate command
                }
            }

            // Re-index since we might have skipped some
            cmdObj.index = commands.length;
            commands.push(cmdObj);
        };

        for (let i = 0; i < primitives.length; i++) {
            const prim = primitives[i];

            // Skip dimensions and annotations
            if (prim.type === 'dimension' ||
                prim.type === 'angularDimension' ||
                prim.type === 'radiusDimension') {
                continue;
            }

            const data = prim.plcData || {};

            let x1, y1;
            if (prim.type === 'circle') {
                const cx = data.cx ?? prim.cx ?? prim.center?.x;
                const cy = data.cy ?? prim.cy ?? prim.center?.y;
                const r = data.r ?? prim.radius ?? prim._radius;
                x1 = cx + r;
                y1 = cy;
            } else if (prim.type === 'rectangle') {
                x1 = prim.x;
                y1 = prim.y;
            } else if (prim.type === 'polygon' || prim.type === 'polyline') {
                if (prim.points && prim.points.length > 0) {
                    x1 = prim.points[0].x;
                    y1 = prim.points[0].y;
                } else {
                    continue;
                }
            } else {
                x1 = data.x1 ?? prim.x1;
                y1 = data.y1 ?? prim.y1;
            }

            const needsJump = Math.abs(lastPoint.x - x1) > 0.01 || Math.abs(lastPoint.y - y1) > 0.01;

            if (needsJump && this.includeZMovements) {
                pushCommand({
                    index: 0, // Will be fixed in pushCommand
                    type: 'Z_up',
                    command: 'Z_UP',
                    primitive: null
                });

                pushCommand({
                    index: 0,
                    type: 'waypoint',
                    command: `J X ${x1.toFixed(this.precision)}, Y ${y1.toFixed(this.precision)}, V ${this.rapidSpeed.toFixed(this.precision)}`,
                    primitive: null
                });

                pushCommand({
                    index: 0,
                    type: 'Z_down',
                    command: 'Z_DW',
                    primitive: null
                });
            }

            const cmd = this.primitiveToCommand(prim, 0); // Index irrelevant here
            if (cmd) {
                if (Array.isArray(cmd)) {
                    cmd.forEach(c => pushCommand(c));

                    if (prim.type === 'circle' || prim.type === 'rectangle' || prim.type === 'polygon' || prim.closed) {
                        lastPoint = { x: x1, y: y1 };
                    } else if (prim.type === 'polyline' && prim.points) {
                        const last = prim.points[prim.points.length - 1];
                        lastPoint = { x: last.x, y: last.y };
                    } else {
                        lastPoint = { x: x1, y: y1 };
                    }
                } else {
                    pushCommand(cmd);
                    lastPoint = { x: data.x2 ?? prim.x2, y: data.y2 ?? prim.y2 };
                }
            }
        }

        if (this.includeZMovements && commands.length > 0) {
            pushCommand({
                index: 0,
                type: 'Z_up',
                command: 'Z_UP',
                primitive: null
            });
        }

        return commands;
    }

    primitiveToCommand(primitive, index) {
        const data = primitive.plcData || {};
        const fmt = (v) => {
            if (typeof v !== 'number' || isNaN(v)) return '0.000';
            return v.toFixed(this.precision);
        };

        let command = '';

        if (primitive.type === 'line') {
            const x2 = data.x2 ?? primitive.x2;
            const y2 = data.y2 ?? primitive.y2;
            command = `L X ${fmt(x2)}, Y ${fmt(y2)}, V ${fmt(this.defaultSpeed)}`;
        } else if (primitive.type === 'arc') {
            const x2 = data.x2 ?? primitive.x2;
            const y2 = data.y2 ?? primitive.y2;

            let auxX, auxY;
            if (primitive._throughPoint) {
                auxX = primitive._throughPoint.x;
                auxY = primitive._throughPoint.y;
            } else if (primitive.midpoint && typeof primitive.midpoint.x === 'number') {
                auxX = primitive.midpoint.x;
                auxY = primitive.midpoint.y;
            } else {
                const cx = primitive.cx ?? data.cx;
                const cy = primitive.cy ?? data.cy;
                const x1 = data.x1 ?? primitive.x1;
                const y1 = data.y1 ?? primitive.y1;
                const radius = primitive.radius ?? Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
                const startAngle = primitive.startAngle ?? Math.atan2(y1 - cy, x1 - cx);
                const sweep = primitive.sweep ?? primitive._sweep;

                if (sweep !== undefined) {
                    const midAngle = startAngle + sweep / 2;
                    auxX = cx + radius * Math.cos(midAngle);
                    auxY = cy + radius * Math.sin(midAngle);
                } else {
                    auxX = cx;
                    auxY = cy;
                }
            }

            command = `A X ${fmt(x2)}, Y ${fmt(y2)}, I ${fmt(auxX)}, J ${fmt(auxY)}, V ${fmt(this.defaultSpeed)}`;
        } else if (primitive.type === 'circle') {
            return this.circleToCommands(primitive, index);
        } else if (primitive.type === 'rectangle') {
            const cmds = [];
            const x = primitive.x;
            const y = primitive.y;
            const w = primitive.width;
            const h = primitive.height;

            const pts = [
                { x: x, y: y },
                { x: x + w, y: y },
                { x: x + w, y: y + h },
                { x: x, y: y + h },
                { x: x, y: y }
            ];

            for (let i = 0; i < 4; i++) {
                cmds.push({
                    index: index + i,
                    type: 'line',
                    command: `L X ${fmt(pts[i + 1].x)}, Y ${fmt(pts[i + 1].y)}, V ${fmt(this.defaultSpeed)}`,
                    primitive: primitive
                });
            }
            return cmds;

        } else if (primitive.type === 'polygon' || primitive.type === 'polyline') {
            const cmds = [];
            const pts = primitive.points;
            if (!pts || pts.length < 2) return null;

            let cmdIdx = 0;

            for (let i = 0; i < pts.length - 1; i++) {
                cmds.push({
                    index: index + cmdIdx,
                    type: 'line',
                    command: `L X ${fmt(pts[i + 1].x)}, Y ${fmt(pts[i + 1].y)}, V ${fmt(this.defaultSpeed)}`,
                    primitive: primitive
                });
                cmdIdx++;
            }

            if (primitive.closed || primitive.type === 'polygon') {
                cmds.push({
                    index: index + cmdIdx,
                    type: 'line',
                    command: `L X ${fmt(pts[0].x)}, Y ${fmt(pts[0].y)}, V ${fmt(this.defaultSpeed)}`,
                    primitive: primitive
                });
            }
            return cmds;

        } else {
            return null;
        }

        return {
            index: index,
            type: primitive.type,
            command: command,
            primitive: primitive
        };
    }

    circleToCommands(primitive, startIndex) {
        const data = primitive.plcData || {};
        const fmt = (v) => {
            if (typeof v !== 'number' || isNaN(v)) return '0.000';
            return v.toFixed(this.precision);
        };

        const cx = data.cx ?? primitive.cx ?? primitive.center?.x;
        const cy = data.cy ?? primitive.cy ?? primitive.center?.y;
        const r = data.r ?? primitive.radius ?? primitive._radius;

        const startX = cx + r;
        const startY = cy;
        const midX = cx - r;
        const midY = cy;

        const aux1X = cx;
        const aux1Y = cy - r;
        const aux2X = cx;
        const aux2Y = cy + r;

        return [
            {
                index: startIndex,
                type: 'arc',
                command: `A X ${fmt(midX)}, Y ${fmt(midY)}, I ${fmt(aux1X)}, J ${fmt(aux1Y)}, V ${fmt(this.defaultSpeed)}`,
                primitive: primitive,
                isCirclePart: 1
            },
            {
                index: startIndex + 1,
                type: 'arc',
                command: `A X ${fmt(startX)}, Y ${fmt(startY)}, I ${fmt(aux2X)}, J ${fmt(aux2Y)}, V ${fmt(this.defaultSpeed)}`,
                primitive: primitive,
                isCirclePart: 2
            }
        ];
    }

    generateText(primitives) {
        const commands = this.generate(primitives);
        return commands.map(c => c.command).join('\n');
    }

    parseCommand(commandString) {
        const cmd = commandString.trim();

        if (cmd === 'Z_UP') return { type: 'Z_up' };
        if (cmd === 'Z_DW') return { type: 'Z_down' };

        const waypointMatch = cmd.match(/^J\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+)(?:,\s*V\s+([\d.-]+))?$/);
        if (waypointMatch) {
            return {
                type: 'waypoint',
                x: parseFloat(waypointMatch[1]),
                y: parseFloat(waypointMatch[2]),
                v: waypointMatch[3] ? parseFloat(waypointMatch[3]) : undefined
            };
        }

        const lineMatch = cmd.match(/^L\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+)(?:,\s*V\s+([\d.-]+))?$/);
        if (lineMatch) {
            return {
                type: 'line',
                x2: parseFloat(lineMatch[1]),
                y2: parseFloat(lineMatch[2]),
                v: lineMatch[3] ? parseFloat(lineMatch[3]) : undefined
            };
        }

        const arcMatch = cmd.match(/^A\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+),\s*I\s+([\d.-]+),\s*J\s+([\d.-]+)(?:,\s*V\s+([\d.-]+))?$/);
        if (arcMatch) {
            return {
                type: 'arc',
                x2: parseFloat(arcMatch[1]),
                y2: parseFloat(arcMatch[2]),
                auxX: parseFloat(arcMatch[3]),
                auxY: parseFloat(arcMatch[4]),
                v: arcMatch[5] ? parseFloat(arcMatch[5]) : undefined
            };
        }

        const circleMatch = cmd.match(/^C\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+),\s*R\s+([\d.-]+)$/);
        if (circleMatch) {
            return {
                type: 'circle',
                cx: parseFloat(circleMatch[1]),
                cy: parseFloat(circleMatch[2]),
                r: parseFloat(circleMatch[3])
            };
        }

        return null;
    }
}

export default PLCOutputGenerator;
