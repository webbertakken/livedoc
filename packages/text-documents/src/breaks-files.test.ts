// docs/specs/034-text-documents/page-layout.md "Breaks": a page break is a paragraph's page break before, and a section
// break on the next page or continuous starts a section with its setup; both formats write them and read them back.
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Block } from './model/blocks';
import { PageSetup } from './model/sections';
import { TextDocument } from './model/text-document';
import { odfSectionRegion } from './odf/odf-region';
import { fodt } from './testing/packages';
import { modelOf } from './testing/compare';

const roundTrip = async (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  const read = await readTextDocumentFile(written.bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read.document;
};

describe('breaks in files', () => {
  it.each(['odt', 'fodt', 'docx'] as const)(
    'writes page breaks and both section breaks, and reads them back (%s)',
    async (type) => {
      const format = type === 'docx' ? 'ooxml' : 'odf';
      const blank = TextDocument.fromTexts(['One', 'Two', 'Three', 'Four'], { format });
      const [one, two, three, four] = blank.body as Paragraph[];
      const landscape = PageSetup.oriented(PageSetup.of('a4', format), 'landscape');
      // In ODF a continuous section is a region, as the editor makes one.
      const region = format === 'odf' ? { region: odfSectionRegion([]) } : {};
      const body: Block[] = [
        one!,
        { ...two!, props: { ...two!.props, pageBreakBefore: true } },
        { type: 'section', start: 'continuous', setup: blank.section.setup, ...region },
        three!,
        { type: 'section', start: 'next-page', setup: landscape },
        four!,
      ];
      const back = await roundTrip({ ...blank, body }, type);
      const paragraphs = back.body.filter((b): b is Paragraph => b.type === 'paragraph');
      expect(paragraphs.map(Paragraph.text)).toEqual(['One', 'Two', 'Three', 'Four']);
      expect(paragraphs[1]!.props.pageBreakBefore).toBe(true);
      const sections = back.body.filter((b) => b.type === 'section');
      expect(sections.map((s) => s.start)).toEqual(['continuous', 'next-page']);
      expect(sections[1]!.setup.orientation).toBe('landscape');
    },
  );
});

// page-layout.md "Breaks": a region's start tag is kept with the bindings it names itself, not those of what it holds,
// so a region holding a table (whose cells a suite writes with `office:` values) reads back the same once written.
describe('a region holding a table', () => {
  it('keeps only its own start tag’s bindings, and reads back the same', async () => {
    const read = await readTextDocumentFile(
      fodt(
        '<text:section text:name="S1"><table:table><table:table-column/><table:table-row><table:table-cell office:value-type="string"><text:p>cell</text:p></table:table-cell></table:table-row></table:table></text:section><text:p>after</text:p>',
      ),
    );
    if (!read.ok) throw new Error(read.rejection);
    const region = read.document.body.find((b) => b.type === 'section' && b.region);
    expect(region?.type === 'section' && region.region?.ns).toEqual({
      text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    });
    const written = writeTextDocumentFile(read.document, 'fodt');
    const again = written.ok ? await readTextDocumentFile(written.bytes) : undefined;
    expect(again?.ok && modelOf(again.document)).toEqual(modelOf(read.document));
  });
});
