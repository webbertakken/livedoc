// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "The recolouring": a mark made in LiveDoc passes through the same step as
// the file's own, so under Dark pages it takes the step's colour and lightens the dark page rather than multiplying.
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
  DarkPages,
  MARK_FACE_DATA,
  Mark,
  MarkFaceSlices,
  PageName,
  type PageMatrix,
  type Quad,
} from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import {
  PdfStampPicturesContext,
  type PdfStampPictureRead,
} from '@/lib/pdf-document/pdf-stamp-pictures';
import { resetStampPictureUrls } from '@/lib/pdf-document/stamp-picture-urls';
import { markFacesStack } from '@/lib/pdf-document/pdf-mark-faces';
import { TYPED_FACES } from '@/lib/pdf-document/pdf-typed';
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

// marks.md "Changing a mark": a line's style dashes it; a fill paints a shape inside its line, before it, in its own
// colour, which Dark pages step as they step the line's.
describe('a styled shape over a page', () => {
  const box = Mark.parse({
    id: 'r2',
    kind: 'ellipse',
    page: PageName.ofObject(1),
    rect: [10, 10, 40, 30],
    width: 2,
    lineStyle: 'dashed',
    fill: '#1a73e8',
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
    modifiedAt: 0,
  })!;
  const drawn = (look: 'paper' | 'dark') =>
    render(
      <PdfLookContext.Provider value={look}>
        <PdfMarksOverlay matrix={[1, 0, 0, -1, 0, 100]} width={100} height={100} marks={[box]} />
      </PdfLookContext.Provider>,
    ).container.querySelectorAll('[data-pdf-mark="r2"] polygon');

  it('fills it first in its fill colour, then dashes its line by the pattern', () => {
    const [inside, outline] = drawn('paper');
    expect(inside!.getAttribute('fill')).toBe('#1a73e8');
    expect(inside!.getAttribute('stroke')).toBe('none');
    expect(outline!.getAttribute('stroke-dasharray')).toBe('6 4');
  });

  it('steps the fill on Dark pages', () => {
    expect(drawn('dark')[0]!.getAttribute('fill')).toBe(DarkPages.hex('#1a73e8'));
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
    const text = Mark.text({ ...base, id: 't1', words: 'Hello\n\nWorld' })!;
    const svg = words([text]);
    const lines = [...svg.querySelectorAll('[data-pdf-mark="t1"] text')];
    expect(lines.map((line) => line.textContent)).toEqual(['Hello', 'World']);
    expect(lines[0]!.parentElement!.getAttribute('font-family')).toBe(TYPED_FACES);
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
  });

  // marks.md "Words in every script": a mark Helvetica cannot write is drawn in the mark faces, as shaped.
  it('draws a mark Helvetica cannot write in the mark faces, unheld, a right-to-left line from its right', async () => {
    const add = vi.fn();
    vi.stubGlobal('FontFace', class {});
    Object.defineProperty(document, 'fonts', { value: { add }, configurable: true });
    const text = Mark.text({ ...base, id: 't1', words: 'Hello\n\nשלום' })!;
    const lines = [...words([text]).querySelectorAll('[data-pdf-mark="t1"] text')];
    expect(lines.map((line) => line.textContent)).toEqual(['Hello', 'שלום']);
    expect(lines[0]!.parentElement!.getAttribute('font-family')).toBe(markFacesStack('sc'));
    expect(lines.map((line) => line.getAttribute('textLength'))).toEqual([null, null]);
    expect(lines[1]!.getAttribute('direction')).toBe('rtl');
    // A script whose family has no bold is drawn regular, as the bake sets it, never made bold by the browser.
    expect((lines[0]!.parentElement as unknown as SVGGElement).style.fontSynthesis).toBe('none');
    // Its region's slices are added once their table arrives.
    const slices = (await MarkFaceSlices.load('sc')).length;
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(MARK_FACE_DATA.length + slices));
    Reflect.deleteProperty(document, 'fonts');
    vi.unstubAllGlobals();
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

// marks.md "Changing a mark": a selected mark is outlined, PDF_MARK_OUTLINE_PX out from it; a drag shows the marks
// moved as they go.
describe('the selected marks over a page', () => {
  const box = Mark.shape('rectangle', {
    id: 'r1',
    page: PageName.ofObject(1),
    rect: [20, 20, 60, 40],
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
  })!;

  it('outlines each selected mark round its line, the gap given in points', () => {
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[mark, box]}
        chosen={['r1']}
        outline={3}
      />,
    );
    const outlines = container.querySelectorAll('[data-pdf-mark-outline]');
    expect(outlines).toHaveLength(1);
    // The box's line reaches 1 point past its rect; the outline 3 more: x 16 to 64, y 16 to 44 (view 56 to 84).
    expect(outlines[0]!.getAttribute('data-pdf-mark-outline')).toBe('r1');
    expect(['x', 'y', 'width', 'height'].map((key) => outlines[0]!.getAttribute(key))).toEqual([
      '16',
      '56',
      '48',
      '28',
    ]);
  });

  it('draws the marks being dragged where the drag has them, outlined there', () => {
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[mark, box]}
        chosen={['r1', 'm1']}
        outline={0}
        moving={{ ids: ['r1', 'm1'], by: { x: 10, y: -10 } }}
      />,
    );
    const outline = container.querySelector('[data-pdf-mark-outline="r1"]')!;
    expect(outline.getAttribute('x')).toBe('29');
    expect(outline.getAttribute('y')).toBe('69');
    // A text mark is not moved.
    expect(container.querySelector('[data-pdf-mark-outline="m1"]')!.getAttribute('x')).toBe('10');
  });

  it('draws the mark a handle resizes as the drag has it, the others where they are', () => {
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[mark, box]}
        chosen={['r1', 'm1']}
        reshaping={{ id: 'r1', place: { rect: [20, 20, 90, 40] } }}
      />,
    );
    expect(container.querySelector('[data-pdf-mark-outline="r1"]')!.getAttribute('width')).toBe(
      '72',
    );
    expect(container.querySelector('[data-pdf-mark-outline="m1"]')!.getAttribute('x')).toBe('10');
  });
});

