// docs/specs/034-text-documents/files-and-print.md "A PDF imported": a tagged page by its tags, any other by its lines'
// geometry, the reading order guessed; scans, cut pages and pictures reported.
import { describe, expect, it } from 'vitest';
import type { Block } from '../model/blocks';
import { ReportBuilder } from '../report';
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

function read(...pages: PdfImportPage[]) {
  const report = new ReportBuilder();
  const document = readPdfImport(pages, report);
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
  it('reads a tagged page by its tags', () => {
    const { blocks, document } = read(
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

  it('reads tagged lists, numbered by their labels, nested a level down', () => {
    const { blocks, document } = read(
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

  it('reads tagged tables with their header rows', () => {
    const { blocks } = read(
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

  it('joins a page’s lines into paragraphs by their geometry', () => {
    const { blocks } = read(
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

  it('makes headings of taller lines, the tallest first', () => {
    const { blocks } = read(
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

  it('never joins lines of very different heights', () => {
    const { blocks } = read(laid(line('Big', 700, 20), line('small', 682, 10)));
    expect(blocks).toHaveLength(2);
  });

  it('reports scans, cut pages and pictures not read', () => {
    const { report, blocks } = read({ reading: 'none', cut: false }, laid(), {
      ...laid(line('x', 700)),
      cut: true,
    });
    expect(blocks).toEqual([['normal', 'x']]);
    expect(report.dropped).toEqual([
      { reason: 'pdf-pictures', name: 'page', count: 3 },
      { reason: 'pdf-no-text', name: 'page', count: 2 },
      { reason: 'pdf-text-cut', name: 'page', count: 1 },
    ]);
  });

  it('is one empty paragraph when nothing is read', () => {
    expect(read().document.body).toHaveLength(1);
  });

  it('weighs the body height by characters', () => {
    expect(bodyHeight([laid(line('a', 700, 30), line('long body text', 600, 10))])).toBe(10);
    expect(bodyHeight([tagged()])).toBe(0);
  });

  it('refuses past the character limit, else reads with the report', () => {
    const page = laid(line('twelve chars', 700));
    expect(readPdfPages([page], 5)).toMatchObject({ ok: false, rejection: 'document_too_large' });
    expect(readPdfPages([page])).toMatchObject({ ok: true, fileType: 'odt' });
  });
});
