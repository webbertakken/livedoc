// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": The context menu: Find "…" opens Find with the
// selection; from the keyboard it opens at its first rectangle, or the middle of the pages; a right-click keeps it.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIND_SELECTION } from './pdf-context-menu';
import { pdfMenuPoint, usePdfContextMenu } from './usePdfContextMenu';
import type { PdfTextSelected } from './usePdfTextSelection';

const SELECTED: PdfTextSelected = {
  page: 1,
  spans: [[0, 9]],
  quads: [[0, 8, 6, 8, 0, 0, 6, 0]],
  touch: false,
  text: 'quick\r\nfox',
};

function menu(selected: PdfTextSelected | null) {
  const props = { onFind: vi.fn() };
  const hook = renderHook(() => usePdfContextMenu({ pages: null, selected, ...props }));
  return { hook, ...props };
}

describe('the context menu’s own items', () => {
  it('finds the selection', () => {
    const { hook, onFind } = menu(SELECTED);
    const find = hook.result.current.actions[FIND_SELECTION]!;
    expect(find.label).toBe('Find “quick fox”');
    find.run();
    expect(onFind).toHaveBeenCalledWith('quick fox');
    // A right-click keeps the selection: placing the caret does nothing.
    expect(hook.result.current.source.placeCaret({ x: 1, y: 1 })).toBeUndefined();
  });

  it('binds nothing with nothing selected', () => {
    expect(menu(null).hook.result.current.actions).toEqual({});
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
