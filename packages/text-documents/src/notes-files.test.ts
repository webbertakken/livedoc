// docs/specs/034-text-documents/page-layout.md "Footnotes", "In the file": a footnote as ODF's `text:note` of the
// footnote class and OOXML's `w:footnoteReference` into the footnotes part; endnotes, labelled citations and custom
// marks kept as the file has them.
import fs from 'node:fs';
import { readOoxmlPackage, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Note } from './model/blocks';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { docx, fodt, W_P, W_R } from './testing/packages';

const decoder = new TextDecoder();
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return written.bytes;
};

const read = async (bytes: Uint8Array) => {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
};

const notesOf = (document: TextDocument) =>
  document.body.flatMap((b) =>
    b.type === 'paragraph' ? b.inlines.filter((i): i is Note => i.type === 'note') : [],
  );
const noteTexts = (note: Note) =>
  note.blocks.flatMap((b) => (b.type === 'paragraph' ? [Paragraph.text(b)] : []));

async function parts(bytes: Uint8Array) {
  const pkg = await readOoxmlPackage(new Uint8Array(bytes));
  if (!pkg.ok) throw new Error(pkg.rejection);
  const text = (name: string) => {
    const data = pkg.package.parts.get(name);
    return data && decoder.decode(data);
  };
  return { pkg: pkg.package, text };
}

const FOOTNOTES_REL = `<Relationship Id="rId9" Type="${RELATIONSHIP_TYPES.footnotes}" Target="footnotes.xml"/>`;
const footnotesPart = (inner: string) => ({
  name: 'word/footnotes.xml',
  data: `<?xml version="1.0"?><w:footnotes xmlns:w="${W}">${inner}</w:footnotes>`,
});
const SEPARATORS =
  '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';

describe('footnotes in OpenDocument files', () => {
  it("reads LibreOffice's footnote as a note, written back as it came", async () => {
    const bytes = fs.readFileSync(new URL('../corpus/libreoffice/features.fodt', import.meta.url));
    const { document, report } = await read(new Uint8Array(bytes));
    const [note] = notesOf(document);
    expect(noteTexts(note!)).toEqual(['The note.']);
    expect(report.kept.map((k) => k.name)).not.toContain('note');
    const again = decoder.decode(write(document, 'fodt'));
    expect(again).toMatch(
      /<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1<\/text:note-citation><text:note-body><text:p[^>]*>The note\.<\/text:p><\/text:note-body><\/text:note>/,
    );
  });

  it('writes each note numbered in the order of its mark, its formatting around it', () => {
    const text = decoder.decode(write(CONSTRUCTS.footnotes!('odf'), 'fodt'));
    expect(text).toContain('<text:note-citation>1</text:note-citation>');
    expect(text).toContain('<text:note-citation>2</text:note-citation>');
    expect(text.indexOf('The source.')).toBeLessThan(text.indexOf('A second paragraph.'));
    expect(text).toMatch(/<text:span text:style-name="[^"]+"><text:note text:id="ftn2"/);
  });

  it('keeps an endnote, a labelled citation and a note in a header as the file has them', async () => {
    const { document } = await read(
      fodt(
        '<text:p>A<text:note text:id="e1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>End</text:p></text:note-body></text:note>' +
          '<text:note text:id="f1" text:note-class="footnote"><text:note-citation text:label="*">*</text:note-citation><text:note-body><text:p>Star</text:p></text:note-body></text:note></text:p>',
      ),
    );
    expect(notesOf(document)).toEqual([]);
    const [p] = document.body as Paragraph[];
    expect(p!.inlines.filter((i) => i.type === 'kept')).toHaveLength(2);
  });
});

