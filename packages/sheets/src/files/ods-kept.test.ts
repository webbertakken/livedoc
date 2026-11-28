import { describe, expect, it } from 'vitest';
import { ODF_NS, writeOdfPackage } from '@livedoc/office-packages';
import { writeTestZip } from '@livedoc/office-packages/testing';
import { KEPT_REPEAT_MAX, type FileAt, type KeptItem } from './kept-content';
import { readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import type { FileRead, WorkbookFile } from './workbook-file';
import {
  CONFIG,
  FORMATS,
  GRAPHIC,
  NAMES,
  FRAME_BEFORE,
  odfFlatWithKept,
  PARAGRAPH,
  SCRIPTS,
  SETTINGS,
  SHAPES,
  TRACKED,
  VALIDATIONS,
} from '../testing/kept-files';

const encode = (text: string) => new TextEncoder().encode(text);

async function readOk(bytes: Uint8Array<ArrayBuffer>): Promise<Extract<FileRead, { ok: true }>> {
  const read = await readOds(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read;
}

const placed = (items: readonly KeptItem<FileAt>[]) =>
  items
    .map((i) => `${i.place}@${i.at.sheet ?? ''},${i.at.r ?? ''},${i.at.c ?? ''}:${i.xml}`)
    .sort();

describe('ODF kept content', () => {
  // standard-mapping.md "Unknown content", Grains: each element and attribute the reader does not read, where it sat.
  it('keeps what the reader does not read, by where it sat', async () => {
    const read = await readOk(encode(odfFlatWithKept()));
    expect(read.file.kept?.standard).toBe('odf');
    expect(placed(read.file.kept!.items)).toEqual(
      [
        `settings@,,:${SETTINGS}`,
        `scripts@,,:${SCRIPTS}`,
        `styles@,,:${GRAPHIC}`,
        `styles@,,:${PARAGRAPH}`,
        `spreadsheet-before@,,:${TRACKED}`,
        `spreadsheet-before@,,:${VALIDATIONS}`,
        `spreadsheet-after@,,:${NAMES}`,
        `table-before@0,,:${SHAPES}`,
        `table-after@0,,:${FORMATS}`,
        'table-attribute@0,,:table:print="false"',
        `cell@0,0,0:${FRAME_BEFORE}`,
        'cell-after@0,0,0:<draw:frame draw:name="after"/>',
        'cell-attribute@0,0,0:table:number-columns-spanned="2"',
        'cell-attribute@0,0,0:table:content-validation-name="val1"',
      ].sort(),
    );
    // A kept element carries the bindings of the prefixes it uses.
    const frame = read.file.kept!.items.find((i) => i.place === 'cell')!;
    expect(frame.ns).toEqual({ draw: ODF_NS.draw, text: ODF_NS.text });
    expect(read.file.sheets[0]!.cells.map((c) => c.value)).toEqual([
      { k: 'n', v: 1 },
      { k: 'n', v: 2 },
    ]);
  });

  // standard-mapping.md "Unknown content", "Written back in place": a flat file read, written and read again keeps
  // every item byte-equal, where it sat.
  it('writes every kept item back where it sat, byte-equal', async () => {
    const read = await readOk(encode(odfFlatWithKept()));
    const again = await readOk(encode(writeFlatOds(read.file, 'T').data));
    expect(placed(again.file.kept!.items)).toEqual(placed(read.file.kept!.items));
    const fromPackage = await readOk(writeOds(read.file, 'T').data);
    expect(placed(fromPackage.file.kept!.items)).toEqual(placed(read.file.kept!.items));
    expect(again.file.sheets).toEqual(read.file.sheets);
  });

  it('writes the calculation settings after tracked changes and before validations, as ODF orders them', async () => {
    const read = await readOk(encode(odfFlatWithKept()));
    const data = writeFlatOds(read.file, 'T').data;
    const at = (text: string) => data.indexOf(text);
    expect(at(TRACKED)).toBeLessThan(at('<table:calculation-settings'));
    expect(at('<table:calculation-settings')).toBeLessThan(at(VALIDATIONS));
    expect(at(VALIDATIONS)).toBeLessThan(at('<table:table '));
    expect(at(SHAPES)).toBeLessThan(at('<table:table-column'));
    expect(at(FORMATS)).toBeGreaterThan(at('</table:table-row>'));
    // Its root declares what the kept content uses; a cell style the cells do not name is not kept.
    expect(data).toContain(`xmlns:config="${CONFIG}"`);
    expect(data).not.toContain('ce9');
  });

  // D105: a repeated cell keeps its content on each of its cells, up to KEPT_REPEAT_MAX.
  it('keeps a repeated cell’s content on each cell, or names the cut past the most it keeps', async () => {
    const few =
      '<table:table-row table:number-rows-repeated="2"><table:table-cell table:number-columns-repeated="3" table:content-validation-name="val1"/></table:table-row>';
    const read = await readOk(encode(odfFlatWithKept(few)));
    const validated = read.file.kept!.items.filter(
      (i) => i.place === 'cell-attribute' && i.at.r !== 0,
    );
    expect(validated.map((i) => `${i.at.r},${i.at.c}`)).toEqual([
      '1,0',
      '1,1',
      '1,2',
      '2,0',
      '2,1',
      '2,2',
    ]);
    // The sheet grows to hold its kept cells, and writes each of them, empty as they are.
    expect(read.file.sheets[0]).toMatchObject({ rows: 3, cols: 3 });
    const again = await readOk(encode(writeFlatOds(read.file, 'T').data));
    expect(placed(again.file.kept!.items)).toEqual(placed(read.file.kept!.items));

    const many = `<table:table-row table:number-rows-repeated="${KEPT_REPEAT_MAX}"><table:table-cell table:number-columns-repeated="2" table:content-validation-name="val1"/></table:table-row>`;
    const cut = await readOk(encode(odfFlatWithKept(many)));
    expect(cut.losses).toContainEqual({
      k: 'kept_cut',
      sheet: 'Sheet1',
      cells: 2 * KEPT_REPEAT_MAX,
    });
    expect(cut.file.kept!.items.filter((i) => (i.at.r ?? 0) > 0)).toEqual([]);
  });

  it('reads a file that keeps nothing as the model alone', async () => {
    const plain = writeFlatOds({ sheets: [{ name: 'A', rows: 1, cols: 1, cells: [] }] }, 'T').data;
    expect((await readOk(encode(plain))).file.kept).toBeUndefined();
  });

  // D109: a file of the other standard never sees kept content.
  it('leaves out kept content of the other standard', () => {
    const file: WorkbookFile = {
      sheets: [{ name: 'A', rows: 1, cols: 1, cells: [] }],
      kept: {
        standard: 'ooxml',
        items: [{ place: 'worksheet', xml: '<mergeCells/>', ns: {}, at: { sheet: 0 } }],
        parts: [{ name: 'xl/media/a.png', type: 'image/png', data: new Uint8Array([1]), rels: [] }],
        relationships: [],
      },
    };
    expect(writeFlatOds(file, 'T').data).not.toContain('mergeCells');
  });

  // standard-mapping.md "Written back in place": a kept entry while it is still reached; D111 for a flat file.
  it('keeps the package’s other entries while kept content still names them', async () => {
    const content = odfFlatWithKept()
      .replace('<?xml version="1.0"?>', '')
      .replace(/office:document /, 'office:document-content ')
      .replace(/<\/office:document>$/, '</office:document-content>')
      .replace(/office:mimetype="[^"]*"/, '')
      .replace(SETTINGS, '');
    const settings = `<office:document-settings xmlns:office="${ODF_NS.office}" xmlns:config="${CONFIG}">${SETTINGS}</office:document-settings>`;
    const png = new Uint8Array([137, 80, 78, 71]);
    const bytes = writeOdfPackage('application/vnd.oasis.opendocument.spreadsheet', [
      { name: 'content.xml', mediaType: 'text/xml', data: encode(content) },
      { name: 'settings.xml', mediaType: 'text/xml', data: encode(settings) },
      { name: 'Pictures/cat.png', mediaType: 'image/png', data: png },
      { name: 'Pictures/dog.png', mediaType: 'image/png', data: png },
      { name: 'Object 1/content.xml', mediaType: 'text/xml', data: encode('<x/>') },
      {
        name: 'Object 1/',
        mediaType: 'application/vnd.oasis.opendocument.chart',
        data: new Uint8Array(),
      },
      { name: 'Configurations2/accelerator/current.xml', mediaType: '', data: encode('<a/>') },
    ]);
    const read = await readOk(bytes);
    expect(read.file.kept!.parts.map((p) => `${p.name} ${p.type}`).sort()).toEqual([
      'Configurations2/accelerator/current.xml ',
      'Object 1/ application/vnd.oasis.opendocument.chart',
      'Object 1/content.xml text/xml',
      'Pictures/cat.png image/png',
      'Pictures/dog.png image/png',
    ]);
    expect(placed(read.file.kept!.items)).toContain(`settings@,,:${SETTINGS}`);
    // The cat is named by a kept frame; the dog and the object by nothing, so they go.
    const again = await readOk(writeOds(read.file, 'T').data);
    expect(again.file.kept!.parts.map((p) => p.name).sort()).toEqual([
      'Configurations2/accelerator/current.xml',
      'Pictures/cat.png',
    ]);
    expect(placed(again.file.kept!.items)).toEqual(placed(read.file.kept!.items));
    expect(writeFlatOds(read.file, 'T').losses).toContainEqual({ k: 'parts_left', count: 2 });
  });

  // D106: what the package drops is named; an entry the manifest leaves untyped is kept untyped.
  it('names what the package drops, and keeps an entry the manifest does not list', async () => {
    const manifest =
      `<manifest:manifest xmlns:manifest="${ODF_NS.manifest}" manifest:version="1.4">` +
      '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>' +
      '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>';
    const bytes = writeTestZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
      { name: 'META-INF/manifest.xml', data: manifest },
      {
        name: 'content.xml',
        data: odfFlatWithKept()
          .replace(/office:document /, 'office:document-content ')
          .replace(/<\/office:document>$/, '</office:document-content>')
          .replace('<?xml version="1.0"?>', ''),
      },
      { name: 'Thumbnails/thumbnail.png', data: new Uint8Array([1]) },
      { name: 'manifest.rdf', data: '<rdf/>' },
    ]);
    const read = await readOk(bytes);
    expect(read.losses).toContainEqual({
      k: 'entries_dropped',
      entries: ['Thumbnails/thumbnail.png'],
    });
    expect(read.file.kept!.parts.map((p) => [p.name, p.type])).toEqual([['manifest.rdf', '']]);
  });

  // A kept attribute whose prefix the root binds to another namespace takes a prefix of its own, never renaming its cell.
  it('writes a kept attribute whose prefix the root binds otherwise under a prefix of its own', async () => {
    const file: WorkbookFile = {
      sheets: [{ name: 'A', rows: 1, cols: 1, cells: [] }],
      kept: {
        standard: 'odf',
        items: [
          {
            place: 'cell-attribute',
            xml: 'table:mark="x"',
            ns: { table: 'urn:other' },
            at: { sheet: 0, r: 0, c: 0 },
          },
          { place: 'cell-attribute', xml: 'plain="y"', ns: {}, at: { sheet: 0, r: 0, c: 0 } },
        ],
        parts: [],
        relationships: [],
      },
    };
    const data = writeFlatOds(file, 'T').data;
    expect(data).toContain('<table:table-cell xmlns:kept1="urn:other" kept1:mark="x" plain="y">');
    const read = await readOk(encode(data));
    expect(read.file.kept!.items.map((i) => [i.xml, i.ns])).toEqual([
      ['kept1:mark="x"', { kept1: 'urn:other' }],
      ['plain="y"', {}],
    ]);
  });
});
