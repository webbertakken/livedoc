// docs/specs/034-text-documents/page-layout.md "Page numbers", "In the file": a page number and a page count as each
// format's fields, the text last drawn inside; a section's start as ODF's `style:page-number` on its first paragraph
// and OOXML's `w:pgNumType` `w:start`; a field in another form kept as the file has it.
import fs from 'node:fs';
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Field, type SectionBreak } from './model/blocks';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { docx, fodt, W_P, W_R } from './testing/packages';

const decoder = new TextDecoder();

const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  return written.bytes;
};

const read = async (bytes: Uint8Array) => {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
};

const paragraphs = (document: TextDocument) =>
  document.body.filter((b): b is Paragraph => b.type === 'paragraph');
const fieldsOf = (p: Paragraph) => p.inlines.filter((i): i is Field => i.type === 'field');

async function mainPart(bytes: Uint8Array): Promise<string> {
  const read = await readOoxmlPackage(new Uint8Array(bytes));
  if (!read.ok) throw new Error(read.rejection);
  return decoder.decode(read.package.parts.get('word/document.xml'));
}

describe('page numbers in OpenDocument files', () => {
  it("reads LibreOffice's header page number as a field, written back as it came", async () => {
    const bytes = fs.readFileSync(new URL('../corpus/libreoffice/features.fodt', import.meta.url));
    const { document } = await read(new Uint8Array(bytes));
    const header = document.section.headers!.header!.default!.blocks[0] as Paragraph;
    expect(fieldsOf(header)).toEqual([
      { type: 'field', field: 'page-number', text: '0', props: {} },
    ]);
    expect(Paragraph.text(header)).toBe('Header text 0');
    // `style:page-number="auto"` continues the numbering.
    expect(document.section.numberStart).toBeUndefined();
    const again = decoder.decode(write(document, 'fodt'));
    expect(again).toContain('<text:page-number text:select-page="current">0</text:page-number>');
    expect(again).toContain('style:page-number="auto"');
  });

  it('writes the fields and each section’s start', () => {
    const text = decoder.decode(write(CONSTRUCTS.fields!('odf'), 'fodt'));
    expect(text).toContain('<text:page-count>2</text:page-count>');
    expect(text).toContain('<text:page-number text:select-page="current">1</text:page-number>');
    expect(text).toMatch(
      /style:master-page-name="[^"]+"[^>]*>\s*<style:paragraph-properties[^>]*style:page-number="2"/,
    );
    expect(text).toMatch(/style:page-number="1"/);
  });

  it('keeps a page number in another form as the file has it', async () => {
    const { document } = await read(
      fodt(
        '<text:p xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">A <text:page-number text:select-page="next" style:num-format="i">ii</text:page-number> and <text:page-count style:num-format="A">B</text:page-count></text:p>',
      ),
    );
    const [p] = paragraphs(document);
    expect(fieldsOf(p!)).toEqual([]);
    expect(
      p!.inlines.filter((i) => i.type === 'kept').map((i) => i.type === 'kept' && i.name),
    ).toEqual(['page-number', 'page-count']);
  });
});

describe('page numbers in Word files', () => {
  it('reads a simple field and a complex one, keeping the result’s formatting', async () => {
    const { document } = await read(
      docx(
        W_P(
          `${W_R('Page ')}<w:fldSimple w:instr=" PAGE   \\* MERGEFORMAT "><w:r><w:rPr><w:b/></w:rPr><w:t>3</w:t></w:r></w:fldSimple>${W_R(' of ')}` +
            '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>' +
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>',
        ),
      ),
    );
    const [p] = paragraphs(document);
    expect(p!.inlines).toMatchObject([
      { type: 'run', text: 'Page ', props: {} },
      { type: 'field', field: 'page-number', text: '3', props: { bold: true } },
      { type: 'run', text: ' of ', props: {} },
      { type: 'field', field: 'page-count', text: '9', props: { italic: true } },
    ]);
  });

  it('leaves a field in another form as it reads today', async () => {
    const { document } = await read(
      docx(W_P('<w:fldSimple w:instr=" PAGE \\* roman "><w:r><w:t>iii</w:t></w:r></w:fldSimple>')),
    );
    const [p] = paragraphs(document);
    expect(fieldsOf(p!)).toEqual([]);
    expect(p!.inlines).toMatchObject([{ type: 'kept', name: 'fldSimple' }]);
  });

  it('writes the fields as simple fields and a section’s start into its page numbering', async () => {
    const xml = await mainPart(write(CONSTRUCTS.fields!('ooxml'), 'docx'));
    expect(xml).toContain(
      '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:rPr><w:i/></w:rPr><w:t>2</w:t></w:r></w:fldSimple>',
    );
    expect(xml).toMatch(/<w:pgNumType w:start="2"\/>/);
  });

  it('reads a section’s start, keeping its number format when the start changes', async () => {
    const { document } = await read(
      docx(
        `${W_P(W_R('One'))}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgNumType w:fmt="lowerRoman" w:start="3"/></w:sectPr>`,
      ),
    );
    expect(document.section.numberStart).toBe(3);
    const changed: TextDocument = { ...document, section: { ...document.section, numberStart: 4 } };
    const xml = await mainPart(write(changed, 'docx'));
    expect(xml).toMatch(/<w:pgNumType w:fmt="lowerRoman" w:start="4"\/>/);
    const back = await read(write(changed, 'docx'));
    expect(back.document.section.numberStart).toBe(4);
    const sections = back.document.body.filter((b): b is SectionBreak => b.type === 'section');
    expect(sections).toEqual([]);
  });
});