describe('footnotes in Word files', () => {
  it('writes the marks, a footnotes part with Word’s separators and each note led by its number', async () => {
    const { pkg, text } = await parts(write(CONSTRUCTS.footnotes!('ooxml'), 'docx'));
    const main = text('word/document.xml')!;
    expect(main).toContain(
      '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r>',
    );
    expect(main).toContain(
      '<w:r><w:rPr><w:i/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="2"/></w:r>',
    );
    const footnotes = text('word/footnotes.xml')!;
    expect(footnotes).toContain('<w:footnote w:type="separator" w:id="-1">');
    expect(footnotes).toContain('<w:footnote w:type="continuationSeparator" w:id="0">');
    expect(footnotes).toMatch(
      /<w:footnote w:id="1"><w:p>(?:<w:pPr>.*?<\/w:pPr>)?<w:r><w:rPr><w:vertAlign w:val="superscript"\/><\/w:rPr><w:footnoteRef\/><\/w:r><w:r><w:t>The source\.<\/w:t><\/w:r><\/w:p><\/w:footnote>/,
    );
    expect(pkg.contentTypes.get('word/footnotes.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
    );
    expect(
      pkg.relationships
        .get('word/document.xml')!
        .filter((r) => r.type === RELATIONSHIP_TYPES.footnotes),
    ).toHaveLength(1);
    // The note's link lies in the footnotes part's own relationships.
    expect(pkg.relationships.get('word/footnotes.xml')).toEqual([
      expect.objectContaining({ target: 'https://example.com/note', external: true }),
    ]);
  });

  it("reads LibreOffice's footnote, its separators kept under their ids and the note numbered after them", async () => {
    const bytes = fs.readFileSync(new URL('../corpus/libreoffice/features.docx', import.meta.url));
    const { document } = await read(new Uint8Array(bytes));
    const [note] = notesOf(document);
    expect(noteTexts(note!)).toEqual(['The note.']);
    expect(note!.style).toBe('FootnoteReference');
    const footnotes = (await parts(write(document, 'docx'))).text('word/footnotes.xml')!;
    expect(footnotes.match(/<w:footnote /g)).toHaveLength(3);
    expect(footnotes).toContain('w:id="0" w:type="separator"');
    expect(footnotes).toContain('<w:footnote w:id="2">');
  });

  it('keeps a custom mark, its footnote kept in the part under its id', async () => {
    const { document } = await read(
      docx(
        W_P(
          `${W_R('A')}<w:r><w:footnoteReference w:customMarkFollows="1" w:id="1"/><w:t>*</w:t></w:r>` +
            '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="2"/></w:r>' +
            '<w:r><w:footnoteReference w:id="7"/></w:r>',
        ),
        {
          rels: FOOTNOTES_REL,
          entries: [
            footnotesPart(
              `${SEPARATORS}<w:footnote w:id="1"><w:p>${W_R('Custom')}</w:p></w:footnote><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r>${W_R(' Own')}</w:p></w:footnote>`,
            ),
          ],
        },
      ),
    );
    const notes = notesOf(document);
    expect(notes.map(noteTexts)).toEqual([[' Own']]);
    // The mark's superscript is every mark's: not its own formatting.
    expect(notes[0]!.props).toEqual({});
    const [p] = document.body as Paragraph[];
    expect(
      p!.inlines.filter((i) => i.type === 'kept').map((i) => i.type === 'kept' && i.name),
    ).toEqual(['footnoteReference', 'footnoteReference']);
    const footnotes = (await parts(write(document, 'docx'))).text('word/footnotes.xml')!;
    expect(footnotes).toContain(
      '<w:footnote w:id="1"><w:p><w:r><w:t xml:space="preserve">Custom</w:t></w:r></w:p></w:footnote>',
    );
    expect(footnotes).toContain('<w:footnote w:id="2">');
    const back = await read(write(document, 'docx'));
    expect(notesOf(back.document).map(noteTexts)).toEqual([[' Own']]);
  });

  it('reads a table in a note, and writes a note opening with one under a paragraph holding its number', async () => {
    const { document, report } = await read(
      docx(W_P(`${W_R('A')}<w:r><w:footnoteReference w:id="1"/></w:r>`), {
        rels: FOOTNOTES_REL,
        entries: [
          footnotesPart(
            `${SEPARATORS}<w:footnote w:id="1"><w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl><w:p><w:proofErr w:type="spellStart"/>${W_R('After')}</w:p></w:footnote>`,
          ),
        ],
      }),
    );
    const [note] = notesOf(document);
    expect(note!.blocks.map((b) => b.type)).toEqual(['table', 'paragraph']);
    expect(report.dropped.map((d) => d.name)).toContain('proofErr');
    const footnotes = (await parts(write(document, 'docx'))).text('word/footnotes.xml')!;
    expect(footnotes).toMatch(
      /<w:footnote w:id="1"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"\/><\/w:rPr><w:footnoteRef\/><\/w:r><\/w:p><w:tbl>/,
    );
  });

  it('takes the footnotes part and its relationship away when nothing names a footnote', async () => {
    const { document } = await read(
      docx(W_P(W_R('Plain')), { rels: FOOTNOTES_REL, entries: [footnotesPart('')] }),
    );
    const { pkg } = await parts(write(document, 'docx'));
    expect(pkg.parts.has('word/footnotes.xml')).toBe(false);
    expect(
      pkg.relationships
        .get('word/document.xml')!
        .some((r) => r.type === RELATIONSHIP_TYPES.footnotes),
    ).toBe(false);
  });

  it('converts notes both ways, holding the same writing', async () => {
    const odf = CONSTRUCTS.footnotes!('odf');
    const back = await read(write(odf, 'odt'));
    expect(notesOf(back.document).map(noteTexts)).toEqual(notesOf(odf).map(noteTexts));
  });
});
