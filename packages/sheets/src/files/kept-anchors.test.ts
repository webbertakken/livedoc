import { describe, expect, it } from 'vitest';
import { emptyLayout, emptySheet, type Sheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { workbookConversion } from './conversion';
import { fileKept, storedKept } from './kept-anchors';
import {
  keptAttribute,
  keptKindOf,
  keptKinds,
  keptStandardOf,
  type KeptContent,
  type KeptItem,
  type KeptPlace,
  type StoredAt,
} from './kept-content';
import { readOds } from './ods-read';
import { sheetsFromFile } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { parseXml } from '@livedoc/office-packages';

let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

function sheetOf(id: string, rows = 3, cols = 3): Sheet {
  return emptySheet({ id, tabId: `t-${id}`, title: id, layout: emptyLayout(rand, rows, cols) });
}

// A kept note anchored at `at`, by position in a file or by id in the model.
function note<At>(at: At, place: KeptPlace = 'cell'): KeptItem<At> {
  return {
    place,
    xml: '<office:annotation/>',
    ns: { office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0' },
    at,
  };
}

describe('kept anchors', () => {
  // standard-mapping.md "Anchors by id": positions become ids when a file is opened, ids positions when one is written.
  it('anchors by id on opening and by position on writing, round and round', () => {
    const one = sheetOf('one');
    const two = sheetOf('two');
    const kept: KeptContent = {
      standard: 'odf',
      items: [note({}), note({ sheet: 1 }, 'table-before'), note({ sheet: 0, r: 2, c: 1 })],
      parts: [],
    };
    const stored = storedKept(kept, [one, two]);
    expect(stored.dropped).toBe(0);
    expect(stored.kept.items.map((i) => i.at)).toEqual([
      {},
      { sheet: 'two' },
      { sheet: 'one', r: one.layout.rows[2], c: one.layout.cols[1] },
    ]);
    // Written with the sheets in another order, each item follows its sheet.
    expect(fileKept(stored.kept, [two, one]).kept.items.map((i) => i.at)).toEqual([
      {},
      { sheet: 0 },
      { sheet: 1, r: 2, c: 1 },
    ]);
  });

  // standard-mapping.md "Unknown content": an anchor gone drops its item, counted.
  it('drops an item whose sheet, row or column is gone, and counts it', () => {
    const one = sheetOf('one');
    const kept: KeptContent = {
      standard: 'odf',
      items: [note({}), note({ sheet: 3 }), note({ sheet: 0, r: 9, c: 0 })],
      parts: [],
    };
    expect(storedKept(kept, [one]).dropped).toBe(2);
    const stored: KeptContent<StoredAt> = {
      standard: 'odf',
      items: [
        note({ sheet: 'gone' }),
        note({ sheet: 'one', r: 'no-such-row', c: one.layout.cols[0]! }),
        note({ sheet: 'one', r: one.layout.rows[0]!, c: one.layout.cols[0]! }),
      ],
      parts: [],
    };
    const placed = fileKept(stored, [one]);
    expect(placed.dropped).toBe(2);
    expect(placed.kept.items.map((i) => i.at)).toEqual([{ sheet: 0, r: 0, c: 0 }]);
  });

  // D109: kept content goes into a file of its own standard only; its gone anchors are named.
  it('writes kept content into its own standard only, naming what is dropped', async () => {
    const one = sheetOf('one');
    const kept: KeptContent<StoredAt> = {
      standard: 'odf',
      items: [
        note({ sheet: 'one', r: one.layout.rows[1]!, c: one.layout.cols[1]! }),
        note<StoredAt>({ sheet: 'gone', r: 'r', c: 'c' }),
      ],
      parts: [],
    };
    const written = writeWorkbook([one], record, 'T', 'ods', kept);
    expect(written.losses).toEqual([{ k: 'kept_dropped', count: 1 }]);
    const read = await readOds(written.data);
    expect(read.ok && read.file.kept?.items.map((i) => [i.xml, i.at])).toEqual([
      ['<office:annotation/>', { sheet: 0, r: 1, c: 1 }],
    ]);
    expect(writeWorkbook([one], record, 'T', 'xlsx', kept).losses).toEqual([]);
    const alive = { ...kept, items: kept.items.slice(0, 1) };
    expect(writeWorkbook([one], record, 'T', 'fods', alive).losses).toEqual([]);
  });

  // files-and-print.md "Converting": the conversion lists the kept content it leaves behind, by kind.
  it('lists the kept content a conversion leaves behind, by kind, the most common first', () => {
    const one = sheetOf('one');
    const at = { sheet: 'one', r: one.layout.rows[0]!, c: one.layout.cols[0]! };
    const kept: KeptContent<StoredAt> = {
      standard: 'odf',
      items: [
        note(at),
        note(at),
        { place: 'spreadsheet-after', xml: '<table:named-expressions/>', ns: {}, at: {} },
        { place: 'styles', xml: '<style:style/>', ns: {}, at: {} },
        note({ sheet: 'gone' }),
      ],
      parts: [],
    };
    const odsRecord = WorkbookRecord.opened(record, 'ods');
    expect(workbookConversion([one], odsRecord, 'xlsx', kept).losses).toEqual([
      { k: 'kept', count: 3, kinds: ['notes', 'named-ranges'] },
    ]);
    // Nothing of it is left behind going back to its own standard.
    const xlsxRecord = WorkbookRecord.opened(record, 'xlsx');
    expect(workbookConversion([one], xlsxRecord, 'ods', kept).losses).toEqual([]);
    expect(workbookConversion([one], odsRecord, 'xlsx').losses).toEqual([]);
  });

  it('opens a file’s kept content anchored to the sheets it made, dropping what the limits cut', async () => {
    const fods = new TextEncoder().encode(
      '<?xml version="1.0"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
        'office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>' +
        '<table:table table:name="A" table:print="false"><table:table-row><table:table-cell table:number-columns-spanned="2"/></table:table-row></table:table>' +
        '</office:spreadsheet></office:body></office:document>',
    );
    const read = await readOds(fods);
    if (!read.ok) throw new Error(read.rejection);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const sheet = made.sheets[0]!;
    expect(made.kept?.items.map((i) => i.at)).toEqual([
      { sheet: sheet.id },
      { sheet: sheet.id, r: sheet.layout.rows[0], c: sheet.layout.cols[0] },
    ]);
    const cut = sheetsFromFile(
      { ...read.file, kept: { ...read.file.kept!, items: [note({ sheet: 5 })] } },
      'en-GB',
      rand,
    );
    expect(cut.losses).toContainEqual({ k: 'kept_dropped', count: 1 });
    expect(sheetsFromFile({ sheets: read.file.sheets }, 'en-GB', rand).kept).toBeUndefined();
  });
});

describe('kept content', () => {
  it('keeps an attribute alone with its value escaped and its prefix bound', () => {
    const parsed = parseXml('<a xmlns:t="urn:t" t:x="1 &lt; 2" plain="&quot;"/>');
    if (!parsed.ok) throw new Error('parse');
    const [prefixed, plain] = parsed.root.attributes;
    expect(keptAttribute(parsed.root, prefixed!)).toEqual({
      xml: 't:x="1 &lt; 2"',
      ns: { t: 'urn:t' },
    });
    expect(keptAttribute(parsed.root, plain!)).toEqual({ xml: 'plain="&quot;"', ns: {} });
  });

  it('names each item’s kind, an attribute’s by its name, one that serves others by none', () => {
    const item = (place: 'cell' | 'cell-attribute' | 'relationship', xml: string) => ({
      place,
      xml,
      ns: {},
      at: {},
    });
    expect(keptKindOf(item('cell', '<draw:frame/>'))).toBe('drawings');
    expect(keptKindOf(item('cell-attribute', 'table:number-columns-spanned="2"'))).toBe('merges');
    expect(keptKindOf(item('cell', '<mergeCells count="1"/>'))).toBe('merges');
    expect(keptKindOf(item('cell', '<x:unknown/>'))).toBe('other');
    expect(keptKindOf(item('cell', ''))).toBe('other');
    expect(keptKindOf(item('relationship', '<Relationship/>'))).toBeNull();
    expect(keptKinds([])).toEqual({ count: 0, kinds: [] });
    expect(keptStandardOf('fods')).toBe('odf');
    expect(keptStandardOf('xlsx')).toBe('ooxml');
  });
});
