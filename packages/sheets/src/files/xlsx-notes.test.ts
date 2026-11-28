// docs/specs/029-sheets/standard-mapping.md "Notes in the file": an XLSX notes part read and written, edge by edge.
import { describe, expect, it } from 'vitest';
import { parseXml, type XmlElement } from '@livedoc/office-packages';
import { cellNote } from './ods-cell-text';
import { cellsNoted, readXlsxNotes, xlsxNotesOut } from './xlsx-notes';
import type { FileCell } from './workbook-file';

const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function root(xml: string): XmlElement {
  const parsed = parseXml(xml);
  if (!parsed.ok) throw new Error('does not parse');
  return parsed.root;
}

describe('readXlsxNotes', () => {
  it('reads runs and plain text, passing over what is no note', () => {
    const notes = readXlsxNotes(
      root(
        `<comments xmlns="${SML}" xmlns:x="urn:other"><commentList>` +
          '<comment ref="A1"><text><rPh><t>ruby</t></rPh><r><t>One</t></r><x:r><t>skipped</t></x:r><r><rPr/></r><t>Two</t></text></comment>' +
          '<x:comment ref="B1"><text><t>foreign</t></text></x:comment>' +
          '<comment ref="C1"/>' +
          '<comment ref="nope"><text><t>x</t></text></comment>' +
          '<comment><text><t>no ref</t></text></comment>' +
          '<comment ref="D1"><text><t></t></text></comment>' +
          '</commentList></comments>',
      ),
    );
    expect(notes).toEqual([{ r: 0, c: 0, text: 'OneTwo' }]);
  });

  it('reads none from a part without a list', () => {
    expect(readXlsxNotes(root(`<comments xmlns="${SML}"><authors/></comments>`))).toEqual([]);
  });
});

describe('cellsNoted', () => {
  it('puts each note on its cell, makes a cell for one on none, and leaves out one past the limits', () => {
    const cells: FileCell[] = [{ r: 0, c: 0 }];
    cellsNoted(cells, [], { rows: 10, cols: 10 });
    expect(cells).toEqual([{ r: 0, c: 0 }]);
    cellsNoted(
      cells,
      [
        { r: 0, c: 0, text: 'on a value' },
        { r: 3, c: 1, text: 'alone' },
        { r: 3, c: 1, text: 'again' },
        { r: 20, c: 0, text: 'past' },
        { r: 0, c: 20, text: 'past' },
      ],
      { rows: 10, cols: 10 },
    );
    expect(cells).toEqual([
      { r: 0, c: 0, note: 'on a value' },
      { r: 3, c: 1, note: 'again' },
    ]);
  });
});

describe('xlsxNotesOut', () => {
  it('writes none for a sheet without notes', () => {
    expect(xlsxNotesOut([{ r: 0, c: 0 }], 1, [])).toBeNull();
  });

  it('names its relationships apart from the sheet’s kept ones, in the cells’ order', () => {
    const out = xlsxNotesOut(
      [
        { r: 2, c: 0, note: 'second' },
        { r: 0, c: 1, note: 'first' },
        { r: 0, c: 0, note: 'before it' },
      ],
      3,
      [
        { id: 'rIdNotes', type: 'x', target: 'y' },
        { id: 'rIdNotes2', type: 'x', target: 'y' },
        { id: 'rIdNotesVml', type: 'x', target: 'y' },
      ],
    )!;
    expect(out.rels.map((r) => [r.id, r.target])).toEqual([
      ['rIdNotes3', '../comments3.xml'],
      ['rIdNotesVml2', '../drawings/vmlDrawing3.vml'],
    ]);
    expect(out.legacyDrawing).toBe('<legacyDrawing r:id="rIdNotesVml2"/>');
    const at = (ref: string) => out.parts[0]!.xml.indexOf(`ref="${ref}"`);
    expect(at('A1')).toBeLessThan(at('B1'));
    expect(at('B1')).toBeLessThan(at('A3'));
    expect(out.parts[1]!.xml).toContain('<o:idmap v:ext="edit" data="3"/>');
    expect(out.parts[1]!.xml).toContain('id="_x0000_s3075"');
  });
});

describe('cellNote (ODF)', () => {
  const cell = (inner: string) =>
    root(
      `<table:table-cell xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">${inner}</table:table-cell>`,
    );

  it('is none for a cell without an annotation, or one with no text', () => {
    expect(cellNote(cell('<text:p>x</text:p>'))).toBeNull();
    expect(cellNote(cell('<office:annotation><text:p/></office:annotation>'))).toBeNull();
  });
});
