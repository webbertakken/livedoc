// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a finger's selection has a handle below each
// end, 44 px to the finger, hidden from assistive technology; dragging one hands that end over with the finger's point.
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageMatrix, Quad } from '@livedoc/pdf-documents';
import { PdfSelectionHandles } from './PdfSelectionHandles';

// Page space to view space at 72 dpi on a 612 by 792 page: y runs down from the top.
const MATRIX: PageMatrix = [1, 0, 0, -1, 0, 792];
// "Hello" on one line, "By" on the next.
const QUADS: Quad[] = [
  [100, 708, 130, 708, 100, 700, 130, 700],
  [100, 696, 112, 696, 100, 688, 112, 688],
];

function handles(quads: readonly Quad[] = QUADS) {
  const onDrag = vi.fn();
  const view = render(
    <PdfSelectionHandles matrix={MATRIX} width={612} height={792} quads={quads} onDrag={onDrag} />,
  );
  const of = (end: string) =>
    view.container.querySelector<HTMLElement>(`[data-pdf-handle="${end}"]`)!;
  return { view, onDrag, of };
}

describe('PdfSelectionHandles', () => {
  it('hangs a handle below the first line’s start and the last line’s end', () => {
    const { of } = handles();
    expect(Number.parseFloat(of('start').style.left)).toBeCloseTo((100 / 612) * 100, 3);
    expect(Number.parseFloat(of('start').style.top)).toBeCloseTo((92 / 792) * 100, 3);
    expect(Number.parseFloat(of('end').style.left)).toBeCloseTo((112 / 612) * 100, 3);
    expect(Number.parseFloat(of('end').style.top)).toBeCloseTo((104 / 792) * 100, 3);
    expect(of('start').getAttribute('aria-hidden')).toBe('true');
    expect(of('end').className).toContain('size-11');
  });

  it('hands a dragged handle’s end over, from just above the finger, until it is lifted', () => {
    const { of, onDrag } = handles();
    const end = of('end');
    end.setPointerCapture = vi.fn();
    fireEvent.pointerMove(end, { clientX: 5, clientY: 50 });
    fireEvent.pointerDown(end, { pointerId: 3 });
    fireEvent.pointerMove(end, { clientX: 140, clientY: 130 });
    fireEvent.pointerMove(of('start'), { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(end);
    fireEvent.pointerMove(end, { clientX: 150, clientY: 130 });
    const start = of('start');
    start.setPointerCapture = vi.fn();
    fireEvent.pointerDown(start, { pointerId: 4 });
    fireEvent.pointerCancel(start);
    fireEvent.pointerMove(start, { clientX: 150, clientY: 130 });

    expect(onDrag.mock.calls).toEqual([['end', { x: 140, y: 108 }]]);
    expect(end.setPointerCapture).toHaveBeenCalledWith(3);
  });

  it('draws nothing for nothing selected', () => {
    const { view } = handles([]);
    expect(view.container.innerHTML).toBe('');
  });
});
