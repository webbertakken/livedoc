import { describe, expect, it } from 'vitest';
import { Paragraph } from '../model/blocks';
import { Styles } from '../model/styles';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { pagePreviews, TEXT_PREVIEW_BLOCKS_MAX } from './page-previews';
import { APPROXIMATE_LABEL } from './preview-svg';

// docs/specs/034-text-documents/agents-and-sync.md "Page previews".

const pages = (doc: TextDocument, from = 1, to = from) => {
  const read = pagePreviews(doc, doc.body, { from, to });
  if (!read.ok) throw new Error(read.message);
  return read;
};

describe('pagePreviews', () => {
  it('draws a Letter page as SVG in CSS pixels, its writing in Inter, labelled approximate', () => {
    const doc = TextDocument.fromTexts(['Launch plan & goals', 'Second paragraph']);
    const read = pages(doc);
    expect(read.pageCount).toBe(1);
    const [page] = read.pages;
    expect(page).toMatchObject({ number: 1, width: 816, height: 1056 });
    expect(page!.svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="816" height="1056"/,
    );
    expect(page!.svg).toContain('Launch plan &amp; goals');
    expect(page!.svg).toContain('font-family="Inter"');
    expect(page!.svg).toContain(APPROXIMATE_LABEL);
    expect(page!.svg).toContain('fill="#ffffff"');
  });

  it('lays a long document tab onto pages, each asked page holding its own paragraphs', () => {
    const texts = Array.from({ length: 120 }, (_, n) => `Paragraph ${n + 1} of the plan`);
    const doc = TextDocument.fromTexts(texts);
    const read = pages(doc, 2, 3);
    expect(read.pageCount).toBeGreaterThan(2);
    expect(read.pages.map((p) => p.number)).toEqual([2, 3]);
    expect(read.pages[0]!.svg).not.toContain('>Paragraph 1 of the plan<');
    expect(read.pages[0]!.svg).toMatch(/>Paragraph \d+ of the plan</);
    // Lines stay inside the page's text area: no baseline below the bottom margin.
    for (const page of read.pages) {
      const ys = [
        ...page.svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-family="Inter" font-size="14/g),
      ].map((m) => Number(m[1]));
      expect(Math.max(...ys)).toBeLessThan(1056 - 96);
    }
  });

  it('starts a page at a page break', () => {
    const doc = TextDocument.fromTexts(['One', 'Two']);
    const [first, second] = doc.body as Paragraph[];
    const broken = { ...doc, body: [first!, { ...second!, props: { pageBreakBefore: true } }] };
    const read = pages(broken, 1, 2);
    expect(read.pageCount).toBe(2);
    expect(read.pages[1]!.svg).toContain('>Two<');
    expect(read.pages[0]!.svg).not.toContain('>Two<');
  });

  it('refuses a page past the end, naming how many there are, and a tab past the layout’s size', () => {
    const doc = TextDocument.fromTexts(['Only']);
    expect(pagePreviews(doc, doc.body, { from: 2, to: 2 })).toEqual({
      ok: false,
      code: 'page_not_found',
      message: 'This document tab has 1 page.',
    });
    const normal = Styles.idOfRole(doc.styles, 'normal')!;
    const body = Array.from({ length: TEXT_PREVIEW_BLOCKS_MAX + 1 }, () =>
      Paragraph.of('x', normal),
    );
    expect(pagePreviews(doc, body, { from: 1, to: 1 })).toMatchObject({
      ok: false,
      code: 'document_too_large',
    });
  });

  it('draws every construct of the model without failing: tables, lists, pictures, sections, contents', () => {
    for (const [name, make] of Object.entries(CONSTRUCTS))
      for (const format of ['odf', 'ooxml'] as const) {
        const doc = make(format);
        const read = pagePreviews(doc, doc.body, { from: 1, to: 1 });
        expect(read.ok, `${name} ${format}`).toBe(true);
      }
  });

  it('draws a table’s grid, a list’s marker and an inline picture’s box', () => {
    const svgOf = (name: string) => pages(CONSTRUCTS[name]!('odf')).pages[0]!.svg;
    expect(svgOf('tables')).toMatch(
      /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="[^"]+" stroke="#9ca3af"\/>/,
    );
    expect(svgOf('lists')).toMatch(/>(●|1\.)</);
    expect(svgOf('pictures')).toContain('fill="#e5e7eb"');
  });
});

describe('a table row of exact height', () => {
  it('clips the lines that do not fit, as the editor does', () => {
    const svg = pages(CONSTRUCTS.tables!('odf')).pages[0]!.svg;
    expect(svg).toContain('>Lined<');
    expect(svg).not.toContain('>n3<');
  });
});

describe('a paragraph longer than a page', () => {
  it('breaks between two of its lines, the next page going on with its writing', () => {
    const long = Array.from({ length: 1000 }, (_, n) => `word${n}`).join(' ');
    const doc = TextDocument.fromTexts([long, 'After']);
    const read = pages(doc, 1, 2);
    expect(read.pageCount).toBe(2);
    const second = read.pages[1]!.svg;
    expect(second).toMatch(/>word\d+ /);
    expect(second).toContain('>After<');
    expect(read.pages[0]!.svg).not.toContain('>After<');
  });
});

describe('line heights', () => {
  const heightOf = (lineHeight: NonNullable<Paragraph['props']['lineHeight']>) => {
    const doc = TextDocument.fromTexts(['a', 'b']);
    const body = (doc.body as Paragraph[]).map((p) => ({ ...p, props: { lineHeight } }));
    const svg = pages({ ...doc, body }).pages[0]!.svg;
    const ys = [
      ...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-family="Inter" font-size="14/g),
    ].map((m) => Number(m[1]));
    return ys[1]! - ys[0]!;
  };

  it('sets a line a multiple of its size, exactly, or at least as given', () => {
    expect(heightOf({ rule: 'multiple', value: 2 })).toBeCloseTo((44 / 3) * 2, 1);
    expect(heightOf({ rule: 'exact', pt: 30 })).toBeCloseTo(40, 1);
    expect(heightOf({ rule: 'atLeast', pt: 6 })).toBeCloseTo((44 / 3) * 1.2, 1);
  });
});

describe('a table wider than the text', () => {
  it('is narrowed to the text’s width', () => {
    const doc = TextDocument.fromTexts(['x']);
    const normal = (doc.body[0] as Paragraph).style;
    const table = {
      type: 'table' as const,
      columns: [600, 600],
      headerRows: 0,
      rows: [{ cells: [0, 1].map(() => ({ blocks: [Paragraph.of('cell', normal)], props: {} })) }],
    };
    const svg = pages({ ...doc, body: [table] }).pages[0]!.svg;
    const widths = [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(624, 0);
  });
});

describe('words drawn in Inter', () => {
  it('fit the width their own face takes, where the previews carry it', () => {
    const svg = pages(TextDocument.fromTexts(['Fitted words'])).pages[0]!.svg;
    expect(svg).toMatch(
      /textLength="[\d.]+" lengthAdjust="spacingAndGlyphs" xml:space="preserve">Fitted words</,
    );
  });
});
