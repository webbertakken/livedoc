// docs/specs/034-text-documents/page-layout.md "Headers and footers", "In the file" (OOXML): a section's default, first
// and even headers and footers as header and footer parts, a missing reference linked to the previous section's,
// Different first page as `w:titlePg`, Different odd and even as the settings' `w:evenAndOddHeaders`, the margins as
// `w:pgMar`'s, a header part a file brought written back under its name and never twice, a missing part reported.
import { readOoxmlPackage, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { Paragraph, type Block, type SectionBreak } from './model/blocks';
import type { HeaderFooter, SectionHeaders } from './model/headers';
import { TextDocument } from './model/text-document';
import { docx } from './testing/packages';
import { CONSTRUCTS } from './testing/constructs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const decoder = new TextDecoder();

const write = (document: TextDocument) => {
  const written = writeTextDocumentFile(document, 'docx');
  if (!written.ok) throw new Error(written.rejection);
  return written.bytes;
};

const read = async (bytes: Uint8Array) => {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
};

const of = (text: string): HeaderFooter => ({ blocks: [Paragraph.of(text, 'Normal')] });
const textOf = (h: HeaderFooter | undefined) =>
  h?.blocks.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : `[${b.type}]`)).join('|');
const sections = (document: TextDocument) =>
  document.body.filter((b): b is SectionBreak => b.type === 'section');

async function partsOf(bytes: Uint8Array) {
  const read = await readOoxmlPackage(new Uint8Array(bytes));
  if (!read.ok) throw new Error(read.rejection);
  return read.package;
}

