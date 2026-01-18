/**
 * State Loader Worker - Handles ALL heavy lifting off main thread
 * Parses JSON and streams primitive data in small chunks
 */

self.onmessage = function(e) {
  const { jsonString } = e.data;

  try {
    // 1. Parse JSON in worker (heavy operation)
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

    // 2. Extract metadata
    const primitives = data.primitives || data;
    const total = Array.isArray(primitives) ? primitives.length : 0;

    // 3. Send metadata immediately
    self.postMessage({
      type: 'metadata',
      layers: data.layers || null,
      view: data.view || null,
      workspace: data.workspace || null,
      grid: data.grid || null,
      plcSettings: data.plcSettings || null,
      total: total
    });

    if (total === 0) {
      self.postMessage({ type: 'done' });
      return;
    }

    // 4. Stream primitives in small chunks (50 per message for smooth UI)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, total);
      const chunk = primitives.slice(i, end);

      self.postMessage({
        type: 'primitives',
        items: chunk,
        progress: Math.round((end / total) * 100)
      });
    }

    self.postMessage({ type: 'done' });

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
