// A text document's files (files-and-print.md "Opening" and "Downloading"): any `.odt`, `.ott`, `.fodt`, `.docx`,
// `.dotx` or `.docm` read into the model under the package's guards and the document's limits, with its import report;
// and the model written as the file its format leaves as.
import {
  packageKind,
  refuse,
  type PackageBudgets,
  type PackageRefusal,
} from '@livedoc/office-packages';
import type { Block, Inline } from './model/blocks';
import { TextDocument } from './model/text-document';
import { KEPT_CONTENT_MAX_BYTES, TEXT_DOCUMENT_MAX_CHARS } from './limits';
import { readOdfFile } from './odf/odf-file';
import { writeOdf } from './odf/odf-write';
import { readOoxmlFile } from './ooxml/ooxml-read';
import { writeOoxml } from './ooxml/ooxml-write';
import { Styles } from './model/styles';
import { Watermarks } from './model/watermark';
import { odfWatermarkInline, readOdfWatermark } from './odf/odf-watermark';
import { ooxmlWatermarkInline, readOoxmlWatermark } from './ooxml/ooxml-watermark';
import { ReportBuilder, type ImportReport } from './report';
import type { TextDocumentFileType } from './file-types';

export type TextDocumentRead =
  | { ok: true; document: TextDocument; report: ImportReport; fileType: TextDocumentFileType }
  | PackageRefusal;

/** Kept XML past the limit is dropped, block by block and inline by inline, in reading order, and reported. */
function withinKeptLimit(
  document: TextDocument,
  report: ReportBuilder,
  limit: number,
): TextDocument {
  let used = 0;
  const fits = (xml: string) => {
    used += xml.length;
    return used <= limit;
  };
  let dropped = 0;
  const within = (blocks: readonly Block[]): Block[] =>
    blocks.flatMap((block): Block[] => {
      if (block.type === 'kept') {
        if (fits(block.xml.xml)) return [block];
        dropped += 1;
        return [];
      }
      if (block.type === 'table') {
        const rows = block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => ({ ...cell, blocks: within(cell.blocks) })),
        }));
        return [{ ...block, rows }];
      }
      if (block.type !== 'paragraph') return [block];
      const inlines = block.inlines.filter((i: Inline) => {
        if (i.type !== 'kept' || fits(i.xml.xml)) return true;
        dropped += 1;
        return false;
      });
      return [inlines.length === block.inlines.length ? block : { ...block, inlines }];
    });
  const body = within(document.body);
  if (dropped === 0) return document;
  report.drop('kept-limit', 'kept content', dropped);
  return { ...document, body };
}

/** `maxObjects`: the most pictures a text document holds (objects.md "In the formats"); past it, the rest stay kept. */
export type ReadLimits = {
  budgets?: PackageBudgets;
  maxChars?: number;
  keptBytes?: number;
  maxObjects?: number;
};

/** A text document file read into the model, in the format it arrived in. */
export async function readTextDocumentFile(
  file: Uint8Array,
  limits: ReadLimits = {},
): Promise<TextDocumentRead> {
  // The readers view the bytes through their own ArrayBuffer.
  const bytes = new Uint8Array(file);
  const report = new ReportBuilder();
  let document: TextDocument;
  let fileType: TextDocumentFileType;
  if (packageKind(bytes) === 'ooxml') {
    const read = await readOoxmlFile(bytes, report, limits.budgets, limits.maxObjects);
    if (!read.ok) return read;
    document = read.document;
    fileType = 'docx';
  } else {
    const read = await readOdfFile(bytes, report, limits.budgets, limits.maxObjects);
    if (!read.ok) return read;
    document = read.document;
    fileType = read.flat ? 'fodt' : 'odt';
  }
  if (TextDocument.characters(document) > (limits.maxChars ?? TEXT_DOCUMENT_MAX_CHARS))
    return refuse('document_too_large');
  document = liftWatermark(document, report);
  document = withinKeptLimit(document, report, limits.keptBytes ?? KEPT_CONTENT_MAX_BYTES);
  return { ok: true, document, report: report.build(), fileType };
}

export type TextDocumentWrite =
  { ok: true; bytes: Uint8Array } | { ok: false; rejection: 'format_not_native' };

/** The text document as a file of its own format: `.odt` or `.fodt` for ODF, `.docx` for OOXML. */
export function writeTextDocumentFile(
  document: TextDocument,
  type: TextDocumentFileType,
  generator = 'LiveDoc',
): TextDocumentWrite {
  const odf = type === 'odt' || type === 'fodt';
  if (odf !== (document.format === 'odf')) return { ok: false, rejection: 'format_not_native' };
  const placed = placeWatermark(document);
  const bytes = odf
    ? writeOdf(placed, { flat: type === 'fodt', generator })
    : writeOoxml(placed, generator);
  return { ok: true, bytes };
}

/** The watermark a file's headers hold, lifted into the document (page-layout.md "Watermark", "In the file"). */
function liftWatermark(document: TextDocument, report: ReportBuilder): TextDocument {
  const source = document.source;
  const styles = source?.format === 'odf' ? [...source.pageStyles, ...source.automaticStyles] : [];
  const read = (kept: Block | Inline) =>
    source?.format === 'odf'
      ? readOdfWatermark(kept, (name) => styles.find((s) => s.name === name)?.xml)
      : readOoxmlWatermark(kept);
  return Watermarks.lift(document, (kept) => {
    const watermark = read(kept);
    // Held by the model now, no longer kept content.
    if (watermark && kept.type === 'kept') report.mapped(kept.name);
    return watermark;
  });
}

/** The document's watermark placed in its headers, as its format writes one. */
function placeWatermark(document: TextDocument): TextDocument {
  const normal = Styles.idOfRole(document.styles, 'normal') ?? '';
  return Watermarks.place(
    document,
    document.format === 'odf' ? odfWatermarkInline : ooxmlWatermarkInline,
    normal,
  );
}
