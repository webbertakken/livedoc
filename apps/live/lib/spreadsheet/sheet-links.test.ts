// docs/specs/029-sheets/inserted-objects.md "Links" (D636-D641): what the link editor opens with and offers, the Link
// field read as a cell's link, the one write applying it, and Get Link to This Cell's address both ways.
import { describe, expect, it } from 'vitest';
import {
  cellKey,
  emptySheet,
  Workbook,
  type CellFormat,
  type CellInput,
  type Sheet,
} from '@livedoc/sheets';
import {
  cellLinkAddress,
  rangeOfSearch,
  withoutRange,
  rangeOnSheet,
  sheetLinkAddress,
  sheetLinkEditing,
  sheetLinkOffers,
  sheetLinkWrite,
} from './sheet-links';

const layout = (tag: string) => ({
  rows: Array.from({ length: 10 }, (_, i) => `${tag}r${i}`),
  cols: Array.from({ length: 6 }, (_, i) => `${tag}c${i}`),
});

function sheetOf(
  id: string,
  title: string,
  cells: Record<string, { i?: CellInput; f?: CellFormat }>,
) {
  const sheet: Sheet = emptySheet({ id, tabId: `t-${id}`, title, layout: layout(id) });
  for (const [a1, cell] of Object.entries(cells)) {
    const key = cellKey(`${id}r${Number(a1.slice(1)) - 1}`, `${id}c${a1.charCodeAt(0) - 65}`);
    sheet.cells.set(key, {
      ...(cell.i ? { input: cell.i } : {}),
      ...(cell.f ? { format: cell.f } : {}),
    });
  }
  return sheet;
}

const wb = new Workbook({
  sheets: [
    sheetOf('s1', 'Sheet1', {
      A1: { i: { s: 'Docs' }, f: { ln: 'https://docs.nu/', b: true } },
      A2: { i: { n: 5 } },
      A3: { i: { f: { t: '1+1', r: [] } } },
      A4: { i: { s: 'To prices' }, f: { ln: '#gid=s2&range=B2:C4' } },
    }),
    sheetOf('s2', 'Price list', {}),
  ],
  locale: 'en-GB',
});
const place = { wb, sheetId: 's1', locale: 'en-GB' };
const sheets = [
  { id: 's1', title: 'Sheet1' },
  { id: 's2', title: 'Price list' },
];

describe('sheetLinkEditing', () => {
  it('opens on what the cell shows and its link, a sheet’s by name', () => {
    expect(sheetLinkEditing(place, { r: 0, c: 0 }, false)).toEqual({
      text: 'Docs',
      link: 'https://docs.nu/',
    });
    expect(sheetLinkEditing(place, { r: 3, c: 0 }, false)).toEqual({
      text: 'To prices',
      link: "'Price list'!B2:C4",
    });
    expect(sheetLinkEditing(place, { r: 1, c: 0 }, false)).toEqual({ text: '5', link: '' });
    expect(sheetLinkEditing(place, { r: 9, c: 5 }, false)).toEqual({ text: '', link: '' });
  });

  it('shows no Text on a formula’s cell or over more than one cell (D639)', () => {
    expect(sheetLinkEditing(place, { r: 2, c: 0 }, false).text).toBeNull();
    expect(sheetLinkEditing(place, { r: 0, c: 0 }, true)).toEqual({
      text: null,
      link: 'https://docs.nu/',
    });
    expect(sheetLinkEditing({ ...place, sheetId: 'gone' }, { r: 0, c: 0 }, false)).toEqual({
      text: '',
      link: '',
    });
  });
});

describe('sheetLinkAddress', () => {
  it('reads a range or sheet of the workbook, then a web, email or LiveDoc address', () => {
    expect(sheetLinkAddress("'Price list'!B2", sheets, 's1')).toEqual({
      href: '#gid=s2&range=B2',
    });
    expect(sheetLinkAddress('price list', sheets, 's1')).toEqual({ href: '#gid=s2' });
    expect(sheetLinkAddress('C3', sheets, 's1')).toEqual({ href: '#gid=s1&range=C3' });
    expect(sheetLinkAddress('docs.nu', sheets, 's1')).toEqual({ href: 'https://docs.nu' });
    expect(sheetLinkAddress('ada@example.com', sheets, 's1')).toEqual({
      href: 'mailto:ada@example.com',
    });
    expect(sheetLinkAddress('  ', sheets, 's1')).toEqual({ href: '' });
  });

  it('refuses another scheme and a place in a text document', () => {
    expect(sheetLinkAddress('javascript:alert(1)', sheets, 's1')).toEqual({
      problem: 'Use a web, email or LiveDoc address',
    });
    expect(sheetLinkAddress('#heading', sheets, 's1')).toEqual({
      problem: 'Use a web, email or LiveDoc address',
    });
  });
});

