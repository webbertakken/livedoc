// A text document's download (docs/specs/034-text-documents/files-and-print.md "Downloading", objects.md "Where the
// bytes live", "In the file"): written in this browser for a text document no room holds, or one whose writing names
// drawings (each drawn afresh into the file alone); otherwise the api writes it from the room's state. A file written
// without a picture whose media could not be read says so, never silently.
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  isTextDocumentExportType,
  TextDocumentState,
  type TextDocumentDownloadType,
  type TextDocumentFileType,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { WrittenTextDocumentFile } from './text-document-file';
import { drawingsForFile } from './text-document-drawn-file';

/** The title row's notice for a file that left `count` pictures out. */
export const leftOutNotice = (count: number): string =>
  count === 1
    ? 'The file was downloaded without 1 picture LiveDoc could not read.'
    : `The file was downloaded without ${count} pictures LiveDoc could not read.`;

export type TextDocumentDownload = {
  file: { format: TextDocumentFormat; name: string; type: TextDocumentDownloadType };
  // A text document in This Browser: always written here.
  localDoc: Y.Doc | null;
  // The writing as this editor holds it, bound to the room.
  liveDoc: Y.Doc | null;
  // A drawing's picture drawn now, or null to leave it as saved; absent where none can be drawn.
  draw: ((drawingTabId: string) => Promise<Uint8Array | null>) | null;
  // A gallery picture's bytes.
  readImage: (imageId: string) => Promise<Uint8Array | undefined>;
  // The api's file, written from the room's state.
  fromApi: () => Promise<WrittenTextDocumentFile>;
};

export async function textDocumentDownload({
  file,
  localDoc,
  liveDoc,
  draw,
  readImage,
  fromApi,
}: TextDocumentDownload): Promise<WrittenTextDocumentFile> {
  // An export reads no picture's bytes: written here for This Browser, else by the api.
  if (isTextDocumentExportType(file.type)) {
    if (!localDoc) return fromApi();
    const { textDocumentExportOf } = await import('./text-document-file');
    return textDocumentExportOf(localDoc, {
      format: file.format,
      name: file.name,
      type: file.type,
    });
  }
  const type: TextDocumentFileType = file.type;
  const drawings = (doc: Y.Doc | null) =>
    doc && draw ? [...TextDocumentState.drawingNames(doc).keys()] : [];
  const named = localDoc ? drawings(localDoc) : drawings(liveDoc);
  const doc = localDoc ?? (named.length > 0 ? liveDoc : null);
  if (!doc) return fromApi();
  const drawn = named.length > 0 && draw ? await drawingsForFile(named, draw) : undefined;
  debugLog('[text-document] file written here', {
    local: localDoc !== null,
    drawings: named.length,
    drawn: drawn?.size ?? 0,
  });
  // The writer loads only when it is asked for.
  const { textDocumentFileOf } = await import('./text-document-file');
  return textDocumentFileOf(doc, { ...file, type, readImage, ...(drawn ? { drawn } : {}) });
}
