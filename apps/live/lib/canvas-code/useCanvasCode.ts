import { useEffect } from 'react';
import { CANVAS_SURFACE_CODE } from '@/lib/editor-deferred-code';
import { prefetchOnceQuiet } from '@/lib/idle-prefetch';
import { browserNavigationDeps, recoverInBrowser } from '@/lib/stale-build-navigation';
import { CANVAS_CODE_PREFETCH, setCanvasCodeFailureHandler } from './canvas-code';

const CANVAS_PREFETCH = [...CANVAS_CODE_PREFETCH, ...CANVAS_SURFACE_CODE];

// The editor's side of the canvas's code (docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code"): a
// needed load that fails goes to the stale-build safety net, which reloads into a newer build when one is live; and
// once the opened document has settled, a document with a canvas tab fetches the canvas and its surfaces while the
// page is idle, so switching to that tab, or opening a canvas panel, finds them in. A document whose tabs all have a
// surface fetches none of it.
export function useCanvasCode({
  settled,
  needsCanvas,
}: {
  settled: boolean;
  needsCanvas: boolean;
}): void {
  useEffect(() => {
    setCanvasCodeFailureHandler((error) => void recoverInBrowser(error, browserNavigationDeps()));
  }, []);
  useEffect(
    () => (settled && needsCanvas ? prefetchOnceQuiet(CANVAS_PREFETCH) : undefined),
    [settled, needsCanvas],
  );
}
