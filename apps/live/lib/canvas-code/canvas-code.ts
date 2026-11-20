import { debugLog } from '@/lib/debug-log';
import { DOCUMENT_CONTENT_CODE } from '@/lib/editor-deferred-code';
import { prefetchWhenIdle } from '@/lib/idle-prefetch';

// The canvas's code (docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code"): the canvas, its palette
// and toolbars, and the chrome only a canvas uses, as one chunk the document page loads on demand, so a document whose
// tabs all have a surface never downloads it. Asked for once however many places ask, read synchronously once in (a
// board's first frame draws its canvas, never a lazy wrapper's placeholder), and, like the element kind families
// (lib/element-kinds/store.ts), a needed load that fails is shown and handed to the stale-build safety net.

export type CanvasCodeModule = typeof import('@/components/canvas/canvas-code-entry');

// Why it was asked. Every reason but `idle` is needed: a board on screen or a tab just chosen waits for it.
export type CanvasCodeReason = 'open' | 'tab' | 'idle' | 'retry';

type FailureHandler = (error: unknown) => void;

// The content a board may draw on open follows the canvas's code, never a document without a canvas
// (lib/editor-deferred-code.ts).
const defaultLoader = (): Promise<CanvasCodeModule> => {
  prefetchWhenIdle(DOCUMENT_CONTENT_CODE);
  return import('@/components/canvas/canvas-code-entry');
};

let loader: () => Promise<CanvasCodeModule> = defaultLoader;
let loaded: CanvasCodeModule | null = null;
let inFlight: Promise<boolean> | null = null;
let neededWhileRunning = false;
let failed = false;
let onNeededFailure: FailureHandler = () => {};
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

// What a needed load that fails is handed to: the stale-build safety net (useCanvasCode).
export function setCanvasCodeFailureHandler(handler: FailureHandler): void {
  onNeededFailure = handler;
}

// The canvas's module once it is in, else null.
export function loadedCanvasCode(): CanvasCodeModule | null {
  return loaded;
}

// Whether a load something waited on failed (cleared by the next load that lands).
export function canvasCodeFailed(): boolean {
  return failed;
}

// Resolves true once the code is in, false when its load failed; never rejects. A load in flight is joined.
export function loadCanvasCode(reason: CanvasCodeReason): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  if (reason !== 'idle') neededWhileRunning = true;
  if (inFlight) return inFlight;
  debugLog(`[canvas-code] load reason=${reason}`);
  const startedAt = performance.now();
  inFlight = loader()
    .then((module) => {
      loaded = module;
      failed = false;
      debugLog(`[canvas-code] in ms=${Math.round(performance.now() - startedAt)}`);
      return true;
    })
    .catch((error: unknown) => {
      if (neededWhileRunning) {
        failed = true;
        console.warn(`[canvas-code] failed reason=${reason}`, error);
        onNeededFailure(error);
      } else {
        debugLog(`[canvas-code] failed reason=${reason} ${String(error)}`);
      }
      return false;
    })
    .finally(() => {
      inFlight = null;
      neededWhileRunning = false;
      changed();
    });
  return inFlight;
}

export function retryCanvasCode(): Promise<boolean> {
  return loadCanvasCode('retry');
}

export function subscribeCanvasCode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// One stable loader for prefetchWhenIdle, which runs each loader once per page.
export const CANVAS_CODE_PREFETCH: readonly (() => Promise<boolean>)[] = [
  () => loadCanvasCode('idle'),
];

export function setCanvasCodeLoaderForTests(next: () => Promise<unknown>): void {
  loader = next as () => Promise<CanvasCodeModule>;
}

export function resetCanvasCodeForTests(): void {
  loader = defaultLoader;
  loaded = null;
  inFlight = null;
  neededWhileRunning = false;
  failed = false;
  onNeededFailure = () => {};
  listeners.clear();
}
