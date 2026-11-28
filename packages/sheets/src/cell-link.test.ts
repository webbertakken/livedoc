import { describe, expect, it } from 'vitest';
import {
  CELL_LINK_MAX,
  cellLinkTarget,
  isCellLink,
  sheetLink,
  sheetLinkOf,
  typedCellLink,
} from './cell-link';
import { cellLinkText } from './cell-link-text';

// docs/specs/029-sheets/inserted-objects.md "A cell's link" (D637): a web or email address, a LiveDoc document's, or a
// sheet or range of this workbook as Google writes one (`#gid=<sheet id>&range=<A1>`).

describe('sheetLink', () => {
  it('writes a sheet as #gid and a range after it', () => {
    expect(sheetLink('sheet0001')).toBe('#gid=sheet0001');
    expect(sheetLink('sheet0001', { r1: 1, c1: 1, r2: 3, c2: 2 })).toBe(
      '#gid=sheet0001&range=B2:C4',
    );
    expect(sheetLink('sheet0001', { r1: 0, c1: 0, r2: 0, c2: 0 })).toBe('#gid=sheet0001&range=A1');
  });
});

describe('sheetLinkOf', () => {
  it('reads a sheet and a range back', () => {
    expect(sheetLinkOf('#gid=sheet0001')).toEqual({ sheetId: 'sheet0001' });
    expect(sheetLinkOf('#gid=sheet0001&range=b2:c4')).toEqual({
      sheetId: 'sheet0001',
      range: { r1: 1, c1: 1, r2: 3, c2: 2 },
    });
  });

  it('is null for anything else', () => {
    for (const not of [
      'https://docs.nu',
      '#gid=',
      '#gid=a b',
      '#gid=s1&range=nope',
      '#gid=s1&range=A1&x=1',
      '#Sheet1.A1',
      'gid=s1',
    ])
      expect(sheetLinkOf(not), not).toBeNull();
  });
});

describe('isCellLink', () => {
  it('takes any text up to the most an address holds, without control characters', () => {
    expect(isCellLink('https://docs.nu')).toBe(true);
    expect(isCellLink('file:///kept/as/it/came')).toBe(true);
    expect(isCellLink('#gid=s1')).toBe(true);
    expect(isCellLink('x'.repeat(CELL_LINK_MAX))).toBe(true);
  });

  it('refuses empty, too long, control characters and non-text', () => {
    for (const bad of ['', ' ', 'x'.repeat(CELL_LINK_MAX + 1), 'a\nb', 'a\u0000b', 3, null])
      expect(isCellLink(bad), String(bad)).toBe(false);
  });
});

describe('cellLinkTarget', () => {
  it('opens web and email addresses and this workbook’s sheets and ranges', () => {
    expect(cellLinkTarget('https://docs.nu')).toEqual({ k: 'web', href: 'https://docs.nu/' });
    expect(cellLinkTarget('mailto:a@b.co')).toEqual({ k: 'web', href: 'mailto:a@b.co' });
    expect(cellLinkTarget('#gid=s1&range=A1')).toEqual({
      k: 'sheet',
      sheetId: 's1',
      range: { r1: 0, c1: 0, r2: 0, c2: 0 },
    });
  });

  it('opens nothing else: a file’s link of another scheme is kept, never opened', () => {
    for (const kept of ['file:///etc/passwd', 'javascript:alert(1)', '#Sheet1.A1', 'docs.nu'])
      expect(cellLinkTarget(kept), kept).toBeNull();
  });
});

describe('typedCellLink', () => {
  const sheets = [
    { id: 's1', title: 'Sheet1' },
    { id: 's2', title: "Ada's sheet" },
  ];
  it('reads a range of a sheet, of this sheet, and a sheet by its title', () => {
    expect(typedCellLink("'Ada''s sheet'!$B$2:C4", sheets, 's1')).toBe('#gid=s2&range=B2:C4');
    expect(typedCellLink("ada's sheet!A1", sheets, 's1')).toBe('#gid=s2&range=A1');
    expect(typedCellLink(' b2:c4 ', sheets, 's1')).toBe('#gid=s1&range=B2:C4');
    expect(typedCellLink('SHEET1', sheets, 's2')).toBe('#gid=s1');
  });

  it('reads an email and a web address', () => {
    expect(typedCellLink('ada@example.com', sheets, 's1')).toBe('mailto:ada@example.com');
    expect(typedCellLink('https://docs.nu', sheets, 's1')).toBe('https://docs.nu/');
    expect(typedCellLink('https://x.example/#!/a', sheets, 's1')).toBe('https://x.example/#!/a');
  });

  it('reads nothing else', () => {
    for (const not of [
      '',
      'docs.nu',
      'javascript:alert(1)',
      'Gone!A1',
      'Sheet1!nope',
      `https://docs.nu/${'a'.repeat(CELL_LINK_MAX)}`,
    ])
      expect(typedCellLink(not, sheets, 's1'), not).toBeNull();
  });
});

describe('cellLinkText', () => {
  const titleOf = (id: string) => (id === 's2' ? "Ada's sheet" : undefined);
  it('names a sheet of the workbook by its title, a range as a formula names one', () => {
    expect(cellLinkText('#gid=s2&range=B2:C4', titleOf)).toBe("'Ada''s sheet'!B2:C4");
    expect(cellLinkText('#gid=s2', titleOf)).toBe("Ada's sheet");
  });

  it('reads any other link as held', () => {
    expect(cellLinkText('#gid=gone', titleOf)).toBe('#gid=gone');
    expect(cellLinkText('https://docs.nu/', titleOf)).toBe('https://docs.nu/');
  });
});
