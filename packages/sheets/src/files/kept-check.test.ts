// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content: kept content checked as it arrives, each
// refusal named.
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { keptItemFault, keptRefusal } from './kept-check';
import {
  isKeptPlace,
  type KeptContent,
  type KeptItem,
  type KeptPart,
  type KeptRelationship,
  type StoredAt,
} from './kept-content';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile } from './workbook-file';
import { excelFileWithKept, odfFlatWithKept } from '../testing/kept-files';

const TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function storedOf(bytes: Uint8Array<ArrayBuffer>): Promise<KeptContent<StoredAt>> {
  const read = await readWorkbookFile(bytes, 'en-GB');
  if (!read.ok) throw new Error(read.rejection);
  const kept = sheetsFromFile(read.file, 'en-GB').kept;
  if (!kept) throw new Error('nothing kept');
  return kept;
}

const odf = (more: Partial<KeptContent<StoredAt>>): KeptContent<StoredAt> => ({
  standard: 'odf',
  items: [],
  parts: [],
  relationships: [],
  ...more,
});
const ooxml = (more: Partial<KeptContent<StoredAt>>): KeptContent<StoredAt> => ({
  ...odf(more),
  standard: 'ooxml',
});
const item = (more: Partial<KeptItem<StoredAt>>): KeptItem<StoredAt> => ({
  place: 'table-after',
  xml: '<table:shapes/>',
  ns: { table: TABLE },
  at: { sheet: 's1' },
  ...more,
});
const part = (more: Partial<KeptPart>): KeptPart => ({
  name: 'Pictures/cat.png',
  type: 'image/png',
  data: new Uint8Array([1, 2, 3]),
  rels: [],
  ...more,
});
const rel = (more: Partial<KeptRelationship<StoredAt>>): KeptRelationship<StoredAt> => ({
  id: 'rId1',
  type: RELATIONSHIP_TYPES.styles,
  target: '/xl/media/a.png',
  from: 'workbook',
  at: {},
  ...more,
});
const rejectionOf = (kept: KeptContent<StoredAt>) => keptRefusal(kept)?.rejection ?? null;