describe('headers and footers in Word files', () => {
  it('writes default, first and even headers and footers with the margins, and reads them back', async () => {
    const blank = TextDocument.fromTexts(['One', 'Two'], { format: 'ooxml' });
    const [one, two] = blank.body as Paragraph[];
    const headers: SectionHeaders = {
      header: { default: of('Head'), first: of('Cover'), even: of('Even head') },
      footer: { default: of('Foot') },
      differentFirst: true,
      differentOddEven: true,
    };
    const second: SectionHeaders = { header: { default: of('Second head') } };
    const margins = { ...blank.section.setup.margins, header: 30, footer: 24 };
    const body: Block[] = [
      one!,
      { type: 'section', start: 'next-page', setup: blank.section.setup, headers: second },
      two!,
    ];
    const document: TextDocument = {
      ...blank,
      section: { ...blank.section, setup: { ...blank.section.setup, margins }, headers },
      body,
    };
    const bytes = write(document);
    const back = (await read(bytes)).document;

    const first = back.section.headers!;
    expect(textOf(first.header?.default)).toBe('Head');
    expect(textOf(first.header?.first)).toBe('Cover');
    expect(textOf(first.header?.even)).toBe('Even head');
    expect(textOf(first.footer?.default)).toBe('Foot');
    expect(first.differentFirst).toBe(true);
    expect(first.differentOddEven).toBe(true);
    expect(back.section.setup.margins).toMatchObject({ header: 30, footer: 24 });

    // The second section made only its default header its own: the rest linked, every section odd and even (Word's).
    const later = sections(back)[0]!.headers!;
    expect(textOf(later.header?.default)).toBe('Second head');
    expect(later.header?.first).toBeUndefined();
    // Its odd and even pages show its default: Word reads the even pages' own, so its default is written as its even.
    expect(later.footer?.default).toBeUndefined();
    expect(textOf(later.footer?.even)).toBe('Foot');
    expect(later.differentFirst).toBeUndefined();
    expect(later.differentOddEven).toBe(true);

    const pkg = await partsOf(bytes);
    const settings = decoder.decode(pkg.parts.get('word/settings.xml'));
    expect(settings).toContain('<w:evenAndOddHeaders/>');
    const main = decoder.decode(pkg.parts.get('word/document.xml'));
    expect(main).toContain('<w:titlePg/>');
    expect(main).toMatch(/w:header="600"/);
    const headerRels = (pkg.relationships.get('word/document.xml') ?? []).filter(
      (r) => r.type === RELATIONSHIP_TYPES.header,
    );
    // Four header parts: the first section's three and the second's own default, also its even one.
    expect(headerRels).toHaveLength(4);
    expect(main.match(/<w:headerReference/g)).toHaveLength(5);
  });

  it('writes a section without odd and even its default header as its even one, when another section has it', async () => {
    const blank = TextDocument.fromTexts(['One', 'Two'], { format: 'ooxml' });
    const [one, two] = blank.body as Paragraph[];
    const document: TextDocument = {
      ...blank,
      section: { ...blank.section, headers: { header: { default: of('Plain') } } },
      body: [
        one!,
        {
          type: 'section',
          start: 'next-page',
          setup: blank.section.setup,
          headers: { header: { default: of('Odd'), even: of('Even') }, differentOddEven: true },
        },
        two!,
      ],
    };
    const back = (await read(write(document))).document;
    expect(textOf(back.section.headers?.header?.even)).toBe('Plain');
    expect(textOf(sections(back)[0]!.headers?.header?.even)).toBe('Even');
  });

  it('writes a link inside a header to the header part’s own relationships', async () => {
    const blank = TextDocument.blank({ format: 'ooxml' });
    const linked: Paragraph = {
      type: 'paragraph',
      style: 'Normal',
      props: {},
      inlines: [{ type: 'run', text: 'Site', props: {}, link: 'https://docs.nu/' }],
    };
    const bytes = write({
      ...blank,
      section: { ...blank.section, headers: { header: { default: { blocks: [linked] } } } },
    });
    const pkg = await partsOf(bytes);
    const name = [...pkg.parts.keys()].find((n) => /^word\/header\d+\.xml$/.test(n))!;
    expect(
      (pkg.relationships.get(name) ?? []).some(
        (r) => r.type === RELATIONSHIP_TYPES.hyperlink && r.target === 'https://docs.nu/',
      ),
    ).toBe(true);
    const back = (await read(bytes)).document;
    const p = back.section.headers!.header!.default!.blocks[0] as Paragraph;
    expect(p.inlines[0]).toMatchObject({ text: 'Site', link: 'https://docs.nu/' });
  });

  it("reads a Word file's headers per section and writes each header part back once, under its name", async () => {
    const fs = await import('node:fs');
    const bytes = new Uint8Array(
      fs.readFileSync(new URL('../corpus/word/Headers.docx', import.meta.url)),
    );
    const { document } = await read(bytes);
    expect(textOf(document.section.headers?.header?.default)).toMatch(/^Section 1/);
    expect(document.section.setup.margins.header).toBeCloseTo(35.4, 1);
    const [s2, s3] = sections(document);
    expect(textOf(s2!.headers?.header?.default)).toMatch(/^Section 2/);
    expect(textOf(s3!.headers?.header?.default)).toMatch(/^Section 3/);

    const pkg = await partsOf(write(document));
    const headerParts = [...pkg.parts.keys()].filter((n) => /header/.test(n));
    expect(headerParts.sort()).toEqual([
      'word/header1.xml',
      'word/header2.xml',
      'word/header3.xml',
    ]);
    const again = (await read(write(document))).document;
    expect(textOf(again.section.headers?.header?.default)).toBe(
      textOf(document.section.headers?.header?.default),
    );
  });

  it('reads a reference to a missing part as no header, reported', async () => {
    const result = await read(
      docx(
        `<w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rId9"/></w:sectPr>`,
        {
          rels: `<Relationship Id="rId9" Type="${R}/header" Target="header9.xml"/>`,
        },
      ),
    );
    expect(result.document.section.headers?.header?.default).toBeUndefined();
    expect(result.report.dropped).toContainEqual({
      reason: 'header-footer',
      name: 'header',
      count: 1,
    });
  });

  it('reads a header part shared by two sections into both', async () => {
    const hdr = `<?xml version="1.0"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Shared</w:t></w:r></w:p></w:hdr>`;
    const ref = `<w:headerReference w:type="default" r:id="rId9"/>`;
    const result = await read(
      docx(
        `<w:p><w:pPr><w:sectPr>${ref}</w:sectPr></w:pPr></w:p><w:p/><w:sectPr>${ref}</w:sectPr>`,
        {
          rels: `<Relationship Id="rId9" Type="${R}/header" Target="header1.xml"/>`,
          entries: [{ name: 'word/header1.xml', data: hdr }],
        },
      ),
    );
    expect(textOf(result.document.section.headers?.header?.default)).toBe('Shared');
    expect(textOf(sections(result.document)[0]!.headers?.header?.default)).toBe('Shared');
    const pkg = await partsOf(write(result.document));
    expect([...pkg.parts.keys()].filter((n) => /header/.test(n))).toEqual(['word/header1.xml']);
  });

  it('keeps a table in a header as kept content and drops its proofing marks, reported', async () => {
    const hdr = `<?xml version="1.0"?><w:hdr xmlns:w="${W}"><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl><w:p><w:proofErr w:type="spellStart"/><w:r><w:t>Hed</w:t></w:r></w:p><w:proofErr w:type="spellEnd"/></w:hdr>`;
    const result = await read(
      docx(`<w:p/><w:sectPr><w:headerReference w:type="default" r:id="rId9"/></w:sectPr>`, {
        rels: `<Relationship Id="rId9" Type="${R}/header" Target="header1.xml"/>`,
        entries: [{ name: 'word/header1.xml', data: hdr }],
      }),
    );
    expect(textOf(result.document.section.headers?.header?.default)).toBe('[kept]|Hed');
    expect(result.report.kept).toContainEqual({ name: 'tbl', count: 1 });
    const back = (await read(write(result.document))).document;
    expect(textOf(back.section.headers?.header?.default)).toBe('[kept]|Hed');
  });

  it('reads a reference whose part is a footer where a header belongs as no header', async () => {
    const ftr = `<?xml version="1.0"?><w:ftr xmlns:w="${W}"><w:p/></w:ftr>`;
    const result = await read(
      docx(
        `<w:p/><w:sectPr><w:headerReference w:type="default" r:id="rId9"/><w:headerReference w:type="odd" r:id="rId9"/></w:sectPr>`,
        {
          rels: `<Relationship Id="rId9" Type="${R}/header" Target="footer1.xml"/>`,
          entries: [{ name: 'word/footer1.xml', data: ftr }],
        },
      ),
    );
    expect(result.document.section.headers).toBeUndefined();
    expect(result.report.dropped).toContainEqual({
      reason: 'header-footer',
      name: 'header',
      count: 1,
    });
  });
});

