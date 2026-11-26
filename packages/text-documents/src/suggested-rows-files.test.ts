// docs/specs/034-text-documents/standard-mapping.md "Suggested blocks", review.md "How a suggestion is kept": a table's
// rows and cells (a column is its cells) carry an insertion or a deletion whole, written as Word and LibreOffice write
// them (Word's `w:trPr` and `w:tcPr` changes; LibreOffice's `loext:text-changes-only="false"` on the row's or cell's
// style, its writing whole in changes), read back whole, what is inside them carrying only its own suggestions.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Block, Paragraph } from './model/blocks';
import type { Table, TableRow } from './model/tables';
import type { TextDocument } from './model/text-document';
import { Suggestions } from './model/suggestions';
import { CONSTRUCTS } from './testing/constructs';
import { TextDocumentState } from './text-document-state';
import { LiveSuggestions } from './live/live-suggestions';
import { tabFragment } from './live/live-root';

async function read(bytes: Uint8Array) {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
}

function write(document: TextDocument, type: TextDocumentFileType): Uint8Array {
  const result = writeTextDocumentFile(document, type);
  if (!result.ok) throw new Error(result.rejection);
  return result.bytes;
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const documentXml = async (bytes: Uint8Array) => {
  const pkg = await readOoxmlPackage(new Uint8Array(bytes));
  if (!pkg.ok) throw new Error('package');
  return text(pkg.package.parts.get('word/document.xml')!);
};

const tables = (d: TextDocument) => d.body.filter((b): b is Table => b.type === 'table');
const cellTexts = (table: Table) =>
  table.rows.map((r) =>
    r.cells.map((c) =>
      (c.blocks as Block[])
        .filter((b): b is Paragraph => b.type === 'paragraph')
        .map((p) =>
          p.inlines
            .map((i) => {
              if (i.type !== 'run') return `<${i.type}>`;
              const { insertion, deletion } = i.suggested ?? {};
              return insertion
                ? `+${i.text}+${insertion.author.name}`
                : deletion
                  ? `-${i.text}-${deletion.author.name}`
                  : i.text;
            })
            .join(''),
        )
        .join('|'),
    ),
  );
/** Each table's suggestion, then each row's, then each cell's, as `kind id author`. */
const marksOf = (d: TextDocument) =>
  tables(d).map((t) => {
    const of = (s: Table['suggested']) => {
      const found = Suggestions.ofBlock(s);
      return found ? `${found.kind} ${found.mark.id} ${found.mark.author.name}` : '';
    };
    return {
      table: of(t.suggested),
      rows: t.rows.map((r) => of(r.suggested)),
      cells: t.rows.map((r) => r.cells.map((c) => of(c.suggested))),
    };
  });

/** How many of an .odt's rows or cells name a style carrying LibreOffice's tracked flag. */
function flaggedUses(xml: string, element: 'table-row' | 'table-cell'): number {
  const flagged = [
    ...xml.matchAll(
      /<style:style style:name="([^"]+)" style:family="([^"]+)">(.*?)<\/style:style>/gs,
    ),
  ]
    .filter((m) => m[2] === element && m[3]!.includes('loext:text-changes-only="false"'))
    .map((m) => m[1]);
  return (xml.match(new RegExp(`<table:${element} table:style-name="([^"]+)"`, 'g')) ?? []).filter(
    (tag) => flagged.some((n) => tag.endsWith(`"${n}"`)),
  ).length;
}

const EXPECTED_TEXTS = [
  [
    ['A1', 'B1'],
    ['A2 +mine+Bo', ''],
    ['A3', 'B3'],
  ],
  [
    ['C1', 'D1'],
    ['C2', ''],
  ],
  [
    ['E1', 'F1'],
    ['E2', 'F2'],
  ],
];

describe('suggested rows and columns, written and read back', () => {
  for (const [format, type] of [
    ['odf', 'fodt'],
    ['odf', 'odt'],
    ['ooxml', 'docx'],
  ] as const)
    it(`keeps each row’s and cell’s suggestion, ids and authors in .${type}`, async () => {
      const document = CONSTRUCTS.suggestedRows!(format);
      const back = (await read(write(document, type))).document;
      expect(marksOf(back)).toEqual(marksOf(document));
      // Another person's text inside the suggested row stays their own; no joiner reads as text.
      expect(tables(back).map(cellTexts)).toEqual(EXPECTED_TEXTS);
    });

  it('writes Word’s forms: a row’s change in its properties, a column’s in each cell’s', async () => {
    const xml = await documentXml(write(CONSTRUCTS.suggestedRows!('ooxml'), 'docx'));
    expect(xml).toMatch(/<w:trPr><w:ins [^>]*livedoc:id="sRow"[^>]*\/><\/w:trPr>/);
    expect(xml).toMatch(/<w:trPr><w:del [^>]*livedoc:id="sRowGone"[^>]*\/><\/w:trPr>/);
    expect(xml.match(/<w:cellIns [^>]*livedoc:id="sColumn"[^>]*\/><\/w:tcPr>/g)).toHaveLength(2);
    expect(xml.match(/<w:cellDel [^>]*livedoc:id="sColumnGone"[^>]*\/><\/w:tcPr>/g)).toHaveLength(
      2,
    );
    expect(xml).toMatch(/<w:ins [^>]*livedoc:id="sColumn"[^>]*><w:r>(?:(?!<\/w:r>).)*D1/);
    expect(xml).toMatch(/<w:del [^>]*livedoc:id="sRowGone"[^>]*><w:r>(?:(?!<\/w:r>).)*A3/);
  });

  it('writes LibreOffice’s forms: the flag on the row’s and cell’s style, the writing whole in changes', () => {
    const xml = text(write(CONSTRUCTS.suggestedRows!('odf'), 'fodt'));
    expect(flaggedUses(xml, 'table-row')).toBe(2);
    expect(flaggedUses(xml, 'table-cell')).toBe(4);
    expect(xml).not.toContain('livedoc:block="table"');
    expect(xml).toMatch(
      /<text:change-start text:change-id="(ct\d+)"\/>\u200d<text:change-end text:change-id="\1"\/>/,
    );
  });

  it('puts the flag on every row of a suggested table', () => {
    const xml = text(write(CONSTRUCTS.suggestedBlocks!('odf'), 'fodt'));
    expect(flaggedUses(xml, 'table-row')).toBe(2);
  });

  it('keeps them through conversion, ODF to Word and back', async () => {
    const document = CONSTRUCTS.suggestedRows!('odf');
    const ooxml = convertTextDocument(document, 'ooxml').document;
    const back = convertTextDocument((await read(write(ooxml, 'docx'))).document, 'odf').document;
    const again = (await read(write(back, 'odt'))).document;
    expect(marksOf(again)).toEqual(marksOf(document));
  });

  it('names no flagged style for a read row or cell once its suggestion is gone', async () => {
    const corpus = readFileSync(
      join(import.meta.dirname, '..', 'corpus', 'libreoffice', 'suggested-rows.fodt'),
    );
    const { document } = await read(corpus);
    const settled = {
      ...document,
      body: document.body.map((b) =>
        b.type === 'table'
          ? {
              ...b,
              rows: b.rows.map(({ suggested: _, ...row }): TableRow => ({
                ...row,
                cells: row.cells.map(({ suggested: __, ...cell }) => cell),
              })),
            }
          : b,
      ),
    } as TextDocument;
    const xml = text(write(settled, 'fodt'));
    expect(flaggedUses(xml, 'table-row')).toBe(0);
    expect(flaggedUses(xml, 'table-cell')).toBe(0);
  });
});

describe('suggested rows and columns from Word and LibreOffice', () => {
  const corpus = (name: string) =>
    readFileSync(join(import.meta.dirname, '..', 'corpus', 'libreoffice', name));

  for (const name of ['suggested-rows-source.docx', 'suggested-rows.fodt'])
    it(`reads ${name}: rows and columns suggested`, async () => {
      const { document } = await read(corpus(name));
      const [rows, added, gone] = tables(document);
      expect(rows!.suggested).toBeUndefined();
      expect(rows!.rows.map((r) => Suggestions.ofBlock(r.suggested)?.kind)).toEqual([
        undefined,
        'insertion',
        'deletion',
      ]);
      expect(rows!.rows[1]!.suggested?.insertion?.author.name).toBe('Ada');
      expect(rows!.rows[2]!.suggested?.deletion?.author.name).toBe('Bo');
      expect(
        added!.rows.map((r) => r.cells.map((c) => Suggestions.ofBlock(c.suggested)?.kind)),
      ).toEqual([
        [undefined, 'insertion'],
        [undefined, 'insertion'],
      ]);
      expect(
        gone!.rows.map((r) => r.cells.map((c) => Suggestions.ofBlock(c.suggested)?.kind)),
      ).toEqual([
        [undefined, 'deletion'],
        [undefined, 'deletion'],
      ]);
      expect(tables(document).map(cellTexts)).toEqual(EXPECTED_TEXTS);
    });

  it('reads a table written before the flag as text suggested into its cells, every one shown', async () => {
    // A 12d5c1 table: its cells' writing whole in changes, its rows' styles without LibreOffice's flag.
    const xml = text(write(CONSTRUCTS.suggestedBlocks!('odf'), 'fodt')).replaceAll(
      ' loext:text-changes-only="false"',
      '',
    );
    const { document } = await read(new TextEncoder().encode(xml));
    const [table] = tables(document);
    expect(table!.suggested).toBeUndefined();
    expect(cellTexts(table!)).toEqual([
      ['+A1+Ada Lovelace', '+\u200d+Ada Lovelace'],
      ['+B1 +Ada Lovelace+mine+Bo', '+B2+Ada Lovelace'],
    ]);
  });
});

describe('Suggestions.foldedRows', () => {
  const ada = { id: 'f.1', author: { name: 'Ada' } };
  const bo = { id: 'f.2', author: { name: 'Bo' } };
  const row = (suggested?: TableRow['suggested']): TableRow => ({
    cells: [{ blocks: [], props: {} }],
    ...(suggested ? { suggested } : {}),
  });
  const table = (...rows: TableRow[]): Table => ({
    type: 'table',
    columns: [144],
    headerRows: 0,
    rows,
  });

  it('makes a table every row of which is suggested, of one kind, that kind’s suggestion', () => {
    const folded = Suggestions.foldedRows(table(row({ insertion: ada }), row({ insertion: bo })));
    expect(folded.suggested).toEqual({ insertion: ada });
    expect(folded.rows.every((r) => r.suggested === undefined)).toBe(true);
  });

  it('leaves rows of mixed kinds, or some plain, as rows', () => {
    const mixed = table(row({ insertion: ada }), row({ deletion: bo }));
    expect(Suggestions.foldedRows(mixed)).toEqual(mixed);
    const some = table(row({ insertion: ada }), row());
    expect(Suggestions.foldedRows(some)).toEqual(some);
  });
});

describe('suggested rows and columns in the live state', () => {
  const load = () =>
    TextDocumentState.load([TextDocumentState.fromDocument(CONSTRUCTS.suggestedRows!('odf'))]);

  it('carries each row’s and cell’s mark into the live state and back, read as block parts', () => {
    const doc = load();
    const back = TextDocumentState.document(doc, 'odf');
    expect(marksOf(back)).toEqual(marksOf(CONSTRUCTS.suggestedRows!('odf')));
    const parts = LiveSuggestions.read(doc).flatMap((s) =>
      s.parts.filter((p) => p.kind.startsWith('block-')).map((p) => [s.id, p.kind, p.text]),
    );
    expect(parts).toEqual([
      ['sRow', 'block-insertion', 'table_row'],
      ['sRowGone', 'block-deletion', 'table_row'],
      ['sColumn', 'block-insertion', 'table_cell'],
      ['sColumn', 'block-insertion', 'table_cell'],
      ['sColumnGone', 'block-deletion', 'table_cell'],
      ['sColumnGone', 'block-deletion', 'table_cell'],
    ]);
  });

  it('accepts a deleted row and a deleted column away; rejects an inserted row and column away', () => {
    const doc = load();
    for (const id of ['sRowGone', 'sColumnGone'])
      expect(LiveSuggestions.accept(doc, id, null)).toBe(true);
    for (const id of ['sRow', 'sColumn']) expect(LiveSuggestions.reject(doc, id, null)).toBe(true);
    const back = TextDocumentState.document(doc, 'odf');
    expect(tables(back).map(cellTexts)).toEqual([
      [['A1', 'B1']],
      [['C1'], ['C2']],
      [['E1'], ['E2']],
    ]);
    expect(tables(back).map((t) => t.columns)).toEqual([[144, 144], [144], [144]]);
    // Bo's text went with the row it was in.
    expect(LiveSuggestions.count(doc)).toBe(0);
  });

  it('takes a table away when its last row goes, and a row when its last cell goes', () => {
    const document = CONSTRUCTS.suggestedRows!('odf');
    const gone = { id: 'sAll', at: 1, author: { name: 'Bo' } };
    const only: TextDocument = {
      ...document,
      body: [
        ...document.body.slice(0, 1).map((b) =>
          b.type === 'table'
            ? {
                ...b,
                rows: b.rows.map((r) => ({
                  ...r,
                  suggested: undefined,
                  cells: r.cells.map((c) => ({ ...c, suggested: { deletion: gone } })),
                })),
              }
            : b,
        ),
        ...document.body.slice(1, 2),
      ],
    };
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(only)]);
    expect(LiveSuggestions.accept(doc, 'sAll', null)).toBe(true);
    const back = TextDocumentState.document(doc, 'odf');
    expect(back.body.map((b) => b.type)).toEqual(['paragraph']);
  });

  it('judges a person’s own row and column as theirs: rejected, the writing reads as before', () => {
    const doc = load();
    const fragment = () => tabFragment(doc, 't.0');
    const before = LiveSuggestions.ownRejected(fragment(), 'k');
    const own = { id: 'sOwn', at: 1, author: { key: 'k', name: 'Kay', colour: '#123456' } };
    doc.transact(() => {
      const table = fragment().get(0) as Y.XmlElement;
      const row = (table.get(0) as Y.XmlElement).clone();
      row.setAttribute('insertion', own as never);
      table.insert(1, [row]);
      const cell = ((table.get(0) as Y.XmlElement).get(0) as Y.XmlElement).clone();
      cell.setAttribute('insertion', own as never);
      (table.get(0) as Y.XmlElement).insert(0, [cell]);
    });
    expect(LiveSuggestions.ownRejected(fragment(), 'k')).toBe(before);
    expect(LiveSuggestions.ownRejected(fragment(), 'other')).not.toBe(before);
  });

  it('judges a table of only someone’s own rows as gone, as rejecting leaves it', () => {
    const doc = load();
    const fragment = () => tabFragment(doc, 't.0');
    const own = { id: 'sOwn', at: 1, author: { key: 'k', name: 'Kay', colour: '#123456' } };
    doc.transact(() => {
      const table = fragment().get(0) as Y.XmlElement;
      for (let i = 0; i < table.length; i++)
        (table.get(i) as Y.XmlElement).setAttribute('insertion', own as never);
    });
    const judged = LiveSuggestions.ownRejected(fragment(), 'k');
    LiveSuggestions.reject(doc, 'sOwn', null);
    expect(LiveSuggestions.ownRejected(fragment(), 'k')).toBe(judged);
    expect(
      fragment()
        .toArray()
        .filter((n) => (n as Y.XmlElement).nodeName === 'table'),
    ).toHaveLength(2);
  });
});
