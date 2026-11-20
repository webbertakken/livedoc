import { describe, expect, it } from 'vitest';
import { downloadFileName } from './file-name';

// docs/specs/029-sheets/files-and-print.md, docs/specs/034-text-documents/files-and-print.md: a downloaded file is
// named after its document, safe in a file system and a Content-Disposition header.
describe('downloadFileName', () => {
  it("names the file after the document, with its format's extension", () => {
    expect(downloadFileName('Q3 Budget', 'ods', 'Untitled')).toBe('Q3 Budget.ods');
  });

  it('mends what a file name or header cannot carry', () => {
    expect(downloadFileName('Q3 / "Budget"\u0007: v2', 'fods', 'Untitled')).toBe(
      'Q3 Budget v2.fods',
    );
    expect(downloadFileName('x'.repeat(200), 'ods', 'Untitled')).toBe(`${'x'.repeat(120)}.ods`);
  });

  it('falls back when nothing of the name is left', () => {
    expect(downloadFileName(' / ', 'odt', 'Untitled spreadsheet')).toBe('Untitled spreadsheet.odt');
  });
});
