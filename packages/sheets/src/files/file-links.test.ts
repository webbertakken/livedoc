import { describe, expect, it } from 'vitest';
import {
  fileLinkOf,
  linkFromFile,
  odfHref,
  odfHrefLink,
  xlsxLocation,
  xlsxLocationLink,
} from './file-links';

// docs/specs/029-sheets/standard-mapping.md "Links in the file" (D642).

const B2C3 = { r1: 1, c1: 1, r2: 2, c2: 2 };
const A1 = { r1: 0, c1: 0, r2: 0, c2: 0 };

describe('a link between the model and a file', () => {
  const titles: Record<string, string> = { s1: 'Sheet 2' };
  const titleOf = (id: string) => titles[id];
  it('names a sheet of the workbook by its title, its top left for a whole sheet', () => {
    expect(fileLinkOf('#gid=s1&range=B2:C3', titleOf)).toEqual({ sheet: 'Sheet 2', range: B2C3 });
    expect(fileLinkOf('#gid=s1', titleOf)).toEqual({ sheet: 'Sheet 2', range: A1 });
  });

  it('writes no link to a sheet that is gone, and any other link as it is', () => {
    expect(fileLinkOf('#gid=gone', titleOf)).toBeNull();
    expect(fileLinkOf('https://docs.nu/', titleOf)).toEqual({ href: 'https://docs.nu/' });
    expect(fileLinkOf('#Bookmark', titleOf)).toEqual({ href: '#Bookmark' });
  });

  it('reads a range back by its sheet’s id, none for a sheet not made', () => {
    const idOf = (t: string) => (t === 'Sheet 2' ? 's1' : undefined);
    expect(linkFromFile({ sheet: 'Sheet 2', range: B2C3 }, idOf)).toBe('#gid=s1&range=B2:C3');
    expect(linkFromFile({ sheet: 'Cut', range: A1 }, idOf)).toBeNull();
    expect(linkFromFile({ href: 'mailto:a@b.co' }, idOf)).toBe('mailto:a@b.co');
  });
});

describe('XLSX locations', () => {
  const known = (s: string) => ['Sheet1', 'Sheet 2', "Ada's", 'a!b'].includes(s);
  it('reads a sheet’s range, quoted or bare, with or without $', () => {
    expect(xlsxLocationLink("'Sheet 2'!B2:C3", known)).toEqual({ sheet: 'Sheet 2', range: B2C3 });
    expect(xlsxLocationLink('Sheet1!$A$1', known)).toEqual({ sheet: 'Sheet1', range: A1 });
    expect(xlsxLocationLink("'Ada''s'!A1", known)).toEqual({ sheet: "Ada's", range: A1 });
    expect(xlsxLocationLink("'a!b'!A1", known)).toEqual({ sheet: 'a!b', range: A1 });
    expect(xlsxLocationLink('a!b!A1', known)).toEqual({ sheet: 'a!b', range: A1 });
  });

  it('reads nothing else: a name, a sheet the file lacks, a broken quote', () => {
    for (const not of ['MyName', 'Gone!A1', "'Sheet 2!A1", "'Sheet 2'A1", 'Sheet1!nope', 'Sheet1!'])
      expect(xlsxLocationLink(not, known), not).toBeNull();
  });

  it('writes a range quoted as a formula quotes it', () => {
    expect(xlsxLocation({ sheet: 'Sheet 2', range: B2C3 })).toBe("'Sheet 2'!B2:C3");
    expect(xlsxLocation({ sheet: 'Sheet1', range: A1 })).toBe('Sheet1!A1');
  });
});

describe('ODF hrefs', () => {
  const known = (s: string) => ['Sheet1', 'Sheet 2', 'My.Sheet', "Ada's"].includes(s);
  it('reads LibreOffice’s forms', () => {
    expect(odfHrefLink("#'Sheet 2'.B2:C3", known)).toEqual({ sheet: 'Sheet 2', range: B2C3 });
    expect(odfHrefLink('#Sheet 2.B2:C3', known)).toEqual({ sheet: 'Sheet 2', range: B2C3 });
    expect(odfHrefLink('#Sheet1.A1', known)).toEqual({ sheet: 'Sheet1', range: A1 });
    expect(odfHrefLink('#$Sheet1.$A$1:Sheet1.$C$3', known)).toEqual({
      sheet: 'Sheet1',
      range: { r1: 0, c1: 0, r2: 2, c2: 2 },
    });
    expect(odfHrefLink('#My.Sheet.A1', known)).toEqual({ sheet: 'My.Sheet', range: A1 });
    expect(odfHrefLink("#'Ada''s'.A1", known)).toEqual({ sheet: "Ada's", range: A1 });
  });

  it('reads nothing else', () => {
    for (const not of ['https://docs.nu', '#Bookmark', '#Gone.A1', '#Sheet1.A1:B2:C3', '#Sheet1.x'])
      expect(odfHrefLink(not, known), not).toBeNull();
  });

  it('writes the sheet’s name quoted, as LibreOffice does', () => {
    expect(odfHref({ sheet: 'Sheet 2', range: B2C3 })).toBe("#'Sheet 2'.B2:C3");
    expect(odfHref({ sheet: "Ada's", range: A1 })).toBe("#'Ada''s'.A1");
  });
});
