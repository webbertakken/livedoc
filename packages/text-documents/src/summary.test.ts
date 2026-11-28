// docs/specs/034-text-documents/links-and-navigation.md "The summary": trimmed, cut to the most, empty removing it; kept
// in the live state's metadata as one write outside the writing's undo; the file's description in both formats.
import { describe, expect, it } from 'vitest';
import { Summary, TEXT_DOCUMENT_SUMMARY_MAX } from './model/summary';
import { TextDocument } from './model/text-document';
import { TextDocumentState } from './text-document-state';
import { readTextDocumentFile, writeTextDocumentFile } from './files';

describe('Summary.held', () => {
  it('trims the text and keeps its line breaks', () => {
    expect(Summary.held('  What this is.\nWho reads it.  ')).toBe('What this is.\nWho reads it.');
  });

  it('cuts the text to the most, by character', () => {
    expect([...Summary.held('📌'.repeat(TEXT_DOCUMENT_SUMMARY_MAX + 5))]).toHaveLength(
      TEXT_DOCUMENT_SUMMARY_MAX,
    );
  });

  it('reads white space alone as none', () => {
    expect(Summary.held(' \n ')).toBe('');
  });
});

describe('TextDocumentState summary', () => {
  it('reads none from a new text document', () => {
    expect(TextDocumentState.summary(TextDocumentState.load())).toBe('');
  });

  it('writes the summary into the metadata, keeping its other fields', () => {
    const document = TextDocument.blank({ format: 'odf', title: 'Plan' });
    const live = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
    expect(TextDocumentState.setSummary(live, '  The plan.  ')).toBe(true);
    expect(TextDocumentState.summary(live)).toBe('The plan.');
    expect(TextDocumentState.document(live, 'odf').metadata).toEqual({
      title: 'Plan',
      description: 'The plan.',
    });
  });

  it('removes it when empty, and writes nothing when unchanged', () => {
    const doc = TextDocumentState.load();
    TextDocumentState.setSummary(doc, 'Notes');
    let writes = 0;
    doc.on('update', () => (writes += 1));
    expect(TextDocumentState.setSummary(doc, ' Notes ')).toBe(false);
    expect(writes).toBe(0);
    expect(TextDocumentState.setSummary(doc, '  ')).toBe(true);
    expect(TextDocumentState.summary(doc)).toBe('');
    expect('description' in TextDocumentState.document(doc, 'odf').metadata).toBe(false);
  });

  it.each(['odt', 'docx'] as const)(
    'leaves and arrives as the %s file’s description',
    async (type) => {
      const doc = TextDocumentState.load();
      TextDocumentState.setSummary(doc, 'Line one\nLine two');
      const format = type === 'odt' ? 'odf' : 'ooxml';
      const written = writeTextDocumentFile(TextDocumentState.document(doc, format), type);
      const read = await readTextDocumentFile(written.bytes);
      if (!read.ok) throw new Error(read.rejection);
      const back = TextDocumentState.load([TextDocumentState.fromDocument(read.document)]);
      expect(TextDocumentState.summary(back)).toBe('Line one\nLine two');
    },
  );
});