describe('sheetLinkOffers', () => {
  const documents = [
    { id: 'd1', name: 'Price notes', savedAt: 2 },
    { id: 'd2', name: '  ', savedAt: 1 },
  ];
  it('offers every sheet when nothing is typed', () => {
    expect(sheetLinkOffers('', wb, 's1', documents, 'https://docs.nu').map((o) => o.label)).toEqual(
      ['Sheet1', 'Price list'],
    );
  });

  it('offers a typed range first, then the sheets and documents holding the words', () => {
    expect(sheetLinkOffers('B2:C3', wb, 's1', documents, 'https://docs.nu')).toEqual([
      {
        group: 'range',
        key: 'r:#gid=s1&range=B2:C3',
        label: 'Sheet1!B2:C3',
        value: 'Sheet1!B2:C3',
      },
    ]);
    expect(sheetLinkOffers('price', wb, 's1', documents, 'https://docs.nu')).toEqual([
      { group: 'sheets', key: 's:s2', label: 'Price list', value: 'Price list' },
      {
        group: 'documents',
        key: 'd:d1',
        label: 'Price notes',
        value: 'https://docs.nu/document/d1',
      },
    ]);
    expect(sheetLinkOffers(' ', wb, 's1', [{ id: 'd2', name: ' ', savedAt: 1 }], 'o').length).toBe(
      2,
    );
  });
});

describe('sheetLinkWrite', () => {
  const opened = (r: number) => sheetLinkEditing(place, { r, c: 0 }, false);
  const one = (r: number) => [{ r1: r, c1: 0, r2: r, c2: 0 }];

  it('sets the link on every selected cell, its other formats kept by the patch', () => {
    const made = sheetLinkWrite(
      place,
      { r: 1, c: 0 },
      [{ r1: 1, c1: 0, r2: 2, c2: 1 }],
      { text: null, link: '' },
      {
        text: null,
        href: 'https://docs.nu/',
        shown: 'docs.nu',
      },
    );
    expect(made && 'write' in made && made.write.kind === 'cells' && made.write.cells).toEqual([
      { r: 's1r1', c: 's1c0', f: { ln: 'https://docs.nu/' } },
      { r: 's1r1', c: 's1c1', f: { ln: 'https://docs.nu/' } },
      { r: 's1r2', c: 's1c0', f: { ln: 'https://docs.nu/' } },
      { r: 's1r2', c: 's1c1', f: { ln: 'https://docs.nu/' } },
    ]);
  });

  it('types a changed Text into the cell with the link, one write', () => {
    const made = sheetLinkWrite(place, { r: 0, c: 0 }, one(0), opened(0), {
      text: 'LiveDoc',
      href: 'https://docs.nu/',
      shown: 'https://docs.nu/',
    });
    expect(made).toEqual({
      write: {
        kind: 'cells',
        cells: [{ r: 's1r0', c: 's1c0', i: { s: 'LiveDoc' }, f: { ln: 'https://docs.nu/' } }],
      },
    });
  });

  it('puts the address as typed into an empty cell given no Text, and takes a link off with none', () => {
    const made = sheetLinkWrite(place, { r: 8, c: 0 }, one(8), opened(8), {
      text: '',
      href: '#gid=s2',
      shown: 'Price list',
    });
    expect(made && 'write' in made && made.write.kind === 'cells' && made.write.cells[0]).toEqual({
      r: 's1r8',
      c: 's1c0',
      i: { s: 'Price list' },
      f: { ln: '#gid=s2' },
    });
    const off = sheetLinkWrite(place, { r: 0, c: 0 }, one(0), opened(0), {
      text: 'Docs',
      href: '',
      shown: '',
    });
    expect(off).toEqual({
      write: { kind: 'cells', cells: [{ r: 's1r0', c: 's1c0', f: { ln: null } }] },
    });
  });

  it('writes nothing on a sheet that is gone, and says a text the cell cannot take', () => {
    expect(
      sheetLinkWrite({ ...place, sheetId: 'gone' }, { r: 0, c: 0 }, one(0), opened(0), {
        text: 'x',
        href: '',
        shown: '',
      }),
    ).toBeNull();
    expect(
      sheetLinkWrite(place, { r: 0, c: 0 }, one(0), opened(0), {
        text: '=SUM(',
        href: 'https://docs.nu/',
        shown: '',
      }),
    ).toEqual({ problem: 'That text cannot go in the cell' });
  });
});

describe('Get Link to This Cell (D641)', () => {
  it('writes the range into the query and the tab into the fragment, and reads the range back', () => {
    const href = cellLinkAddress('https://docs.nu/document/d1', 'tab 1', {
      r1: 1,
      c1: 1,
      r2: 3,
      c2: 2,
    });
    expect(href).toBe('https://docs.nu/document/d1?range=B2:C4#t=tab%201');
    expect(rangeOfSearch(new URL(href).search)).toEqual({ r1: 1, c1: 1, r2: 3, c2: 2 });
    expect(rangeOfSearch('?s=code')).toBeNull();
    expect(rangeOfSearch('?range=nope')).toBeNull();
    expect(withoutRange('https://docs.nu/document/d1?s=c&range=A1#t=x')).toBe(
      '/document/d1?s=c#t=x',
    );
  });

  it('cuts a range to the sheet’s edge, none when it starts past it', () => {
    expect(rangeOnSheet({ r1: 8, c1: 4, r2: 20, c2: 20 }, 10, 6)).toEqual({
      r1: 8,
      c1: 4,
      r2: 9,
      c2: 5,
    });
    expect(rangeOnSheet({ r1: 10, c1: 0, r2: 12, c2: 0 }, 10, 6)).toBeNull();
    expect(rangeOnSheet({ r1: 0, c1: 6, r2: 0, c2: 7 }, 10, 6)).toBeNull();
  });
});
