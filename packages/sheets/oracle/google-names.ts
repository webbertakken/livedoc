// The oracle's workbook as Google Sheets reads it (docs/specs/029-sheets/formulas.md "The oracle"): Google reads
// Excel's `_xlfn._xlws.FILTER` and `_xlfn._xlws.SORT` as `_xlws.FILTER` and answers #NAME?, where it reads them with
// `_xlfn.` alone (measured 2026-11-21); Excel and LibreOffice read only the first, so the writer keeps it and the
// oracle renames them on the way to Google.
import { readOoxmlPackage, writeOoxmlPackage } from '@livedoc/office-packages';
import { XLSX_FUTURE_PREFIX, XLSX_WORKSHEET_PREFIX } from '../src/files/xlsx-function-names';

const WORKSHEET_PART = /^xl\/worksheets\/[^/]+\.xml$/;

/** An .xlsx with each worksheet function's `_xlfn._xlws.` written `_xlfn.`; throws on bytes that are no package. */
export async function asGoogleReadsIt(
  xlsx: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const read = await readOoxmlPackage(xlsx);
  if (!read.ok) throw new Error(`the written workbook: ${read.rejection}`);
  const { parts, contentTypes, relationships, defaults } = read.package;
  const renamed = [...parts].map(([name, data]) => ({
    name,
    contentType: contentTypes.get(name)!,
    data: WORKSHEET_PART.test(name)
      ? new TextEncoder().encode(
          new TextDecoder().decode(data).replaceAll(XLSX_WORKSHEET_PREFIX, XLSX_FUTURE_PREFIX),
        )
      : data,
  }));
  return writeOoxmlPackage(renamed, relationships, defaults);
}
