// Response envelopes: the `{ <noun>: payload }` wrappers the api worker puts
// around the canonical types in ./index.ts. Named once here so every consumer
// of the wire (the live editor's api client, the MCP server's tools) reads
// the same shape instead of spelling `{ document: LiveDoc }` inline at each
// call site, where a renamed key would drift silently.

import type {
  LiveDoc,
  ParticipantRecord,
  DocumentSummary,
  Folder,
  ShareLink,
  TabRecord,
  TabSaveRecord,
  TeamListItem,
} from './index';
import type { TeamRecentDocument } from './recent-diagrams';

// GET / PUT /api/documents/:id, POST /api/documents (+ copy).
export type DocumentResponse = { document: LiveDoc };
// GET /api/documents/:id marked as the editor's open (X-Document-Open: 1): the tab it opens first and the reader's own
// participant row ride along (docs/specs/015-api/api.md). Absent from an api that answers no more than the document.
export type DocumentOpenResponse = DocumentResponse & {
  openedTab?: TabRecord | null;
  reader?: ParticipantRecord | null;
};
// GET /api/documents/:id/tabs/:tabId.
export type TabResponse = { tab: TabRecord };
// PUT /api/documents/:id/tabs/:tabId: the editor's save, answered without the content it sent.
export type TabSaveResponse = { tab: TabSaveRecord };
// GET /api/documents: the caller's personal library. With `?include=team-recent` it also carries the
// newest documents of the teams they have joined (docs/specs/019-marketing/returning-visitor.md).
export type DocumentListResponse = {
  documents: DocumentSummary[];
  teamRecent?: TeamRecentDocument[];
};
// POST /api/documents/:id/share (+ extend).
export type ShareLinkResponse = { link: ShareLink };
// GET /api/teams: the teams the caller belongs to (docs/specs/013-workspace/teams.md).
export type TeamsResponse = { teams: TeamListItem[] };
// GET /api/teams/:id/library: a team's shared folders + documents (docs/specs/013-workspace/team-shared-documents.md).
export type TeamLibraryResponse = { folders: Folder[]; documents: DocumentSummary[] };
