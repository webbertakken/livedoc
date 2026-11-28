// A dashboard's reads of a spreadsheet's sheet (docs/specs/029-sheets/plan-links.md "Reading a sheet from another
// document", D505), one per sheet however many slots show it: asked through the api with the reader's own access, the
// sheet's values worked out again here by the same engine, and asked again every LINK_REFRESH_MS while a slot shows it
// and the page is visible, naming the version held so an unchanged workbook costs a few bytes. The last read stays
// once no slot shows it, for a picture of the dashboard (plan-export-sheets).
import { sheetFromJson, Workbook, type Sheet } from '@livedoc/sheets';
import { fetchWorkbookLink } from '@/lib/api/workbook-link';

/** How often a shown link is asked again. Safe range 5,000 to 60,000 ms. */
export const LINK_REFRESH_MS = 10_000;

export type LinkedSheetName = { id: string; title: string };

export type LinkedRead =
  | { state: 'loading' }
  | { state: 'denied' }
  | { state: 'too-large' }
  // The first ask failed: said so, with a Retry.
  | { state: 'failed' }
  | {
      state: 'ready';
      // Null when the workbook holds no such sheet (deleted), or none was asked for (a picker's list).
      sheet: Sheet | null;
      wb: Workbook;
      locale: string;
      // Counts up with each new read, so what is worked out from it is worked out again.
      version: number;
      // The spreadsheet's name, and its visible sheets in tab order.
      name: string;
      sheets: LinkedSheetName[];
    };

type Entry = {
  read: LinkedRead;
  // The workbook's version the read is of, asked again with.
  held: string | null;
  ownerId: string;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  asking: boolean;
};

const LOADING: LinkedRead = { state: 'loading' };
const entries = new Map<string, Entry>();
let reads = 0;

const keyOf = (documentId: string, sheetId: string) => `${documentId}:${sheetId}`;

function land(entry: Entry, read: LinkedRead): void {
  entry.read = read;
  for (const listener of entry.listeners) listener();
}

async function ask(documentId: string, sheetId: string, entry: Entry): Promise<void> {
  if (entry.asking) return;
  entry.asking = true;
  try {
    const answer = await fetchWorkbookLink(entry.ownerId, documentId, sheetId, entry.held);
    if (answer.kind !== 'read') {
      entry.held = null;
      land(entry, { state: answer.kind });
      return;
    }
    const { body } = answer;
    if ('unchanged' in body) return;
    const sheet = body.sheet ? sheetFromJson(body.sheet) : null;
    entry.held = body.version;
    land(entry, {
      state: 'ready',
      sheet,
      wb: new Workbook({ sheets: sheet ? [sheet] : [], locale: body.locale }),
      locale: body.locale,
      version: ++reads,
      name: body.name,
      sheets: body.sheets,
    });
  } catch (error) {
    console.warn('[dashboard] linked sheet read failed', {
      documentId,
      sheetId,
      error: String(error),
    });
    // A read already shown stays; only a first ask that fails says so.
    if (entry.read.state !== 'ready') land(entry, { state: 'failed' });
  } finally {
    entry.asking = false;
  }
}

/** Shows the link to `listener` until the returned call; the first to show it asks for it, and asking goes on while
 * any shows it. `sheetId` '' reads the workbook's sheets alone. */
export function subscribeLinkedRead(
  ownerId: string,
  documentId: string,
  sheetId: string,
  listener: () => void,
): () => void {
  const key = keyOf(documentId, sheetId);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      read: LOADING,
      held: null,
      ownerId,
      listeners: new Set(),
      timer: null,
      asking: false,
    };
    entries.set(key, entry);
  }
  const it = entry;
  it.ownerId = ownerId;
  it.listeners.add(listener);
  if (!it.timer) {
    if (it.read.state !== 'ready') void ask(documentId, sheetId, it);
    it.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void ask(documentId, sheetId, it);
    }, LINK_REFRESH_MS);
  }
  return () => {
    it.listeners.delete(listener);
    if (it.listeners.size === 0 && it.timer) {
      clearInterval(it.timer);
      it.timer = null;
    }
  };
}

/** The link's read now: loading until its first answer, and for a link never asked for. */
export function linkedRead(documentId: string, sheetId: string): LinkedRead {
  return entries.get(keyOf(documentId, sheetId))?.read ?? LOADING;
}

/** Asks for a failed link again. */
export function retryLinkedRead(documentId: string, sheetId: string): void {
  const entry = entries.get(keyOf(documentId, sheetId));
  if (!entry) return;
  land(entry, LOADING);
  void ask(documentId, sheetId, entry);
}

/** Drops every read and stops every ask (a test's reset; signing out). */
export function forgetLinkedReads(): void {
  for (const entry of entries.values()) if (entry.timer) clearInterval(entry.timer);
  entries.clear();
}