// reading-surface.md "Find": every result tinted, the current one stronger; marks.md "Making a mark": the text a drag
// would mark is drawn while it lasts.
describe('the find tints, the text selected and a mark’s preview over a page', () => {
  it('tints every result, the current one apart, the selection, and draws the preview', () => {
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[]}
        found={{ found: [QUAD, QUAD], current: [QUAD] }}
        preview={[QUAD]}
        selected={[QUAD]}
      />,
    );
    expect(container.querySelectorAll('[data-pdf-found] polygon')).toHaveLength(2);
    expect(container.querySelectorAll('[data-pdf-found-current] polygon')).toHaveLength(1);
    expect(container.querySelectorAll('[data-pdf-mark-preview] polygon')).toHaveLength(1);
    expect(container.querySelectorAll('[data-pdf-text-selection] polygon')).toHaveLength(1);
  });
});

// live-editing-and-storage.md "A mark as it is made": a collaborator's stroke as it is drawn, in the Drawing's look.
describe('collaborators’ strokes as they are drawn', () => {
  it('draws each in its own look, as a Drawing is drawn', () => {
    const { container } = render(
      <PdfMarksOverlay
        matrix={[1, 0, 0, -1, 0, 100]}
        width={100}
        height={100}
        marks={[]}
        peerDrafts={[
          {
            person: 'ada',
            stroke: 's1',
            page: 'p:1',
            look: { colour: '#7c3aed', opacity: 0.5, width: 3, lineStyle: 'dashed' },
            points: [10, 10, 20, 30, 40, 30],
          },
        ]}
      />,
    );
    const drawn = container.querySelector('[data-pdf-peer-draft="s1"]')!;
    expect(drawn.getAttribute('stroke')).toBe('#7c3aed');
    expect(drawn.getAttribute('opacity')).toBe('0.5');
    expect(drawn.querySelector('polyline')!.getAttribute('points')).toBe('10,90 20,70 40,70');
    expect(drawn.querySelector('polyline')!.getAttribute('stroke-dasharray')).not.toBeNull();
  });
});

// custom-stamps.md "Placing one": the page draws a custom stamp's picture across its box, read from the document; its
// outlined box with its name while the picture is on its way, or where it failed.
describe('a custom stamp over a page', () => {
  const custom = Mark.stamp({
    id: 'c1',
    page: PageName.ofObject(1),
    rect: [10, 20, 50, 40],
    colour: '#1565c0',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
    stamp: 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a',
    lines: ['Paid'],
    picture: { key: 'cd'.repeat(32) as BlobKey, type: 'png', width: 80, height: 40 },
  })!;

  const drawn = (read: PdfStampPictureRead | null) =>
    render(
      <PdfStampPicturesContext.Provider value={read}>
        <PdfMarksOverlay matrix={[1, 0, 0, -1, 0, 100]} width={100} height={100} marks={[custom]} />
      </PdfStampPicturesContext.Provider>,
    ).container.querySelector('svg')!;

  afterEach(() => resetStampPictureUrls());

  it('draws its picture across its box once read from the document', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:paid');
    const read = vi.fn(async () => new Uint8Array([1]));
    const svg = drawn(read);
    expect(svg.querySelector('[data-pdf-mark="c1"] text')!.textContent).toBe('Paid');
    await waitFor(() => expect(svg.querySelector('[data-pdf-stamp-picture="c1"]')).not.toBeNull());
    const image = svg.querySelector('[data-pdf-stamp-picture="c1"]')!;
    expect(image.getAttribute('href')).toBe('blob:paid');
    // Its top left at the box's (10, 40 on the page: 10, 60 in view), 40 across and 20 down.
    expect(image.getAttribute('transform')).toBe('matrix(40 0 0 20 10 60)');
    expect(read).toHaveBeenCalledWith(custom.picture!.key);
  });

  it('draws its outlined box with its name where its picture failed', async () => {
    const read = vi.fn(async () => {
      throw new Error('blob_missing');
    });
    const svg = drawn(read);
    await waitFor(() => expect(read).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(svg.querySelector('[data-pdf-stamp-picture]')).toBeNull();
    expect(svg.querySelector('[data-pdf-mark="c1"] text')!.textContent).toBe('Paid');
  });
});
