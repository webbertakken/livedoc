// Replacing a PDF document's stored file (docs/specs/035-pdf-documents/live-editing-and-storage.md "Replacing the
// stored file"): what the PDF document declares to the room's shared replacement of a state with its row
// (docs/specs/006-document/kinds-outside-the-canvas.md "Live state"). A client that baked a new file asks; this
// judges the asking against the tab, the live changes and the sender's level, and says what the room writes and
// tells.
import {
  levelAtLeast,
  PDF_STORED_REASONS,
  type AccessLevel,
  type PdfReplacementRefusalName,
  type PdfStoredReason,
} from '@livedoc/api-schema';
import { FILE_TAB_MAX_BYTES, isBlobKey, pdfTabOf, type BlobKey } from '@livedoc/document';
import { PDF_MAX_PAGES, PdfLiveChanges } from '@livedoc/pdf-documents';
import { documentOwnerBlobSize } from '../db/blobs';
import type {
  LiveTabReplace,
  LiveTabReplacement,
  LiveTabReplacementAsked,
} from '../live-tabs/live-tab-kind';
import { previousStoredFileStatement } from './pdf-previous';

/** A replacement as a client asks it. */
export type PdfStoredAsked = {
  readonly tabId: string;
  readonly from: BlobKey;
  readonly blob: BlobKey;
  readonly size: number;
  readonly pages: number;
  readonly reason: PdfStoredReason;
  /** The fingerprint of the live changes the new file holds. */
  readonly at: string;
};

/** The least level each reason asks (live-editing-and-storage.md "Share roles"). */
const REASON_LEVEL: Record<PdfStoredReason, AccessLevel> = { budget: 'edit' };

const isCount = (value: unknown, most: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= most;

/** The asking an op holds, or null: every part is checked, since it arrives from a browser. */
export function parsePdfStored(op: unknown): PdfStoredAsked | null {
  if (typeof op !== 'object' || op === null) return null;
  const { kind, tabId, from, blob, size, pages, reason, at } = op as Record<string, unknown>;
  if (kind !== 'pdf-stored' || typeof tabId !== 'string') return null;
  if (!isBlobKey(from) || !isBlobKey(blob) || from === blob || !isBlobKey(at)) return null;
  if (!isCount(size, FILE_TAB_MAX_BYTES) || !isCount(pages, PDF_MAX_PAGES)) return null;
  const why = PDF_STORED_REASONS.find((known) => known === reason);
  return why ? { tabId, from, blob, size, pages, reason: why, at } : null;
}

const refused = (refusal: PdfReplacementRefusalName): LiveTabReplacement => ({ refusal });

async function judge(asking: LiveTabReplacementAsked): Promise<LiveTabReplacement> {
  const { env, documentId, tabId, tab, now } = asking;
  // `tabIdOf` has read the op already: it is one.
  const asked = parsePdfStored(asking.op)!;
  if (!levelAtLeast(asking.level, REASON_LEVEL[asked.reason])) return refused('level_too_low');
  const file = pdfTabOf(tab);
  if (!file || file.blob !== asked.from) return refused('stored_file_changed');
  // Nothing the room holds may be missing from the new file: a change stored since the bake is not in it.
  const held = await PdfLiveChanges.fingerprint(PdfLiveChanges.load(asking.stored));
  if (held !== asked.at) return refused('live_changes_moved');
  if (!env.FILES) return refused('files_unavailable');
  if ((await documentOwnerBlobSize(env, documentId, asked.blob)) !== asked.size)
    return refused('blob_missing');
  // The live changes stand on the new file from here: nothing but its name and its pages.
  const state = PdfLiveChanges.load();
  PdfLiveChanges.setStored(state, { blob: asked.blob, pages: asked.pages });
  const { blob, size, pages, reason, from } = asked;
  return {
    tab: { ...tab, blob, size },
    state: PdfLiveChanges.encode(state),
    statements: [previousStoredFileStatement(env, tabId, file, { at: now, reason })],
    told: [
      // Every editor's own copy of the tab's row follows, by the path a rename takes.
      { kind: 'tab-meta', tabId, patch: { blob, size } },
      { kind: 'pdf-stored', tabId, from, blob, size, pages, reason },
    ],
    log: `stored-file-replaced reason=${reason} from=${from.slice(0, 8)} to=${blob.slice(0, 8)}`,
  };
}

export const PDF_REPLACEMENT: LiveTabReplace = {
  op: 'pdf-stored',
  tabIdOf: (op) => parsePdfStored(op)?.tabId ?? null,
  judge,
};
