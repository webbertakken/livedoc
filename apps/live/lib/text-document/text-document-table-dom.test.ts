// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "In the editor": a table drawn at its columns' widths, aligned; a header
// row's cells as column headers; each cell's formatting on the page's paper; a guide where a side has no line.
import { describe, expect, it } from 'vitest';
import { DOMSerializer } from 'prosemirror-model';
import { textDocumentSchema } from './text-document-schema';
import { CELL_GUIDES, cellStyle, columnWidths, TABLE_CLASS } from './text-document-table-dom';

const s = textDocumentSchema;
const p = (text: string) => s.nodes.paragraph!.create(null, text ? [s.text(text)] : []);
const cell = (type: 'table_cell' | 'table_header', attrs: Record<string, unknown>, text: string) =>
  s.nodes[type]!.create(attrs, [p(text)]);

const table = (attrs: Record<string, unknown> = {}) =>
  s.nodes.table!.create(attrs, [
    s.nodes.table_row!.create(null, [
      cell('table_header', { colwidth: [100, 50], colspan: 2 }, 'Head'),
      cell('table_header', { colwidth: [60] }, 'Side'),
    ]),
    s.nodes.table_row!.create({ height: 24 }, [
      cell('table_cell', { colwidth: [100] }, 'a'),
      cell('table_cell', { colwidth: [50] }, 'b'),
      cell(
        'table_cell',
        {
          colwidth: [60],
          props: {
            background: '#d9ead3',
            borders: { top: { width: 1, dash: 'solid', color: '#000000', space: 0 } },
            padding: { left: 5 },
            verticalAlign: 'middle',
          },
        },
        'c',
      ),
    ]),
  ]);

const draw = (node: ReturnType<typeof table>) =>
  DOMSerializer.fromSchema(s).serializeNode(node) as HTMLTableElement;

describe('a table drawn', () => {
  it('sets its columns from its first row, spans counted, and its width as their sum', () => {
    const t = table();
    expect(columnWidths(t)).toEqual([100, 50, 60]);
    const dom = draw(t);
    expect(dom.className).toBe(TABLE_CLASS);
    expect(dom.style.width).toBe('210pt');
    expect([...dom.querySelectorAll('col')].map((c) => c.style.width)).toEqual([
      '100pt',
      '50pt',
      '60pt',
    ]);
  });

  it('stands centred, at the end, or at its indent', () => {
    expect(draw(table({ align: 'center' })).style.marginLeft).toBe('auto');
    expect(draw(table({ align: 'center' })).style.marginRight).toBe('auto');
    expect(draw(table({ align: 'end' })).style.marginRight).toBe('');
    expect(draw(table({ indent: 18 })).style.marginLeft).toBe('18pt');
    expect(draw(table({ indent: -5 })).style.marginLeft).toBe('');
  });

  it("draws a header row's cells as column headers, and a row at its height", () => {
    const dom = draw(table());
    const [head, side] = [...dom.querySelectorAll('th')];
    expect([head!.getAttribute('scope'), head!.getAttribute('colspan')]).toEqual(['col', '2']);
    expect(side!.hasAttribute('colspan')).toBe(false);
    expect(dom.querySelectorAll('tr')[1]!.style.height).toBe('24pt');
    expect(dom.querySelector('tbody')!.children).toHaveLength(2);
  });

  it("draws a cell's background, lines, padding and alignment, and guides where it has no line", () => {
    const dom = draw(table());
    const c = dom.querySelectorAll('td')[2]!;
    expect(c.getAttribute('style')).toContain('border-top: 1pt solid light-dark(rgb(0, 0, 0)');
    expect(c.getAttribute('style')).toContain('padding-left: 5pt');
    expect(c.getAttribute('style')).toContain('background-color: light-dark(rgb(217, 234, 211)');
    expect(c.getAttribute('style')).toContain('vertical-align: middle');
    expect(c.getAttribute(CELL_GUIDES)).toBe('blr');
    expect(dom.querySelectorAll('td')[0]!.getAttribute(CELL_GUIDES)).toBe('tblr');
  });

  it('draws nothing unsafe: a colour not #rrggbb, a length out of range', () => {
    expect(
      cellStyle({
        background: 'red; position: fixed',
        padding: { top: -1, bottom: Number.NaN },
        borders: { left: { width: 2, dash: 'solid', color: 'url(x)', space: 0 } },
      }),
    ).toEqual({ style: '', guides: 'tblr' });
    expect(cellStyle(null)).toEqual({ style: '', guides: 'tblr' });
  });
});
