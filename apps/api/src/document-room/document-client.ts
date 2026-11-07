// The worker's way into a document's room (docs/specs/006-document/document-storage.md "Interfaces and
// contracts"): the one place that stubs DOCUMENT_ROOM. One client per document: the room's RPCs with the document id
// filled in, and a `fetch` that names the document on every call (X-Document-Id), so a room knows whose legacy state
// to take over (docs/specs/006-document/document-storage-move.md). Every read or
// write of one document's content from outside its routes comes through here.
//
// Inside the room itself the same call is a plain method call (DocumentRoom's local namespace), so code the worker
// and the room share (a document read's outline) costs no hop there.

import type { BugReportFiling } from '@livedoc/api-schema';
import type { Item } from '@livedoc/items';
import type { BugReportFileOutcome } from '../bug-reports/room-file';
import type { ContentSummary } from '../db/content-summary';
import type { Env } from '../types';
import type { MoveOutcome } from './content-move';
import type { DocumentCopy, DocumentOutline } from './document-content';
import type { CreateOutcome, DocumentSeed } from './document-create';
import { roomUnavailable, type RouteIdentity } from './document-route';
import type { DocumentRoomRpc } from './document-rpc';
import type { ShareAnswer, ShareMessage, SharedTabCopy } from './tab-shares';

/** Names the document on every worker-to-room fetch. */
export const DOCUMENT_ID_HEADER = 'X-Document-Id';

export type DocumentRoomClient = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  route(request: Request, identity: RouteIdentity): Promise<Response>;
  create(seed: DocumentSeed): Promise<CreateOutcome>;
  outline(): Promise<DocumentOutline>;
  hasTab(tabId: string): Promise<boolean>;
  placesImage(imageId: string, onlyTabId: string | null): Promise<boolean>;
  image(request: Request, identity: RouteIdentity): Promise<Response>;
  exportCopy(
    onlyTabId: string | null,
    redactAuthorsFor: string | null,
  ): Promise<DocumentCopy | null>;
  importCopy(copy: DocumentCopy): Promise<ContentSummary>;
  item(itemId: string): Promise<Item | null>;
  respondToForm(request: Request, identity: RouteIdentity): Promise<Response>;
  fileBugReport(tabId: string, filing: BugReportFiling): Promise<BugReportFileOutcome>;
  // A tab shared between documents (tab-shares.ts): the tab and its holders for one joining through this document,
  // the join recorded here, and what another holder (`from`) sends.
  sharedTabCopy(tabId: string): Promise<SharedTabCopy | null>;
  shareJoined(tabId: string, member: string, seenUpdatedAt: number): Promise<boolean>;
  receiveShares(from: string, messages: ShareMessage[]): Promise<ShareAnswer[]>;
  // The sweep's move of the document's content into the room (content-move.ts); null when D1 has no row for it.
  move(): Promise<MoveOutcome | null>;
};

type RoomStub = DocumentRoomRpc & {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  move(documentId: string): Promise<MoveOutcome | null>;
};

export function documentRoom(
  env: Pick<Env, 'DOCUMENT_ROOM'>,
  documentId: string,
): DocumentRoomClient {
  const ns = env.DOCUMENT_ROOM;
  // The stub's RPC types wrap every answer for the wire; the shapes here are the class's own.
  const room = ns.get(ns.idFromName(documentId)) as unknown as RoomStub;
  return {
    fetch: (input, init) => {
      if (typeof input !== 'string') {
        const request = new Request(input, init);
        request.headers.set(DOCUMENT_ID_HEADER, documentId);
        return room.fetch(request);
      }
      const headers = new Headers(init?.headers);
      headers.set(DOCUMENT_ID_HEADER, documentId);
      return room.fetch(input, { ...init, headers });
    },
    route: (request, identity) => room.route(documentId, request, identity),
    create: (seed) => room.create(documentId, seed),
    outline: () => room.outline(documentId),
    hasTab: (tabId) => room.hasTab(documentId, tabId),
    placesImage: (imageId, onlyTabId) => room.placesImage(documentId, imageId, onlyTabId),
    image: (request, identity) => room.image(documentId, request, identity),
    exportCopy: (onlyTabId, redact) => room.exportCopy(documentId, onlyTabId, redact),
    importCopy: (copy) => room.importCopy(documentId, copy),
    item: (itemId) => room.item(documentId, itemId),
    respondToForm: (request, identity) => room.respondToForm(documentId, request, identity),
    fileBugReport: (tabId, filing) => room.fileBugReport(documentId, tabId, filing),
    sharedTabCopy: (tabId) => room.sharedTabCopy(documentId, tabId),
    shareJoined: (tabId, member, seen) => room.shareJoined(documentId, tabId, member, seen),
    receiveShares: (from, messages) => room.receiveShares(documentId, from, messages),
    move: () => room.move(documentId),
  };
}

// A worker request answered by a room: the room's answer, or 503 `room_unavailable` when the call throws (D16).
export async function askRoom(request: Request, call: () => Promise<Response>): Promise<Response> {
  try {
    return await call();
  } catch (error) {
    return roomUnavailable(request, error);
  }
}
