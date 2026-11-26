// docs/specs/034-text-documents/standard-mapping.md "Suggested blocks", review.md "How a suggestion is kept": a table,
// a section break and a table of contents carry an insertion or a deletion whole, written as Word and LibreOffice
// write them (a table's rows tracked; a table of contents' entries in one change; a section break's paragraph mark in
// .docx and a region named by `livedoc:section-change` in .odt), read back whole, what is inside them carrying only
// its own suggestions; a dangling suggestion reads as nothing and is reported.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Block, type Run, type SectionBreak } from './model/blocks';
import type { TableOfContents } from './model/contents';
import type { Table } from './model/tables';
import type { TextDocument } from './model/text-document';
import { Suggestions } from './model/suggestions';
import { CONSTRUCTS } from './testing/constructs';
import { fodt } from './testing/packages';
import { TextDocumentState } from './text-document-state';
import { LiveSuggestions } from './live/live-suggestions';

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
const sections = (d: TextDocument) => d.body.filter((b): b is SectionBreak => b.type === 'section');
const contents = (d: TextDocument) =>
  d.body.filter((b): b is TableOfContents => b.type === 'contents');
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
const marksOf = (d: TextDocument) =>
  d.body.map((b) =>
    b.type === 'table' || b.type === 'section' || b.type === 'contents' ? b.suggested : undefined,
  );

describe('suggested blocks, written and read back', () => {
  for (const [format, type] of [
    ['odf', 'fodt'],
    ['odf', 'odt'],
    ['ooxml', 'docx'],
  ] as const)
    it(`keeps each block’s suggestion, ids and authors in .${type}`, async () => {
      const document = CONSTRUCTS.suggestedBlocks!(format);
      const back = (await read(write(document, type))).document;
      expect(marksOf(back).filter(Boolean)).toEqual(marksOf(document).filter(Boolean));
      // Another person's text inside the suggested table stays their own; an empty cell holds no joiner.
      expect(cellTexts(tables(back)[0]!)).toEqual([
        ['A1', ''],
        ['B1 +mine+Bo', 'B2'],
      ]);
    });

  it('writes Word’s forms: tracked rows, the cells’ runs, the field, the section’s own paragraph', async () => {
    const xml = await documentXml(write(CONSTRUCTS.suggestedBlocks!('ooxml'), 'docx'));
    expect(xml.match(/<w:trPr>(?:(?!<\/w:trPr>).)*<w:ins [^>]*livedoc:id="sTable"/g)).toHaveLength(
      2,
    );
    expect(xml).toMatch(/<w:ins [^>]*livedoc:id="sTable"[^>]*><w:r>(?:(?!<\/w:r>).)*A1/);
    expect(xml).toMatch(
      /<w:del [^>]*livedoc:id="sContents"[^>]*><w:r><w:fldChar w:fldCharType="begin"\/>/,
    );
    expect(xml).toMatch(
      /<w:p><w:pPr><w:rPr><w:ins [^>]*livedoc:id="sSection"[^>]*\/><\/w:rPr><w:sectPr>/,
    );
  });

  it('writes LibreOffice’s forms: a region per row in every cell paragraph, a joiner, the section named', () => {
    const xml = text(write(CONSTRUCTS.suggestedBlocks!('odf'), 'fodt'));
    const tableRegions = xml.match(/<text:changed-region [^>]*livedoc:block="table"/g) ?? [];
    expect(tableRegions).toHaveLength(2);
    expect(xml).toMatch(
      /<text:p[^>]*><text:change-start text:change-id="(ct\d+)"\/>A1<text:change-end text:change-id="\1"\/><\/text:p>/,
    );
    expect(xml).toMatch(
      /<text:change-start text:change-id="(ct\d+)"\/>\u200d<text:change-end text:change-id="\1"\/>/,
    );
    expect(xml).toMatch(/<text:changed-region [^>]*livedoc:block="contents"/);
    const pointer = /livedoc:section-change="(ct\d+)"/.exec(xml);
    expect(pointer).not.toBeNull();
    expect(xml).toContain(`<text:changed-region xml:id="${pointer![1]}"`);
  });

  it('keeps them through conversion, ODF to Word and back', async () => {
    const document = CONSTRUCTS.suggestedBlocks!('odf');
    const ooxml = convertTextDocument(document, 'ooxml').document;
    const back = convertTextDocument((await read(write(ooxml, 'docx'))).document, 'odf').document;
    const again = (await read(write(back, 'odt'))).document;
    expect(marksOf(again).filter(Boolean)).toEqual(marksOf(document).filter(Boolean));
  });
});

