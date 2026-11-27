// A text document's file written in this browser (docs/specs/034-text-documents/live-editing-and-storage.md "A text
// document in This Browser"): what the file route writes from the room's state, written here from the live one, for
// a text document no room holds. Named after the document; a file of the other format is a converted copy
// (standard-mapping.md "Conversion").
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { TextDocumentFileType } from '@livedoc/text-documents';
import { downloadFileName } from '@livedoc/office-packages';
import {
  DrawingPictures,
  Pictures,
  TextDocumentState,
  writeTextDocumentFile,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';

const MEDIA_TYPES = {
  odt: 'application/vnd.oasis.opendocument.text',
  fodt: 'application/vnd.oasis.opendocument.text-flat-xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/** A written file: its bytes, its name, and how many pictures it left out, their media not read. */
export type WrittenTextDocumentFile = { blob: Blob; fileName: string; leftOut: number };

export async function textDocumentFileOf(
  doc: Y.Doc,
  file: {
    format: TextDocumentFormat;
    name: string;
    // The file asked for: the format's own (an OpenDocument one may be flat), or the other format's converted copy.
    type?: TextDocumentFileType;
    // A gallery media's bytes (objects.md "Where the bytes live"): a picture it cannot read is left out.
    readImage?: (imageId: string) => Promise<Uint8Array | undefined>;
    // Drawings drawn afresh for this file, by drawing tab (objects.md "In the file"); any other leaves as saved.
    drawn?: ReadonlyMap<string, Uint8Array>;
  },
): Promise<WrittenTextDocumentFile> {
  const { format, name, readImage = async () => undefined } = file;
  const type = file.type ?? (format === 'ooxml' ? 'docx' : 'odt');
  const live = TextDocumentState.document(doc, format);
  // The fresh PNGs hold their bytes, so the gallery is not asked for them.
  const drawn = file.drawn?.size ? await DrawingPictures.redrawn(live, file.drawn) : live;
  const read = await Pictures.resolveMedia(drawn, readImage);
  if (read.unavailable.length > 0)
    debugLog('[text-document] pictures left out of the file', { media: read.unavailable });
  // Its title is the document's name, as the room writes it.
  const written = writeTextDocumentFile(
    { ...read.document, metadata: { ...live.metadata, title: name } },
    type,
  );
  return {
    blob: new Blob([written.bytes.slice().buffer], { type: MEDIA_TYPES[type] }),
    fileName: downloadFileName(name, type, 'Untitled'),
    leftOut: read.unavailable.length,
  };
}
