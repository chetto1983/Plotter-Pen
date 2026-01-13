
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs';

console.log('--- Testing Worker Spawn ---');

const workerPath = path.join(process.cwd(), 'server', 'workers', 'dxf-worker.js');
console.log('Worker Path:', workerPath);

if (!fs.existsSync(workerPath)) {
    console.error('Worker file NOT FOUND at', workerPath);
    process.exit(1);
}

const worker = new Worker(workerPath);
let terminating = false;
const filePath = path.join(process.cwd(), 'DXF', 'drawing_2026-01-11.dxf');
const dxfContent = fs.readFileSync(filePath, 'utf8');

console.log('Sending message to worker...');
worker.postMessage(dxfContent);

worker.on('message', (result) => {
    console.log('Received message from worker:');
    if (result.type == 'success') {
        const data = JSON.parse(result.data);
        console.log('Status: success');
        console.log('Primitives count:', data.primitives.length);
    } else {
        console.log('Type:', result.type);
        console.log('Message:', result.message);
    }
    terminating = true;
    worker.terminate().catch((err) => {
        console.error('Worker terminate failed:', err);
        process.exit(1);
    });
});

worker.on('error', (err) => {
    console.error('Worker Error:', err);
    process.exit(1);
});

worker.on('exit', (code) => {
    if (terminating && code === 1) {
        return;
    }
    console.log('Worker exit code:', code);
});
