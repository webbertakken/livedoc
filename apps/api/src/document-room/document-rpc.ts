// The room's RPC surface (docs/specs/006-document/document-storage.md): what
// the worker asks of a document's room, as plain functions over the room's env. DocumentRoom binds each call to its
// one document and runs it here; the tests' rooms (test-sqlite-d1.ts) run the same functions over shared tables.
// The worker calls these only through document-client.ts.

import type { BugReportFiling } from '@livedoc/api-schema';
import type { Item } from '@livedoc/items';
import type { ContentSummary } from '../db/content-summary';
import { readItem } from '../db';
import { documentPlacesImage } from '../db/image-refs';
import { answerFormRequest } from '../routes/forms';
import { fileBugReportInRoom, type BugReportFileOutcome } from '../bug-reports/room-file';
import type { DocumentEnv } from '../types';
import { answerDocumentImage } from './document-image-request';
import {
  documentHasTab,
  exportDocumentCopy,
  importDocumentCopy,
  readDocumentOutline,
  type DocumentCopy,
  type DocumentOutline,
} from './document-content';
import { createDocumentContent, type CreateOutcome, type DocumentSeed } from './document-create';
import { answerDocumentRequest, documentRouteContext, type RouteIdentity } from './document-route';
import {
  receiveShares,
  recordShareJoin,
  sharedTabCopy,
  type ShareAnswer,
  type ShareMessage,
  type SharedTabCopy,
} from './tab-shares';

export type DocumentRoomRpc = {
  // One API request under /api/documents/:id/, answered by the same handlers (document-route.ts).
  route(documentId: string, request: Request, identity: RouteIdentity): Promise<Response>;
  // A create's content: the document row, tabs, items, sheets and deck; answers the first content summary.
  create(documentId: string, seed: DocumentSeed): Promise<CreateOutcome>;
  // The tabs (no bodies), deck and catalogue a document read carries.
  outline(documentId: string): Promise<DocumentOutline>;
  // Whether the document holds the tab (a tab-scoped link's mint and check, a workbench ticket).
  hasTab(documentId: string, tabId: string): Promise<boolean>;
  // Whether the document places the image (on one tab for a tab-scoped visitor): the byte endpoint's place check.
  placesImage(documentId: string, imageId: string, onlyTabId: string | null): Promise<boolean>;
  // A drawn snapshot, share card or live image of the document (document-image-request.ts).
  image(documentId: string, request: Request, identity: RouteIdentity): Promise<Response>;
  // A copy's two halves (document-content.ts).
  exportCopy(
    documentId: string,
    onlyTabId: string | null,
    redactAuthorsFor: string | null,
  ): Promise<DocumentCopy | null>;
  importCopy(documentId: string, copy: DocumentCopy): Promise<ContentSummary>;
  // One card of the document, or null (a team mention's check of a card comment).
  item(documentId: string, itemId: string): Promise<Item | null>;
  // A public form's doors, /api/forms/:code... (read, respond, report), for a form this document holds.
  respondToForm(documentId: string, request: Request, identity: RouteIdentity): Promise<Response>;
  // A bug report filed on the Bug Tracker board this document holds (docs/specs/016-platform/bug-reports.md).
  fileBugReport(
    documentId: string,
    tabId: string,
    filing: BugReportFiling,
  ): Promise<BugReportFileOutcome>;
  // A tab shared between documents (tab-shares.ts): a joining document's copy, the join recorded, and what
  // another holder (`from`) sends.
  sharedTabCopy(documentId: string, tabId: string): Promise<SharedTabCopy | null>;
  shareJoined(
    documentId: string,
    tabId: string,
    member: string,
    seenUpdatedAt: number,
  ): Promise<boolean>;
  receiveShares(documentId: string, from: string, messages: ShareMessage[]): Promise<ShareAnswer[]>;
};

export function documentRpc(
  env: DocumentEnv,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
): DocumentRoomRpc {
  return {
    route: (_documentId, request, identity) =>
      answerDocumentRequest(env, request, identity, waitUntil),
    create: (documentId, seed) => createDocumentContent(env, documentId, seed, waitUntil),
    outline: (documentId) => readDocumentOutline(env, documentId),
    hasTab: (documentId, tabId) => documentHasTab(env, documentId, tabId),
    placesImage: (documentId, imageId, onlyTabId) =>
      documentPlacesImage(env, documentId, imageId, onlyTabId),
    image: (documentId, request, identity) =>
      answerDocumentImage(documentRouteContext(env, request, identity, waitUntil), documentId),
    exportCopy: (documentId, onlyTabId, redactAuthorsFor) =>
      exportDocumentCopy(env, documentId, onlyTabId, redactAuthorsFor),
    importCopy: (documentId, copy) => importDocumentCopy(env, documentId, copy),
    item: (documentId, itemId) => readItem(env, documentId, itemId),
    respondToForm: (_documentId, request, identity) =>
      answerFormRequest(documentRouteContext(env, request, identity, waitUntil)),
    fileBugReport: (documentId, tabId, filing) =>
      fileBugReportInRoom(env, documentId, tabId, filing, waitUntil),
    sharedTabCopy: (documentId, tabId) => sharedTabCopy(env, documentId, tabId),
    shareJoined: (documentId, tabId, member, seenUpdatedAt) =>
      recordShareJoin(env, documentId, tabId, member, seenUpdatedAt),
    receiveShares: (documentId, from, messages) => receiveShares(env, documentId, from, messages),
  };
}
