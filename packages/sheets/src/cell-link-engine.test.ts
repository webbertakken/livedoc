import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { renderWindow } from './engine/render';
import { findMatches, findPattern, type FindPattern } from './find';

// docs/specs/029-sheets/inserted-objects.md "A cell's link": held with the cell's format, drawn as a HYPERLINK's
// label is, winning over a HYPERLINK in the same cell (D638), and read by Also Search Within Links.

describe('a cell’s link in the engine', () => {
  it('opens a web address, a sheet or a range, and nothing for a kept link of another scheme', () => {
    const b = book({ A1: 'Web', A2: 'Range', A3: 'Kept', A4: 'Plain' });
    const id = b.sheets[0]!.id;
    b.format('A1', { ln: 'https://docs.nu' });
    b.format('A2', { ln: `#gid=${id}&range=B2:C3` });
    b.format('A3', { ln: 'file:///c/notes.txt' });
    expect(b.wb.linkTargetOf(id, 0, 0)).toEqual({ k: 'web', href: 'https://docs.nu/' });
    expect(b.wb.hyperlinkOf(id, 0, 0)).toBe('https://docs.nu/');
    expect(b.wb.linkTargetOf(id, 1, 0)).toEqual({
      k: 'sheet',
      sheetId: id,
      range: { r1: 1, c1: 1, r2: 2, c2: 2 },
    });
    // A sheet's link is no web address.
    expect(b.wb.hyperlinkOf(id, 1, 0)).toBeNull();
    expect(b.wb.cellLinkOf(id, 2, 0)).toBe('file:///c/notes.txt');
    expect(b.wb.linkTargetOf(id, 2, 0)).toBeNull();
    expect(b.wb.cellLinkOf(id, 3, 0)).toBeNull();
    expect(b.wb.linkTargetOf(id, 3, 0)).toBeNull();
    expect(b.wb.cellLinkOf('nosheet', 0, 0)).toBeNull();
  });

  it('wins over a HYPERLINK formula in the same cell (D638)', () => {
    const b = book({ A1: '=HYPERLINK("https://example.com", "Go")' });
    const id = b.sheets[0]!.id;
    expect(b.wb.hyperlinkOf(id, 0, 0)).toBe('https://example.com/');
    b.format('A1', { ln: 'https://docs.nu/' });
    expect(b.wb.hyperlinkOf(id, 0, 0)).toBe('https://docs.nu/');
  });

  it('draws as a link where the cell shows something', () => {
    const b = book({ A1: 'Web', A2: 'Sheet' });
    const id = b.sheets[0]!.id;
    b.format('A1', { ln: 'https://docs.nu' });
    b.format('A2', { ln: `#gid=${id}` });
    b.format('A3', { ln: 'https://docs.nu' });
    b.format('A4', { ln: 'file:///x' });
    const cells = renderWindow(b.wb, id, { width: 600, height: 200 }, 'en-GB')!.cells;
    const at = (r: number) => cells.find((x) => x.r === r && x.c === 0);
    expect(at(0)).toMatchObject({ link: 'https://docs.nu/', underline: true });
    expect(at(1)).toMatchObject({ link: `#gid=${id}`, underline: true });
    // Nothing shown, nothing drawn; a link that never opens draws plain.
    expect(at(2)?.link).toBeUndefined();
    expect(at(3)?.link).toBeUndefined();
  });

  it('is found by Also Search Within Links, its address as held', () => {
    const b = book({ A1: 'Docs', A2: 'Other' });
    const id = b.sheets[0]!.id;
    b.format('A1', { ln: 'https://docs.nu/page' });
    const place = { sheetId: id };
    const pattern = (inLinks: boolean) => findPattern('docs.nu', { inLinks }) as FindPattern;
    expect(findMatches(b.wb, place, pattern(true))).toEqual([{ r: 0, c: 0 }]);
    expect(findMatches(b.wb, place, pattern(false))).toEqual([]);
  });
});
