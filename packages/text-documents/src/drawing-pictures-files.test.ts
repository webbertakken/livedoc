// docs/specs/034-text-documents/objects.md "In the file": a drawing's picture names its drawing tab,
// `livedoc:drawing="<tab id>"` on the ODF `draw:frame` and on the OOXML `pic:cNvPr`, `livedoc` declared ignorable on
// every part that may hold a picture; read back as written, in either format, header pictures included.
import { readOdfPackage, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Pictures } from './model/pictures';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { LO_FRAME, loOdt } from './testing/picture-files';

const decoder = new TextDecoder();
const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return written.bytes;
};
const drawingsOf = (document: TextDocument) =>
  Pictures.ofDocument(document).flatMap((p) => (p.drawing ? [p.drawing] : []));
const LIVEDOC = 'xmlns:livedoc="urn:livedoc:xmlns:text:1.0"';

describe("a drawing's picture in a file", () => {
  it.each(['docx', 'odt', 'fodt'] as const)(
    'reads back naming its drawing tab: %s',
    async (type) => {
      const original = CONSTRUCTS.pictures!(type === 'docx' ? 'ooxml' : 'odf');
      expect(drawingsOf(original)).toEqual(['drawing-1', 'drawing-2']);
      expect(drawingsOf(await read(write(original, type)))).toEqual(['drawing-1', 'drawing-2']);
    },
  );

  it('carries the name to the other format', async () => {
    const converted = convertTextDocument(CONSTRUCTS.pictures!('odf'), 'ooxml');
    expect(drawingsOf(await read(write(converted.document, 'docx')))).toEqual([
      'drawing-1',
      'drawing-2',
    ]);
  });

  it("names it on Word's pic:cNvPr, livedoc ignorable on the document and its header", async () => {
    const pkg = await readOoxmlPackage(
      new Uint8Array(write(CONSTRUCTS.pictures!('ooxml'), 'docx')),
    );
    if (!pkg.ok) throw new Error(pkg.rejection);
    const document = decoder.decode(pkg.package.parts.get('word/document.xml'));
    expect(document).toMatch(/<pic:cNvPr id="0" name="[^"]*" livedoc:drawing="drawing-1"\/>/);
    expect(document).toMatch(/mc:Ignorable="[^"]*\blivedoc\b/);
    const header = [...pkg.package.parts.entries()].find(([name]) => /header\d*\.xml$/.test(name));
    const headerXml = decoder.decode(header![1]);
    expect(headerXml).toContain(LIVEDOC);
    expect(headerXml).toContain('mc:Ignorable="livedoc"');
    expect(headerXml).toContain('livedoc:drawing="drawing-2"');
  });

  it("names it on LibreOffice's draw:frame, livedoc declared on the root", async () => {
    const pkg = await readOdfPackage(new Uint8Array(write(CONSTRUCTS.pictures!('odf'), 'odt')));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const content = decoder.decode(pkg.package.entries.get('content.xml'));
    expect(content).toMatch(/<draw:frame [^>]*livedoc:drawing="drawing-1">/);
    expect(content).toContain(LIVEDOC);
    const styles = decoder.decode(pkg.package.entries.get('styles.xml'));
    expect(styles).toMatch(/<draw:frame [^>]*livedoc:drawing="drawing-2">/);
    expect(styles).toContain(LIVEDOC);
  });

  it('reads a name on a frame LibreOffice kept, and an empty one as none', async () => {
    const named = await read(loOdt(LO_FRAME({ attrs: ` ${LIVEDOC} livedoc:drawing="tab-9"` })));
    expect(drawingsOf(named)).toEqual(['tab-9']);
    const empty = await read(loOdt(LO_FRAME({ attrs: ` ${LIVEDOC} livedoc:drawing=""` })));
    expect(Pictures.ofDocument(empty)).toHaveLength(1);
    expect(drawingsOf(empty)).toEqual([]);
  });
});
