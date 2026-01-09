import express from 'express';
import { Worker } from 'worker_threads';
import path from 'path';

const router = express.Router();

router.post('/smart-import', express.text({ limit: '50mb' }), async (req, res) => {
    try {
        const dxfContent = req.body;
        if (!dxfContent) {
            return res.status(400).json({ status: 'error', message: 'No DXF content provided' });
        }

        // Use Worker Thread to prevent main event loop blocking and allow multi-threading
        const workerPath = path.join(process.cwd(), 'server', 'workers', 'dxf-worker.js');
        const worker = new Worker(workerPath);

        let responseSent = false;

        worker.postMessage(dxfContent);

        worker.on('message', (result) => {
            if (responseSent) return;
            responseSent = true;

            if (result.type === 'error') {
                console.error('Worker Logic Error:', result.message);
                res.status(500).json({ status: 'error', message: result.message });
            } else if (result.type === 'success') {
                // Worker returned pre-stringified JSON to save Main Thread CPU
                res.setHeader('Content-Type', 'application/json');
                res.send(result.data);
            } else {
                // Fallback/Safety
                res.json(result);
            }
            worker.terminate();
        });

        worker.on('error', (err) => {
            if (responseSent) return;
            responseSent = true;
            console.error('Worker System Error:', err);
            res.status(500).json({ status: 'error', message: err.message });
        });

        worker.on('exit', (code) => {
            if (!responseSent) {
                responseSent = true;
                console.warn(`Worker stopped with exit code ${code} (no response sent)`);
                res.status(500).json({ status: 'error', message: `Worker crashed with exit code ${code}` });
            }
        });

    } catch (error) {
        console.error('Smart Import Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

export { router as smartImportRouter };
