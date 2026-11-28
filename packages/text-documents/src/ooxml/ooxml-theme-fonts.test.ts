// docs/specs/034-text-documents/standard-mapping.md "What the model holds", A theme's font: a Word document's body
// named by its theme reads as the theme's typeface, and leaves with it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from '../files';

const read = async (bytes: Uint8Array) => {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result.document;
};

describe('a Word theme’s fonts', () => {
  it('reads SampleDoc’s body, named by its theme, as Calibri, and writes it back so', async () => {
    const bytes = new Uint8Array(
      readFileSync(new URL('../../corpus/word/SampleDoc.docx', import.meta.url)),
    );
    const document = await read(bytes);
    expect(document.defaults.text.font).toBe('Calibri');
    const { bytes: written } = writeTextDocumentFile(document, 'docx');
    expect((await read(written)).defaults.text.font).toBe('Calibri');
    // Converted to OpenDocument, the font is named outright.
    const { bytes: odt } = writeTextDocumentFile(document, 'odt');
    expect((await read(odt)).defaults.text.font).toBe('Calibri');
  });
});
