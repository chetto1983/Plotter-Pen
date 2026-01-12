
import DxfParser from 'dxf-parser';
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'DXF', 'drawing_2026-01-11.dxf');
console.log('Reading file:', filePath);

try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('File read, size:', content.length);

    console.log('Instantiating parser...');
    const parser = new DxfParser();

    console.log('Parsing...');
    const result = parser.parseSync(content);

    console.log('Success!');
    console.log('Entities found:', result.entities ? result.entities.length : 0);
    // console.log('Result:', JSON.stringify(result, null, 2).slice(0, 500) + '...');
} catch (e) {
    console.error('ERROR during parsing:', e.message);
    console.error(e.stack);
}
