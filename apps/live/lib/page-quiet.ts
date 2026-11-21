// Work that waits until the opened page has gone quiet (docs/specs/016-platform/web-performance.md "Surfaces someone
// opens"): no long task for QUIET_MS, the window in which the canvas probe calls a page interactive
// (docs/specs/008-canvas/canvas-performance.md D68). Code fetched ahead for a surface someone may open evaluates as
// long tasks of its own; started on the first idle moment, it landed among the opening's last tasks and kept the
// page from settling. A page that never goes quiet runs it after QUIET_MAX_WAIT_MS. Where long tasks cannot be
// watched (Safari), it waits the window alone. Returns a cancel for an effect's cleanup.
import { debugLog } from './debug-log';

export const QUIET_MS = 500;
export const QUIET_MAX_WAIT_MS = 10_000;

export function afterPageQuiet(run: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const watchable =
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
  let observer: PerformanceObserver | null = null;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let longest: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    observer?.disconnect();
    observer = null;
    clearTimeout(quiet);
    clearTimeout(longest);
  };
  const fire = (why: 'quiet' | 'longest wait') => {
    stop();
    debugLog('[page-quiet] run', { why });
    run();
  };
  const wait = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => fire('quiet'), QUIET_MS);
  };
  if (watchable) {
    observer = new PerformanceObserver(() => wait());
    observer.observe({ type: 'longtask' });
    longest = setTimeout(() => fire('longest wait'), QUIET_MAX_WAIT_MS);
  }
  wait();
  return stop;
}
