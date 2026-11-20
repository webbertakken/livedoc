// A text document's first page as a picture (docs/specs/034-text-documents/live-editing-and-storage.md "Thumbnails"):
// drawn from the model without layout, for the Explorer's thumbnail and the live image. The page of the first
// section's paper, its margins, and the paragraphs from the top at their style's size, weight and colour, wrapped at
// an average character width, until the page is full. Pure: no DOM, no fonts measured.
import { Paragraph, type Block } from '../model/blocks';
import { Styles, type StyleRole } from '../model/styles';
import type { TextDocument } from '../model/text-document';

type Look = { size: number; bold: boolean; color: string };

// Google Docs' defaults for the built-in styles, in points (text-and-paragraphs.md "Paragraph styles").
const ROLE_LOOKS: Record<StyleRole, Look> = {
  normal: { size: 11, bold: false, color: '#000000' },
  title: { size: 26, bold: false, color: '#000000' },
  subtitle: { size: 15, bold: false, color: '#666666' },
  heading1: { size: 20, bold: false, color: '#000000' },
  heading2: { size: 16, bold: false, color: '#000000' },
  heading3: { size: 14, bold: false, color: '#434343' },
  heading4: { size: 12, bold: false, color: '#666666' },
  heading5: { size: 11, bold: false, color: '#666666' },
  heading6: { size: 11, bold: false, color: '#666666' },
};

/** Line height as a share of the size: Google's default single spacing (1.15). */
const LINE = 1.15;
/** An average character's width as a share of the size, for Arial-like text: wrapping without measuring. */
const CHARACTER_WIDTH = 0.5;
/** Space after a paragraph, as a share of its size. */
const AFTER = 0.5;
const FONT = 'Arial, Helvetica, sans-serif';
const LIST_MARK = '\u2022 ';

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The words of one paragraph broken into lines no wider than `columns` characters; a long word is cut. */
export function wrapText(text: string, columns: number): string[] {
  const width = Math.max(1, Math.floor(columns));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > width) {
      if (line) lines.push(line);
      line = '';
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    const next = line ? `${line} ${rest}` : rest;
    if (next.length > width) {
      lines.push(line);
      line = rest;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function lookOf(document: TextDocument, block: Paragraph): Look {
  const style = Styles.byId(document.styles, block.style);
  const base = ROLE_LOOKS[style?.role ?? 'normal'];
  return {
    size: block.text?.size ?? style?.text.size ?? base.size,
    bold: block.text?.bold ?? style?.text.bold ?? base.bold,
    color: block.text?.color ?? style?.text.color ?? base.color,
  };
}

const isParagraph = (block: Block): block is Paragraph => block.type === 'paragraph';

/** The first page as SVG, in points; null when the document has no text to draw. */
export function textDocumentPageSvg(document: TextDocument): string | null {
  const paragraphs = document.body.filter(isParagraph);
  if (!paragraphs.some((p) => Paragraph.text(p).trim() !== '')) return null;
  const { width, height, margins, pageColor } = document.section.setup;
  const textWidth = width - margins.left - margins.right;
  const bottom = height - margins.bottom;
  const lines: string[] = [];
  let y = margins.top;
  for (const paragraph of paragraphs) {
    const look = lookOf(document, paragraph);
    const step = look.size * LINE;
    const mark = paragraph.list ? LIST_MARK : '';
    const text = Paragraph.text(paragraph);
    const wrapped =
      text.trim() === '' ? [''] : wrapText(mark + text, textWidth / (look.size * CHARACTER_WIDTH));
    for (const line of wrapped) {
      if (y + step > bottom) break;
      y += step;
      if (line === '') continue;
      const weight = look.bold ? ' font-weight="700"' : '';
      lines.push(
        `<text x="${margins.left}" y="${(y - step * 0.25).toFixed(1)}" font-size="${look.size}" fill="${look.color}"${weight}>${escapeXml(line)}</text>`,
      );
    }
    if (y + step > bottom) break;
    y += look.size * AFTER;
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`,
    `<rect width="${width}" height="${height}" fill="${pageColor ?? '#ffffff'}"/>`,
    ...lines,
    '</svg>',
  ].join('');
}
