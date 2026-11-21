// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "In the editor": a table copied as plain text (rows a line each, cells by
// tabs), as HTML other editors read, as LiveDoc's fragment into another document, and pasted from HTML.
import { describe, expect, it } from 'vitest';
import { Slice } from 'prosemirror-model';
import { ListDefinition, Styles } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { plainTextOf } from './text-document-clipboard-text';
import { clipboardSerializer, exportCellCss } from './text-document-clipboard-html';
import {
  makeFragment,
  placeFragment,
  type FragmentContext,
  type NodeJson,
} from './text-document-clipboard-fragment';
import { pastedHtmlParser } from './text-document-paste-html';

const p = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(attrs, text ? [schema.text(text)] : []);
const kept = { name: 'bookmark', xml: { xml: '<x/>', ns: {} } };
const table = schema.nodes.table!.create(
  { kept: { xml: { xml: '<t/>', ns: {} }, read: '', residue: [] } },
  [
    schema.nodes.table_row!.create(null, [
      schema.nodes.table_header!.create({ colwidth: [100, 50], colspan: 2 }, [p('Head')]),
    ]),
    schema.nodes.table_row!.create(null, [
      schema.nodes.table_cell!.create({ colwidth: [100], props: { background: '#d9ead3' } }, [
        p('a', { style: 'Heading_20_1' }),
        p('a2'),
      ]),
      schema.nodes.table_cell!.create({ colwidth: [50], tag: { xml: '<c/>', ns: {} } }, [
        schema.nodes.kept_block!.create(kept),
      ]),
    ]),
  ],
);
const doc = schema.node('doc', null, [p('Before'), table, p('After')]);
const whole = new Slice(doc.content, 0, 0);

const odf: FragmentContext = {
  documentId: 'd1',
  tabId: 't1',
  format: 'odf',
  styles: Styles.builtIn('odf'),
  defaults: Styles.defaults(),
  lists: {},
};
const ooxml: FragmentContext = {
  documentId: 'd2',
  tabId: 't2',
  format: 'ooxml',
  styles: Styles.builtIn('ooxml'),
  defaults: Styles.defaults(),
  lists: { L1: ListDefinition.of('bullet') },
};

describe('a table copied', () => {
  it('as plain text: its rows a line each, its cells by tabs', () => {
    expect(plainTextOf(whole)).toBe('Before\nHead\na a2\t\nAfter');
    const row = new Slice(table.child(1).content, 0, 0);
    expect(
      plainTextOf(new Slice(schema.nodes.table_row!.create(null, row.content).content, 0, 0)),
    ).toBe('a a2\n');
  });

  it('as HTML other editors read: columns, spans, header cells, formatting as on white paper', () => {
    const serializer = clipboardSerializer(() => ({
      styles: Styles.builtIn('odf'),
      defaults: Styles.defaults(),
      lists: {},
    }));
    const holder = document.createElement('div');
    holder.append(serializer.serializeFragment(doc.content));
    const html = holder.querySelector('table')!;
    expect(html.style.width).toBe('150pt');
    expect([...html.querySelectorAll('col')].map((c) => c.style.width)).toEqual(['100pt', '50pt']);
    expect(html.querySelector('th')!.getAttribute('colspan')).toBe('2');
    expect(html.querySelector('td')!.getAttribute('style')).toContain(
      'background-color: rgb(217, 234, 211)',
    );
    expect(
      exportCellCss({ borders: { top: { width: 1, dash: 'solid', color: '#cc0000', space: 0 } } }),
    ).toContain('border-top: 1pt solid #cc0000');
    expect(exportCellCss(null)).toContain('vertical-align: top');
  });

  it('into another document: its cells placed, what the file kept left behind, an emptied cell holding a paragraph', () => {
    const fragment = makeFragment(whole, odf);
    const placed = placeFragment(fragment, ooxml);
    const tableJson = placed.slice.content![1]!;
    expect(tableJson.attrs?.kept).toBeNull();
    const [, second] = tableJson.content ?? [];
    const [first, emptied] = second!.content ?? [];
    expect((first!.content![0] as NodeJson).attrs?.style).toBe('Heading1');
    expect(emptied!.attrs?.tag).toBeNull();
    expect(emptied!.content).toEqual([{ type: 'paragraph', attrs: { style: null } }]);
    expect(placed.left).toBe(1);
    expect(() =>
      Slice.fromJSON(schema, placed.slice as Parameters<typeof Slice.fromJSON>[1]),
    ).not.toThrow();
  });
});

describe('a table pasted from HTML', () => {
  it('keeps its rows, cells, spans and header cells', () => {
    const holder = document.createElement('div');
    holder.innerHTML =
      '<table><tr><th colspan="2">Head</th></tr><tr><td rowspan="9999">a</td><td>b</td></tr></table>';
    const slice = pastedHtmlParser(schema).parseSlice(holder);
    const pasted = slice.content.firstChild!;
    expect(pasted.type.name).toBe('table');
    expect(pasted.child(0).child(0).type.name).toBe('table_header');
    expect(pasted.child(0).child(0).attrs.colspan).toBe(2);
    expect(pasted.child(1).child(0).attrs.rowspan).toBe(1);
    expect(pasted.child(1).child(1).textContent).toBe('b');
  });
});
