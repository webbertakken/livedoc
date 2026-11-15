// Whether the Explorer's own first reads have landed: its documents are listed. What the Explorer fetches ahead of
// need (the editor's code, what builds a new document, its search) waits for this, then for an idle moment: an idle
// main thread is not an idle connection, and code fetched ahead would otherwise share the connection with the reads
// the landing page is waiting on (docs/specs/016-platform/web-performance.md "What is fetched ahead waits for the
// page's own reads").

// How long what is fetched ahead waits for the Explorer's reads before it starts anyway (default).
export const EXPLORER_SETTLE_TIMEOUT_MS = 5000;

let settled = false;
const waiting = new Set<() => void>();

export function markExplorerSettled(): void {
  if (settled) return;
  settled = true;
  for (const run of [...waiting]) run();
}

/**
 * Runs `start` once the Explorer has settled, or once the wait runs out. `start` answers its own cancel (an idle
 * callback's); the cancel answered here stops whichever is pending, for an effect's cleanup.
 */
export function afterExplorerSettled(start: () => () => void): () => void {
  let stop: (() => void) | null = null;
  let timer: number | null = null;
  const run = () => {
    waiting.delete(run);
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    stop = start();
  };
  if (settled) {
    run();
  } else {
    waiting.add(run);
    timer = window.setTimeout(run, EXPLORER_SETTLE_TIMEOUT_MS);
  }
  return () => {
    waiting.delete(run);
    if (timer !== null) window.clearTimeout(timer);
    stop?.();
  };
}

export function resetExplorerSettledForTests(): void {
  settled = false;
  waiting.clear();
}
