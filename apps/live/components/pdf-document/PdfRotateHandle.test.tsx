// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate, The handle. A round handle a gap above the box as it
// shows, joined to it by a line; at least 24 px, 44 on touch; none for a mark that does not turn.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Mark, PageName } from '@livedoc/pdf-documents';
import { PdfRotateHandle } from './PdfRotateHandle';

const BASE = {
  page: PageName.ofObject(3),
  colour: '#188038',
  opacity: 1,
  author: 'Ada',
  createdAt: 1,
};

function handle(mark: Mark) {
  return render(
    <PdfRotateHandle
      mark={mark}
      matrix={[1, 0, 0, -1, 0, 792]}
      width={612}
      height={792}
      gap={24}
      toView={(client) => client}
      pageBox={() => [0, 0, 612, 792]}
      onPreview={vi.fn()}
      onTurn={vi.fn()}
    />,
  );
}

describe('PdfRotateHandle', () => {
  it('stands a round handle above the box, joined to it by a line', () => {
    const stamp = Mark.stamp({
      ...BASE,
      id: 's',
      stamp: 'approved',
      rect: [100, 100, 160, 120],
      lines: ['APPROVED'],
    })!;
    const { container } = handle(stamp);
    const knob = container.querySelector<HTMLElement>('[data-pdf-rotate-handle="s"]')!;
    expect(knob.getAttribute('aria-hidden')).toBe('true');
    expect(knob.className).toContain('size-chip');
    expect(knob.className).toContain('pointer-coarse:size-11');
    expect(parseFloat(knob.style.left)).toBeCloseTo((130 / 612) * 100, 3);
    expect(parseFloat(knob.style.top)).toBeCloseTo(((792 - 144) / 792) * 100, 3);
    const line = container.querySelector('[data-pdf-rotate-line="s"]')!;
    expect(line.getAttribute('y1')).toBe(String(792 - 120));
    expect(line.getAttribute('y2')).toBe(String(792 - 144));
  });

  it('shows nothing for a mark that does not turn', () => {
    const drawing = Mark.drawing({ ...BASE, id: 'd', strokes: [[0, 0, 9, 9]], width: 1 })!;
    const { container } = handle(drawing);
    expect(container.querySelector('[data-pdf-rotate-handle]')).toBeNull();
  });
});
