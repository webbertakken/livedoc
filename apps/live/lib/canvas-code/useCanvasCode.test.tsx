// @vitest-environment jsdom
// docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code": the editor's side. A needed load that fails
// goes to the stale-build safety net; once the document has settled, the canvas's code and the canvas's surfaces are
// fetched on idle only when a tab is a canvas.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const prefetchOnceQuiet = vi.fn((_loaders: unknown): (() => void) => () => {});
const recoverInBrowser = vi.fn((..._args: unknown[]): void => {});
const setCanvasCodeFailureHandler = vi.fn((_handler: unknown): void => {});
vi.mock('@/lib/idle-prefetch', () => ({
  prefetchOnceQuiet: (loaders: unknown) => prefetchOnceQuiet(loaders),
}));
vi.mock('@/lib/stale-build-navigation', () => ({
  browserNavigationDeps: () => 'deps',
  recoverInBrowser: (...args: unknown[]) => recoverInBrowser(...args),
}));
vi.mock('./canvas-code', () => ({
  CANVAS_CODE_PREFETCH: ['the canvas'],
  setCanvasCodeFailureHandler: (h: unknown) => setCanvasCodeFailureHandler(h),
}));
vi.mock('@/lib/editor-deferred-code', () => ({ CANVAS_SURFACE_CODE: ['its surfaces'] }));

const { useCanvasCode } = await import('./useCanvasCode');

afterEach(() => vi.clearAllMocks());

describe('useCanvasCode', () => {
  it('hands a needed load’s failure to the stale-build safety net', () => {
    renderHook(() => useCanvasCode({ settled: false, needsCanvas: true }));
    const handler = setCanvasCodeFailureHandler.mock.calls[0]![0] as (e: unknown) => void;
    const error = new Error('Loading chunk 3 failed.');
    handler(error);
    expect(recoverInBrowser).toHaveBeenCalledWith(error, 'deps');
  });

  it('prefetches the canvas and its surfaces once a document with a canvas tab has settled', () => {
    const { rerender } = renderHook((props) => useCanvasCode(props), {
      initialProps: { settled: false, needsCanvas: true },
    });
    expect(prefetchOnceQuiet).not.toHaveBeenCalled();
    rerender({ settled: true, needsCanvas: true });
    expect(prefetchOnceQuiet).toHaveBeenCalledWith(['the canvas', 'its surfaces']);
  });

  it('prefetches nothing for a document whose tabs all have a surface', () => {
    renderHook(() => useCanvasCode({ settled: true, needsCanvas: false }));
    expect(prefetchOnceQuiet).not.toHaveBeenCalled();
  });
});
