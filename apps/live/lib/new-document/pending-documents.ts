// Pending documents (docs/specs/013-workspace/new-document-menu.md "Opening at once"): a
// document made in the browser whose create has not landed. The Explorer adds one before it opens the editor in its
// place; the editor seeds from it instead of fetching, holds its saves until the create lands, and offers Try again
// when it fails. Memory only: a page load forgets it, by which time the create has landed or the page warned.
import type { Tab } from '@livedoc/document';
import type { ItemTypeCatalogue } from '@livedoc/items';
import { debugLog } from '@/lib/debug-log';
import type { SaveLocationId } from '@/lib/save-locations';
import { createFailureCopy, type CreateFailure } from './create-failure';
import { holdDocument, releaseDocument } from './create-hold';

export type NewDocumentPlace = { folderId?: string; teamId?: string };

export type PendingCreate =
  { status: 'creating' } | { status: 'landed' } | { status: 'failed'; failure: CreateFailure };

export type PendingDocumentInput = {
  id: string;
  name: string;
  // Whole, every element: the editor opens them as they are.
  tabs: Tab[];
  itemTypes: ItemTypeCatalogue | null;
  // Who is creating: the reader the editor opens as. A This Browser document's owner is the local sentinel.
  ownerId: string;
  location: SaveLocationId;
  teamId: string | null;
  // performance.now() at the click.
  startedAt: number;
};

export type PendingDocument = PendingDocumentInput & { create: PendingCreate };

type Entry = {
  doc: PendingDocument;
  // Resolved once the editor has painted the document (notePendingPainted), or after OPEN_PAINT_WAIT_MS.
  painted: Promise<void>;
  markPainted: () => void;
  write: (place: NewDocumentPlace) => Promise<void>;
  place: NewDocumentPlace;
  hasUnsavedChanges: (() => boolean) | null;
};

// The longest a create waits for the editor's first paint (D207).
export const OPEN_PAINT_WAIT_MS = 1000;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

function setCreate(id: string, create: PendingCreate): void {
  const entry = entries.get(id);
  if (!entry) return;
  entry.doc = { ...entry.doc, create };
  notify();
}

function runWrite(id: string, place: NewDocumentPlace): void {
  const entry = entries.get(id);
  if (!entry) return;
  entry.place = place;
  void entry.write(place).then(
    () => {
      debugLog(
        `[new-document] create-landed ms=${Math.round(performance.now() - entry.doc.startedAt)}`,
      );
      releaseDocument(id);
      setCreate(id, { status: 'landed' });
    },
    (error: unknown) => {
      const failure = createFailureCopy(error);
      console.warn(`[new-document] create-failed action=${failure.action}`, error);
      setCreate(id, { status: 'failed', failure });
    },
  );
}

// Registers the document and starts its create at once; requests naming it wait until it lands.
export function addPendingDocument(
  input: PendingDocumentInput,
  write: (place: NewDocumentPlace) => Promise<void>,
  place: NewDocumentPlace,
): void {
  holdDocument(input.id);
  let markPainted!: () => void;
  const painted = new Promise<void>((resolve) => {
    markPainted = resolve;
  });
  entries.set(input.id, {
    doc: { ...input, create: { status: 'creating' } },
    painted,
    markPainted,
    write,
    place,
    hasUnsavedChanges: null,
  });
  notify();
  // The create starts once the editor has painted the document (D207): one that lands at once (This Browser's) would
  // otherwise re-render the editor inside its first frame. A page that never paints (a background tab) waits at most
  // OPEN_PAINT_WAIT_MS. Nothing is lost meanwhile: saves are held until it lands.
  const timer = setTimeout(markPainted, OPEN_PAINT_WAIT_MS);
  void painted.then(() => {
    clearTimeout(timer);
    runWrite(input.id, place);
  });
}

// The editor has painted the document: its create may start.
export function notePendingPainted(id: string): void {
  entries.get(id)?.markPainted();
}

export function pendingDocument(id: string | null): PendingDocument | null {
  return id ? (entries.get(id)?.doc ?? null) : null;
}

export function subscribePendingDocuments(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Try again (the same place) or Save to My Documents (none), under the same ids: a create that reached the server
// but whose answer was lost is taken as the re-commit of an id its owner already has.
export function retryPendingDocument(id: string, opts: { withoutPlacement: boolean }): void {
  const entry = entries.get(id);
  if (!entry || entry.doc.create.status !== 'failed') return;
  debugLog(`[new-document] retry placement=${opts.withoutPlacement ? 'none' : 'same'}`);
  // Saved to My Documents: no longer filed in a team.
  if (opts.withoutPlacement) entry.doc = { ...entry.doc, teamId: null };
  setCreate(id, { status: 'creating' });
  runWrite(id, opts.withoutPlacement ? {} : entry.place);
}

// The open editor says whether it holds anything unsaved, for Back (isPendingSettled).
export function attachPendingEditor(id: string, hasUnsavedChanges: () => boolean): () => void {
  const entry = entries.get(id);
  if (entry) entry.hasUnsavedChanges = hasUnsavedChanges;
  return () => {
    const now = entries.get(id);
    if (now?.hasUnsavedChanges === hasUnsavedChanges) now.hasUnsavedChanges = null;
  };
}

// Landed, with nothing unsaved in its editor: the editor may go. An unknown document has nothing to keep.
export function isPendingSettled(id: string): boolean {
  const entry = entries.get(id);
  if (!entry) return true;
  return entry.doc.create.status === 'landed' && !(entry.hasUnsavedChanges?.() ?? false);
}

export function forgetPendingDocument(id: string): void {
  if (entries.delete(id)) notify();
}

export function resetPendingDocumentsForTests(): void {
  entries.clear();
  standbys.clear();
  listeners.clear();
}

// A standby document: the blank the New Document button's face would make next, prepared while
// the Explorer is idle so the editor can render it ahead, hidden. Nothing is created for it; the click makes it a
// pending document under the same ids (addPendingDocument), and a standby never used is dropped with the page.
const standbys = new Map<string, PendingDocument>();

export function addStandbyDocument(input: PendingDocumentInput): void {
  standbys.set(input.id, { ...input, create: { status: 'creating' } });
}

export function standbyDocument(id: string | null): PendingDocument | null {
  return id ? (standbys.get(id) ?? null) : null;
}

export function dropStandbyDocument(id: string): void {
  standbys.delete(id);
}
