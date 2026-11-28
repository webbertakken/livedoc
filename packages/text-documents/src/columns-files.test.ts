// docs/specs/034-text-documents/page-layout.md "Columns": a section's count, gap and line between written to both
// formats and read back; a kept region's style keeps all but its columns; unequal widths read as equal and reported.
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it, vi } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Block, type SectionBreak } from './model/blocks';
import { PageSetup } from './model/sections';
import { TextDocument } from './model/text-document';
import { odfSectionRegion } from './odf/odf-region';
import { readSection } from './ooxml/ooxml-props';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const encoder = new TextEncoder();

const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return written.bytes;
};

const read = async (bytes: Uint8Array) => {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result;
};

const sections = (document: TextDocument) =>
  document.body.filter((b): b is SectionBreak => b.type === 'section');

describe('columns in files', () => {
  it.each(['odt', 'fodt', 'docx'] as const)(
    'writes the first section and a continuous section with their columns and line, and reads them back (%s)',
    async (type) => {
      const format = type === 'docx' ? 'ooxml' : 'odf';
      const blank = TextDocument.fromTexts(['One', 'Two', 'Three'], { format });
      const [one, two, three] = blank.body as Paragraph[];
      const region = format === 'odf' ? { region: odfSectionRegion([]) } : {};
      const three20 = { ...blank.section.setup, columns: { count: 3, gap: 20 } };
      const body: Block[] = [
        one!,
        { type: 'section', start: 'continuous', setup: three20, ...region },
        two!,
        { type: 'section', start: 'continuous', setup: blank.section.setup, ...region },
        three!,
      ];
      const first = {
        ...blank.section.setup,
        columns: { count: 2, gap: 36, separator: true as const },
      };
      const back = (
        await read(write({ ...blank, section: { ...blank.section, setup: first }, body }, type))
      ).document;
      expect(back.section.setup.columns).toEqual({ count: 2, gap: 36, separator: true });
      expect(sections(back)[0]!.setup.columns).toEqual({ count: 3, gap: 20 });
      expect(
        back.body.filter((b): b is Paragraph => b.type === 'paragraph').map(Paragraph.text),
      ).toEqual(['One', 'Two', 'Three']);
    },
  );

  it('reads a LibreOffice section gap in its unit and keeps equal halves unreported', async () => {
    const fodt = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../corpus/libreoffice/features.fodt', import.meta.url)),
    );
    const result = await read(new Uint8Array(fodt));
    const columns = sections(result.document).find((s) => s.setup.columns)?.setup.columns;
    expect(columns).toEqual({ count: 2, gap: 36 });
    expect(result.report.dropped.some((d) => d.reason === 'column-width')).toBe(false);
  });

  it('writes a kept region whose columns changed with a copy of its style, keeping its other properties', async () => {
    const fodt = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../corpus/libreoffice/features.fodt', import.meta.url), 'utf8'),
    );
    const { document } = await read(encoder.encode(fodt));
    const body = document.body.map((b) =>
      b.type === 'section' && b.setup.columns
        ? { ...b, setup: { ...b.setup, columns: { count: 3, gap: 18, separator: true as const } } }
        : b,
    );
    const bytes = write({ ...document, body }, 'fodt');
    const xml = new TextDecoder().decode(bytes);
    const name = xml.match(/<text:section text:style-name="([^"]+)" text:name="Columns"/)?.[1];
    expect(name).toMatch(/^LDS/);
    const style = xml.match(
      new RegExp(`<style:style style:name="${name}"[\\s\\S]*?</style:style>`),
    )?.[0];
    expect(style).toContain('style:editable="false"');
    expect(style).toContain('fo:column-count="3"');
    expect(style).toContain('<style:column-sep');
    expect(style).not.toContain('rel-width');
    const back = sections((await read(bytes)).document).find((s) => s.setup.columns);
    expect(back?.setup.columns).toEqual({ count: 3, gap: 18, separator: true });
  });

  it('writes a kept region with its own style while its columns stay', async () => {
    const fodt = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../corpus/libreoffice/features.fodt', import.meta.url), 'utf8'),
    );
    const { document } = await read(encoder.encode(fodt));
    const xml = new TextDecoder().decode(write(document, 'fodt'));
    expect(xml).toMatch(/<text:section text:style-name="Sect1" text:name="Columns"/);
  });

  it('reads columns of unequal widths as equal and reports them, in both formats; w:sep on as true', async () => {
    const blank = TextDocument.fromTexts(['One'], { format: 'odf' });
    const odfBytes = write(
      {
        ...blank,
        section: {
          ...blank.section,
          setup: { ...blank.section.setup, columns: { count: 2, gap: 36 } },
        },
      },
      'fodt',
    );
    const unequal = new TextDecoder()
      .decode(odfBytes)
      .replace(
        /<style:columns([^>]*)\/>/,
        '<style:columns$1><style:column style:rel-width="1000*"/><style:column style:rel-width="3000*"/></style:columns>',
      );
    const odf = await read(encoder.encode(unequal));
    expect(odf.document.section.setup.columns).toEqual({ count: 2, gap: 36 });
    expect(odf.report.dropped).toContainEqual({
      reason: 'column-width',
      name: 'column-width',
      count: 1,
    });

    const unequalWord = vi.fn();
    const sectPr = parseXml(
      `<w:sectPr xmlns:w="${W}"><w:cols w:num="2" w:space="720" w:sep="true" w:equalWidth="0"><w:col w:w="2000" w:space="720"/><w:col w:w="6000"/></w:cols></w:sectPr>`,
    );
    if (!sectPr.ok) throw new Error('fixture');
    expect(readSection(sectPr.root, undefined, unequalWord).setup.columns).toEqual({
      count: 2,
      gap: 36,
      separator: true,
    });
    expect(unequalWord).toHaveBeenCalledTimes(1);
  });

  it('writes no line or columns for one column', async () => {
    const blank = TextDocument.fromTexts(['One'], { format: 'ooxml' });
    const back = (await read(write(blank, 'docx'))).document;
    expect(back.section.setup.columns).toBeUndefined();
    expect(PageSetup.equal(back.section.setup, blank.section.setup)).toBe(true);
  });
});

