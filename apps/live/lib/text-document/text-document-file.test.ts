import { describe, expect, it } from 'vitest';
import {
  Body,
  readTextDocumentFile,
  TextDocument,
  TextDocumentState,
} from '@livedoc/text-documents';
import { textDocumentFileOf } from './text-document-file';

// docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This Browser": Download writes the
// file here, from the state, as the room would.
describe('textDocumentFileOf', () => {
  it('writes the file in the format the text document is held in, named after it', async () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Written here'))]);
    for (const [format, name] of [
      ['odf', 'Notes.odt'],
      ['ooxml', 'Notes.docx'],
    ] as const) {
      const { blob, fileName } = textDocumentFileOf(doc, format, 'Notes');
      expect(fileName).toBe(name);
      const read = await readTextDocumentFile(new Uint8Array(await blob.arrayBuffer()));
      if (!read.ok) throw new Error('unreadable');
      expect(TextDocument.paragraphTexts(read.document)).toEqual(['Written here']);
      expect(read.document.metadata.title).toBe('Notes');
    }
  });
  it('writes an OpenDocument text document as a flat file when asked', async () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Flat'))]);
    const { blob, fileName } = textDocumentFileOf(doc, 'odf', 'Notes', 'fodt');
    expect(fileName).toBe('Notes.fodt');
    expect(blob.type).toBe('application/vnd.oasis.opendocument.text-flat-xml');
    const read = await readTextDocumentFile(new Uint8Array(await blob.arrayBuffer()));
    if (!read.ok) throw new Error('unreadable');
    expect(TextDocument.paragraphTexts(read.document)).toEqual(['Flat']);
  });

  it('refuses a file of the other format: that is a conversion', () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('x'))]);
    expect(() => textDocumentFileOf(doc, 'odf', 'Notes', 'docx')).toThrow(/format_not_native/);
  });
});
