// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LaidOutItem } from '@livedoc/pdf-documents/laid-out';
import { capturePages, type CaptureMeasure, type ViewRect } from './capture-pages';

// A fake layout: each element says its box in `data-box` (left top width height, viewport pixels); text draws 10
// pixels a character from its element's left, on one line, unless `data-wrap` names the character a new line starts
// at (20 pixels lower, from the left again). Styles come from the element's own `style` attribute over defaults.
const DEFAULTS: Record<string, string> = {
  color: 'rgb(32, 33, 36)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  fontSize: '16px',
  fontWeight: '400',
  fontStyle: 'normal',
  fontFamily: '"LiveDoc Lora", serif',
  textDecorationLine: 'none',
  textDecorationColor: '',
  textTransform: 'none',
  direction: 'ltr',
  display: 'inline',
  borderTopStyle: 'none',
  borderRightStyle: 'none',
  borderBottomStyle: 'none',
  borderLeftStyle: 'none',
  borderTopColor: '',
  borderRightColor: '',
  borderBottomColor: '',
  borderLeftColor: '',
  borderTopWidth: '0px',
  borderRightWidth: '0px',
  borderBottomWidth: '0px',
  borderLeftWidth: '0px',
};

const boxOf = (element: Element): ViewRect => {
  const [left = 0, top = 0, width = 0, height = 0] = (element.getAttribute('data-box') ?? '')
    .split(' ')
    .filter(Boolean)
    .map(Number);
  return { left, top, width, height };
};

const measure: CaptureMeasure = {
  style: (element) => {
    const own = (element as HTMLElement).style;
    const read: Record<string, string> = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      const value = own?.[key as keyof CSSStyleDeclaration];
      if (typeof value === 'string' && value !== '') read[key] = value;
    }
    return read as unknown as CSSStyleDeclaration;
  },
  rect: boxOf,
  rects: (target) => {
    if (target instanceof Element) {
      const lines = target.getAttribute('data-lines');
      return lines
        ? lines.split(';').map((line) => boxOf({ getAttribute: () => line } as unknown as Element))
        : [boxOf(target)];
    }
    const node = target.startContainer;
    const element = node.parentElement!;
    const box = boxOf(element);
    const wrap = Number(element.getAttribute('data-wrap') ?? Infinity);
    const place = (at: number) =>
      at < wrap
        ? { x: box.left + at * 10, y: box.top }
        : { x: box.left + (at - wrap) * 10, y: box.top + 20 };
    const from = target.startOffset;
    const to = target.endOffset;
    if (from < wrap && to > wrap) {
      const a = place(from);
      const b = place(wrap);
      return [
        { left: a.x, top: a.y, width: (wrap - from) * 10, height: 16 },
        { left: b.x, top: b.y, width: (to - wrap) * 10, height: 16 },
      ];
    }
    const a = place(from);
    return [{ left: a.x, top: a.y, width: (to - from) * 10, height: 16 }];
  },
  drawn: (element) => (element as HTMLElement).style?.display !== 'none',
  ascent: () => 12,
};

