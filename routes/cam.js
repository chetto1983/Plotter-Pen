import express from 'express';
import { Worker } from 'worker_threads';
import path from 'path';

const router = express.Router();
const workerPath = path.join(process.cwd(), 'server', 'workers', 'cam-worker.js');

function runCamWorker(command, data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath);
        let settled = false;

        const finalize = (err, result) => {
            if (settled) return;
            settled = true;
            worker.terminate();
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        };

        worker.on('message', (result) => finalize(null, result));
        worker.on('error', (err) => finalize(err));
        worker.on('exit', (code) => {
            if (!settled) {
                finalize(new Error(`Worker stopped with exit code ${code}`));
            }
        });

        worker.postMessage({ command, data });
    });
}

router.post('/cam/generate', async (req, res) => {
    try {
        const job = req.body?.job;
        if (!job || !Array.isArray(job.operations)) {
            return res.status(400).json({ status: 'error', message: 'Job payload with operations is required.' });
        }

        const result = await runCamWorker('generate', {
            job,
            settings: req.body?.settings,
            tools: req.body?.tools
        });

        if (result?.type === 'error') {
            return res.status(500).json({ status: 'error', message: result.message ?? 'CAM worker error.' });
        }

        return res.json({ status: 'ok', gcode: result?.gcode ?? '' });
    } catch (error) {
        console.error('CAM generate error:', error);
        return res.status(500).json({ status: 'error', message: error.message ?? 'CAM generation failed.' });
    }
});

router.post('/cam/parse', async (req, res) => {
    try {
        const gcode = req.body?.gcode;
        if (typeof gcode !== 'string' || gcode.trim().length === 0) {
            return res.status(400).json({ status: 'error', message: 'G-code text is required.' });
        }

        const result = await runCamWorker('parse', { gcode });

        if (result?.type === 'error') {
            return res.status(500).json({ status: 'error', message: result.message ?? 'CAM worker error.' });
        }

        if (typeof result?.data === 'string') {
            res.setHeader('Content-Type', 'application/json');
            return res.send(result.data);
        }

        return res.json(result);
    } catch (error) {
        console.error('CAM parse error:', error);
        return res.status(500).json({ status: 'error', message: error.message ?? 'CAM parse failed.' });
    }
});

router.post('/cam/postprocess', async (req, res) => {
    try {
        const gcode = req.body?.gcode;
        if (typeof gcode !== 'string' || gcode.trim().length === 0) {
            return res.status(400).json({ status: 'error', message: 'G-code text is required.' });
        }

        const result = await runCamWorker('postprocess', {
            gcode,
            options: req.body?.options
        });

        if (result?.type === 'error') {
            return res.status(500).json({ status: 'error', message: result.message ?? 'CAM worker error.' });
        }

        if (typeof result?.data === 'string') {
            res.setHeader('Content-Type', 'application/json');
            return res.send(result.data);
        }

        return res.json(result);
    } catch (error) {
        console.error('CAM postprocess error:', error);
        return res.status(500).json({ status: 'error', message: error.message ?? 'CAM postprocess failed.' });
    }
});

export { router as camRouter };
