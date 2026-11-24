// Test fixtures: small PDFs made here, so no file of anyone else's is committed, and the reader's binary as tests
// load it (a browser's worker fetches the same file as an asset).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CryptoKeySigner, PDF } from '@libpdf/core';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import type { PdfDocumentInfo } from '../engine-contract';
import { PdfPermissions } from '../permissions';

const require = createRequire(import.meta.url);

/** The reader's WebAssembly binary. */
export const readerWasm = (): Uint8Array =>
  readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));

export const FIXTURE_LINE = 'The quick brown fox jumps over the lazy dog.';

/** A PDF of US Letter pages, each with one line of text 72 points in and 720 up, and its page number below it. */
export async function textPdf(pages = 2): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = PDF.create();
  for (let n = 1; n <= pages; n += 1) {
    const page = pdf.addPage({ width: 612, height: 792 });
    page.drawText(FIXTURE_LINE, { x: 72, y: 720, size: 12 });
    page.drawText(`Page ${n}`, { x: 72, y: 690, size: 12 });
  }
  return (await pdf.save()) as Uint8Array<ArrayBuffer>;
}

/** The left of the right column of `columnsPdf`, in points. */
export const COLUMNS_RIGHT_LEFT = 330;

/**
 * One US Letter page set in two columns under a heading across both, twelve lines a column 14 points apart, the left
 * column 72 points in and the right `COLUMNS_RIGHT_LEFT` (reading-surface.md "Phone and tablet": a double tap).
 */
export async function columnsPdf(): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = PDF.create();
  const page = pdf.addPage({ width: 612, height: 792 });
  page.drawText('Two columns under one heading across them both', {
    x: 72,
    y: 730,
    size: 14,
  });
  for (let row = 0; row < 12; row += 1) {
    const y = 690 - row * 14;
    page.drawText(`Left column line ${row + 1} reads on and on`, { x: 72, y, size: 11 });
    page.drawText(`Right column line ${row + 1} reads on too`, {
      x: COLUMNS_RIGHT_LEFT,
      y,
      size: 11,
    });
  }
  return (await pdf.save()) as Uint8Array<ArrayBuffer>;
}

/**
 * A PDF written by hand from its objects (object 1 is the catalogue), for the files no writer makes: one with no
 * pages, one locked by a handler the reader does not know.
 */
export function rawPdf(objects: readonly string[], trailer = ''): Uint8Array<ArrayBuffer> {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, at) => {
    offsets.push(body.length);
    body += `${at + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** A well-formed PDF whose page tree holds no page. */
export const noPagesPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>']);

/** A PDF locked by the security handler named: one the reader does not open. */
export const lockedPdf = (handler: string): Uint8Array<ArrayBuffer> =>
  rawPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
      `<< /Filter /${handler} /V 1 /R 2 /Length 40 >>`,
    ],
    '/Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]',
  );

/** The same PDF with its cross-reference pointer spoiled: readers rebuild it, and no writer can append to it. */
export function spoiled(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const text = Buffer.from(bytes)
    .toString('latin1')
    .replace(/startxref/g, 'startxxxx');
  return new Uint8Array(Buffer.from(text, 'latin1'));
}

const PAGE = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>';

/** Three pages labelled "i", "ii" and "A-1": lower-case roman numerals, then a prefix with decimals. */
export const labelledPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >> 2 << /S /D /P (A-) >>] >> >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    PAGE,
    PAGE,
    PAGE,
  ]);

/** Five pages turned as the file says: by a quarter, a half, three quarters, not at all, and by no quarter turn. */
export const rotatedPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R] /Count 5 >>',
    ...[90, 180, 270, 0, 45].map(
      (turn) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate ${turn} >>`,
    ),
  ]);

/** One page, and in its catalogue an entry of other software's, with its own words: nothing LiveDoc reads. */
export const privateDataPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /OtherSoftware << /Words (kept as it came) /Deep 4 0 R >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    '<< /Unknown /Thing /Numbers [1 2 3] >>',
  ]);

/** One page with one text field named "name", valued "Ada": an interactive form. */
export const fieldsPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (Ada) /Rect [72 700 272 720] /P 3 0 R >>',
  ]);

