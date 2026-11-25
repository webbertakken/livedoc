// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": A tool's line: with a line tool in hand, Format > Line width
// and Line style set that tool's, its step checked; with a Rectangle or Ellipse in hand the toolbar's Fill sets its
// fill, led by None; each kept for the kind, the pages given the keys; "Telemetry and observability": `ToolLine`,
// `[pdf] tool-look`.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { markLooks, resetMarkLooks, useMarkLooks } from './pdf-mark-looks';
import { FILL_COLOUR } from './pdf-toolbar';
import type { PdfPageTool } from './usePdfMarkTools';
import { usePdfToolLine } from './usePdfToolLine';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const focusPages = vi.fn();

function inHand(tool: PdfPageTool) {
  return renderHook(() => usePdfToolLine({ inHand: tool, looks: useMarkLooks(), focusPages }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  localStorage.clear();
  resetMarkLooks();
});

describe('a tool’s line', () => {
  it('binds nothing with Select, a text tool, a Text or a Stamp in hand', () => {
    for (const tool of ['select', 'highlight', 'text', 'callout', 'stamp'] as const)
      expect(inHand(tool).result.current).toEqual({ actions: {}, colours: {} });
  });

  it('checks the tool’s width and style, and sets them for the kind alone', () => {
    const { result } = inHand('arrow');
    expect(result.current.actions['line-width-2-pt']?.checked).toBe(true);
    expect(result.current.actions['line-style-solid']?.checked).toBe(true);
    act(() => result.current.actions['line-width-8-pt']!.run());
    act(() => result.current.actions['line-style-dash-dot']!.run());
    expect(result.current.actions['line-width-8-pt']?.checked).toBe(true);
    expect(result.current.actions['line-width-2-pt']?.checked).toBe(false);
    expect(result.current.actions['line-style-dash-dot']?.checked).toBe(true);
    expect(markLooks().arrow).toMatchObject({ width: 8, lineStyle: 'dash-dot' });
    expect(markLooks().line.width).toBe(2);
    expect(focusPages).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'ToolLine');
    expect(debugLog).toHaveBeenCalledWith('[pdf] tool-look kind=arrow look=width');
    expect(debugLog).toHaveBeenCalledWith('[pdf] tool-look kind=arrow look=style');
  });

  it('offers a Drawing’s and a Line’s tool no fill', () => {
    expect(inHand('drawing').result.current.colours).toEqual({});
    expect(inHand('line').result.current.colours).toEqual({});
  });

  it('gives a Rectangle’s and an Ellipse’s tool a fill, led by None', () => {
    const { result } = inHand('ellipse');
    const fill = () => result.current.colours[FILL_COLOUR]!;
    expect(fill().leading).toBe('None');
    expect(fill().read()).toBeUndefined();
    act(() => fill().set('#FDE68A'));
    expect(fill().read()).toBe('#fde68a');
    expect(markLooks().rectangle.fill).toBeUndefined();
    act(() => fill().set(null));
    expect(fill().read()).toBeUndefined();
    expect(debugLog).toHaveBeenCalledWith('[pdf] tool-look kind=ellipse look=fill');
  });

  it('counts nothing that was not taken, and still gives the pages the keys', () => {
    const { result } = inHand('rectangle');
    act(() => result.current.colours[FILL_COLOUR]!.set('not a colour'));
    expect(track).not.toHaveBeenCalled();
    expect(focusPages).toHaveBeenCalledOnce();
  });
});
