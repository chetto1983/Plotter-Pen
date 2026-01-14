import express from 'express';
import { Worker } from 'worker_threads';
import path from 'path';
import { runCamGo, getCamEngineInfo } from '../server/workers/cam-go-bridge.js';

const router = express.Router();
const workerPath = path.join(process.cwd(), 'server', 'workers', 'cam-worker.js');
const camInfo = getCamEngineInfo();

if (camInfo.path) {
    console.log(`[CAM] Using Go CAM engine: ${camInfo.path} (${camInfo.platform}/${camInfo.arch})`);
} else {
    console.warn(`[CAM] Go CAM engine not found for ${camInfo.platform}/${camInfo.arch}. Tried: ${camInfo.tried.join(', ')}`);
}

function runCamWorker(command, data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath);
        let settled = false;

        const finalize = (err, result) => {
            if (settled) return;
            settled = true;
            worker.terminate();
            err ? reject(err) : resolve(result);
        };

        worker.on('message', (result) => finalize(null, result));
        worker.on('error', (err) => finalize(err));
        worker.on('exit', (code) => {
            if (!settled) finalize(new Error(`Worker stopped with exit code ${code}`));
        });

        worker.postMessage({ command, data });
    });
}

router.post('/cam/generate', async (req, res) => {
    return res.status(410).json({
        status: 'error',
        message: 'CAM generation via /cam/generate is deprecated. Use /cam/process (Go engine).'
    });
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

// Process primitives → G-code (Go engine)
router.post('/cam/process', async (req, res) => {
    console.log('[Route] /cam/process called');
    try {
        const primitives = req.body?.primitives;
        console.log(`[Route] Received ${primitives?.length ?? 0} primitives`);
        if (!Array.isArray(primitives) || primitives.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Primitives array is required.' });
        }

        const startTime = Date.now();
        const result = await runCamGo({
            primitives,
            type: req.body?.type ?? 'profile',
            settings: req.body?.settings
        }, 60000);
        console.log(`[Route] Go engine completed in ${Date.now() - startTime}ms`);

        return res.json({
            status: 'ok',
            gcode: result.gcode,
            stats: result.stats
        });
    } catch (error) {
        console.error('CAM process error:', error);
        return res.status(500).json({ status: 'error', message: error.message ?? 'CAM process failed.' });
    }
});

export { router as camRouter };