/** What a file that says nothing of itself answers: no protection, no properties, no form. */
export const plainDocument: PdfDocumentInfo = {
  version: '1.7',
  encrypted: false,
  permissions: PdfPermissions.all(),
  properties: {
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
    created: '',
    modified: '',
  },
  tagged: false,
  form: 'none',
  scripts: 0,
};

/** The text fixture with protection set as given: an open password, a permissions password, what is asked. */
export async function protectedPdf(
  protection: Parameters<PDF['setProtection']>[0],
): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDF.load(await textPdf(2));
  pdf.setProtection(protection);
  return (await pdf.save()) as Uint8Array<ArrayBuffer>;
}

/**
 * Two pages and an outline: "Chapter 1" (to a point on page one) holding "Section 1.1" (to page two), then
 * "Website" (an address), "Run it" (a launch) and "Elsewhere" (another file).
 */
export const outlinePdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    PAGE,
    PAGE,
    '<< /Type /Outlines /First 6 0 R /Last 10 0 R /Count 5 >>',
    '<< /Title (Chapter 1) /Parent 5 0 R /Next 8 0 R /First 7 0 R /Last 7 0 R /Count 1 /Dest [3 0 R /XYZ 72 720 0] >>',
    '<< /Title (Section 1.1) /Parent 6 0 R /Dest [4 0 R /Fit] >>',
    '<< /Title (Website) /Parent 5 0 R /Prev 6 0 R /Next 9 0 R /A << /S /URI /URI (https://example.com/a) >> >>',
    '<< /Title (Run it) /Parent 5 0 R /Prev 8 0 R /Next 10 0 R /A << /S /Launch /F (calc.exe) >> >>',
    '<< /Title (Elsewhere) /Parent 5 0 R /Prev 9 0 R /A << /S /GoToR /F (other.pdf) /D [0 /Fit] >> >>',
  ]);

/** An outline whose second bookmark names itself as the one after it, and whose third holds its own parent. */
export const circularOutlinePdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    '<< /Type /Outlines /First 5 0 R /Last 6 0 R /Count 2 >>',
    '<< /Title (One) /Parent 4 0 R /Next 6 0 R /First 5 0 R /Dest [3 0 R /Fit] >>',
    '<< /Title (Two) /Parent 4 0 R /Prev 5 0 R /Next 6 0 R /Dest [3 0 R /Fit] >>',
  ]);

/** An outline of `count` bookmarks in a row, each to the one page. */
export function longOutlinePdf(count: number): Uint8Array<ArrayBuffer> {
  const first = 5;
  const items = Array.from({ length: count }, (_, at) => {
    const next = at + 1 < count ? `/Next ${first + at + 1} 0 R` : '';
    return `<< /Title (Bookmark ${at + 1}) /Parent 4 0 R ${next} /Dest [3 0 R /Fit] >>`;
  });
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    `<< /Type /Outlines /First ${first} 0 R /Last ${first + count - 1} 0 R /Count ${count} >>`,
    ...items,
  ]);
}

const link = (bottom: number, rest: string): string =>
  `<< /Type /Annot /Subtype /Link /Rect [72 ${bottom} 172 ${bottom + 20}] ${rest} >>`;

/**
 * Two pages; on the first, five links one under the other: to a point on page two, to an address, to a script, to
 * another file, and a launch.
 */
export const linksPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [5 0 R 6 0 R 7 0 R 8 0 R 9 0 R] >>',
    PAGE,
    link(700, '/Dest [4 0 R /XYZ 10 20 0]'),
    link(660, '/A << /S /URI /URI (https://example.com/a) >>'),
    link(620, '/A << /S /URI /URI (javascript:alert\\(1\\)) >>'),
    link(580, '/A << /S /GoToR /F (other.pdf) /D [0 /Fit] >>'),
    link(540, '/A << /S /Launch /F (calc.exe) >>'),
  ]);

/**
 * An outline of every other way a bookmark leads: a go-to action with a place, one with none, a script, a go-to into
 * an embedded file, nothing at all, a page that is not in the file, and an address that is empty. And one page with
 * a link that leads nowhere, and a highlight the file gives no name.
 */
