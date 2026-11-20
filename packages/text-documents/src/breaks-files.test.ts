// docs/specs/034-text-documents/page-layout.md "Breaks": a page break is a paragraph's page break before, and a section
// break on the next page or continuous starts a section with its setup; both formats write them and read them back.
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import { Paragraph, type Block } from './model/blocks';
import { PageSetup } from './model/sections';
import { TextDocument } from './model/text-document';
import { odfSectionRegion } from './odf/odf-region';

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
