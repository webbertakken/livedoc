// Runs `run` once the next frame is painted: a frame's own work (a keystroke drawn) is never kept waiting on it.
// Returns what cancels it.
export function afterNextPaint(run: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(run, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
  };
}