export const actionsPdf = (): Uint8Array<ArrayBuffer> => {
  const item = (n: number, title: string, rest: string, last = false): string =>
    `<< /Title (${title}) /Parent 4 0 R ${last ? '' : `/Next ${n + 1} 0 R`} ${rest} >>`;
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [12 0 R 13 0 R] >>',
    '<< /Type /Outlines /First 5 0 R /Last 11 0 R /Count 7 >>',
    item(5, 'Go to', '/A << /S /GoTo /D [3 0 R /XYZ 5 6 0] >>'),
    item(6, 'Go nowhere', '/A << /S /GoTo >>'),
    item(7, 'Script', '/A << /S /JavaScript /JS (app.alert\\(1\\)) >>'),
    item(8, 'Embedded', '/A << /S /GoToE /F (inner.pdf) /D [0 /Fit] >>'),
    item(9, 'Nothing', ''),
    item(10, 'Missing page', '/Dest [99 /Fit]'),
    item(11, 'Empty address', '/A << /S /URI /URI () >>', true),
    link(700, ''),
    '<< /Type /Annot /Subtype /Highlight /Rect [72 700 172 720] /QuadPoints [72 720 172 720 72 700 172 700] >>',
  ]);
};

/** An outline `depth` bookmarks deep, each the only child of the one before. */
export function deepOutlinePdf(depth: number): Uint8Array<ArrayBuffer> {
  const first = 5;
  const items = Array.from({ length: depth }, (_, at) => {
    const child = at + 1 < depth ? `/First ${first + at + 1} 0 R /Last ${first + at + 1} 0 R` : '';
    return `<< /Title (Level ${at + 1}) /Parent ${at === 0 ? 4 : first + at - 1} 0 R ${child} >>`;
  });
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    `<< /Type /Outlines /First ${first} 0 R /Last ${first} 0 R /Count 1 >>`,
    ...items,
  ]);
}

/** One page whose interactive form is an XFA form. */
export const xfaPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [] /XFA 4 0 R >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    '<< /Length 0 >>\nstream\n\nendstream',
  ]);

export const stream = (dictionary: string, body: string): string =>
  `<< ${dictionary} /Length ${body.length} >>\nstream\n${body}\nendstream`;

/**
 * One page of marks as files hold them: a highlight with its colour, opacity, author, words and dates under its own
 * name; a reply to it, a state reply and a grouped caret; a pop-up, which is no mark; a note the file gives neither
 * name nor colour, and a reply to that; and a note whose words run past any limit. `listApart`: the page names its
 * list of marks as an object of its own, as most software writes it, rather than holding the list itself.
 */
