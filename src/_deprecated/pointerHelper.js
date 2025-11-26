export function createPointerHelper(state) {
  function getPosition(evt) {
    const canvas = state.elements.canvas;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    let clientX;
    let clientY;
    if (evt.touches && evt.touches[0]) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;

    let logicalX = (rawX - state.view.panX) / (state.view.zoom || 1);
    let logicalY = (rawY - state.view.panY) / (state.view.zoom || 1);
    logicalX = logicalX / (state.view.scaleFactor || 1);
    logicalY = logicalY / (state.view.scaleFactor || 1);

    logicalX = Math.max(0, Math.min(state.workspace.widthMm || 0, logicalX));
    logicalY = Math.max(0, Math.min(state.workspace.heightMm || 0, logicalY));

    state.snap.lastPointerRaw = { x: logicalX, y: logicalY };
    return { x: logicalX, y: logicalY };
  }

  return { getPosition };
}
