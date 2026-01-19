/**
 * JSON Parse Worker - Parses large JSON strings off the main thread
 * Sends data in chunks for progressive rendering
 */

self.onmessage = function(e) {
  const { jsonString, chunkSize = 100 } = e.data;

  try {
    // Parse JSON in worker (heavy operation)
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

    // Extract primitives array
    const primitives = data.primitives || data;
    const total = Array.isArray(primitives) ? primitives.length : 0;

    // Send metadata immediately
    self.postMessage({
      type: 'metadata',
      layers: data.layers || null,
      view: data.view || null,
      workspace: data.workspace || null,
      grid: data.grid || null,
      snapSettings: data.snapSettings || null,
      plcSettings: data.plcSettings || null,
      totalPrimitives: total
    });

    if (total === 0) {
      self.postMessage({ type: 'complete' });
      return;
    }

    // Stream primitives in chunks
    for (let i = 0; i < total; i += chunkSize) {
      const end = Math.min(i + chunkSize, total);
      const chunk = primitives.slice(i, end);

      self.postMessage({
        type: 'chunk',
        data: chunk,
        percent: Math.round((end / total) * 100)
      });
    }

    self.postMessage({ type: 'complete' });

  } catch (err) {
    self.postMessage({ type: 'error', error: err.message });
  }
};
