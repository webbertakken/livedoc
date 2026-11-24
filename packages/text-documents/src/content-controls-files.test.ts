// docs/specs/034-text-documents/standard-mapping.md "Kept content", "Shown as it reads": a content control in a
// paragraph (a date picker, a dropdown, a chip) is kept whole and written back; it shows its text, and in ODF that text
// counts as characters for the white space after it.
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Inline, Paragraph } from './model/blocks';
import { keptShownText } from './live/kept-presence';
import { docx, W_P, W_R } from './testing/packages';

const ODF = (inner: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" office:mimetype="application/vnd.oasis.opendocument.text"><office:body><office:text>${inner}</office:text></office:body></office:document>`,
  );

const shape = (inlines: readonly Inline[]) =>
  inlines.map((i) =>
    i.type === 'run' ? i.text : i.type === 'kept' ? `[${keptShownText(i.name, i.xml.xml)}]` : '?',
  );

async function first(bytes: Uint8Array): Promise<Paragraph> {
  const read = await readTextDocumentFile(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read.document.body[0] as Paragraph;
}

describe('a content control in ODF', () => {
  it('is kept, shows its text, and keeps the space after it', async () => {
    const paragraph = await first(
      ODF(
        '<text:p>Due <loext:content-control loext:date="true">Nov 24</loext:content-control> ok <text:bookmark text:name="b"/> end</text:p>',
      ),
    );
    expect(shape(paragraph.inlines)).toEqual(['Due ', '[Nov 24]', ' ok ', '[null]', 'end']);
  });

  it('is written back whole', async () => {
    const read = await readTextDocumentFile(
      ODF(
        '<text:p>Due <loext:content-control loext:dropdown="true">Yes</loext:content-control></text:p>',
      ),
    );
    if (!read.ok) throw new Error(read.rejection);
    const written = writeTextDocumentFile(read.document, 'fodt');
    if (!written.ok) throw new Error(written.rejection);
    expect(new TextDecoder().decode(written.bytes)).toContain('loext:dropdown="true"');
  });
});

describe('a content control in OOXML', () => {
  it('is kept, shows its text, and is written back whole', async () => {
    const bytes = docx(
      W_P(
        `${W_R('Due ')}<w:sdt><w:sdtPr><w:date w:fullDate="2026-11-24T00:00:00Z"/></w:sdtPr><w:sdtContent>${W_R('Nov 24')}</w:sdtContent></w:sdt>${W_R(' ok')}`,
      ),
    );
    const read = await readTextDocumentFile(bytes);
    if (!read.ok) throw new Error(read.rejection);
    expect(shape((read.document.body[0] as Paragraph).inlines)).toEqual([
      'Due ',
      '[Nov 24]',
      ' ok',
    ]);
    const written = writeTextDocumentFile(read.document, 'docx');
    if (!written.ok) throw new Error(written.rejection);
    const again = await first(written.bytes);
    expect(shape(again.inlines)).toEqual(['Due ', '[Nov 24]', ' ok']);
  });
});