describe('column breaks in files (page-layout.md "Breaks")', () => {
  it.each(['odt', 'fodt', 'docx'] as const)(
    "writes a paragraph's column break before and reads it back, a page break winning (%s)",
    async (type) => {
      const format = type === 'docx' ? 'ooxml' : 'odf';
      const blank = TextDocument.fromTexts(['One', 'Two', 'Three'], { format });
      const [one, two, three] = blank.body as Paragraph[];
      const body: Block[] = [
        one!,
        { ...two!, props: { ...two!.props, columnBreakBefore: true } },
        { ...three!, props: { ...three!.props, pageBreakBefore: true } },
      ];
      const back = (await read(write({ ...blank, body }, type))).document;
      const paragraphs = back.body.filter((b): b is Paragraph => b.type === 'paragraph');
      expect(paragraphs.map(Paragraph.text)).toEqual(['One', 'Two', 'Three']);
      expect(paragraphs[1]!.props.columnBreakBefore).toBe(true);
      expect(paragraphs[1]!.inlines.some((i) => i.type === 'kept')).toBe(false);
      expect(paragraphs[2]!.props.columnBreakBefore).toBeUndefined();
      expect(paragraphs[2]!.props.pageBreakBefore).toBe(true);
    },
  );

  it("writes ODF's column break before as the paragraph's break before", () => {
    const blank = TextDocument.fromTexts(['One'], { format: 'odf' });
    const [one] = blank.body as Paragraph[];
    const xml = new TextDecoder().decode(
      write({ ...blank, body: [{ ...one!, props: { columnBreakBefore: true } }] }, 'fodt'),
    );
    expect(xml).toContain('fo:break-before="column"');
  });
});
