// docs/specs/034-text-documents/text-document.md "The format it is in": a file keeps the format it arrived in (C1).
import { describe, expect, it } from 'vitest';
import { newTextDocumentTab } from './text-document-tab';

describe('newTextDocumentTab', () => {
  it('is born in ODF (C5) unless a file says otherwise', () => {
    expect(newTextDocumentTab('t', 'N').format).toBe('odf');
    expect(newTextDocumentTab('t', 'N', 'ooxml').format).toBe('ooxml');
  });
});