describe('suggested blocks from Word and LibreOffice', () => {
  const corpus = (name: string) =>
    readFileSync(join(import.meta.dirname, '..', 'corpus', 'libreoffice', name));

  for (const name of ['suggested-blocks-source.docx', 'suggested-blocks.fodt'])
    it(`reads ${name}: tables, the table of contents and section breaks suggested`, async () => {
      const { document, report } = await read(corpus(name));
      const [inserted, deleted] = tables(document);
      expect(inserted!.suggested?.insertion?.author.name).toBe('Ada');
      expect(cellTexts(inserted!)).toEqual([
        ['A1', ''],
        ['B1 +mine+Bo', 'B2'],
      ]);
      expect(deleted!.suggested?.deletion?.author.name).toBe('Bo');
      expect(cellTexts(deleted!)).toEqual([['Gone']]);
      expect(contents(document)[0]!.suggested?.insertion?.author.name).toBe('Ada');
      expect(
        contents(document)[0]!.entries.every((p) =>
          p.inlines.every((i) => !('suggested' in i) || !i.suggested),
        ),
      ).toBe(true);
      expect(report.dropped.filter((d) => d.reason === 'suggestion-dangling')).toEqual([]);
    });

  it('reads Word’s tracked section breaks, each paragraph holding one kept as a paragraph', async () => {
    const { document } = await read(corpus('suggested-blocks-source.docx'));
    const [inserted, deleted] = sections(document);
    expect(inserted!.suggested?.insertion?.author.name).toBe('Ada');
    expect(deleted!.suggested?.deletion?.author.name).toBe('Bo');
    const texts = document.body.flatMap((b) =>
      b.type === 'paragraph' ? [Paragraph.text(b)] : [`<${b.type}>`],
    );
    expect(texts.slice(texts.indexOf('Before'))).toEqual([
      'Before',
      '',
      '<section>',
      'Landscape ends here',
      '<section>',
      'After',
    ]);
    // The tracked marks are the section breaks', never the next paragraphs' breaks.
    const after = document.body.filter((b): b is Paragraph => b.type === 'paragraph');
    expect(after.every((p) => !p.suggested)).toBe(true);
  });

  it('reads text suggested into every cell of a LiveDoc table as text, never as a suggested table', async () => {
    const document = CONSTRUCTS.suggestedBlocks!('odf');
    const filled = document.body.map((b) =>
      b.type === 'table' ? { ...b, suggested: undefined } : b,
    );
    const filledDocument = {
      ...document,
      body: filled.map((b) =>
        b.type === 'table'
          ? {
              ...b,
              rows: b.rows.map((r) => ({
                ...r,
                cells: r.cells.map((c) => ({
                  ...c,
                  blocks: c.blocks.map((p) =>
                    p.type === 'paragraph'
                      ? {
                          ...p,
                          inlines: p.inlines.map((i) =>
                            i.type === 'run'
                              ? { ...i, suggested: i.suggested ?? { insertion: ADA_TEXT } }
                              : i,
                          ),
                        }
                      : p,
                  ),
                })),
              })),
            }
          : b,
      ),
    } as TextDocument;
    const back = (await read(write(filledDocument, 'fodt'))).document;
    expect(tables(back)[0]!.suggested).toBeUndefined();
    expect(cellTexts(tables(back)[0]!)[0]).toEqual(['+A1+Ada Lovelace', '']);
  });
});

