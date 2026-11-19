// docs/specs/034-text-documents/text-document.md "The format it is in": a file keeps the format it arrived in (C1).
import { describe, expect, it } from 'vitest';
import { formatOfFileName, newTextDocumentTab } from './text-document-tab';

describe('formatOfFileName', () => {
  it('holds a Word file in OOXML and an OpenDocument file in ODF', () => {
    expect(formatOfFileName('Report.docx')).toBe('ooxml');
    expect(formatOfFileName('Letter.DOTX')).toBe('ooxml');
    expect(formatOfFileName('Notes.odt')).toBe('odf');
    expect(formatOfFileName('Notes.fodt')).toBe('odf');
  });
});

describe('newTextDocumentTab', () => {
  it('is born in ODF (C5) unless a file says otherwise', () => {
    expect(newTextDocumentTab('t', 'N').format).toBe('odf');
    expect(newTextDocumentTab('t', 'N', 'ooxml').format).toBe('ooxml');
  });
});
