import type { Tab } from '@livedoc/document';
import type { SavedItemTypes } from '@/lib/api/item-types';
import { debugLog } from '@/lib/debug-log';
import { documentIdFromPath } from '@/lib/legacy-editor-path';
import { setLoadStep } from '@/lib/load-progress';
import { ensureCollabKey, hasConfirmedName } from '@/lib/local-identity';
import {
  notePendingPainted,
  pendingDocument,
  standbyDocument,
  type PendingDocument,
} from '@/lib/new-document/pending-documents';
import { OFFLINE_OWNER_ID } from '@/lib/offline/offline-store';
import { isOfflineLocation } from '@/lib/save-locations';
import { noteDocumentLoadEnded, startEditorTiming } from '@/lib/timing';
import type { Participant } from '@/lib/identity';

// What the editor starts from when it opens a pending document
// (docs/specs/013-workspace/new-document-menu.md): its first state, read once as the editor mounts, so the
// document is on screen in the editor's very first render, with no loading pass and no state set after it. Every tab
// is whole and loaded, none is fetched, and the autosave's baseline is the content the create writes, so what is done
// before the create lands is saved once it has. The counterpart of seed-fetched-document.ts, for a document with
// nothing on the server to fetch yet.
export type EditorSeed = {
  documentId: string;
  documentName: string;
  tabs: Tab[];
  activeId: string;
  loadedTabIds: Set<string>;
  itemTypes: SavedItemTypes;
  // A This Browser document is the local sentinel's; a LiveDoc one its creator's.
  ownerId: string;
  teamId: string | null;
  // The reader: the creator the Explorer already knew; their profile settles in the background (settleEarlyIdentity).
  self: Participant;
  nameConfirmed: boolean;
};

export function pendingEditorSeed(doc: PendingDocument, self: Participant): EditorSeed {
  return {
    documentId: doc.id,
    documentName: doc.name,
    tabs: doc.tabs,
    activeId: doc.tabs[0]!.id,
    loadedTabIds: new Set(doc.tabs.map((t) => t.id)),
    itemTypes: { itemTypes: doc.itemTypes, itemTypesRev: 0 },
    ownerId: isOfflineLocation(doc.location) ? OFFLINE_OWNER_ID : doc.ownerId,
    teamId: doc.teamId,
    self: { ...self, id: doc.ownerId, key: ensureCollabKey(), status: 'online' },
    nameConfirmed: hasConfirmedName(),
  };
}

// The seed for the document the editor opens, when it is pending or the standby: the one the Explorer renders it for
// (`documentId`), else the one the address names; null for every other open, which loads.
export function readEditorSeed(
  pathname: string,
  placeholder: Participant,
  documentId: string | null = null,
): EditorSeed | null {
  const url = new URL(pathname, 'http://editor');
  if (url.searchParams.has('s')) return null;
  const id = documentId ?? documentIdFromPath(url.pathname).id;
  const doc = pendingDocument(id) ?? standbyDocument(id);
  return doc && doc.tabs.length > 0 ? pendingEditorSeed(doc, placeholder) : null;
}

// The open of a seeded document, once it is on screen: the load is done, the open is timed from the click
// (NewDocumentOpen), logged `[new-document] opened ms=`, and the create starts after that first frame.
export function notePendingOpened(doc: PendingDocument): void {
  debugLog('[load] open from memory of a document just made');
  setLoadStep('done');
  noteDocumentLoadEnded();
  startEditorTiming('NewDocumentOpen', { from: doc.startedAt }).endAfterPaint((ms) =>
    debugLog(`[new-document] opened ms=${Math.round(ms)}`),
  );
  // Once that frame is on screen, the create may start (pending-documents.ts, D207).
  requestAnimationFrame(() => setTimeout(() => notePendingPainted(doc.id), 0));
}
