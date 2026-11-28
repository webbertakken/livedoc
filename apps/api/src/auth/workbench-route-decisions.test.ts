import { describe, expect, it } from 'vitest';
import { workbenchRouteVerdict, type WorkbenchConfinementSession } from '@livedoc/api-schema';
import { ROUTE_MANIFEST } from '../openapi/manifest';

// Every route under one document, decided for a workbench session (docs/specs/013-workspace/workbench-embeds.md
// "What a workbench session may do", WB69): a route the api gains is decided here, or this test fails, so a tab
// kind's content is never confined by being forgotten. `allow` in the document scope is what the editor of one
// document calls; everything else stays `confined`. The workspace scope reaches every route but an agent's presence.

type Decision = 'allow' | 'confined';

const DOCUMENT_SCOPE: Record<string, Decision> = {
  'GET /documents/{id}': 'allow',
  'PUT /documents/{id}': 'allow',
  'DELETE /documents/{id}': 'confined',
  'GET /documents/{id}/shared-tabs': 'confined',
  'POST /documents/{id}/copy': 'confined',
  'PUT /documents/{id}/folder': 'confined',
  'GET /documents/{id}/tabs/{tabId}': 'allow',
  'PUT /documents/{id}/tabs/{tabId}': 'allow',
  'DELETE /documents/{id}/tabs/{tabId}': 'allow',
  'PUT /documents/{id}/tabs/{tabId}/name': 'allow',
  'POST /documents/{id}/tabs/{tabId}/changesets': 'allow',
  'GET /documents/{id}/changesets': 'allow',
  'GET /documents/{id}/changesets/{changesetId}': 'allow',
  'POST /documents/{id}/changesets/{changesetId}/revert': 'allow',
  // An agent's pages write, never the editor's.
  'POST /documents/{id}/tabs/{tabId}/pages': 'confined',
  'POST /documents/{id}/tabs/{tabId}/illustrate': 'confined',
  'POST /documents/{id}/tabs/{tabId}/comments': 'allow',
  'DELETE /documents/{id}/tabs/{tabId}/comments/{commentId}': 'allow',
  'POST /documents/{id}/tabs/{tabId}/comments/{commentId}/reply': 'allow',
  'POST /documents/{id}/tabs/{tabId}/comments/{commentId}/resolve': 'allow',
  'POST /documents/{id}/tabs/{tabId}/comments/{commentId}/reopen': 'allow',
  'GET /documents/{id}/tabs/{tabId}/render.svg': 'allow',
  // A text document's pages drawn for an agent, never the editor's.
  'GET /documents/{id}/tabs/{tabId}/page-previews': 'confined',
  'GET /documents/{id}/tabs/{tabId}/comment-pictures': 'allow',
  'PUT /documents/{id}/tabs/{tabId}/presence': 'confined',
  'DELETE /documents/{id}/tabs/{tabId}/presence': 'confined',
  'GET /documents/{id}/comments': 'allow',
  'PUT /documents/{id}/item-types': 'allow',
  // An agent's read of the plan, never the editor's.
  'GET /documents/{id}/plan': 'confined',
  'GET /documents/{id}/items': 'allow',
  'POST /documents/{id}/items': 'allow',
  'POST /documents/{id}/items/bulk': 'allow',
  'POST /documents/{id}/items/patches': 'allow',
  'POST /documents/{id}/items/tally': 'allow',
  'POST /documents/{id}/items/{itemId}': 'allow',
  'DELETE /documents/{id}/items/{itemId}': 'allow',
  'POST /documents/{id}/items/{itemId}/move': 'allow',
  'POST /documents/{id}/items/{itemId}/comments': 'allow',
  'DELETE /documents/{id}/items/{itemId}/comments/{commentId}': 'allow',
  'POST /documents/{id}/items/{itemId}/comments/resolve': 'allow',
  'POST /documents/{id}/items/{itemId}/comments/reopen': 'allow',
  // A Sheet's sheets.
  'GET /documents/{id}/sheets': 'allow',
  'POST /documents/{id}/sheets': 'allow',
  'DELETE /documents/{id}/sheets/{sheetId}': 'allow',
  'POST /documents/{id}/sheets/{sheetId}/writes': 'allow',
  // A spreadsheet's comment threads, as the editor's comments.
  'GET /documents/{id}/sheet-threads': 'allow',
  'POST /documents/{id}/sheets/{sheetId}/threads': 'allow',
  // An opened file's threads, stored as the editor's File › Open stores them.
  'POST /documents/{id}/sheets/{sheetId}/file-threads': 'allow',
  // A workbench writes no agent changesets (agent-changesets.md "Whole-tab saves and tab renames").
  'POST /documents/{id}/sheets/{sheetId}/changesets': 'confined',
  'GET /documents/{id}/sheets/{sheetId}/cells': 'allow',
  // A spreadsheet's workbook; its imports read other documents (WB68).
  'GET /documents/{id}/workbook': 'allow',
  'GET /documents/{id}/workbook/file': 'allow',
  'GET /documents/{id}/workbook/conversion': 'allow',
  'POST /documents/{id}/workbook/conversion': 'allow',
  'PUT /documents/{id}/workbook/settings': 'allow',
  'PUT /documents/{id}/workbook/functions': 'allow',
  // Its kept content, the file it was opened from, and nothing outside it.
  'GET /documents/{id}/workbook/kept': 'allow',
  'POST /documents/{id}/workbook/kept': 'allow',
  'GET /documents/{id}/workbook/imports': 'confined',
  'POST /documents/{id}/workbook/imports': 'confined',
  // Read by another document's dashboard (docs/specs/029-sheets/plan-links.md), never by its own editor.
  'GET /documents/{id}/workbook/link': 'confined',
  // A form in another document connected, or its connection taken back from the form's editor.
  'POST /documents/{id}/workbook/link': 'confined',
  'DELETE /documents/{id}/workbook/link': 'confined',
  'POST /documents/{id}/workbook/sheets': 'allow',
  'POST /documents/{id}/workbook/sheets/{sheetId}/rename': 'allow',
  'POST /documents/{id}/workbook/sheets/{sheetId}/move': 'allow',
  'DELETE /documents/{id}/workbook/sheets/{sheetId}': 'allow',
  // A text document.
  'GET /documents/{id}/text-documents/{tabId}/state': 'allow',
  'GET /documents/{id}/text-documents/{tabId}/file': 'allow',
  'POST /documents/{id}/text-documents/{tabId}/updates': 'allow',
  // Its versions: the editor's version history.
  'GET /documents/{id}/text-documents/{tabId}/versions': 'allow',
  'POST /documents/{id}/text-documents/{tabId}/versions': 'allow',
  'GET /documents/{id}/text-documents/{tabId}/versions/{versionId}': 'allow',
  'PUT /documents/{id}/text-documents/{tabId}/versions/{versionId}': 'allow',
  'POST /documents/{id}/text-documents/{tabId}/versions/{versionId}': 'allow',
  // The person's notification setting (review.md "Notifications").
  'GET /documents/{id}/notification-settings': 'allow',
  'PUT /documents/{id}/notification-settings': 'allow',
  // A PDF document: its live changes and the stored file it holds.
  'GET /documents/{id}/pdf-documents/{tabId}/state': 'allow',
  'POST /documents/{id}/pdf-documents/{tabId}/updates': 'allow',
  // The first page's picture for the document's thumbnail is a person's own surface's to send, never a session's.
  'GET /documents/{id}/pdf-documents/{tabId}/thumbnail': 'confined',
  'PUT /documents/{id}/pdf-documents/{tabId}/thumbnail': 'confined',
  'GET /documents/{id}/files/{key}': 'allow',
  // An Event Storming board's domain export.
  'POST /documents/{id}/tabs/{tabId}/storm-export': 'allow',
  // A Form tab: an agent's whole-form write is not the editor's; its link, seen and Preview are.
  'POST /documents/{id}/tabs/{tabId}/form': 'confined',
  'GET /documents/{id}/tabs/{tabId}/form-link': 'allow',
  'POST /documents/{id}/tabs/{tabId}/form-link': 'allow',
  'PUT /documents/{id}/tabs/{tabId}/form-link': 'allow',
  'DELETE /documents/{id}/tabs/{tabId}/form-link': 'allow',
  'POST /documents/{id}/tabs/{tabId}/form-seen': 'allow',
  'POST /documents/{id}/tabs/{tabId}/form-preview': 'allow',
  'POST /documents/{id}/tabs/{tabId}/qa': 'allow',
  // Another document's tab, or ownership powers.
  'POST /documents/{id}/tabs/{tabId}/link': 'confined',
  'GET /documents/{id}/share': 'confined',
  'POST /documents/{id}/share': 'confined',
  'DELETE /documents/{id}/share': 'confined',
  'PUT /documents/{id}/share-password': 'confined',
  'PUT /documents/{id}/share/{code}': 'confined',
  'DELETE /documents/{id}/share/{code}': 'confined',
  'POST /documents/{id}/share/{code}/extend': 'confined',
  // The Explorer's thumbnail.
  'GET /documents/{id}/thumbnail': 'confined',
  'POST /documents/{id}/room-ticket': 'allow',
  // The socket is reached by its room ticket, never the session.
  'GET /documents/{id}/ws': 'confined',
};

