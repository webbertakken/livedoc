// docs/specs/034-text-documents/files-and-print.md "A PDF imported": a tagged page by its tags, any other by its lines'
// geometry, the reading order guessed; scans, cut pages and pictures reported.
import { describe, expect, it } from 'vitest';
import type { Block } from '../model/blocks';
import type { TextDocument } from '../model/text-document';
import { ReportBuilder } from '../report';
import { GREEN_PNG, GREEN_PNG_SHA } from '../testing/pictures';
import {
  bodyHeight,
  readPdfImport,
  readPdfPages,
  type PdfImportLine,
  type PdfImportNode,
  type PdfImportPage,
} from './pdf';

const node = (type: string, ...kids: (PdfImportNode | string)[]): PdfImportNode => ({
  type,
  alt: '',
  kids,
});
const tagged = (...nodes: PdfImportNode[]): PdfImportPage => ({
  reading: 'tags',
  nodes,
  cut: false,
});
const line = (text: string, top: number, height = 10, left = 72, right = 500): PdfImportLine => ({
  text,
  left,
  right,
  top,
  bottom: top - height,
});
const laid = (...lines: PdfImportLine[]): PdfImportPage => ({
  reading: 'geometry',
  lines,
  cut: false,
});

async function read(...pages: PdfImportPage[]) {
  const report = new ReportBuilder();
  const document = await readPdfImport(pages, report);
  const styleName = (id: string) => document.styles.find((s) => s.id === id)?.role ?? id;
  const shape = (block: Block): unknown => {
    if (block.type === 'paragraph')
      return [
        styleName(block.style),
        block.inlines.map((i) => ('text' in i ? i.text : '')).join(''),
        ...(block.list ? [block.list] : []),
      ];
    if (block.type === 'table')
      return {
        headerRows: block.headerRows,
        rows: block.rows.map((r) => r.cells.map((c) => shape(c.blocks[0]!))),
      };
    return block.type;
  };
  return { document, blocks: document.body.map(shape), report: report.build() };
}

