/* global importScripts */
/**
 * CAM Worker Loader
 * Loads legacy dependencies (Clipper) via importScripts (Classic Worker)
 * then dynamically imports the ES Module logic.
 */

// Load ClipperLib into global scope (self.ClipperLib)
try {
    importScripts('../lib/clipper.js');
} catch (e) {
    console.error('WORKER LOADER: Failed to load ClipperLib', e);
}

// Load the actual worker logic (ES Module)
// Note: Dynamic import allows loading modules in a Classic Worker
import('./cam-worker-core.js').catch(err => {
    console.error('WORKER LOADER: Failed to load core module', err);
});
