import { describe, expect, it } from 'vitest';
import { isPresenceOpKind, parseTextDocumentCaret, TEXT_DOCUMENT_CARET_MAX_CHARS } from './index';

// docs/specs/034-text-documents/live-editing-and-storage.md "Presence": a caret travels as presence, its anchor and
// head as base64 relative positions, checked before anyone draws it.

describe('text-document-caret on the wire', () => {
  it('is presence: unordered, never logged or replayed', () => {
    expect(isPresenceOpKind('text-document-caret')).toBe(true);
  });

  it('keeps a selection, and a caret that left the writing', () => {
    expect(
      parseTextDocumentCaret({
        kind: 'text-document-caret',
        tabId: 't',
        anchor: 'AQID',
        head: 'BAU=',
      }),
    ).toEqual({ tabId: 't', anchor: 'AQID', head: 'BAU=' });
    expect(
      parseTextDocumentCaret({ kind: 'text-document-caret', tabId: 't', anchor: null }),
    ).toEqual({
      tabId: 't',
      anchor: null,
    });
  });

  it.each([
    null,
    'x',
    { anchor: null },
    { tabId: '', anchor: null },
    { tabId: 't', anchor: 'AQID' },
    { tabId: 't', anchor: 'AQID', head: 3 },
    { tabId: 't', anchor: 'not base64!', head: 'AQID' },
    { tabId: 't', anchor: 'A'.repeat(TEXT_DOCUMENT_CARET_MAX_CHARS + 1), head: 'AQID' },
    { tabId: 7, anchor: null },
  ])('refuses a malformed caret %#', (op) => {
    expect(parseTextDocumentCaret(op)).toBeNull();
  });
});
