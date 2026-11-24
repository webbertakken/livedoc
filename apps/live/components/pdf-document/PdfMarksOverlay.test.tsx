// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "The recolouring": a mark made in LiveDoc passes through the same step as
// the file's own, so under Dark pages it takes the step's colour and lightens the dark page rather than multiplying.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DarkPages, Mark, PageName, type PageMatrix, type Quad } from '@livedoc/pdf-documents';
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
    // A highlight is a fill alone, with no line round it.
    expect(svg.querySelector('[data-pdf-mark="m1"] polygon')!.getAttribute('stroke')).toBe('none');
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
    expect(group.getAttribute('stroke')).toBe('#16a34a');
    expect(group.querySelector('polygon')).toBeNull();
    // The quad's foot, y 10 in page space, is y 90 in view space.
    const line = group.querySelector('polyline')!;
    expect(line.getAttribute('fill')).toBe('none');
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
    const draft = {
      shape: { kind: 'drawing' as const, strokes: [[30, 30]], width: 3 },
      colour: '#7c3aed',
      opacity: 0.5,
    };
    const { container, rerender } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[sketch]}
        draft={draft}
      />,
    );
    const line = container.querySelector('[data-pdf-mark="d1"] polyline')!;
    expect(line.getAttribute('points')).toBe('10,90 20,80');
    expect(line.getAttribute('stroke-linecap')).toBe('round');
    const draftGroup = container.querySelector('[data-pdf-draft="drawing"]')!;
    const drawn = draftGroup.querySelector('polyline')!;
    // One point is a dot: the point twice, its round ends drawing it.
    expect(drawn.getAttribute('points')).toBe('30,70 30,70');
    expect(draftGroup.getAttribute('stroke')).toBe('#7c3aed');
    expect(draftGroup.getAttribute('opacity')).toBe('0.5');
    expect(drawn.getAttribute('stroke-width')).toBe('3');
    rerender(
      <PdfLookContext.Provider value="dark">
        <PdfMarksOverlay
          matrix={[1, 0, 0, -1, 0, 100]}
          width={100}
          height={100}
          marks={[]}
          draft={draft}
        />
      </PdfLookContext.Provider>,
    );
    expect(container.querySelector('[data-pdf-draft]')!.getAttribute('stroke')).toBe(
      DarkPages.hex('#7c3aed'),
    );
  });
});

// marks.md "Making a mark": a Rectangle round its box, closed; a line or shape shows as it is dragged.
describe('a shape over a page', () => {
  it('draws a Rectangle as a closed outline, filling nothing, and the shape being dragged in its look', () => {
    const box = Mark.shape('rectangle', {
      id: 'r1',
      page: PageName.ofObject(1),
      rect: [10, 10, 40, 30],
      width: 2,
      colour: '#d93025',
      opacity: 1,
      author: 'Ada',
      createdAt: 0,
    })!;
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[box]}
        draft={{
          shape: { kind: 'arrow', line: [50, 50, 90, 50], width: 2 },
          colour: '#1a73e8',
          opacity: 1,
        }}
      />,
    );
    const outline = container.querySelector('[data-pdf-mark="r1"] polygon')!;
    expect(outline.getAttribute('points')).toBe('10,90 40,90 40,70 10,70');
    expect(outline.getAttribute('fill')).toBe('none');
    expect(outline.getAttribute('stroke-width')).toBe('2');
    expect(container.querySelectorAll('[data-pdf-draft="arrow"] polyline')).toHaveLength(2);
  });
});

// marks.md "Making a mark": a Text's words set line for line in Helvetica's widths, upright on the page as the file has
// it; a right-to-left paragraph set from its right end; a Callout's line and border with them.
describe('a Text or a Callout over a page', () => {
  const base = {
    page: PageName.ofObject(1),
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
    rect: [10, 40, 90, 90] as const,
    size: 10,
  };
  const words = (marks: readonly Mark[], matrix: PageMatrix = [1, 0, 0, -1, 0, 100]) =>
    render(<PdfMarksOverlay matrix={matrix} width={100} height={100} marks={marks} />).container;

  it('sets each line with words from its baseline, held to Helvetica’s width, unstroked', () => {
    const text = Mark.text({ ...base, id: 't1', words: 'Hello\n\nשלום' })!;
    const svg = words([text]);
    const lines = [...svg.querySelectorAll('[data-pdf-mark="t1"] text')];
    expect(lines.map((line) => line.textContent)).toEqual(['Hello', 'שלום']);
    expect(lines[0]!.parentElement!.getAttribute('stroke')).toBe('none');
    // Its baseline 2 points in and 8.555 down from the box's top, which is 10 down the view.
    const [, , , , x, y] = lines[0]!
      .getAttribute('transform')!
      .match(/-?[\d.]+/g)!
      .map(Number);
    expect(x).toBe(12);
    expect(y).toBeCloseTo(10 + 2 + 8.555, 6);
    expect(Number(lines[0]!.getAttribute('textLength'))).toBeCloseTo(22.78, 6);
    expect(lines[0]!.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
    // A line Helvetica cannot write is the face's own width, read right to left.
    expect(lines[1]!.getAttribute('textLength')).toBeNull();
    expect(lines[1]!.getAttribute('direction')).toBe('rtl');
  });

  it('turns its words with a turned view, and draws a Callout’s line and border', () => {
    const callout = Mark.callout({
      ...base,
      id: 'c1',
      words: 'Why?',
      callout: [0, 0, 1, 1, 10, 65],
    })!;
    const svg = words([callout], [0, 1, 1, 0, 0, 0]);
    const line = svg.querySelector('[data-pdf-mark="c1"] text')!;
    expect(line.getAttribute('transform')).toMatch(/^matrix\(0 1 -1 -?0 /);
    expect(svg.querySelectorAll('[data-pdf-mark="c1"] polyline')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-pdf-mark="c1"] polygon')).toHaveLength(1);
  });
});

// marks.md "Stamps": LiveDoc's style, its rounded border and its name bold, its second line plain and smaller.
describe('a stamp over a page', () => {
  it('draws its border and sets its name bold, each line at its own size', () => {
    const stamp = Mark.stamp({
      id: 's1',
      page: PageName.ofObject(1),
      colour: '#086f1e',
      opacity: 1,
      author: 'Ada',
      createdAt: 0,
      rect: [10, 40, 90, 70],
      stamp: 'approved-by',
      lines: ['APPROVED', 'by Ada'],
    })!;
    const svg = render(
      <PdfMarksOverlay matrix={[1, 0, 0, -1, 0, 100]} width={100} height={100} marks={[stamp]} />,
    ).container;
    expect(svg.querySelectorAll('[data-pdf-mark="s1"] polygon')).toHaveLength(1);
    const [name, detail] = [...svg.querySelectorAll('[data-pdf-mark="s1"] text')];
    expect(name!.textContent).toBe('APPROVED');
    expect(name!.getAttribute('font-weight')).toBe('bold');
    expect(detail!.getAttribute('font-weight')).toBeNull();
    expect(Number(name!.getAttribute('font-size'))).toBeGreaterThan(
      Number(detail!.getAttribute('font-size')),
    );
  });
});
