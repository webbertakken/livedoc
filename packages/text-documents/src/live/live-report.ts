// The import report in the live state (docs/specs/034-text-documents/files-and-print.md "Import report",
// live-editing-and-storage.md "Beside the body"): the root map `report` holds `imported`, written once when the room
// reads a file, and `converted`, which each conversion that lost anything appends to inside its own transaction.
import type * as Y from 'yjs';
import {
  readConversionRecords,
  readImportRecord,
  withConversion,
  type ConversionRecord,
  type ImportRecord,
  type TextDocumentReport,
} from '../report-record';
import { REPORT_MAP } from './live-names';

const IMPORTED = 'imported';
const CONVERTED = 'converted';

const reportMap = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>(REPORT_MAP);

/** The report the state holds; a state without one, or with one not of the shape, holds an empty one. */
export function readLiveReport(doc: Y.Doc): TextDocumentReport {
  const map = reportMap(doc);
  return {
    imported: readImportRecord(map.get(IMPORTED)),
    converted: readConversionRecords(map.get(CONVERTED)),
  };
}

/** Writes what reading the file dropped and kept. */
export function writeLiveImportRecord(doc: Y.Doc, record: ImportRecord): void {
  reportMap(doc).set(IMPORTED, record);
}

/** Appends a conversion's losses, in the caller's transaction (so its undo step holds them). */
export function appendLiveConversion(doc: Y.Doc, record: ConversionRecord): void {
  const map = reportMap(doc);
  map.set(CONVERTED, withConversion(readConversionRecords(map.get(CONVERTED)), record));
}