/** A page of 400 by 600 CSS pixels drawn at `zoom`, at the viewport's 100, 50. */
function pageRoot(inner: string, zoom = 1): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<div data-page-sheet="1" data-box="100 50 ${400 * zoom} ${600 * zoom}"></div>${inner}`;
  document.body.replaceChildren(root);
  return root;
}

const captured = (root: HTMLElement, sizes = [{ width: 400, height: 600 }]) =>
  capturePages(root, sizes, measure);

const kinds = (items: readonly LaidOutItem[]) => items.map((item) => item.kind);

describe('capturePages', () => {
  it('reads each page at its size in points', () => {
    const { pages } = captured(pageRoot(''));
    expect(pages).toEqual([{ width: 300, height: 450, items: [], sources: [] }]);
  });

  it('reads each word where it stands, taking the white space after it, at its baseline', () => {
    const root = pageRoot('<p data-box="140 90 200 16">Hello  world</p>');
    const { pages, faces } = captured(root);
    const texts = pages[0]!.items.filter((item) => item.kind === 'text');
    expect(texts).toEqual([
      {
        kind: 'text',
        x: 30,
        baseline: 30 + 9,
        width: 37.5,
        text: 'Hello  ',
        face: 'lora-400-normal',
        size: 12,
        colour: '#202124',
      },
      {
        kind: 'text',
        x: 30 + 52.5,
        baseline: 39,
        width: 37.5,
        text: 'world',
        face: 'lora-400-normal',
        size: 12,
        colour: '#202124',
      },
    ]);
    expect(faces.map((face) => face.id)).toEqual(['lora-400-normal']);
    expect(pages[0]!.sources[0]).toBe(root.querySelector('p')!.firstChild);
  });

  it('reads the same in points whatever the zoom', () => {
    const root = pageRoot('<p data-box="180 130 400 32">Hi</p>', 2);
    const text = captured(root).pages[0]!.items[0]!;
    expect(text).toMatchObject({ x: 30, baseline: 30 + 9 });
  });

  it('splits a word across two lines into its characters', () => {
    const root = pageRoot('<p data-box="140 90 200 16" data-wrap="2">abcd</p>');
    const texts = captured(root).pages[0]!.items.filter((item) => item.kind === 'text');
    expect(texts.map((item) => item.kind === 'text' && item.text)).toEqual(['a', 'b', 'c', 'd']);
    expect(texts[2]).toMatchObject({ x: 30, baseline: 30 + 15 + 9 });
  });

  it('draws text as transformed, in its weight and slant, see-through ink over white', () => {
    const root = pageRoot(
      '<p data-box="140 90 200 16" style="text-transform: uppercase; font-weight: 700; font-style: italic; color: rgba(0, 0, 0, 0.5)">bold</p>',
    );
    expect(captured(root).pages[0]!.items[0]).toMatchObject({
      text: 'BOLD',
      face: 'lora-700-italic',
      colour: '#808080',
    });
  });

  it('leaves out text no one can see and what is not drawn', () => {
    const root = pageRoot(
      '<p data-box="140 90 200 16" style="color: transparent">gone</p><p data-box="140 120 200 16" style="display: none">hidden</p><div data-story-sources data-box="140 150 100 16">source</div><p data-box="140 150 200 16" style="font-size: 0px">tiny</p>',
    );
    expect(captured(root).pages[0]!.items).toEqual([]);
  });

  it('underlines and strikes through a word from its decorated ancestor, in its decoration’s colour', () => {
    const root = pageRoot(
      '<p data-box="140 90 200 16"><span style="text-decoration-line: underline; text-decoration-color: rgb(255, 0, 0)"><b data-box="140 90 40 16">red</b></span><s style="text-decoration-line: line-through" data-box="180 90 40 16">old</s></p>',
    );
    const lines = captured(root).pages[0]!.items.filter((item) => item.kind === 'line');
    expect(lines).toEqual([
      {
        kind: 'line',
        x1: 30,
        y1: 39 + 1.2,
        x2: 52.5,
        y2: 39 + 1.2,
        width: expect.closeTo(0.6, 6),
        colour: '#ff0000',
      },
      {
        kind: 'line',
        x1: 60,
        y1: 39 - 3.6,
        x2: 82.5,
        y2: 39 - 3.6,
        width: expect.closeTo(0.6, 6),
        colour: '#202124',
      },
    ]);
  });

  it('stops a decoration at its block', () => {
    const root = pageRoot(
      '<div style="text-decoration-line: underline"><p style="display: block" data-box="140 90 200 16">plain</p></div>',
    );
    expect(kinds(captured(root).pages[0]!.items)).toEqual(['text']);
  });

  it('fills a background and draws each border side, dashed or dotted as drawn', () => {
    const root = pageRoot(
      '<div data-box="140 90 100 40" style="background-color: rgb(255, 255, 0); border-top-style: solid; border-top-color: rgb(0, 0, 0); border-top-width: 2px; border-bottom-style: dashed; border-bottom-color: rgb(0, 0, 0); border-bottom-width: 1px; border-left-style: dotted; border-left-color: rgb(0, 0, 0); border-left-width: 1px; border-right-style: solid; border-right-color: rgba(0, 0, 0, 0.5); border-right-width: 1px"></div>',
    );
    expect(captured(root).pages[0]!.items).toEqual([
      { kind: 'box', x: 30, y: 30, width: 75, height: 30, colour: '#ffff00' },
      { kind: 'line', x1: 30, y1: 30.75, x2: 105, y2: 30.75, width: 1.5, colour: '#000000' },
      {
        kind: 'line',
        x1: 30,
        y1: 59.625,
        x2: 105,
        y2: 59.625,
        width: 0.75,
        colour: '#000000',
        dash: 'dashed',
      },
      {
        kind: 'line',
        x1: 30.375,
        y1: 30,
        x2: 30.375,
        y2: 60,
        width: 0.75,
        colour: '#000000',
        dash: 'dotted',
      },
      { kind: 'line', x1: 104.625, y1: 30, x2: 104.625, y2: 60, width: 0.75, colour: '#808080' },
    ]);
  });

  it('keeps a see-through fill’s opacity', () => {
    const root = pageRoot(
      '<mark data-box="140 90 40 16" style="background-color: rgba(255, 255, 0, 0.4)"></mark>',
    );
    expect(captured(root).pages[0]!.items[0]).toMatchObject({ kind: 'box', opacity: 0.4 });
  });

  it('notes pictures to draw afterwards, without reading inside them', () => {
    const root = pageRoot(
      '<span class="text-document-picture-turn" data-box="140 90 80 40"><img data-box="140 90 80 40"><span>alt</span></span><svg data-box="140 200 20 20"></svg>',
    );
    const { pages, pictures } = captured(root);
    expect(kinds(pages[0]!.items)).toEqual(['picture', 'picture']);
    expect(pages[0]!.items[0]).toMatchObject({ x: 30, y: 30, width: 60, height: 30 });
    expect(pictures.map(({ page, index, element }) => [page, index, element.localName])).toEqual([
      [0, 0, 'span'],
      [0, 1, 'svg'],
    ]);
    expect(pictures[0]!.scale).toBe(0.75);
  });

  it('reads a link’s boxes, line by line, to the web or to a place on the pages', () => {
    const root = pageRoot(
      '<a href="https://docs.nu/" data-lines="140 90 40 16;140 110 20 16"></a><a href="#h-1" data-box="140 150 40 16"></a><a href="#nowhere" data-box="140 170 40 16"></a><a href="" data-box="140 190 40 16"></a><h1 id="h-1" data-box="140 290 200 30"></h1>',
    );
    const links = captured(root).pages[0]!.items.filter((item) => item.kind === 'link');
    expect(links).toEqual([
      { kind: 'link', x: 30, y: 30, width: 30, height: 12, to: { uri: 'https://docs.nu/' } },
      { kind: 'link', x: 30, y: 45, width: 15, height: 12, to: { uri: 'https://docs.nu/' } },
      { kind: 'link', x: 30, y: 75, width: 30, height: 12, to: { page: 0, top: 180 } },
    ]);
  });

  it('puts each item on the page holding its middle, and drops what lies on none', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div data-page-sheet="1" data-box="0 0 400 600"></div><div data-page-sheet="2" data-box="0 612 400 600"></div><p data-box="10 650 100 16">two</p><p data-box="10 604 100 6">gap</p>';
    document.body.replaceChildren(root);
    const sizes = [
      { width: 400, height: 600 },
      { width: 400, height: 600 },
    ];
    const { pages } = captured(root, sizes);
    expect(pages[0]!.items).toEqual([]);
    expect(pages[1]!.items[0]).toMatchObject({ text: 'two', baseline: 38 * 0.75 + 9 });
  });

  it('draws a fraction’s bar between its numerator and denominator', () => {
    const root = pageRoot(
      '<mfrac data-box="140 90 40 40"><mn data-box="150 90 10 16"></mn><mn data-box="150 114 10 16"></mn></mfrac>',
    );
    expect(captured(root).pages[0]!.items[0]).toEqual({
      kind: 'line',
      x1: 30,
      y1: (110 - 50) * 0.75,
      x2: 60,
      y2: (110 - 50) * 0.75,
      width: 0.6,
      colour: '#202124',
    });
  });

  it('reads no page whose sheet has no size or is not drawn', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div data-page-sheet="1" data-box="0 0 0 0"></div><div data-page-sheet="2" data-box="0 0 400 600"></div>';
    expect(captured(root, [{ width: 400, height: 600 }]).pages).toEqual([]);
  });
});