export function marksPdf(longWords = 0, listApart = false): Uint8Array<ArrayBuffer> {
  const at = '/Rect [72 700 172 720]';
  const list = '[4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R]';
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots ${listApart ? '12 0 R' : list} >>`,
    `<< /Type /Annot /Subtype /Highlight ${at} /QuadPoints [72 720 172 720 72 700 172 700] /NM (hl-1) /C [1 0.5 0] /CA 0.5 /T (Grace) /Contents (Check this) /Subj (Fact) /M (D:20261121140203Z) /CreationDate (D:20261120090000Z) /Popup 8 0 R >>`,
    `<< /Type /Annot /Subtype /Text ${at} /NM (re-1) /IRT 4 0 R /T (Ada) /Contents (Agreed) /M (D:20261121150000Z) >>`,
    `<< /Type /Annot /Subtype /Text ${at} /NM (st-1) /IRT 4 0 R /T (Ada) /State (Accepted) /StateModel (Review) >>`,
    `<< /Type /Annot /Subtype /Caret ${at} /NM (ca-1) /IRT 4 0 R /RT /Group >>`,
    `<< /Type /Annot /Subtype /Popup ${at} /Parent 4 0 R >>`,
    '<< /Type /Annot /Subtype /Text /Rect [-99999 5 99999 20] /C [] /CA 7 >>',
    `<< /Type /Annot /Subtype /Text ${at} /IRT 9 0 R >>`,
    `<< /Type /Annot /Subtype /Text ${at} /NM (long) /Contents (${'w'.repeat(longWords)}) >>`,
    ...(listApart ? [list] : []),
  ]);
}

/**
 * One page with a form as files hold them: a text field "applicant.city" (inside "applicant") valued "Delft" and
 * labelled; a multi-line read-only required one; a password field holding a value; a tick box that is on; a radio
 * group "colour" of two buttons, the second on; a dropdown that takes a value of one's own and a list that takes several, of three options each; a push button; an empty
 * signature field; and a field hidden from view.
 */
export function formPdf(options = 3): Uint8Array<ArrayBuffer> {
  const widget = (bottom: number, rest: string): string =>
    `<< /Type /Annot /Subtype /Widget /Rect [72 ${bottom} 272 ${bottom + 20}] /P 3 0 R ${rest} >>`;
  const opt = Array.from({ length: options }, (_, n) => `(Option ${n + 1})`).join(' ');
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 6 0 R 7 0 R 8 0 R 9 0 R 12 0 R 13 0 R 14 0 R 15 0 R 16 0 R] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [5 0 R 6 0 R 7 0 R 8 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R 16 0 R] >>',
    '<< /T (applicant) /Kids [5 0 R] >>',
    widget(700, '/Parent 4 0 R /FT /Tx /T (city) /V (Delft) /TU (The city you live in)'),
    widget(660, '/FT /Tx /T (notes) /Ff 4099 /V (Line one)'),
    widget(620, '/FT /Tx /T (secret) /Ff 8192 /V (hunter2)'),
    widget(580, '/FT /Btn /T (agree) /V /Yes /AS /Yes /AP << /N << /Yes 17 0 R /Off 17 0 R >> >>'),
    '<< /FT /Btn /Ff 32768 /T (colour) /V /blue /Kids [10 0 R 11 0 R] >>',
    widget(540, '/Parent 9 0 R /AS /Off /AP << /N << /red 17 0 R /Off 17 0 R >> >>'),
    widget(500, '/Parent 9 0 R /AS /blue /AP << /N << /blue 17 0 R /Off 17 0 R >> >>'),
    widget(460, `/FT /Ch /Ff 393216 /T (country) /Opt [${opt}] /V (Option 2)`),
    widget(420, `/FT /Ch /Ff 2097152 /T (languages) /Opt [${opt}] /V [(Option 1) (Option 3)]`),
    widget(
      380,
      '/FT /Btn /Ff 65536 /T (send) /A << /S /SubmitForm /F (https://example.com/submit) >>',
    ),
    widget(340, '/FT /Sig /T (signature)'),
    widget(300, '/FT /Tx /T (unseen) /F 2 /V (kept)'),
    stream('/Type /XObject /Subtype /Form /BBox [0 0 200 20]', ''),
  ]);
}

/**
 * One page with one text field the file has drawn: its appearance fills its box, 200 by 20 points at 72 in and 700
 * up, with black.
 */
export const drawnFieldPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [4 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /Rect [72 700 272 720] /P 3 0 R /F 4 /FT /Tx /T (city) /V (Delft) /AP << /N 5 0 R >> >>',
    stream('/Type /XObject /Subtype /Form /BBox [0 0 200 20]', '0 0 0 rg 0 0 200 20 re f'),
  ]);

/** One page and two embedded files: "notes.txt" with its size, type and description said, and "run.exe" with none. */
export const embeddedFilesPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(notes.txt) 4 0 R (run.exe) 6 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    '<< /Type /Filespec /F (notes.txt) /UF (notes.txt) /Desc (Meeting notes) /EF << /F 5 0 R >> >>',
    stream('/Type /EmbeddedFile /Subtype /text#2Fplain /Params << /Size 5 >>', 'hello'),
    '<< /Type /Filespec /F (../run.exe) /EF << /F 7 0 R >> >>',
    stream('/Type /EmbeddedFile', 'MZ'),
  ]);

/** One page carrying a one-page PDF, "inner.pdf", and a file that only says it is one, "fake.pdf". */
export const embeddedPdfPdf = (): Uint8Array<ArrayBuffer> => {
  const inner = new TextDecoder().decode(
    rawPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      PAGE,
    ]),
  );
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(inner.pdf) 4 0 R (fake.pdf) 6 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    '<< /Type /Filespec /F (inner.pdf) /UF (inner.pdf) /EF << /F 5 0 R >> >>',
    stream('/Type /EmbeddedFile /Subtype /application#2Fpdf', inner),
    '<< /Type /Filespec /F (fake.pdf) /EF << /F 7 0 R >> >>',
    stream('/Type /EmbeddedFile', 'not a pdf'),
  ]);
};

/**
 * One page and three PDF layers: "Plan" shown, "Notes" hidden, "Border" shown and locked; then as many more, each
 * shown, as `more` says.
 */
export function layersPdf(more = 0): Uint8Array<ArrayBuffer> {
  const extra = Array.from({ length: more }, (_, n) => n + 7);
  const all = [4, 5, 6, ...extra].map((n) => `${n} 0 R`).join(' ');
  return rawPdf([
    `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [${all}] /D << /Order [${all}] /OFF [5 0 R] /Locked [6 0 R] >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    PAGE,
    '<< /Type /OCG /Name (Plan) >>',
    '<< /Type /OCG /Name (Notes) >>',
    '<< /Type /OCG /Name (Border) >>',
    ...extra.map((n) => `<< /Type /OCG /Name (Layer ${n}) >>`),
  ]);
}

