
import { GCodeParser } from '@polar3d/gcode-viewer';
import { GCodeGenerator } from './src/cam/GCodeGenerator.js';

// ... (preparePreviewGCode omitted for brevity, logic assumed same or imported if possible)
// Re-pasting the function since I cannot import it easily in this env
function preparePreviewGCode(gcodeText) {
    if (typeof gcodeText !== 'string') return '';
    const lines = gcodeText.split('\n');
    const motionRegex = /^\s*G0?([0123])\b/i;
    const hasXYRegex = /\b[XY][-+]?\d*\.?\d+/i;
    const hasERegex = /\bE[-+]?\d*\.?\d+/i;
    const coordStartRegex = /^\s*[XYZIJR]/i;
    let extrusionCounter = 0;
    let currentMotion = null;
    return lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('(') || trimmed.startsWith(';')) return line;
        const commentIndex = line.indexOf(';');
        let codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
        const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : '';
        const motionMatch = codePart.match(motionRegex);
        if (motionMatch) currentMotion = `G${motionMatch[1]}`;
        else if (coordStartRegex.test(codePart) && currentMotion) codePart = `${currentMotion} ${codePart.trimStart()}`;
        if (!motionRegex.test(codePart)) return line;
        if (hasERegex.test(codePart)) return line;
        if (!hasXYRegex.test(codePart)) return line;
        if (currentMotion === 'G0') return line;
        extrusionCounter += 1;
        const trimmedCode = codePart.replace(/\s+$/, '');
        return `${trimmedCode} E${extrusionCounter}${commentPart}`;
    }).join('\n');
}

async function testArc() {
    console.log('--- Testing Arc Generation with SPLIT Z Moves ---');
    const gen = new GCodeGenerator();
    gen.generateHeader();
    gen.addRapid(0, 0, 5);
    gen.addRapid(0, 0);

    // Split moves
    // 1. Move to Z layer
    gen.addLinear(0, 0, 0.2, 100);
    // 2. Linear Move XY
    gen.addLinear(5, 5, 0.2, 100);
    // 3. Arc Move
    gen.addArc(10, 10, 0, 10, true, 200);

    const rawGcode = gen.getCode();
    const previewGcode = preparePreviewGCode(rawGcode);
    console.log('\n[PREPARED G-CODE]:');
    console.log(previewGcode);

    try {
        const parser = new GCodeParser();
        const result = parser.parse(previewGcode);
        console.log('\n[PARSE RESULT SUMM]');
        if (result.layers) {
            console.log('Layer Count:', result.layers.length);
            result.layers.forEach((l, i) => {
                console.log(`Layer ${i} (Z=${l.zHeight}): ${l.paths ? l.paths.length : 0} paths`);
            });
        }
    } catch (e) {
        console.error('Parse Error:', e);
    }
}
testArc();