describe('keptRefusal', () => {
  it('takes what a reader keeps from either standard', async () => {
    expect(keptRefusal(await storedOf(new TextEncoder().encode(odfFlatWithKept())))).toBeNull();
    expect(keptRefusal(await storedOf(excelFileWithKept()))).toBeNull();
  });

  it('takes entries, folders and relationships that stay inside the package', () => {
    expect(
      rejectionOf(odf({ parts: [part({}), part({ name: 'Object 1/', data: new Uint8Array() })] })),
    ).toBeNull();
    const drawing = part({
      name: 'xl/drawings/drawing1.xml',
      type: 'application/vnd.openxmlformats-officedocument.drawing+xml',
      rels: [{ id: 'rId1', type: `${R}/image`, target: '../media/a.png' }],
    });
    const link = rel({
      id: 'rId3',
      target: 'https://example.com/',
      external: true,
      from: 'sheet',
      at: { sheet: 's1' },
    });
    expect(rejectionOf(ooxml({ parts: [drawing], relationships: [rel({}), link] }))).toBeNull();
  });

  it('refuses an item that is not one whole element of its standard', () => {
    const refused = (more: Partial<KeptItem<StoredAt>>) =>
      keptRefusal(odf({ items: [item(more)] }));
    expect(refused({ xml: '<table:shapes/><table:shapes/>' })).toEqual({
      rejection: 'kept_item_invalid',
      at: 'items[0]',
      why: 'not one element',
    });
    expect(refused({ xml: ' <table:shapes/>' })?.why).toBe('not one element');
    expect(refused({ xml: 'text' })?.why).toBe('not one element');
    expect(refused({ xml: '<table:shapes>' })?.why).toBe('xml_malformed');
    expect(refused({ xml: '<x:shapes/>' })?.why).toBe('xml_malformed');
    // A DOCTYPE never stands inside the element the check wraps the item in.
    expect(refused({ xml: '<!DOCTYPE x [<!ENTITY a "b">]><table:shapes/>' })?.why).toBe(
      'xml_malformed',
    );
    expect(refused({ xml: '<table:shapes>&a;</table:shapes>' })?.why).toBe('xml_malformed');
    expect(refused({ place: 'workbook' })?.why).toBe('place');
    expect(refused({ ns: { xmlns: TABLE } })?.why).toBe('bindings');
    expect(refused({ ns: { table: '' } })?.why).toBe('bindings');
  });

  it('refuses an attribute place holding anything but one attribute', () => {
    const at = { sheet: 's1', r: 'r1', c: 'c1' };
    const attribute = (xml: string) =>
      keptRefusal(odf({ items: [item({ place: 'cell-attribute', xml, at })] }))?.why ?? null;
    expect(attribute('table:number-columns-spanned="2"')).toBeNull();
    expect(attribute('table:a="1" table:b="2"')).toBe('not one attribute');
    expect(attribute('xmlns:x="urn:x"')).toBe('not one attribute');
    expect(attribute('x:a="1"')).toBe('xml_malformed');
  });

  it('refuses an anchor that is not whole', () => {
    expect(rejectionOf(odf({ items: [item({ at: { sheet: 's1', r: 'r1' } })] }))).toBe(
      'kept_anchor_invalid',
    );
    expect(rejectionOf(odf({ items: [item({ at: { r: 'r1', c: 'c1' } })] }))).toBe(
      'kept_anchor_invalid',
    );
  });

  it('refuses an entry that is unsafe, LiveDoc’s own, dropped, twice, or mistyped', () => {
    const why = (kept: KeptContent<StoredAt>) => keptRefusal(kept)?.why ?? null;
    expect(why(odf({ parts: [part({ name: '../x.png' })] }))).toBe('name');
    expect(why(odf({ parts: [part({ name: 'content.xml' })] }))).toBe('name');
    expect(why(odf({ parts: [part({ name: 'Basic/Module.xml' })] }))).toBe('name');
    expect(why(odf({ parts: [part({ name: 'Object 1/' })] }))).toBe('name');
    expect(why(ooxml({ parts: [part({ name: 'xl/worksheets/sheet1.xml' })] }))).toBe('name');
    expect(why(ooxml({ parts: [part({ name: 'xl/_rels/workbook.xml.rels' })] }))).toBe('name');
    expect(why(ooxml({ parts: [part({ name: 'xl/vbaProject.bin' })] }))).toBe('name');
    expect(why(ooxml({ parts: [part({ name: 'xl/media/', data: new Uint8Array() })] }))).toBe(
      'name',
    );
    expect(why(odf({ parts: [part({ type: 'image/png"' })] }))).toBe('type');
    expect(why(odf({ parts: [part({}), part({})] }))).toBe('twice');
    expect(
      why(odf({ parts: [part({ rels: [{ id: 'rId1', type: 't', target: 'a.png' }] })] })),
    ).toBe('relationships');
    const escaping = part({
      name: 'xl/media/a.png',
      rels: [{ id: 'rId1', type: 't', target: '../../../x' }],
    });
    expect(keptRefusal(ooxml({ parts: [escaping] }))).toEqual({
      rejection: 'kept_part_invalid',
      at: 'parts[0]',
      why: 'target',
    });
  });

  it('refuses a relationship that leaves the package, is dropped, or sits wrong', () => {
    const why = (more: Partial<KeptRelationship<StoredAt>>) =>
      keptRefusal(ooxml({ relationships: [rel(more)] }))?.why ?? null;
    expect(rejectionOf(ooxml({ relationships: [rel({ target: '/../x' })] }))).toBe(
      'kept_relationship_invalid',
    );
    expect(why({ id: '1d' })).toBe('id');
    expect(why({ type: RELATIONSHIP_TYPES.vbaProject })).toBe('type');
    expect(why({ target: '' })).toBe('target');
    expect(why({ target: 'a\nb', external: true })).toBe('target');
    expect(why({ target: 'x'.repeat(2049), external: true })).toBe('target');
    expect(why({ from: 'sheet' })).toBe('source');
    expect(why({ at: { sheet: 's1' } })).toBe('source');
    expect(why({ from: 'sheet', at: { sheet: 's1', r: 'r1', c: 'c1' } })).toBe('source');
    expect(keptRefusal(odf({ relationships: [rel({})] }))?.why).toBe('odf');
  });
});

describe('isKeptPlace', () => {
  it('names the places kept content sits at', () => {
    expect(isKeptPlace('cell-attribute')).toBe(true);
    expect(isKeptPlace('nowhere')).toBe(false);
  });
});

describe('keptItemFault', () => {
  it('answers null for one whole element with the bindings it needs', () => {
    expect(keptItemFault('worksheet', '<x:a xmlns:x="urn:x"/>', {})).toBeNull();
    expect(keptItemFault('worksheet', '<a/>', { '': 'urn:main' })).toBeNull();
  });
});
