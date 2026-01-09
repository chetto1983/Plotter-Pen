
import express from 'express';
import * as db from '../server/db.js';

const router = express.Router();

// Auto-save State
router.get('/state', async (req, res) => {
    try {
        const data = await db.loadAppState();
        res.json({ status: 'ok', data });
    } catch (err) {
        console.error('Load State Error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.post('/state', async (req, res) => {
    try {
        await db.saveAppState(req.body);
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Save State Error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Named Drawings
router.get('/drawings', async (req, res) => {
    try {
        const list = await db.listDrawings();
        res.json({ status: 'ok', data: list });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.get('/drawings/:name', async (req, res) => {
    try {
        const name = req.params.name;
        const data = await db.loadDrawing(name);
        if (!data) return res.status(404).json({ status: 'error', message: 'Drawing not found' });
        res.json({ status: 'ok', data });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.post('/drawings', async (req, res) => {
    try {
        const { name, data, preview } = req.body;
        if (!name || !data) return res.status(400).json({ status: 'error', message: 'Name and Data required' });
        await db.saveDrawing(name, data, preview);
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.delete('/drawings/:name', async (req, res) => {
    try {
        const name = req.params.name;
        await db.deleteDrawing(name);
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

export { router as persistenceRouter };
