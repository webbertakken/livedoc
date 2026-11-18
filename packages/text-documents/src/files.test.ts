import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { TextDocument, type TextDocumentFormat } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { modelOf } from './testing/compare';
import type { TextDocumentFileType } from './file-types';

const TYPES: [TextDocumentFormat, TextDocumentFileType][] = [
  ['odf', 'odt'],
  ['odf', 'fodt'],
  ['ooxml', 'docx'],
];

async function roundTrip(document: TextDocument, type: TextDocumentFileType) {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  const read = await readTextDocumentFile(written.bytes);
  if (!read.ok) throw new Error(read.rejection);
  return { read, bytes: written.bytes };
}

// docs/specs/034-text-documents/standard-mapping.md "The rule" and "What the model holds": every construct the model
// holds comes back equal, in either format.
describe('every construct, written and read back', () => {
  for (const [format, type] of TYPES)
    for (const [name, build] of Object.entries(CONSTRUCTS))
      it(`keeps ${name} in .${type}`, async () => {
        const document = build(format);
        const { read } = await roundTrip(document, type);
        expect(read.fileType).toBe(type);
        expect(read.document.format).toBe(format);
        expect(modelOf(read.document)).toEqual(modelOf(document));
        expect(read.report).toEqual({ dropped: [], kept: [] });
      });
});

// standard-mapping.md "The flat file": deterministic writing.
describe('writing', () => {
  it('gives the same bytes for the same document, and again after reading it back', async () => {
    for (const [format, type] of TYPES) {
      const document = CONSTRUCTS.lists!(format);
      const first = writeTextDocumentFile(document, type);
      expect(first).toEqual(writeTextDocumentFile(document, type));
      const { read } = await roundTrip(document, type);
      const second = writeTextDocumentFile(read.document, type);
      expect(second.ok && new TextDecoder().decode(second.bytes)).toBe(
        first.ok && new TextDecoder().decode(first.bytes),
      );
    }
  });

  it('refuses the other format, which only a conversion writes (C1)', () => {
    const odf = TextDocument.blank();
    expect(writeTextDocumentFile(odf, 'docx')).toEqual({
      ok: false,
      rejection: 'format_not_native',
    });
    expect(writeTextDocumentFile(TextDocument.blank({ format: 'ooxml' }), 'odt')).toEqual({
      ok: false,
      rejection: 'format_not_native',
    });
  });

  it('makes a new document ODF, one empty Normal text paragraph, Google’s styles', () => {
    const blank = TextDocument.blank({ paper: 'a4', title: 'T' });
    expect(blank.format).toBe('odf');
    expect(TextDocument.paragraphTexts(blank)).toEqual(['']);
    expect(blank.metadata).toEqual({ title: 'T' });
    expect(blank.section.setup.width).toBe(595.276);
    expect(TextDocument.fromTexts([]).body).toHaveLength(1);
    expect(TextDocument.characters(TextDocument.fromTexts(['ab', 'c']))).toBe(3);
  });
});
