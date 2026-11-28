import { describe, expect, it } from 'vitest';
import { CELL_LINK_MAX, cellLinkTarget, isCellLink, sheetLink, sheetLinkOf } from './cell-link';

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
