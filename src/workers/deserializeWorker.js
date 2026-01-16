/**
 * Web Worker for deserializing primitives off the main thread
 * Prevents UI freeze during large state restoration
 */

self.onmessage = function(e) {
  const { items, chunkSize = 100 } = e.data;

  if (!Array.isArray(items)) {
    self.postMessage({ type: 'error', error: 'Invalid data' });
    return;
  }

  const total = items.length;
  const results = [];

  // Process in chunks and report progress
  for (let i = 0; i < total; i += chunkSize) {
    const end = Math.min(i + chunkSize, total);

    for (let j = i; j < end; j++) {
      const item = items[j];
      if (item && item.type) {
        // Just validate and pass through - actual object creation happens on main thread
        results.push(item);
      }
    }

    // Report progress
    self.postMessage({
      type: 'progress',
      current: end,
      total: total,
      percent: Math.round((end / total) * 100)
    });
  }

  // Send final result
  self.postMessage({ type: 'complete', data: results });
};
