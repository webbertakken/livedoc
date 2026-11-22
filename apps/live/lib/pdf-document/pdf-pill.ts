// What a PDF document's format pill says of its file (docs/specs/035-pdf-documents/reading-surface.md "The title
// row"): "PDF 1.7, 14 pages, 1.2 MB", the version the file's own. The shell reads the same words as the pill's tooltip
// and its accessible name, so a protected file says so there.

export type PdfPillFile = {
  /** The PDF version the file names, as "1.7"; null where it names none. */
  version: string | null;
  pages: number;
  bytes: number;
  /** Whether the file is protected (opening.md "Passwords"). */
  protected: boolean;
};

/** A file's size as a person reads it: "12 kB" under a megabyte (never "0 kB"), "1.2 MB" from there. */
export const pdfSizeText = (bytes: number): string =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1_000))} kB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The pill's tooltip and accessible name; `file` null while the file is not read. */
export function pdfPillTitle(file: PdfPillFile | null): string {
  if (!file) return 'PDF document';
  const format = file.version ? `PDF ${file.version}` : 'PDF';
  const pages = `${file.pages} ${file.pages === 1 ? 'page' : 'pages'}`;
  return `${file.protected ? 'Protected ' : ''}${format}, ${pages}, ${pdfSizeText(file.bytes)}`;
}
