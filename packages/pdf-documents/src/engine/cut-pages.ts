// Pages cut from a PDF as a new PDF of those pages alone (docs/specs/035-pdf-documents/files-print-and-sync.md
// "Printing": pages other than all are cut from what is printed). The bytes handed in are never touched.
import { openWriter } from './writer';

/** The pages at `indexes`, in that order, as a new PDF; null where the file cannot be read or a page is not there. */
export async function cutPages(
  bytes: Uint8Array,
  indexes: readonly number[],
  password: string | null,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (indexes.length === 0) return null;
  const pdf = await openWriter(bytes, password);
  if (
    !pdf ||
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= pdf.getPageCount())
  )
    return null;
  const cut = await pdf.extractPages([...indexes]);
  return (await cut.save()) as Uint8Array<ArrayBuffer>;
}
