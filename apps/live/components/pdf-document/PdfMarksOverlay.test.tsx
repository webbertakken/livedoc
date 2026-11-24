// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "The recolouring": a mark made in LiveDoc passes through the same step as
// the file's own, so under Dark pages it takes the step's colour and lightens the dark page rather than multiplying.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DarkPages, Mark, PageName, type Quad } from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import { PdfMarksOverlay } from './PdfMarksOverlay';

const QUAD: Quad = [10, 20, 50, 20, 10, 10, 50, 10];
const mark = Mark.highlight({
  id: 'm1',
  page: PageName.ofObject(1),
  quads: [QUAD],
  text: 'words',
  colour: '#ffeb3b',
  opacity: 1,
  author: 'Ada',
  createdAt: 0,
})!;

function overlay(look: 'paper' | 'dark') {
  const { container } = render(
    <PdfLookContext.Provider value={look}>
      <PdfMarksOverlay matrix={[1, 0, 0, -1, 0, 100]} width={100} height={100} marks={[mark]} />
    </PdfLookContext.Provider>,
  );
  return container.querySelector('svg')!;
}

describe('LiveDoc’s marks over a page', () => {
  it('multiplies a mark in its own colour onto paper', () => {
    const svg = overlay('paper');
    expect(svg.getAttribute('class')).toContain('mix-blend-multiply');
    expect(svg.querySelector('[data-pdf-mark="m1"]')!.getAttribute('fill')).toBe('#ffeb3b');
  });

  it('lightens a Dark page with the colour the step gives the file’s own marks', () => {
    const svg = overlay('dark');
    expect(svg.getAttribute('data-pdf-look')).toBe('dark');
    expect(svg.getAttribute('class')).toContain('mix-blend-lighten');
    expect(svg.querySelector('[data-pdf-mark="m1"]')!.getAttribute('fill')).toBe(
      DarkPages.hex('#ffeb3b'),
    );
  });
});

// marks.md "Making a mark": How a text mark is drawn.
describe('a line mark over a page', () => {
  const underline = Mark.ofText('underline', { ...mark, colour: '#16a34a' })!;

  it('strokes its line in its colour, in the page’s points, filling nothing', () => {
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[underline]}
      />,
    );
    const group = container.querySelector('[data-pdf-mark="m1"]')!;
    expect(group.getAttribute('data-pdf-mark-kind')).toBe('underline');
    expect(group.getAttribute('fill')).toBe('none');
    expect(group.getAttribute('stroke')).toBe('#16a34a');
    expect(group.querySelector('polygon')).toBeNull();
    // The quad's foot, y 10 in page space, is y 90 in view space.
    const line = group.querySelector('polyline')!;
    expect(line.getAttribute('points')).toBe('10,90 50,90');
    expect(line.getAttribute('stroke-width')).toBe('1');
  });
});

// marks.md "Making a mark": A Drawing, its strokes round; the stroke being drawn in the tool's look.
describe('a Drawing over a page', () => {
  it('strokes each stroke round, and the stroke being drawn in the tool’s look, its colour mirrored on Dark pages', () => {
    const sketch = Mark.drawing({
      id: 'd1',
      page: PageName.ofObject(1),
      strokes: [[10, 10, 20, 20]],
      width: 2,
      colour: '#d93025',
      opacity: 1,
      author: 'Ada',
      createdAt: 0,
    })!;
    const ink = { stroke: [30, 30], colour: '#7c3aed', opacity: 0.5, width: 3 };
    const { container, rerender } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[sketch]}
        ink={ink}
      />,
    );
    const line = container.querySelector('[data-pdf-mark="d1"] polyline')!;
    expect(line.getAttribute('points')).toBe('10,90 20,80');
    expect(line.getAttribute('stroke-linecap')).toBe('round');
    const drawn = container.querySelector('[data-pdf-ink-preview]')!;
    // One point is a dot: the point twice, its round ends drawing it.
    expect(drawn.getAttribute('points')).toBe('30,70 30,70');
    expect(drawn.getAttribute('stroke')).toBe('#7c3aed');
    expect(drawn.getAttribute('stroke-width')).toBe('3');
    rerender(
      <PdfLookContext.Provider value="dark">
        <PdfMarksOverlay
          matrix={[1, 0, 0, -1, 0, 100]}
          width={100}
          height={100}
          marks={[]}
          ink={ink}
        />
      </PdfLookContext.Provider>,
    );
    expect(container.querySelector('[data-pdf-ink-preview]')!.getAttribute('stroke')).toBe(
      DarkPages.hex('#7c3aed'),
    );
  });
});