describe('a PDF imported', () => {
  it('reads a tagged page by its tags', async () => {
    const { blocks, document } = await read(
      tagged(
        node(
          'Document',
          node('H1', 'Annual ', 'report'),
          node('P', 'Revenue ', node('Span', 'grew'), '.'),
          node('Sect', node('H', 'Plain heading'), node('H3', 'Third')),
          { type: 'Figure', alt: 'Sales chart', kids: [] },
          node('Figure'),
          node('P', '   '),
          node('Div', 'loose text', node('P', 'inside')),
        ),
      ),
    );
    expect(blocks).toEqual([
      ['heading1', 'Annual report'],
      ['normal', 'Revenue grew.'],
      ['heading1', 'Plain heading'],
      ['heading3', 'Third'],
      ['normal', '[Sales chart]'],
      ['normal', 'loose text'],
      ['normal', 'inside'],
    ]);
    expect(document.format).toBe('odf');
  });

  it('reads tagged lists, numbered by their labels, nested a level down', async () => {
    const { blocks, document } = await read(
      tagged(
        node(
          'L',
          node(
            'LI',
            node('Lbl', '1.'),
            node('LBody', 'One', node('L', node('LI', node('Lbl', '•'), 'Inner'))),
          ),
          node('LI', node('Lbl', '2.'), 'Two'),
        ),
        node('L', node('LI', node('Lbl', '•'), node('LBody', 'Dot'))),
        node('L', node('LI', 'Unlabelled')),
      ),
    );
    expect(blocks).toEqual([
      ['normal', 'One', { id: 'L1', level: 0 }],
      ['normal', 'Inner', { id: 'L1', level: 1 }],
      ['normal', 'Two', { id: 'L1', level: 0 }],
      ['normal', 'Dot', { id: 'L2', level: 0 }],
      ['normal', 'Unlabelled', { id: 'L3', level: 0 }],
    ]);
    expect(document.lists.L1!.levels[0]!.kind).toBe('number');
    expect(document.lists.L2!.levels[0]!.kind).toBe('bullet');
  });

  it('reads tagged tables with their header rows', async () => {
    const { blocks } = await read(
      tagged(
        node(
          'Table',
          node('THead', node('TR', node('TH', 'Q'), node('TH', 'Sum'))),
          node(
            'TBody',
            node('TR', node('TD', 'Q3'), node('TD', '12')),
            node('TR', node('TD', 'Q4')),
          ),
        ),
        node('Table', node('TR', node('TH', 'Only'))),
        node('Table', node('TR')),
      ),
    );
    expect(blocks).toEqual([
      {
        headerRows: 1,
        rows: [
          [
            ['normal', 'Q'],
            ['normal', 'Sum'],
          ],
          [
            ['normal', 'Q3'],
            ['normal', '12'],
          ],
          [
            ['normal', 'Q4'],
            ['normal', ''],
          ],
        ],
      },
      { headerRows: 1, rows: [[['normal', 'Only']]] },
    ]);
  });

  it('joins a page’s lines into paragraphs by their geometry', async () => {
    const { blocks } = await read(
      laid(
        line('The first para-', 700),
        line('graph goes on', 688),
        line('and on.', 676),
        line('A new one after a gap.', 640),
        line('Beside it, apart', 640, 10, 520, 580),
        line('   ', 600),
        line('Up the page again', 650),
      ),
    );
    expect(blocks).toEqual([
      ['normal', 'The first paragraph goes on and on.'],
      ['normal', 'A new one after a gap.'],
      ['normal', 'Beside it, apart'],
      ['normal', 'Up the page again'],
    ]);
  });

  it('makes headings of taller lines, the tallest first', async () => {
    const { blocks } = await read(
      laid(
        line('Title', 760, 24),
        line('Section', 720, 16),
        line('Sub', 690, 13),
        line('Smaller', 670, 12.5),
        line('Body text one', 640),
        line('Body text two', 628),
        line('Body text three', 580),
      ),
    );
    expect(blocks).toEqual([
      ['heading1', 'Title'],
      ['heading2', 'Section'],
      ['heading3', 'Sub'],
      ['heading3', 'Smaller'],
      ['normal', 'Body text one Body text two'],
      ['normal', 'Body text three'],
    ]);
  });

  it('never joins lines of very different heights', async () => {
    const { blocks } = await read(laid(line('Big', 700, 20), line('small', 682, 10)));
    expect(blocks).toHaveLength(2);
  });

  it('reports scans and cut pages', async () => {
    const { report, blocks } = await read({ reading: 'none', cut: false }, laid(), {
      ...laid(line('x', 700)),
      cut: true,
    });
    expect(blocks).toEqual([['normal', 'x']]);
    expect(report.dropped).toEqual([
      { reason: 'pdf-no-text', name: 'page', count: 2 },
      { reason: 'pdf-text-cut', name: 'page', count: 1 },
    ]);
  });

  it('is one empty paragraph when nothing is read', async () => {
    expect((await read()).document.body).toHaveLength(1);
  });

  it('weighs the body height by characters', async () => {
    expect(bodyHeight([laid(line('a', 700, 30), line('long body text', 600, 10))])).toBe(10);
    expect(bodyHeight([tagged()])).toBe(0);
  });

  it('refuses past the character limit, else reads with the report', async () => {
    const page = laid(line('twelve chars', 700));
    expect(await readPdfPages([page], 5)).toMatchObject({
      ok: false,
      rejection: 'document_too_large',
    });
    expect(await readPdfPages([page])).toMatchObject({ ok: true, fileType: 'odt' });
  });

  const picture = (top: number, bytes: Uint8Array | null = GREEN_PNG, across = 100) => ({
    left: 72,
    right: 72 + across,
    top,
    bottom: top - 50,
    bytes,
  });
  const shapes = (document: TextDocument) =>
    document.body.map((block) =>
      block.type === 'paragraph'
        ? block.inlines
            .map((i) =>
              i.type === 'picture'
                ? `picture ${i.width}x${i.height}${i.alt ? ` ${i.alt}` : ''}`
                : 'text' in i
                  ? i.text
                  : '',
            )
            .join('')
        : block.type,
    );

  it('places an untagged page’s pictures before the first paragraph below them, the rest after', async () => {
    const { document, report } = await read(
      {
        ...laid(line('Above', 700), line('Below', 600)),
        pictures: [
          picture(650),
          picture(500),
          picture(400, null),
          picture(300, Uint8Array.of(1, 2, 3)),
        ],
      },
      { reading: 'none', cut: false, pictures: [picture(700)], picturesCut: true },
    );
    expect(shapes(document)).toEqual([
      'Above',
      'picture 100x50',
      'Below',
      'picture 100x50',
      'picture 100x50',
    ]);
    expect(Object.keys(document.media ?? {})).toEqual([GREEN_PNG_SHA]);
    expect(report.dropped).toEqual([
      { reason: 'pdf-pictures', name: 'picture', count: 2 },
      { reason: 'pdf-pictures', name: 'page past its picture limit', count: 1 },
    ]);
  });

  it('gives a tagged figure the page’s next picture, with its alternative text, no wider than the text', async () => {
    const { document } = await read({
      ...tagged(
        { type: 'Figure', alt: 'Chart', kids: [] },
        { type: 'Figure', alt: '', kids: [] },
        { type: 'Figure', alt: 'No picture left', kids: [] },
      ),
      pictures: [picture(700, GREEN_PNG, 936), picture(600)],
    });
    expect(shapes(document)).toEqual([
      'picture 468x25 Chart',
      'picture 100x50',
      '[No picture left]',
    ]);
  });
});
