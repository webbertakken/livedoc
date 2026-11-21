import { afterPageQuiet } from './page-quiet';

// Fetch the code of surfaces the editor loads on demand (docs/specs/016-platform/web-performance.md) once the
// page is idle, so their first use does not wait on the network while their code still stays out of the first
// load. Each loader runs once per page; a failure is ignored, since the surface's own import tries again (and
// handles failing) when it is drawn. Returns a cancel for an effect's cleanup.
const IDLE_TIMEOUT_MS = 4000;
const FALLBACK_DELAY_MS = 1500;
const started = new Set<() => Promise<unknown>>();

export function prefetchWhenIdle(loaders: readonly (() => Promise<unknown>)[]): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => {
    for (const load of loaders) {
      if (started.has(load)) continue;
      started.add(load);
      void load().catch(() => {});
    }
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, FALLBACK_DELAY_MS);
  return () => window.clearTimeout(id);
}

// The code of surfaces someone opens (docs/specs/016-platform/web-performance.md "Surfaces someone opens"): fetched
// as above, but only once the opened page has gone quiet (lib/page-quiet.ts), so evaluating it never lands among the
// opening's own tasks. Returns a cancel for an effect's cleanup.
export function prefetchOnceQuiet(loaders: readonly (() => Promise<unknown>)[]): () => void {
  let cancelIdle: () => void = () => {};
  const cancelQuiet = afterPageQuiet(() => {
    cancelIdle = prefetchWhenIdle(loaders);
  });
  return () => {
    cancelQuiet();
    cancelIdle();
  };
}
