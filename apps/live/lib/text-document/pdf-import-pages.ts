// A PDF's pages as the text document's PDF import reads them (docs/specs/034-text-documents/files-and-print.md "A PDF
// imported"): each page's tags where they cover it, else its lines with their boxes, read through the PDF engine, the
// one place a PDF is parsed. Text and numbers only cross from the engine.
import { PageTags, PageText, type PdfEngine, type TagNode } from '@livedoc/pdf-documents';
import type { PdfImportLine, PdfImportNode, PdfImportPage } from '@livedoc/text-documents';

/** The most pages an import reads; the rest are reported as cut (default). */
export const PDF_IMPORT_MAX_PAGES = 2000;

const BREAK = /[\r\n]/;

/** A page's text split at the engine's line breaks, each line's box the union of its drawn characters. */
export function linesOfPageText(page: PageText): PdfImportLine[] {
  const lines: PdfImportLine[] = [];
  let text = '';
  let box: { left: number; right: number; top: number; bottom: number } | null = null;
  const end = () => {
    if (box && text.trim()) lines.push({ text, ...box });
    text = '';
    box = null;
  };
  for (let at = 0; at < page.text.length; at += 1) {
    const character = page.text[at]!;
    if (BREAK.test(character)) {
      end();
      continue;
    }
    text += character;
    const drawn = PageText.boxAt(page, at);
    if (!drawn || (drawn.right <= drawn.left && drawn.top <= drawn.bottom)) continue;
    box = box
      ? {
          left: Math.min(box.left, drawn.left),
          right: Math.max(box.right, drawn.right),
          top: Math.max(box.top, drawn.top),
          bottom: Math.min(box.bottom, drawn.bottom),
        }
      : { left: drawn.left, right: drawn.right, top: drawn.top, bottom: drawn.bottom };
  }
  end();
  return lines;
}

const importNode = (node: TagNode): PdfImportNode => ({
  type: node.type,
  alt: node.alt,
  kids: node.kids.map((kid) => (typeof kid === 'string' ? kid : importNode(kid))),
});

/** Every page read for the import, in order; past the cap, each page is cut and holds nothing. */
export async function pdfImportPages(engine: PdfEngine, pages: number): Promise<PdfImportPage[]> {
  const out: PdfImportPage[] = [];
  for (let index = 0; index < pages; index += 1) {
    if (index >= PDF_IMPORT_MAX_PAGES) {
      out.push({ reading: 'none', cut: true });
      continue;
    }
    const text = await engine.pageText(index);
    const reading = PageTags.read(await engine.pageTags(index), text);
    const cut = text?.cut ?? false;
    if (reading.source === 'tags' && reading.nodes.length > 0)
      out.push({ reading: 'tags', nodes: reading.nodes.map(importNode), cut });
    else if (text && text.text.trim())
      out.push({ reading: 'geometry', lines: linesOfPageText(text), cut });
    else out.push({ reading: 'none', cut });
  }
  return out;
}
