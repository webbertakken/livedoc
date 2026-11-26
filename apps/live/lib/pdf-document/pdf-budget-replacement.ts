// Replacing a PDF document's stored file for the budget (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "Replacing the stored file"; saving.md "When the stored file is replaced"): once the live changes pass
// `PDF_REPLACE_AT_BYTES`, an Editor's surface that has been idle bakes them into the file, stores the result and asks
// the room to make it the stored file. The room refuses a file that lacks anything it holds, so nothing is ever lost
// to a replacement; everyone, this surface too, then opens the new file as the room tells of it.
import type * as Y from 'yjs';
import type { PdfReplacementRefusalName, PdfStoredReason } from '@livedoc/api-schema';
import { blobKeyOf, type BlobKey } from '@livedoc/document';
import {
  PDF_REPLACE_AT_BYTES,
  PDF_REPLACE_IDLE_MS,
  PdfLiveChanges,
  type PdfEngine,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { bakePictures, type ReadPicture } from './download-pdf';

/** A replacement as this surface asks the room for it. */
export type PdfStoredAsking = {
  kind: 'pdf-stored';
  tabId: string;
  from: BlobKey;
  blob: BlobKey;
  size: number;
  pages: number;
  reason: PdfStoredReason;
  at: string;
};

export type PdfBudgetDeps = {
  tabId: string;
  /** The live changes, and the stored file they are on. */
  doc: Y.Doc;
  storedFile: BlobKey;
  pages: number;
  engine: Pick<PdfEngine, 'bake'>;
  /** A picture a mark names (a custom stamp's), read from where the document holds it. */
  readPicture?: ReadPicture;
  /** Whether this session may replace the stored file: an Editor's alone. */
  canReplace: () => boolean;
  /** Whether the room holds every change made here. */
  isSaved: () => boolean;
  /** Stores the new file's bytes for the document, unless they are held already. */
  store: (key: BlobKey, bytes: Uint8Array<ArrayBuffer>) => Promise<unknown>;
  /** Asks the room; true once it has made the file the stored file. */
  ask: (asking: PdfStoredAsking) => Promise<boolean>;
  /** Listens for the room refusing what this surface asked. */
  onRefused: (listener: (refusal: PdfReplacementRefusalName) => void) => () => void;
  /** The limits, the spec's unless a test sizes them. */
  atBytes?: number;
  idleMs?: number;
};

/** Why an idle surface did not replace the stored file, for the log. */
type Skipped =
  'not-able' | 'unsaved' | 'small' | 'bake' | 'rewrite' | 'lossy' | 'changed' | 'store';

export type PdfBudgetWatch = {
  /** Stop watching: a surface that goes, or whose stored file was replaced. */
  stop: () => void;
  /** Settles once a replacement under way has ended, however it ended. */
  settled: () => Promise<void>;
};

/** Watches the live changes and replaces the stored file for the budget when this surface is idle. */
export function watchPdfBudget(deps: PdfBudgetDeps): PdfBudgetWatch {
  const { tabId, doc } = deps;
  const atBytes = deps.atBytes ?? PDF_REPLACE_AT_BYTES;
  const idleMs = deps.idleMs ?? PDF_REPLACE_IDLE_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Counts every change, made here or arrived: a replacement begun before one is given up.
  let changes = 0;
  let replacing: Promise<void> | null = null;

  const skipped = (reason: Skipped) =>
    debugLog(`[pdf] replace-skipped reason=${reason} tab=${tabId}`);

  const arm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = stopped ? null : setTimeout(() => void whenIdle(), idleMs);
  };

  const replace = async (): Promise<void> => {
    const at = changes;
    const moved = () => stopped || changes !== at;
    const update = PdfLiveChanges.encode(doc);
    if (update.byteLength < atBytes) return skipped('small');
    const started = Date.now();
    const baked = await deps.engine.bake(update, await bakePictures(doc, deps.readPicture));
    if (!baked.ok) return skipped('bake');
    // A rewrite renumbers the file's objects, so page names would not carry: left to an Editor's own act.
    if (baked.kind !== 'addition') return skipped('rewrite');
    // A change the bake could not place lives only in the live changes: replacing would lose it.
    if (baked.anchorsLost > 0 || baked.fieldsLost > 0) return skipped('lossy');
    if (moved()) return skipped('changed');
    const blob = await blobKeyOf(baked.bytes);
    try {
      await deps.store(blob, baked.bytes);
    } catch (error) {
      debugLog(`[pdf] replace-store-failed tab=${tabId}`, String(error));
      return skipped('store');
    }
    if (moved()) return skipped('changed');
    const asking: PdfStoredAsking = {
      kind: 'pdf-stored',
      tabId,
      from: deps.storedFile,
      blob,
      size: baked.bytes.byteLength,
      pages: deps.pages,
      reason: 'budget',
      at: await PdfLiveChanges.fingerprint(PdfLiveChanges.load([update])),
    };
    const stored = await deps.ask(asking);
    debugLog(
      `[pdf] replace-asked reason=budget stored=${stored} bytes=${asking.size} ms=${Date.now() - started} tab=${tabId}`,
    );
  };

  async function whenIdle(): Promise<void> {
    timer = null;
    if (stopped || replacing) return;
    if (!deps.canReplace()) return skipped('not-able');
    // What was made here is on its way: idle again once the room has it.
    if (!deps.isSaved()) {
      skipped('unsaved');
      return arm();
    }
    replacing = replace().finally(() => {
      replacing = null;
    });
    await replacing;
  }

  const onUpdate = () => {
    changes += 1;
    arm();
  };
  doc.on('update', onUpdate);
  // Refused because the room holds a change the file lacked: tried again once idle. Any other refusal stands.
  const offRefused = deps.onRefused((refusal) => {
    debugLog(`[pdf] replace-refused name=${refusal} tab=${tabId}`);
    if (refusal === 'live_changes_moved') arm();
  });
  arm();
  return {
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      doc.off('update', onUpdate);
      offRefused();
    },
    settled: async () => {
      await replacing;
    },
  };
}