/**
 * One page drawing two squares, each in a PDF layer: "Plan" a black one at 72 to 172 points, shown; "Notes" a red one
 * at 300 to 400 points, hidden by the file.
 */
export const layeredDrawingPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [5 0 R 6 0 R] /D << /Order [5 0 R 6 0 R] /OFF [6 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Properties << /Plan 5 0 R /Notes 6 0 R >> >> >>',
    stream(
      '',
      '/OC /Plan BDC 0 0 0 rg 72 72 100 100 re f EMC /OC /Notes BDC 1 0 0 rg 300 300 100 100 re f EMC',
    ),
    '<< /Type /OCG /Name (Plan) >>',
    '<< /Type /OCG /Name (Notes) >>',
  ]);

/**
 * One page and two signature fields signed by hand, neither with bytes that are a signature: the first certifies
 * the file, allowing fields to be filled, and says a byte range of two runs; the second says no byte range.
 */
export const signaturesPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R] /SigFlags 3 >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R 5 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (first) /Rect [0 0 0 0] /P 3 0 R /V 6 0 R >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (second) /Rect [0 0 0 0] /P 3 0 R /V 7 0 R >>',
    '<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 10 20 30] /Contents <0011223344> /Reason (Certified) /M (D:20261121140203Z) /Reference [<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P 2 /V /1.2 >> >>] >>',
    '<< /Type /Sig /Filter /Adobe.PPKLite /Contents <00> >>',
  ]);

const SIGNER_NAME = [
  ['2.5.4.3', 'Ada Lovelace'],
  ['2.5.4.10', 'Analytical Engines'],
] as const;

/** A certificate made here for a key made here, naming "Ada Lovelace" of "Analytical Engines", issued by itself. */
async function selfSigned(): Promise<{ key: CryptoKey; certificate: Uint8Array }> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const certificate = new pkijs.Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({ value: 0x1234 });
  for (const name of [certificate.issuer, certificate.subject])
    for (const [type, value] of SIGNER_NAME)
      name.typesAndValues.push(
        new pkijs.AttributeTypeAndValue({ type, value: new asn1js.Utf8String({ value }) }),
      );
  certificate.notBefore.value = new Date(Date.UTC(2026, 0, 1));
  certificate.notAfter.value = new Date(Date.UTC(2036, 0, 1));
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificate.sign(keys.privateKey, 'SHA-256');
  return { key: keys.privateKey, certificate: new Uint8Array(certificate.toSchema().toBER(false)) };
}

/**
 * The text fixture signed with a certificate made here (Ada Lovelace, Analytical Engines), for the reason given,
 * at 14:02:03 UTC on 21 November 2026 by the signer's clock.
 */
export async function signedPdf(reason = 'I approve'): Promise<Uint8Array<ArrayBuffer>> {
  const { key, certificate } = await selfSigned();
  const pdf = await PDF.load(await textPdf(1));
  const signed = await pdf.sign({
    signer: new CryptoKeySigner(key, certificate, 'EC', 'ECDSA'),
    reason,
    signingTime: new Date(Date.UTC(2026, 10, 21, 14, 2, 3)),
  });
  return signed.bytes as Uint8Array<ArrayBuffer>;
}
export { taggedPdf } from './tagged';

/** The text of each page of a PDF, as the writer reads it: what a test checks a made file holds. */
export async function pageTextsOf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDF.load(bytes);
  return pdf.getPages().map((page) => page.extractText().text);
}
