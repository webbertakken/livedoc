// A tagged PDF written by hand (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): no writer the
// tests hold makes a structure tree, and the corpus's tagged files carry no text on their pages.
import { rawPdf, stream } from './fixtures';

const text = (size: number, x: number, y: number, words: string): string =>
  `BT /F1 ${size} Tf ${x} ${y} Td (${words}) Tj ET`;

const marked = (tag: string, mcid: number, body: string): string =>
  `/${tag} <</MCID ${mcid}>> BDC ${body} EMC`;

// The first page's content, drawn in an order other than the one it reads in: the picture and the page number first.
const PAGE_ONE = [
  `/Artifact BMC ${text(10, 300, 40, 'Page 1')} EMC`,
  marked('Figure', 8, '0.8 0 0 rg 400 600 50 50 re f'),
  marked('H1', 0, text(24, 72, 720, 'Annual report')),
  marked(
    'P',
    1,
    `BT /F1 12 Tf 72 690 Td (The year began quietly and) Tj 0 -14 Td (ended with a record.) Tj ET`,
  ),
  marked('Lbl', 2, text(12, 72, 640, '1.')),
  marked('LBody', 3, text(12, 90, 640, 'Plant more trees')),
  marked('TH', 4, text(12, 72, 600, 'Name')),
  marked('TH', 5, text(12, 172, 600, 'Score')),
  marked('TD', 6, text(12, 72, 580, 'Ada')),
  marked('TD', 7, text(12, 172, 580, '9')),
].join('\n');

// The second page: a tagged paragraph and a line no tag reaches (marked, with no id), so its tags do not cover it.
const PAGE_TWO = [
  marked('P', 0, text(12, 72, 720, 'Tagged words')),
  `/Span <</Lang (nl)>> BDC ${text(12, 72, 690, 'Words no tag reaches')} EMC`,
].join('\n');

const element = (tag: string, parent: number, kids: string, extra = ''): string =>
  `<< /Type /StructElem /S /${tag} /P ${parent} 0 R /Pg 3 0 R /K ${kids} ${extra}>>`;

/**
 * Two pages. The first is tagged: a heading, a paragraph over two lines, a list of one item, a table of a header row
 * and a row, and a figure with alternative text, drawn in another order than its tags read; its page number is an
 * artifact. The second holds a tagged paragraph and a line no tag reaches.
 */
export const taggedPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> /Lang (en-GB) >>',
    '<< /Type /Pages /Kids [3 0 R 22 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /StructParents 0 >>',
    stream('', PAGE_ONE),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /StructTreeRoot /K 7 0 R /RoleMap << /Heading /H1 >> /ParentTree << /Nums [0 [8 0 R 9 0 R 12 0 R 13 0 R 16 0 R 17 0 R 19 0 R 20 0 R 21 0 R] 1 [24 0 R]] >> /ParentTreeNextKey 2 >>',
    '<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R 9 0 R 10 0 R 14 0 R 21 0 R 24 0 R] >>',
    element('Heading', 7, '0'),
    element('P', 7, '1'),
    element('L', 7, '[11 0 R]'),
    element('LI', 10, '[12 0 R 13 0 R]'),
    element('Lbl', 11, '2'),
    element('LBody', 11, '3'),
    element('Table', 7, '[15 0 R 18 0 R]'),
    element('TR', 14, '[16 0 R 17 0 R]'),
    element('TH', 15, '4'),
    element('TH', 15, '5'),
    element('TR', 14, '[19 0 R 20 0 R]'),
    element('TD', 18, '6'),
    element('TD', 18, '7'),
    element('Figure', 7, '8', '/Alt (A red square) '),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 23 0 R /StructParents 1 >>',
    stream('', PAGE_TWO),
    '<< /Type /StructElem /S /P /P 7 0 R /Pg 22 0 R /K 0 >>',
  ]);
