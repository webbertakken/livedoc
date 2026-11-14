// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVisualViewportBand, useVisualViewportBand } from './useVisualViewportBand';

// The visible band (docs/specs/007-editor/live-app.md "A dialog stays above the on-screen keyboard").

afterEach(() => vi.unstubAllGlobals());

const viewport = (v: { height: number; offsetTop?: number }) =>
  vi.stubGlobal('visualViewport', {
    width: window.innerWidth,
    offsetTop: 0,
    offsetLeft: 0,
    ...v,
  });

describe('readVisualViewportBand', () => {
  it('is null without a visualViewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    expect(readVisualViewportBand()).toBeNull();
  });

  it('is null while the whole window is visible, within rounding', () => {
    viewport({ height: window.innerHeight - 0.5 });
    expect(readVisualViewportBand()).toBeNull();
  });

  it('is the visible band while a keyboard covers the bottom', () => {
    viewport({ height: 420 });
    expect(readVisualViewportBand()).toEqual({
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: 420,
    });
  });

  it('follows a band panned down the page', () => {
    viewport({ height: window.innerHeight, offsetTop: 200 });
    expect(readVisualViewportBand()?.top).toBe(200);
  });
});

// docs/specs/008-canvas/canvas-performance.md "A render never asks the browser for layout": reading the visual
// viewport brings layout up to date, and every dialog in the editor read it as it rendered, laying the board out
// in the middle of a stroke's release. The band is read once and kept; the viewport's events update it.
describe('useVisualViewportBand', () => {
  // A visual viewport whose every read is counted, and whose events can be fired.
  function countedViewport(height: number) {
    const target = new EventTarget();
    const reads = { count: 0 };
    const state = { height };
    const counted = (read: () => number) => ({
      get: () => {
        reads.count += 1;
        return read();
      },
    });
    const vv = Object.defineProperties(target, {
      width: counted(() => window.innerWidth),
      height: counted(() => state.height),
      offsetTop: counted(() => 0),
      offsetLeft: counted(() => 0),
    });
    vi.stubGlobal('visualViewport', vv);
    return { vv, reads, state };
  }

  it('reads the viewport once, however often a dialog renders', () => {
    const { reads } = countedViewport(window.innerHeight);
    const view = renderHook(() => useVisualViewportBand());
    const afterMount = reads.count;
    for (let i = 0; i < 20; i++) view.rerender();
    expect(reads.count).toBe(afterMount);
    expect(view.result.current).toBeNull();
  });

  it('reads it again when the viewport resizes, and hands on the new band', () => {
    const { vv, state } = countedViewport(window.innerHeight);
    const view = renderHook(() => useVisualViewportBand());
    state.height = 420;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    expect(view.result.current?.height).toBe(420);
  });
});