const WORKSPACE_CONFINED = new Set([
  'PUT /documents/{id}/tabs/{tabId}/presence',
  'DELETE /documents/{id}/tabs/{tabId}/presence',
]);

const DOC = 'doc1';
const documentSession: WorkbenchConfinementSession = {
  scope: 'document',
  documentId: DOC,
  ownerId: 'user_1',
};
const workspaceSession: WorkbenchConfinementSession = {
  scope: 'workspace',
  documentId: null,
  ownerId: 'user_1',
};

const documentRoutes = ROUTE_MANIFEST.filter((r) => r.path.startsWith('/documents/{id}')).map(
  (r) => `${r.method} ${r.path}`,
);

// `GET /documents/{id}/tabs/{tabId}` as the api splits it, each placeholder an id.
function segmentsOf(path: string): string[] {
  return [
    'api',
    ...path
      .slice(1)
      .split('/')
      .map((part) => (part === '{id}' ? DOC : part.startsWith('{') ? 'x1' : part)),
  ];
}

const verdictOf = (route: string, session: WorkbenchConfinementSession) => {
  const [method, path] = route.split(' ') as [string, string];
  return workbenchRouteVerdict(method, segmentsOf(path), session);
};

describe('the workbench decisions for the routes of one document', () => {
  it('decide every route the manifest serves under a document, and no other', () => {
    expect(documentRoutes.filter((r) => !(r in DOCUMENT_SCOPE))).toEqual([]);
    expect(Object.keys(DOCUMENT_SCOPE).filter((r) => !documentRoutes.includes(r))).toEqual([]);
  });

  it.each(Object.entries(DOCUMENT_SCOPE))('the document scope answers %s with %s', (route, d) => {
    expect(verdictOf(route, documentSession)).toBe(d);
  });

  it.each(documentRoutes)(
    'the workspace scope reaches %s unless it is an agent’s presence',
    (route) => {
      expect(verdictOf(route, workspaceSession)).toBe(
        WORKSPACE_CONFINED.has(route) ? 'confined' : 'allow',
      );
    },
  );
});