const ADA_TEXT = { id: 'sText', at: Date.UTC(2026, 10, 26, 9), author: { name: 'Ada Lovelace' } };

describe('a dangling suggestion', () => {
  const region = (id: string, kind = 'insertion') =>
    `<text:changed-region xmlns:dc="http://purl.org/dc/elements/1.1/" xml:id="${id}" text:id="${id}"><text:${kind}><office:change-info><dc:creator>Ada</dc:creator></office:change-info></text:${kind}></text:changed-region>`;
  const document = (regions: string, pointer: string) =>
    fodt(
      `<text:tracked-changes>${regions}</text:tracked-changes><text:p text:style-name="Standard">One</text:p><text:p text:style-name="Landscape"${pointer}>Two</text:p>`,
    );

  it('reads a pointer to no region as a plain section break, reported', async () => {
    const { report } = await read(document('', ' livedoc:section-change="ct9"'));
    expect(report.dropped).toContainEqual({
      reason: 'suggestion-dangling',
      name: 'ct9',
      count: 1,
    });
  });

  it('reads a region nothing names as nothing, reported', async () => {
    const { document: read_, report } = await read(document(region('ct1'), ''));
    expect(read_.body.every((b) => b.type !== 'paragraph' || !b.suggested)).toBe(true);
    expect(report.dropped).toContainEqual({
      reason: 'suggestion-dangling',
      name: 'ct1',
      count: 1,
    });
  });
});

describe('suggested blocks in the live state', () => {
  it('carries each block’s mark into the live state and back, read as its kind’s parts', async () => {
    const document = CONSTRUCTS.suggestedBlocks!('odf');
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    const back = TextDocumentState.document(doc, 'odf');
    expect(marksOf(back).filter(Boolean)).toEqual(marksOf(document).filter(Boolean));
    const parts = LiveSuggestions.read(doc).flatMap((s) =>
      s.parts.filter((p) => p.kind.startsWith('block-')).map((p) => [s.id, p.kind, p.text]),
    );
    expect(parts).toEqual([
      ['sContents', 'block-deletion', 'table_of_contents'],
      ['sTable', 'block-insertion', 'table'],
      ['sSection', 'block-insertion', 'section_break'],
    ]);
  });
});

describe('Suggestions.absorbed', () => {
  const ada = { id: 'f.1', author: { name: 'Ada' } };
  const adaAgain = { id: 'f.7', author: { name: 'Ada' } };
  const bo = { id: 'f.2', author: { name: 'Bo' } };
  const run = (t: string, suggested?: Run['suggested']): Run => ({
    type: 'run',
    text: t,
    props: {},
    ...(suggested ? { suggested } : {}),
  });
  const p = (...inlines: Run[]): Paragraph => ({
    type: 'paragraph',
    style: 'Standard',
    props: {},
    inlines,
  });

  it('drops the block’s own marks and the same author’s, keeps another’s, takes the joiners out', () => {
    const blocks = Suggestions.absorbed(
      [
        p(
          run('A', { insertion: ada }),
          run('B', { insertion: adaAgain }),
          run('C', { insertion: bo }),
        ),
        p(run('\u200d', { insertion: ada })),
        { ...p(run('D', { insertion: ada })), suggested: { break: ada } },
      ],
      'insertion',
      [ada],
    ) as Paragraph[];
    expect(blocks.map((b) => b.inlines)).toEqual([
      [run('AB'), run('C', { insertion: bo })],
      [],
      [run('D')],
    ]);
    expect(blocks[2]!.suggested).toBeUndefined();
  });

  it('leaves a mark of the other kind alone', () => {
    const blocks = Suggestions.absorbed([p(run('A', { deletion: ada }))], 'insertion', [ada]);
    expect((blocks[0] as Paragraph).inlines).toEqual([run('A', { deletion: ada })]);
  });
});
