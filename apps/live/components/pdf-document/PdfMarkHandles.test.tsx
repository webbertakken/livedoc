// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": one selected mark's handles, dragged to resize it, shown as
// it goes and made once let go; "Keyboard and accessibility": 24 px targets, 44 on touch, hidden from assistive
// technology.
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Mark, PageName, type PageMatrix } from '@livedoc/pdf-documents';
import { PdfMarkHandles } from './PdfMarkHandles';

const ellipse = Mark.shape('ellipse', {
  id: 'e',
  page: PageName.ofObject(1),
  rect: [100, 100, 200, 150],
  width: 2,
  colour: '#ff0000',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
})!;
const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 400];

function handles({ laidOut = true } = {}) {
  const onPreview = vi.fn();
  const onReshape = vi.fn();
  const view = render(
    <PdfMarkHandles
      mark={ellipse}
      matrix={UPRIGHT}
      width={400}
      height={400}
      toView={({ x, y }) => (laidOut ? { x, y } : null)}
      pageBox={() => [0, 0, 400, 400]}
      onPreview={onPreview}
      onReshape={onReshape}
    />,
  );
  const handle = (name: string) =>
    view.container.querySelector<HTMLElement>(`[data-pdf-mark-handle="${name}"]`)!;
  for (const element of view.container.querySelectorAll<HTMLElement>('[data-pdf-mark-handle]'))
    element.setPointerCapture = vi.fn();
  return { handle, onPreview, onReshape, view };
}

describe('a selected mark’s handles', () => {
  it('lays a target on each corner and side, hidden from assistive technology', () => {
    const { handle, view } = handles();
    expect(view.container.querySelectorAll('[data-pdf-mark-handle]')).toHaveLength(8);
    expect(handle('se').style.left).toBe('50%');
    expect(handle('se').style.top).toBe('75%');
    expect(handle('se').getAttribute('aria-hidden')).toBe('true');
    expect(handle('se').className).toContain('size-chip');
    expect(handle('se').className).toContain('pointer-coarse:size-11');
    expect(handle('se').className).toContain('cursor-nwse-resize');
  });

  it('shows the mark as a drag has it and hands it over once let go', () => {
    const { handle, onPreview, onReshape } = handles();
    fireEvent.pointerDown(handle('se'), { pointerId: 1 });
    fireEvent.pointerMove(handle('se'), { pointerId: 1, clientX: 260, clientY: 340 });
    expect(onPreview).toHaveBeenLastCalledWith({ rect: [100, 60, 260, 150] });
    fireEvent.pointerUp(handle('se'), { pointerId: 1 });
    expect(onReshape).toHaveBeenCalledWith({ rect: [100, 60, 260, 150] });
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('hands nothing over for a press alone, a cancel, another handle, or a page not laid out', () => {
    const { handle, onReshape, onPreview } = handles();
    fireEvent.pointerDown(handle('se'), { pointerId: 1 });
    fireEvent.pointerUp(handle('se'), { pointerId: 1 });
    fireEvent.pointerMove(handle('nw'), { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(handle('n'), { pointerId: 1 });
    fireEvent.pointerMove(handle('n'), { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.pointerCancel(handle('n'), { pointerId: 1 });
    expect(onReshape).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    const unlaid = handles({ laidOut: false });
    fireEvent.pointerDown(unlaid.handle('e'), { pointerId: 1 });
    fireEvent.pointerMove(unlaid.handle('e'), { pointerId: 1, clientX: 300, clientY: 275 });
    expect(unlaid.onPreview).not.toHaveBeenCalled();
  });
});