// "In the file" (ODF): a master page's header, header-first and header-left, linked when the previous section's.
describe('headers and footers in OpenDocument files', () => {
  it("reads LibreOffice's header, its field kept, and the body's top under it", async () => {
    const fs = await import('node:fs');
    const bytes = new Uint8Array(
      fs.readFileSync(new URL('../corpus/libreoffice/features.fodt', import.meta.url)),
    );
    const { document } = await read(bytes);
    const header = document.section.headers!.header!.default!;
    expect(textOf(header)).toBe('Header text ');
    const p = header.blocks[0] as Paragraph;
    expect(p.inlines.some((i) => i.type === 'kept' && i.name === 'page-number')).toBe(true);
    expect(document.section.setup.margins.header).toBe(72);
    expect(document.section.setup.margins.top).toBeCloseTo(86.148, 2);
    // The landscape section's master page has no header: it shows none of its own, as LibreOffice draws it.
    const landscape = sections(document).find((s) => s.setup.orientation === 'landscape')!;
    expect(landscape.headers?.header?.default).toEqual({ blocks: [] });
  });

  it('reads a kind without an even element as showing its default on even pages, as ODF does', async () => {
    const odf = CONSTRUCTS.headers!('odf');
    const written = writeTextDocumentFile(odf, 'fodt');
    if (!written.ok) throw new Error(written.rejection);
    // As LibreOffice writes it: no footer-left, so even pages show the footer.
    const text = new TextDecoder()
      .decode(written.bytes)
      .replace('<style:footer-left><text:p/></style:footer-left>', '');
    const { document } = await read(new TextEncoder().encode(text));
    const footer = document.section.headers!.footer!;
    expect(footer.even).toBe(footer.default);
  });

  it.each(['odt', 'fodt'] as const)(
    'writes a section linking its header into its own master page, read back as linked (%s)',
    async (type) => {
      const document = CONSTRUCTS.headers!('odf');
      const written = writeTextDocumentFile(document, type);
      if (!written.ok) throw new Error(written.rejection);
      const back = (await read(written.bytes)).document;
      const later = sections(back)[0]!.headers!;
      expect(textOf(later.header?.default)).toBe('Second section header');
      expect(later.header?.even).toBeUndefined();
      expect(later.footer).toBeUndefined();
      expect(back.section.setup.margins).toMatchObject({ header: 24, footer: 30 });
    },
  );
});
