// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": The context menu: Highlight marks the selected text and
// clears it, in Reviewing only; Find "…" opens Find with it; from the keyboard it opens at the selection's first
// rectangle, or the middle of the pages; a right-click keeps the selection.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIND_SELECTION, HIGHLIGHT_SELECTION } from './pdf-context-menu';
import { pdfMenuPoint, usePdfContextMenu } from './usePdfContextMenu';
import type { PdfTextSelected } from './usePdfTextSelection';

const SELECTED: PdfTextSelected = {
  page: 1,
  spans: [[0, 9]],
  quads: [[0, 8, 6, 8, 0, 0, 6, 0]],
  text: 'quick\r\nfox',
};

function menu(selected: PdfTextSelected | null, marking = true) {
  const props = { onHighlight: vi.fn(), onFind: vi.fn(), clear: vi.fn() };
  const hook = renderHook(() => usePdfContextMenu({ pages: null, selected, marking, ...props }));
  return { hook, ...props };
}

describe('the context menu’s own items', () => {
  it('highlights the selection and clears it, and finds it', () => {
    const { hook, onHighlight, onFind, clear } = menu(SELECTED);
    hook.result.current.actions[HIGHLIGHT_SELECTION]!.run();
    expect(onHighlight).toHaveBeenCalledWith(1, { text: SELECTED.text, quads: SELECTED.quads });
    expect(clear).toHaveBeenCalled();
    const find = hook.result.current.actions[FIND_SELECTION]!;
    expect(find.label).toBe('Find “quick fox”');
    find.run();
    expect(onFind).toHaveBeenCalledWith('quick fox');
    // A right-click keeps the selection: placing the caret does nothing.
    hook.result.current.source.placeCaret({ x: 1, y: 1 });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('binds neither with nothing selected, and no Highlight outside Reviewing', () => {
    expect(menu(null).hook.result.current.actions).toEqual({});
    const viewing = menu(SELECTED, false).hook.result.current.actions;
    expect(viewing[HIGHLIGHT_SELECTION]).toBeUndefined();
    expect(viewing[FIND_SELECTION]).toBeDefined();
    expect(menu(null).hook.result.current.source.caretPoint()).toBeNull();
  });
});

describe('where the menu opens from the keyboard', () => {
  const box = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, bottom: top + height, right: left + width }) as DOMRect;

  it('opens under the selection’s first rectangle, else at the middle of the pages', () => {
    const pages = document.createElement('div');
    pages.getBoundingClientRect = () => box(0, 0, 800, 600);
    expect(pdfMenuPoint(pages)).toEqual({ x: 400, y: 300 });
    pages.innerHTML = '<svg><g data-pdf-text-selection="true"><polygon /></g></svg>';
    pages.querySelector('polygon')!.getBoundingClientRect = () => box(50, 60, 100, 10);
    expect(pdfMenuPoint(pages)).toEqual({ x: 50, y: 70 });
    expect(pdfMenuPoint(null)).toBeNull();
  });
});
