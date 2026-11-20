// How the sheet store reaches its engine (docs/specs/029-sheets/formulas.md "Recalculation"): a Web Worker in the
// browser; in place, answering at once, where the page has no Workers (unit tests, server rendering).
import { EngineHosts, type FromEngine, type ToEngine } from './sheet-engine-hosts';

/** How long the Worker works before it takes in newer changes: half a 60 Hz frame (safe range 4 to 16). */
export const RECALC_SLICE_MS = 8;

export type EngineLink = {
  send: (m: ToEngine) => void;
  listen: (fn: (m: FromEngine) => void) => void;
  close: () => void;
};

export function workerLink(): EngineLink {
  const worker = new Worker(new URL('./sheet-engine.worker.ts', import.meta.url), {
    type: 'module',
  });
  return {
    send: (m) => worker.postMessage(m),
    listen: (fn) => worker.addEventListener('message', (e: MessageEvent<FromEngine>) => fn(e.data)),
    close: () => worker.terminate(),
  };
}

/** The engines in this thread: each message answered before \`send\` returns. */
export function inPlaceLink(): EngineLink {
  const listeners: ((m: FromEngine) => void)[] = [];
  const hosts = new EngineHosts((m) => {
    for (const fn of listeners) fn(m);
  });
  return {
    send: (m) => {
      hosts.receive(m);
      while (hosts.work(Infinity));
    },
    listen: (fn) => listeners.push(fn),
    close: () => undefined,
  };
}

export function engineLink(): EngineLink {
  return typeof Worker === 'undefined' ? inPlaceLink() : workerLink();
}
