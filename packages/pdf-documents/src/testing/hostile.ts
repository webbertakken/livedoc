// Hostile files, made here (docs/specs/035-pdf-documents/security.md "Abuse cases"): each is the smallest file that
// tries one thing a PDF may try on its reader. None is committed as a file.
import { deflateSync } from 'node:zlib';
import { rawPdf, stream } from './fixtures';

const PAGES = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
const hex = (bytes: Uint8Array): string => `${Buffer.from(bytes).toString('hex')}>`;

/** What every script of `scriptsPdf` would do, were one ever run. */
export const SCRIPT_WOULD_WRITE = 'changed by a script';

/**
 * A file with scripts wherever a file may carry one: two named for the document, one on opening it, one on opening
 * its page, and on its one text field "city" (valued "Delft") a calculation, a keystroke, a format and a validation.
 * Each would write `SCRIPT_WOULD_WRITE` into the field.
 */
export const scriptsPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /Names << /JavaScript << /Names [(one) 5 0 R (two) 5 0 R] >> >> /OpenAction 5 0 R /AcroForm << /Fields [4 0 R] /CO [4 0 R] >> >>',
    PAGES,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [4 0 R] /AA << /O 5 0 R >> >>',
    '<< /Type /Annot /Subtype /Widget /Rect [72 700 272 720] /P 3 0 R /FT /Tx /T (city) /V (Delft) /A 5 0 R /AA << /C 5 0 R /K 5 0 R /F 5 0 R /V 5 0 R >> >>',
    `<< /S /JavaScript /JS (this.getField\\("city"\\).value = "${SCRIPT_WOULD_WRITE}";) >>`,
  ]);

/** Where `remotePdf` asks a reader to fetch from. */
export const REMOTE_ADDRESS = 'https://remote.example/asked-for';

/**
 * One page that names what it shows by address: a picture whose data is "at" a URL, and a font whose file is. A
 * reader with a network would ask for both.
 */
export const remotePdf = (): Uint8Array<ArrayBuffer> => {
  const elsewhere = `/F << /Type /Filespec /FS /URL /F (${REMOTE_ADDRESS}) >>`;
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    PAGES,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> /Font << /F0 6 0 R >> >> /Contents 4 0 R >>',
    stream('', 'q 100 0 0 100 72 600 cm /Im0 Do Q BT /F0 12 Tf 72 720 Td (Remote) Tj ET'),
    stream(
      `/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 ${elsewhere}`,
      '',
    ),
    '<< /Type /Font /Subtype /TrueType /BaseFont /Elsewhere /FontDescriptor 7 0 R >>',
    '<< /Type /FontDescriptor /FontName /Elsewhere /Flags 32 /FontFile2 8 0 R >>',
    stream(elsewhere, ''),
  ]);
};

/** A picture `side` pixels a side, every one black, in a file a thousandth of its decoded size. */
export function bombPdf(side: number): Uint8Array<ArrayBuffer> {
  const packed = hex(deflateSync(new Uint8Array(side * side), { level: 9 }));
  return rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    PAGES,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    stream('', 'q 612 0 0 792 0 0 cm /Im0 Do Q'),
    stream(
      `/Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode]`,
      packed,
    ),
  ]);
}

/** One page showing a JPEG that is no JPEG: bytes no decoder can read. */
export const brokenPicturePdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    PAGES,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    stream('', 'q 100 0 0 100 72 600 cm /Im0 Do Q'),
    stream(
      '/Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode]',
      hex(Uint8Array.from({ length: 512 }, (_, at) => (at * 37 + 11) % 256)),
    ),
  ]);

/** A page tree that names itself among its own pages. */
export const circularPagesPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 2 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>',
  ]);

/** One page with a field that is its own parent, and so has a name without end. */
export const circularFieldPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] >> >>',
    PAGES,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [5 0 R] >>',
    '<< /FT /Tx /T (loop) /Parent 4 0 R /Kids [5 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /Rect [72 700 272 720] /P 3 0 R /Parent 4 0 R /T (leaf) /V (kept) >>',
  ]);

/** How far from the page `farAwayPdf` places what it holds: past any reach of a page. */
export const FAR_AWAY = 9_000_000;

/**
 * One page whose word of text, whose link, the place its link leads to and the text its highlight covers are all
 * `FAR_AWAY` from the page, and whose own width is a thousand times what a page may measure.
 */
export const farAwayPdf = (): Uint8Array<ArrayBuffer> =>
  rawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    PAGES,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 14400000 792] /Resources << /Font << /F0 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R 7 0 R] >>',
    stream('', `BT /F0 12 Tf 1 0 0 1 ${FAR_AWAY} ${FAR_AWAY} Tm (Far) Tj ET`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /Annot /Subtype /Link /Rect [-${FAR_AWAY} 5 ${FAR_AWAY} 20] /Dest [3 0 R /XYZ ${FAR_AWAY} -${FAR_AWAY} 0] >>`,
    `<< /Type /Annot /Subtype /Highlight /Rect [72 700 172 720] /QuadPoints [${FAR_AWAY} 720 172 720 72 700 172 700] >>`,
  ]);
