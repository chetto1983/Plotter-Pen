/**
 * DXF Parsing API Route
 * Handles DXF file parsing in the backend to avoid browser freeze
 * Uses unified DXFImporter from src to ensure consistency
 */

import DxfParser from "dxf-parser";
import { DXFImporter } from "../src/import/DXFImporter.js";

/**
 * Express route handler for DXF parsing
 */
export async function dxfParseHandler(req, res) {
    try {
        const dxfContent = req.body;
        if (!dxfContent || typeof dxfContent !== 'string') {
            return res.status(400).json({ status: 'error', message: 'DXF content required' });
        }

        // Instantiate importer with the DxfParser class (dependency injection)
        const importer = new DXFImporter(DxfParser);

        // Parse the content
        // Note: DXFImporter.parse is async and yields to event loop, but in Node we want to await it.
        // The importer returns { primitives, bounds }
        const result = await importer.parse(dxfContent);

        res.json({
            status: 'ok',
            primitives: result.primitives,
            bounds: result.bounds,
            count: result.primitives.length
        });

    } catch (error) {
        console.error('DXF parsing error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
}
