// The route manifest: the single declarative description of the `/api/*` REST
// surface (docs/specs/015-api/api-documentation.md). Each entry names one endpoint's method, path template,
// auth mode, summary, request/response body, and meaningful status codes. The
// worker dispatch (index.ts → routes/*.ts) is segment-based and imperative, so
// THIS array is the declaration of the surface, and `route-parity.test.ts` pins
// it to the real handlers by probing the running dispatch: a path the worker
// serves without a manifest entry (or a manifest entry the worker doesn't
// serve) turns CI red.
//
// `requestSchema` / `responseSchema` are either a component name (a key of the
// generated COMPONENT_SCHEMAS, itself derived from @livedoc/api-schema) or
// an inline JSON Schema for the small envelopes that wrap a payload. Path
// parameters are derived from the `{param}` placeholders in `path` by
// document.ts, so they aren't repeated here.

import {
  LINT_VIEW_NAME,
  TAB_VIEW_NAMES,
  TEAM_RECENT_INCLUDE,
  TEAM_RECENT_LIMIT,
} from '@livedoc/api-schema';
import { NAME_MAX_LENGTH } from '@livedoc/document';
import { FIND_QUERY_MAX_LENGTH, VIEW_BUDGET_MAX } from '@livedoc/document-views';
import type { BodySchema } from './types';

/** How a caller authenticates (docs/specs/014-identity/auth-and-guest-access.md):
 *  - `public`: no identity required.
 *  - `guest-or-session`: the guest `X-Owner-Id` header OR a Bearer credential
 *    (a LiveDoc session token or an API token).
 *  - `session`: a Bearer credential only (a session token or an API token);
 *    guests are rejected. */
export type AuthMode = 'public' | 'guest-or-session' | 'session';

interface QueryParam {
  name: string;
  required: boolean;
  description: string;
}

const SHEET_TAB_QUERY: QueryParam = {
  name: 'tabId',
  required: false,
  description:
    "The tab a tab-scoped link reaches (required on one); a GET's tabId also narrows to that tab's sheets.",
};

const ITEM_TAB_QUERY: QueryParam = {
  name: 'tabId',
  required: false,
  description:
    'The tab a tab-scoped share link is confined to; the call then reaches only the items that tab shows.',
};

export interface RouteSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path template under the server base, e.g. `/documents/{id}/tabs/{tabId}`. */
  path: string;
  /** Top-level resource segment, matching index.ts's dispatch switch. Used by
   *  the drift test to assert manifest/handler parity. */
  segment: string;
  tag: string;
  summary: string;
  auth: AuthMode;
  /** Whether an external API-token holder would realistically call this (vs a
   *  first-party-only / internal endpoint). Surfaced in the doc so integrators
   *  can see the supported surface at a glance. */
  tokenUsable?: boolean;
  /** An old address still served for clients that predate a rename; documented so they are not
   *  surprised, marked so nobody new calls it. */
  deprecated?: boolean;
  query?: QueryParam[];
  requestSchema?: BodySchema;
  responseSchema?: BodySchema;
  /** Media type of the success body. Defaults to `application/json`; the SVG
   *  snapshot endpoints answer `image/svg+xml`. */
  responseMediaType?: string;
  /** A plain-text form of the success body beside the JSON one (a document view). */
  textResponse?: { description: string };
  /** Meaningful status codes. The first 2xx is the success response; the rest
   *  are documented with the shared Error schema by document.ts. */
  statuses: number[];
}

// Small helpers for the response envelopes the routes wrap payloads in. These
// are the ONLY hand-written shapes; the payloads they reference come from the
// generated component schemas.
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const listOf = (key: string, name: string): BodySchema => ({
  type: 'object',
  properties: { [key]: { type: 'array', items: ref(name) } },
  required: [key],
});
// A document name field: the worker shortens it to the name cap rather than
// rejecting it (docs/specs/006-document/name-length.md).
const nameField = {
  type: 'string',
  description:
    `At most ${NAME_MAX_LENGTH} characters; a longer name is stored shortened at a word boundary ` +
    'with an ellipsis, and whitespace runs collapse to one space.',
};
// The document views' query (docs/specs/024-agents/document-views.md): `view` turns the plain read into a
// view, text by default.
const VIEW_COMMON_QUERY = [
  { name: 'view', required: false, description: 'A view instead of the plain read.' },
  {
    name: 'json',
    required: false,
    description: '`1` answers the view as JSON (`OutlineView`, `GraphView`, …) instead of text.',
  },
  {
    name: 'budget',
    required: false,
    description: `Fit the view to this many tokens (characters ÷ 3), 1 to ${VIEW_BUDGET_MAX}; what it leaves out is named on its last line.`,
  },
  {
    name: 'door',
    required: false,
    description: '`cli` (default) or `mcp`: the syntax of the command the last line names.',
  },
];
const TAB_VIEW_QUERY = [
  {
    ...VIEW_COMMON_QUERY[0]!,
    description: `A view instead of the plain read: ${[...TAB_VIEW_NAMES, LINT_VIEW_NAME].join(', ')}. \`lint\` (the diagram lint) takes only \`json\`.`,
  },
  ...VIEW_COMMON_QUERY.slice(1),
  {
    name: 'only',
    required: false,
    description:
      'outline, layout: one element (a ref, unique prefix or id) and what nests under it.',
  },
  {
    name: 'coarse',
    required: false,
    description: 'layout: `1` for rows per container instead of geometry.',
  },
  {
    name: 'style',
    required: false,
    description: 'outline: `1` adds the non-default style attributes.',
  },
  {
    name: 'ref',
    required: false,
    description: 'show (required): the element, by ref, unique prefix or id.',
  },
  {
    name: 'q',
    required: false,
    description: `find (required): the text to look for, 1 to ${FIND_QUERY_MAX_LENGTH} characters.`,
  },
  { name: 'all', required: false, description: 'comments: `1` adds resolved threads.' },
  {
    name: 'range',
    required: false,
    description:
      "cells (a spreadsheet's sheet): an A1 cell or range, the used range when absent; outline on a spreadsheet's tab is its workbook.",
  },
];
const DOCUMENT_VIEW_QUERY = [
  {
    ...VIEW_COMMON_QUERY[0]!,
    description:
      '`overview`: one line per tab, its counts and revision, instead of the plain read.',
  },
  ...VIEW_COMMON_QUERY.slice(1),
];

const wrap = (key: string, name: string): BodySchema => ({
  type: 'object',
  properties: { [key]: ref(name) },
  required: [key],
});

/** A custom stamp as kept (custom-stamps.md "API"); no api-schema DTO: the record is the package's. */
const CUSTOM_STAMP = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string' },
    picture: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        type: { type: 'string', enum: ['png', 'jpeg'] },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
      required: ['key', 'type', 'width', 'height'],
    },
    natural: {
      type: 'object',
      properties: { width: { type: 'number' }, height: { type: 'number' } },
      required: ['width', 'height'],
    },
    // Whether it shows who and when under its picture; absent, it does not.
    dynamic: { type: 'boolean' },
    createdAt: { type: 'integer' },
    updatedAt: { type: 'integer' },
  },
  required: ['id', 'name', 'category', 'picture', 'natural', 'createdAt', 'updatedAt'],
} as const;

export const ROUTE_MANIFEST: RouteSpec[] = [
  // ---- Meta ----
  {
    method: 'GET',
    path: '/openapi.json',
    segment: 'openapi.json',
    tag: 'Meta',
    summary: 'This OpenAPI 3.1 description of the API. Public and unauthenticated.',
    auth: 'public',
    responseSchema: { type: 'object' },
    statuses: [200],
  },
  {
    method: 'GET',
    path: '/capabilities',
    segment: 'capabilities',
    tag: 'Meta',
    summary: 'Which optional server features are configured (e.g. AI).',
    auth: 'public',
    responseSchema: 'CapabilitiesResponse',
    statuses: [200],
  },

  // ---- Catalogues (docs/specs/015-api/cli.md) ----
  {
    method: 'GET',
    path: '/templates',
    segment: 'templates',
    tag: 'Catalogues',
    summary:
      'The template library: its categories and one entry a template, as list_templates gives them.',
    auth: 'public',
    responseSchema: 'TemplateCatalogueResponse',
    statuses: [200, 405],
  },
  {
    method: 'GET',
    path: '/templates/{kind}',
    segment: 'templates',
    tag: 'Catalogues',
    summary:
      'One template, built and read as an outline view; json=1 for the view as JSON. Unknown: 404 unknown_template with the kinds.',
    auth: 'public',
    query: [{ name: 'json', required: false, description: '1 for the outline as JSON.' }],
    responseMediaType: 'text/plain',
    responseSchema: { type: 'string' },
    statuses: [200, 404, 405],
  },
  {
    method: 'GET',
    path: '/icons',
    segment: 'icons',
    tag: 'Catalogues',
    summary:
      'Icons from the line-art and Technology catalogues for a query, best first, as the palette ranks them.',
    auth: 'public',
    query: [
      { name: 'query', required: true, description: '1 to 60 characters.' },
      { name: 'limit', required: false, description: '1 to 50; 20 by default.' },
    ],
    responseSchema: 'IconSearchResponse',
    statuses: [200, 400, 405],
  },
  {
    method: 'GET',
    path: '/schema',
    segment: 'schema',
    tag: 'Catalogues',
    summary: 'The element kinds edit operations make, one line each.',
    auth: 'public',
    responseMediaType: 'text/plain',
    responseSchema: { type: 'string' },
    statuses: [200, 405],
  },
  {
    method: 'GET',
    path: '/schema/{kind}',
    segment: 'schema',
    tag: 'Catalogues',
    summary:
      'One kind: its first size, the aliases set takes with their values, and its stored fields. Unknown: 404 unknown_kind with the kinds.',
    auth: 'public',
    responseMediaType: 'text/plain',
    responseSchema: { type: 'string' },
    statuses: [200, 404, 405],
  },

  // ---- Documents ----
  {
    method: 'GET',
    path: '/documents',
    segment: 'documents',
    tag: 'Documents',
    summary: "List the caller's documents (metadata only, no tab contents).",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'include',
        required: false,
        description: `${TEAM_RECENT_INCLUDE} adds \`teamRecent\`: the ${TEAM_RECENT_LIMIT} newest non-empty documents of the teams the caller has joined, newest first, each with its \`teamName\`.`,
      },
    ],
    responseSchema: {
      type: 'object',
      properties: {
        documents: { type: 'array', items: ref('DocumentSummary') },
        teamRecent: {
          type: 'array',
          items: {
            allOf: [
              ref('DocumentSummary'),
              {
                type: 'object',
                properties: { teamName: { type: 'string' } },
                required: ['teamName'],
              },
            ],
          },
        },
      },
      required: ['documents'],
    },
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/documents',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Create a document, optionally seeding it with tabs and filing it in a team and/or folder. ' +
      'An invalid placement refuses the whole create by name (placement_invalid, team_forbidden, ' +
      'folder_not_found, folder_scope_mismatch) or a malformed intent (intent_invalid); nothing is ' +
      'written.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: nameField,
        tabs: {
          type: 'array',
          description:
            'The tabs to seed. A tab may give `graph`, `mermaid` or `template` in place of `elements`, compiled ' +
            'by the edit-operations engine; a tab it refuses refuses the create (422, with `tabId`).',
          items: {
            anyOf: [
              ref('Tab'),
              {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  theme: { type: 'string' },
                  graph: { type: 'object' },
                  mermaid: { type: 'string' },
                  template: { type: 'string' },
                },
                required: ['id'],
              },
            ],
          },
        },
        source: {
          anyOf: [ref('DocumentSource'), { type: 'null' }],
          description: 'The agent front door that made it; `ai` and `mcp` count as Made by AI.',
        },
        // Placement (docs/specs/013-workspace/folders.md "Placement on create").
        teamId: {
          type: ['string', 'null'],
          description:
            "The team library to file into; absent or null = the caller's My documents. " +
            'Requires a signed-in caller (or API token) who has joined the team.',
        },
        folderId: {
          type: ['string', 'null'],
          description:
            "A folder of the chosen space. null, present, is that space's root chosen on " +
            'purpose; absent with no teamId is no choice, where a default folder may answer.',
        },
        // The creation intent (docs/specs/013-workspace/default-folders.md).
        intent: {
          type: ['object', 'null'],
          description:
            'What the new document is made as, recorded on it (opensIn, tabKind, templateFamily). ' +
            "With no choice of place, the document lands in the caller's default folder for it: " +
            'the tab kind default, else the template family default, else the mode default, else ' +
            'the root of My documents. Malformed: intent_invalid (400).',
          properties: {
            mode: ref('TabOpening'),
            tabKind: { anyOf: [ref('CreationTabKind'), { type: 'null' }] },
            templateFamily: { anyOf: [ref('TemplateFamily'), { type: 'null' }] },
          },
          required: ['mode'],
        },
        // The document's own dates, ms since the epoch (docs/specs/015-api/api.md "Document dates").
        createdAt: { type: 'integer' },
        savedAt: { type: 'integer' },
        // Making a document is a use (docs/specs/015-api/api.md "Marking a document used").
        markUsed: {
          type: 'boolean',
          description:
            'Whether making the document counts as a use of it for the caller, so it joins their ' +
            'Jump back in at once. Default true; send false when making many documents in one go ' +
            '(the editor does for an import of more than one), so they wait until opened. Not a ' +
            'boolean: 400 invalid markUsed.',
        },
      },
      required: ['id', 'name'],
    },
    responseSchema: wrap('document', 'Document'),
    statuses: [201, 400, 401, 403, 404, 410, 413, 422],
  },
  {
    method: 'GET',
    path: '/documents/{id}',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Get a document (metadata + tab summaries; tab contents fetched separately), or with `view=overview` one line per tab.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: DOCUMENT_VIEW_QUERY,
    // The editor's open (`X-Document-Open: 1`) carries the tab it opens first and the reader's own row too.
    responseSchema: {
      type: 'object',
      properties: {
        document: ref('Document'),
        openedTab: {
          description:
            'With `X-Document-Open: 1`: the tab the reader opens first, as the tab read answers it; the open is recorded.',
          oneOf: [ref('TabRecord'), { type: 'null' }],
        },
        reader: {
          description:
            "With `X-Document-Open: 1`: the caller's own participant row, null before they have one.",
          oneOf: [ref('ParticipantRecord'), { type: 'null' }],
        },
      },
      required: ['document'],
    },
    textResponse: { description: 'With `view=overview`: the document and one line per tab.' },
    statuses: [200, 400, 401, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Update a document name and/or tab order.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        name: nameField,
        tabIds: { type: 'array', items: { type: 'string' } },
      },
    },
    responseSchema: wrap('document', 'Document'),
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Move a document to the Trash, restorable for 30 days. With permanent=true, delete it for good. 410 when it is already in the Trash (without permanent).',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'permanent',
        required: false,
        description:
          '"true" deletes the document for good instead of moving it to the Trash; also purges one already in the Trash.',
      },
    ],
    statuses: [204, 401, 403, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/shared-tabs',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Count the tabs a delete would leave in other documents.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: wrap('sharedTabs', 'SharedTabsSummary'),
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/copy',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "Duplicate a document into the caller's files. With folderId, filed in one of the caller's own folders (404 for any other). For a text document, comments: false leaves out every comment thread and rejects every pending suggestion; resolved: false leaves out resolved threads. Neither given: everything is kept. 400 for a choice of the wrong type.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        name: nameField,
        folderId: { type: ['string', 'null'] },
        comments: { type: 'boolean' },
        resolved: { type: 'boolean' },
      },
    },
    responseSchema: wrap('document', 'Document'),
    statuses: [201, 400, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/folder',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Move a document into a personal or team folder.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        folderId: { type: ['string', 'null'] },
        teamId: { type: ['string', 'null'] },
      },
    },
    statuses: [204, 400, 401, 403, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/tabs/{tabId}',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Get the full contents (elements) of one tab, with its revision (`rev`, also the weak `ETag`): what a changeset base names.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: TAB_VIEW_QUERY,
    responseSchema: wrap('tab', 'TabRecord'),
    textResponse: {
      description:
        'With `view`: the tab as text, its first line the header with `rev`. A ref that names nothing is 404 `target_not_found`, several 400 `target_ambiguous`, each with candidates (`RefErrorBody`).',
    },
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/tabs/{tabId}',
    segment: 'documents',
    tag: 'Documents',
    summary: `The editor's whole-tab save: create or replace one tab and its elements, merged with every changeset the editor had not seen (\`X-Changeset-Seen\`). An API token is refused with 405 \`use_changesets\`: scripts and agents write tabs with changesets. A new or changed tab name is stored shortened to ${NAME_MAX_LENGTH} characters. Answers the saved tab's record and new revision, not its content.`,
    auth: 'guest-or-session',
    requestSchema: 'Tab',
    responseSchema: wrap('tab', 'TabSaveRecord'),
    statuses: [200, 400, 401, 403, 404, 405, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/changesets',
    segment: 'documents',
    tag: 'Changesets',
    summary:
      'Change one tab with a changeset: ordered edit operations or one replace, applied atomically, shown live to everyone with the tab open, credited to you and revertable. Pass the base you read (rev and element fingerprints) to refuse a write over a change made since. A whole-tab replace on a tab id the document lacks creates that tab.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      { name: 'dryRun', required: false, description: '1: answer the plan without writing.' },
    ],
    requestSchema: 'ChangesetRequest',
    responseSchema: 'ChangesetResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410, 412, 413, 422],
  },
  {
    method: 'GET',
    path: '/documents/{id}/changesets',
    segment: 'documents',
    tag: 'Changesets',
    summary: "A document's changesets, newest first.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      { name: 'tab', required: false, description: 'Only this tab.' },
      { name: 'limit', required: false, description: 'At most this many, 1 to 100 (default 20).' },
    ],
    responseSchema: listOf('changesets', 'ChangesetSummary'),
    statuses: [200, 400, 401, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/changesets/{changesetId}',
    segment: 'documents',
    tag: 'Changesets',
    summary: 'One changeset, with the result lines it answered.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: 'ChangesetDetail',
    statuses: [200, 401, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/changesets/{changesetId}/revert',
    segment: 'documents',
    tag: 'Changesets',
    summary:
      'Revert a changeset: its inverse, applied as a new changeset by you. Elements changed since are kept as they are and listed. Possible for 30 days after it landed, by anyone with edit access to the tab.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: 'RevertResponse',
    statuses: [200, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/tabs/{tabId}/name',
    segment: 'documents',
    tag: 'Documents',
    summary: `Rename one tab. Advances the tab's revision and reaches everyone with the document open. Stored shortened to ${NAME_MAX_LENGTH} characters.`,
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: { type: 'object', properties: { name: nameField }, required: ['name'] },
    responseSchema: wrap('tab', 'TabSummary'),
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/pages',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Change the pages of a tab (add, set, lay out, move, duplicate, delete; up to 50, as one edit) or write an article from Markdown. Switches the tab into Pages and reaches everyone with the document open. Answers each page with its rectangle on the canvas.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: ref('PagesRequest'),
    responseSchema: 'PagesAnswer',
    statuses: [200, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/illustrate',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'The address of the pages call before Illustrate mode became Pages mode, kept for older clients. Use /documents/{id}/tabs/{tabId}/pages.',
    auth: 'guest-or-session',
    tokenUsable: true,
    deprecated: true,
    requestSchema: ref('PagesRequest'),
    responseSchema: 'PagesAnswer',
    statuses: [200, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/tabs/{tabId}',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Delete one tab from a document.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/comments',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Add a comment to an element on a tab; an API token is recorded on it for the audit trail.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { elementId: { type: 'string' }, text: { type: 'string' } },
      required: ['elementId', 'text'],
    },
    statuses: [201, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/tabs/{tabId}/comments/{commentId}',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Delete a comment you wrote.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/comments/{commentId}/reply',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Reply on the thread that holds a comment; it reopens a resolved thread.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    statuses: [201, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/comments/{commentId}/resolve',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Resolve the thread that holds a comment; resolving a resolved thread changes nothing.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 405, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/comments/{commentId}/reopen',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Reopen the thread that holds a comment; reopening an open thread changes nothing.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 405, 409, 410, 413],
  },
  {
    method: 'GET',
    path: '/documents/{id}/tabs/{tabId}/render.svg',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "One tab drawn by the shared renderer (images inlined when the host stores them); a spreadsheet's sheet tab draws its sheet and charts, from A1 or a range's top-left. 400 invalid_value for a range it cannot read or on a tab that is no spreadsheet's. Read-gated like the tab; never cached.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'range',
        required: false,
        description: "A spreadsheet's sheet tab: only this A1 cell or range.",
      },
    ],
    responseSchema: { type: 'string' },
    responseMediaType: 'image/svg+xml',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/tabs/{tabId}/presence',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "An agent's presence on a tab: a status line (up to 80 characters), focus (up to 20 refs) and a ttl (1 to 120 seconds; 30 by default). API tokens only; shown as the token's owner.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        focus: { type: 'array', items: { type: 'string' } },
        ttl: { type: 'integer' },
      },
    },
    responseSchema: wrap('presence', 'AgentPresenceResult'),
    statuses: [200, 400, 401, 403, 404, 409, 410, 503],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/tabs/{tabId}/presence',
    segment: 'documents',
    tag: 'Documents',
    summary: "Clear an agent's presence on a tab; 204 whether or not it was there.",
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 410, 503],
  },
  {
    method: 'GET',
    path: '/documents/{id}/comments',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "The comment threads across the document, in tab and outline order, with each element's ref and label. status=open (default), resolved or all.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [{ name: 'status', required: false, description: 'open (default), resolved or all.' }],
    responseSchema: listOf('threads', 'DocumentCommentThread'),
    statuses: [200, 400, 401, 403, 404, 405, 410],
  },
  // The document's type catalogue (docs/specs/026-plan/item-types.md).
  {
    method: 'PUT',
    path: '/documents/{id}/item-types',
    segment: 'documents',
    tag: 'Items',
    summary:
      "Store the document's item types, whole: up to 32 types, each with its fields and custom fields. null goes back to the default types (Project, Task, Note, Idea, Action). expectedRev names the revision (itemTypesRev) the change was made to: when another change landed since, 409 item_types_stale answers with the stored types and revision to re-apply the change to. Needs edit access to the whole document.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'ItemTypesRequest',
    responseSchema: 'ItemTypesResponse',
    statuses: [200, 400, 401, 403, 404, 405, 409, 410],
  },
  // The document's plan for agents (docs/specs/026-plan/plan-agents.md).
  {
    method: 'GET',
    path: '/documents/{id}/plan',
    segment: 'documents',
    tag: 'Items',
    summary:
      "The document's Plan boards, in tab then canvas order, with their columns; the statuses they name, each once with its column name; and the card types. A tab-scoped link passes tabId and gets that tab's boards.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    responseSchema: 'PlanResponse',
    statuses: [200, 401, 403, 404, 405, 410],
  },
  // The sheet store (docs/specs/029-sheets/sheet-store.md). A caller on a tab-scoped link adds ?tabId=.
  {
    method: 'GET',
    path: '/documents/{id}/sheets',
    segment: 'documents',
    tag: 'Sheets',
    summary:
      "The document's sheets, cells included: a tab's (tabId), named ones (ids, comma-separated, up to 50), or all. A tab-scoped link gets its tab's only.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      SHEET_TAB_QUERY,
      { name: 'ids', required: false, description: 'Sheet ids, comma-separated, up to 50.' },
    ],
    responseSchema: 'SheetsResponse',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/sheets',
    segment: 'documents',
    tag: 'Sheets',
    summary:
      "Make a sheet on a tab: blank, filled (a layout and up to 5,000 cells), or a copy of another of the document's sheets (copyOf). Titles are unique on a tab. Needs edit access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [SHEET_TAB_QUERY],
    requestSchema: 'SheetCreateRequest',
    responseSchema: 'SheetResponse',
    statuses: [201, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/sheets/{sheetId}',
    segment: 'documents',
    tag: 'Sheets',
    summary: 'Delete a sheet and its cells.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      SHEET_TAB_QUERY,
      {
        name: 'whenUnreferenced',
        required: false,
        description:
          'true to delete it once no element of the document references it (now, if none does): the editor deleting a Sheet with its element.',
      },
    ],
    statuses: [204, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/sheets/{sheetId}/writes',
    segment: 'documents',
    tag: 'Sheets',
    summary:
      'Change a sheet: cells (inputs and format keys, by row and column id), its layout (insert, delete, move, order, size, hide, freeze, merge, filter, a spreadsheet sheet tab colour and hiding; 409 sheet_last_visible for the last sheet shown) or its title. Answers the write as it landed, the new rev and the stored cells it touched.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [SHEET_TAB_QUERY],
    requestSchema: 'SheetWriteRequest',
    responseSchema: 'SheetWriteResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/sheets/{sheetId}/changesets',
    segment: 'documents',
    tag: 'Sheets',
    summary:
      "An agent's change to a sheet as one sheet changeset: its writes in order, every one landing or none (400 with the refused write's index), the revision advancing by one per write; recorded for the history and its revert (POST /documents/{id}/changesets/{changesetId}/revert). 412 stale_sheet when strict and the sheet moved on; 413 too_large past 200 writes, 50,000 cells or 8 MiB.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [SHEET_TAB_QUERY],
    requestSchema: 'SheetChangesetRequest',
    responseSchema: 'SheetChangesetResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410, 412, 413],
  },
  {
    method: 'GET',
    path: '/documents/{id}/sheets/{sheetId}/cells',
    segment: 'documents',
    tag: 'Sheets',
    summary:
      "One page of a sheet's cells: those of the rows at positions [from, to) in its order at the answered rev, to clamped to its rows, at most 5,000 rows. 400 rows_invalid; 409 sheet_busy when writes keep landing. Read access; a tab-scoped link reads only its tab's.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      SHEET_TAB_QUERY,
      {
        name: 'rows',
        required: true,
        description: 'The rows by position, <from>-<to>, half-open.',
      },
    ],
    responseSchema: 'SheetCellsResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  // A text document's live state and file (docs/specs/034-text-documents/live-editing-and-storage.md "Storage",
  // files-and-print.md "Downloading").
  {
    method: 'GET',
    path: '/documents/{id}/text-documents/{tabId}/state',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      "A text document's live state as one Yjs update: the seed merged with every update the room stored; with since, only what it holds beyond that state vector. Its own state vector rides X-State-Vector (base64). 400 state_vector_invalid; 404 text_document_not_found when the tab is absent or another kind. Read access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'since',
        required: false,
        description: 'A state vector, base64: answer only what the state holds beyond it.',
      },
    ],
    responseMediaType: 'application/octet-stream',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/text-documents/{tabId}/file',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      'A text document as a file, written from its live state and named after the document: odt, fodt or docx (the other format’s a converted copy, X-Conversion-Losses counting what it could not hold), or txt, md, html (zipped with its pictures), epub and rtf written with suggestions accepted, X-Pictures-Left-Out counting pictures it could not read. 400 file_type_unknown. Read access.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'type',
        required: false,
        description: 'odt (the default), fodt, docx, txt, md, html, epub or rtf.',
      },
    ],
    responseMediaType: 'application/vnd.oasis.opendocument.text',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/text-documents/{tabId}/updates',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      'One Yjs update to a text document, its bytes as the body: for an update too large for a room frame. Stored by the room, then sent live to everyone on it. 400 update_invalid; 413 update_too_large; 404 text_document_not_found; 503 room_unavailable. Edit access (a tab-scoped link on its own tab).',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: { type: 'string', format: 'binary' },
    statuses: [204, 400, 401, 403, 404, 410, 413, 503],
  },
  // A text document's versions (docs/specs/034-text-documents/live-editing-and-storage.md "Versions").
  {
    method: 'GET',
    path: '/documents/{id}/text-documents/{tabId}/versions',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      "A text document tab's versions, newest first: automatic and named, each with who took it, what it was restored from and its editors. Edit access: Editors only (403 for a Participant or Viewer; 404 for a link confined to another tab); 404 text_document_not_found.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: 'TextDocumentVersionListDto',
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/text-documents/{tabId}/versions',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      'Names the current version: the newest version when nothing changed since it, else a version of now. 400 version_name_invalid or version_name_too_long; 409 named_versions_full; 503 room_unavailable. Edit access: Editors only (403 for a Participant or Viewer; 404 for a link confined to another tab); 404 text_document_not_found.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'TextDocumentVersionNameBody',
    responseSchema: 'TextDocumentVersionWriteDto',
    statuses: [200, 400, 401, 403, 404, 409, 410, 503],
  },
  {
    method: 'GET',
    path: '/documents/{id}/text-documents/{tabId}/versions/{versionId}',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      "One version read whole: its Yjs snapshot and the one before it (base64), each Yjs client id's author, and the deletions each editor made in it. 404 version_not_found. Edit access: Editors only (403 for a Participant or Viewer; 404 for a link confined to another tab); 404 text_document_not_found.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: 'TextDocumentVersionReadDto',
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/text-documents/{tabId}/versions/{versionId}',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      'Names, renames or (an empty name) unnames one version. 400 version_name_invalid or version_name_too_long; 404 version_not_found; 409 named_versions_full; 503 room_unavailable. Edit access: Editors only (403 for a Participant or Viewer; 404 for a link confined to another tab); 404 text_document_not_found.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'TextDocumentVersionNameBody',
    responseSchema: 'TextDocumentVersionWriteDto',
    statuses: [200, 400, 401, 403, 404, 409, 410, 503],
  },
  {
    method: 'POST',
    path: '/documents/{id}/text-documents/{tabId}/versions/{versionId}',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      'Restores a version (posting to a version makes it current again): a version of now is kept first, then one change by the restorer makes the document read as it (comment threads untouched), and the version of the result is answered. 404 version_not_found; 503 room_unavailable. Edit access: Editors only (403 for a Participant or Viewer; 404 for a link confined to another tab); 404 text_document_not_found.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: 'TextDocumentVersionWriteDto',
    statuses: [200, 401, 403, 404, 410, 503],
  },
  // A person's notification setting for a document (docs/specs/034-text-documents/review.md "Notifications").
  {
    method: 'GET',
    path: '/documents/{id}/notification-settings',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      "The caller's notification setting for the document: comments all, for-you or none, edits added-or-removed or none; the defaults (for-you, none) when they chose none. Only a signed-in account (403 account_required), only where email is configured (404 email_off); Participant access (403 for a Viewer).",
    auth: 'session',
    tokenUsable: true,
    responseSchema: 'NoticeSettingDto',
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/notification-settings',
    segment: 'documents',
    tag: 'Text documents',
    summary:
      "Keeps the caller's notification setting for the document, replacing any before it. 400 invalid_setting. Only a signed-in account (403 account_required), only where email is configured (404 email_off); Participant access (403 for a Viewer).",
    auth: 'session',
    tokenUsable: true,
    requestSchema: 'NoticeSettingDto',
    responseSchema: 'NoticeSettingDto',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  // A PDF document's live changes (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage").
  {
    method: 'GET',
    path: '/documents/{id}/pdf-documents/{tabId}/state',
    segment: 'documents',
    tag: 'PDF documents',
    summary:
      "A PDF document's live changes as one Yjs update: everything changed since its stored file, whose key rides X-Stored-File (fetch it from /documents/{id}/files/{key}); with since, only what lies beyond that state vector. The state's own vector rides X-State-Vector (base64). 400 state_vector_invalid; 404 pdf_not_found when the tab is absent or another kind. Read access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'since',
        required: false,
        description: 'A state vector, base64: answer only what the state holds beyond it.',
      },
    ],
    responseMediaType: 'application/octet-stream',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/pdf-documents/{tabId}/updates',
    segment: 'documents',
    tag: 'PDF documents',
    summary:
      "One Yjs update to a PDF document's live changes, its bytes as the body: for an update too large for a room frame. X-Stored-File names the stored file it was made on. Stored by the room, then sent live to everyone on it. An Editor's is stored as it is; a Participant's only when it changes what Reviewing changes, and of marks only their own. 400 update_invalid; 403 level_too_low or not_your_mark (a Participant's that changes a mark not their own); 409 update_unreadable (a Participant's that stands on changes the room lacks) or stored_file_changed (made on another stored file than the room holds); 413 update_too_large or live_changes_too_large; 404 pdf_not_found; 503 room_unavailable. A tab-scoped link on its own tab.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: { type: 'string', format: 'binary' },
    statuses: [204, 400, 401, 403, 404, 409, 410, 413, 503],
  },
  // A browser's thumbnail of a PDF document (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
  // thumbnail").
  {
    method: 'GET',
    path: '/documents/{id}/pdf-documents/{tabId}/thumbnail',
    segment: 'documents',
    tag: 'PDF documents',
    summary:
      "Whether this caller should send a picture of the PDF's first page for the document's thumbnail: { wanted }. True only for an Editor, on the document's first tab, where the server keeps snapshots and none is stored or the one stored was sent before the document was last saved. 404 pdf_not_found when the tab is no PDF tab.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: { type: 'object' },
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/pdf-documents/{tabId}/thumbnail',
    segment: 'documents',
    tag: 'PDF documents',
    summary:
      "The PDF's first page as a JPEG, its bytes as the body, for the document's thumbnail: for display only, stored marked as a browser's, never read back into the document. An Editor's only: 403 level_too_low. 400 thumbnail_invalid (not a JPEG, or a side of 0 or past 1,024 px); 413 thumbnail_too_large (past 200,000 bytes); 409 thumbnail_not_wanted (not the document's first tab); 404 pdf_not_found; 503 images_unavailable.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: { type: 'string', format: 'binary' },
    statuses: [204, 400, 401, 403, 404, 409, 410, 413, 503],
  },
  // The blob store's read (docs/specs/006-document/blob-store.md "Getting bytes out").
  {
    method: 'GET',
    path: '/documents/{id}/files/{key}',
    segment: 'documents',
    tag: 'Files',
    summary:
      "A blob the document holds (a PDF tab's stored file), its bytes exactly; a Range request is answered 206 with only those bytes. The key is its strong ETag, and the answer is immutable. 400 key_invalid; 404 blob_not_held when the document holds no such key, blob_missing when its bytes are gone; 416 range_not_satisfiable; 503 files_unavailable on a host without file storage. Read access (a tab-scoped link: its own tab's file).",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseMediaType: 'application/octet-stream',
    statuses: [200, 206, 304, 400, 401, 403, 404, 410, 416, 503],
  },
  // A spreadsheet's file (docs/specs/029-sheets/files-and-print.md, standard-mapping.md).
  {
    method: 'GET',
    path: '/documents/{id}/workbook',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "A spreadsheet to open: its workbook row and every sheet in tab order, each with its head, layout, cell count and the cells of its first rowsLoaded rows: the open tab's sheet its first rows, a sheet with no cells whole, any other none (fetch the rest from /sheets/{sheetId}/cells). 404 workbook_not_found when the document is no spreadsheet; 400 rows_invalid; 409 sheet_busy. Read access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'open',
        required: false,
        description: "The tab to open (the first tab's by default).",
      },
      {
        name: 'rows',
        required: false,
        description: 'The first rows to load, 0-<to> (0-200 by default).',
      },
    ],
    responseSchema: 'WorkbookResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/workbook/file',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "A spreadsheet as a file, written from its sheets with every formula's value cached beside it and named after the document: ods, fods or xlsx; in the other standard than the workbook's, a converted copy (the workbook keeps its format). csv or tsv write the sheet on the tab named (tab) as its values as shown, injection-safe, named '<spreadsheet> - <sheet>'. 404 workbook_not_found when the document is no spreadsheet, sheet_not_found when no sheet is on that tab; 400 file_type_unknown. Read access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'format',
        required: false,
        description:
          "The workbook's own format (the default), or another: ods, fods, xlsx; csv or tsv for one sheet.",
      },
      { name: 'tab', required: false, description: 'csv and tsv: the tab of the sheet to write.' },
    ],
    responseMediaType: 'application/vnd.oasis.opendocument.spreadsheet',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  // A spreadsheet converted to the other standard (docs/specs/029-sheets/files-and-print.md "Converting").
  {
    method: 'GET',
    path: '/documents/{id}/workbook/conversion',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "What a spreadsheet's file in another format cannot hold that one in its own could, one entry a kind: sheet names cut to Excel's 31 characters, formulas the new format's apps cannot calculate (with the functions they lack), formulas written as values only, text cut to Excel's 32,767 characters, columns past XFD. None within one standard. 400 file_type_unknown; 404 workbook_not_found. Read access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      { name: 'to', required: true, description: 'The format converted to: ods, fods, xlsx.' },
    ],
    responseSchema: 'WorkbookConversionResponse',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/workbook/conversion',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      'Convert a spreadsheet to the other standard: its file format alone changes, its sheets and cells stay as they are. Sent live to everyone on it. 400 file_type_unknown; 404 workbook_not_found; 409 format_same_standard when it is already in that standard. Edit access; never on a tab-scoped link.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookConvertRequest',
    responseSchema: 'WorkbookSettingsResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  // A spreadsheet's kept content (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content).
  {
    method: 'GET',
    path: '/documents/{id}/workbook/kept',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "A spreadsheet's kept content whole: what the file it was opened from held that LiveDoc does not model, as the file's own XML by where it sat (items), its relationships, and its package entries with their bytes as base64; null when it keeps none. Written back into files of its standard. 404 workbook_not_found. Read access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: 'WorkbookKeptResponse',
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/workbook/kept',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "Add one request's share of a file's kept content to a spreadsheet, as File › Open does after its create: up to 16 MB in all, an item up to 1 MB, an entry up to 5 MB. Each item one whole element or one attribute of its standard's places; entries' names safe, not LiveDoc's own, not what the office packages drop. 400 kept_invalid, kept_item_invalid, kept_part_invalid, kept_relationship_invalid or kept_anchor_invalid; 404 workbook_not_found; 409 kept_standard_mismatch; 413 kept_too_large. Nothing of a refused request is stored. Edit access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookKeptDto',
    responseSchema: 'WorkbookKeptStoredResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410, 413],
  },
  // A spreadsheet's sheets and settings changed (docs/specs/029-sheets/sheet-store.md "Changing the workbook").
  {
    method: 'PUT',
    path: '/documents/{id}/workbook/settings',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "Save a spreadsheet's settings whole: locale, time zone, recalculation and iterative calculation. Sent live to everyone on it. 400 settings_invalid; 404 workbook_not_found when the document is no spreadsheet. Edit access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookSettingsRequest',
    responseSchema: 'WorkbookSettingsResponse',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/workbook/functions',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "Save a spreadsheet's named functions whole, as Data › Named Functions does: each a name in capitals (not a built-in function's), its argument placeholders, a definition reading cells only through them and named ranges, a description and argument hints. The later of two saves stands. Sent live to everyone on it. 400 functions_invalid; 413 functions_full past 100; 404 workbook_not_found when the document is no spreadsheet. Edit access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookFunctionsRequest',
    responseSchema: 'WorkbookSettingsResponse',
    statuses: [200, 400, 401, 403, 404, 410, 413],
  },
  // A spreadsheet's imports from the web (docs/specs/029-sheets/imports.md), and IMPORTRANGE's reads of other
  // spreadsheets (formulas.md "Other workbooks").
  {
    method: 'GET',
    path: '/documents/{id}/workbook/imports',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      'Fetch one IMPORTDATA, IMPORTFEED, IMPORTHTML or IMPORTXML for a spreadsheet: its rows of text, or the error the cell shows; kind=image answers the bytes of a picture IMAGE shows (PNG, JPEG, GIF, WebP, AVIF, BMP or an icon, by its first bytes), else 422 image_refused. Kept an hour for everyone; fresh=1 skips that. 400 import_invalid; 403 imports_not_allowed until an Editor allows access; 404 workbook_not_found; 429 past 60 fetches a minute per spreadsheet. Off unless the deployment sets SHEET_IMPORTS=on. kind=range reads an IMPORTRANGE range of another LiveDoc spreadsheet with the caller’s own access, as values, whatever SHEET_IMPORTS: until an Editor connects the source it answers "You need to connect these sheets." with connect true. Read access.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      { name: 'kind', required: true, description: 'data, feed, html, xml, image or range.' },
      {
        name: 'url',
        required: false,
        description: 'The address to fetch, http or https (all but range).',
      },
      {
        name: 'source',
        required: false,
        description: "range: the source spreadsheet's document id.",
      },
      {
        name: 'range',
        required: false,
        description: 'range: [sheet_name!]range, or a named range.',
      },
      {
        name: 'query',
        required: false,
        description: 'html: table or list; feed: items or feed, with a type.',
      },
      { name: 'index', required: false, description: 'html: which table or list, from 1.' },
      { name: 'xpath', required: false, description: 'xml: the XPath 1.0 query.' },
      {
        name: 'headers',
        required: false,
        description: 'feed: 1 for a first row of column titles, else 0.',
      },
      { name: 'items', required: false, description: 'feed: how many items, from 1.' },
      { name: 'fresh', required: false, description: '1 to fetch past the hour kept.' },
    ],
    responseSchema: {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        values: {
          type: 'array',
          description:
            "range: the source's cells: numbers, text, booleans, null, or { e } for an error.",
          items: { type: 'array', items: {} },
        },
        error: { type: 'string', enum: ['#N/A', '#REF!', '#VALUE!', '#ERROR!'] },
        why: { type: 'string' },
        connect: { type: 'boolean', description: 'range: the source is not yet connected.' },
      },
    },
    statuses: [200, 400, 401, 403, 404, 410, 422, 429],
  },
  {
    method: 'POST',
    path: '/documents/{id}/workbook/imports',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "Without a body, allow a spreadsheet's imports to fetch from the web, for good, as Google's Allow access. With { sources }, connect the spreadsheets its IMPORTRANGEs read, those the caller may open (403 when none), for good; 400 range_sources_invalid, 409 range_sources_full past 100. Sent live to everyone on it. 404 workbook_not_found. Edit access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookConnectRequest',
    responseSchema: 'WorkbookSettingsResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/workbook/sheets',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      'Add a sheet tab: its tab and a blank sheet of 1,000 rows by 26 columns, made as one, after the tab named, first for an empty name, or last. Named as asked, or Sheet<n>. With copyOf, a copy of that sheet (layout and cells) after it, named Copy of <name>. With seed, a sheet carried in whole from another spreadsheet (its layout and cells, checked as a new sheet), named from name by the sheet name rules. Naming a deleted sheet and its tab puts it back as it was. 400 write_invalid or sheet_name_invalid; 404 workbook_not_found, tab_not_found or sheet_not_found; 409 sheet_exists or sheet_name_taken; 413 sheets_full or workbook_full. Edit access; never on a tab-scoped link.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookSheetAddRequest',
    responseSchema: 'WorkbookSheetAddResponse',
    statuses: [201, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/workbook/sheets/{sheetId}/rename',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      "Rename a sheet: its title and its tab's name as one write, and every formula naming it follows. 400 sheet_name_invalid; 404 workbook_not_found or sheet_not_found; 409 sheet_name_taken or sheet_busy. Edit access; never on a tab-scoped link.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookSheetRenameRequest',
    responseSchema: 'WorkbookSheetRenameResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/workbook/sheets/{sheetId}/move',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      'Move a sheet: its tab goes after the tab named, or first for an empty name; SHEET counts the sheets in the new order. 400 write_invalid; 404 workbook_not_found, sheet_not_found or tab_not_found. Edit access; never on a tab-scoped link.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'WorkbookSheetMoveRequest',
    responseSchema: 'WorkbookSheetMoveResponse',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/workbook/sheets/{sheetId}',
    segment: 'documents',
    tag: 'Spreadsheets',
    summary:
      'Delete a sheet: its tab is removed and its sheet kept, unreferenced, until it expires, so adding it back with its ids restores it. 404 workbook_not_found or sheet_not_found; 409 sheet_last_visible for the last sheet shown. Edit access; never on a tab-scoped link.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 409, 410],
  },
  // The item store (docs/specs/026-plan/items.md). A caller on a tab-scoped link adds ?tabId=.
  {
    method: 'GET',
    path: '/documents/{id}/items',
    segment: 'documents',
    tag: 'Items',
    summary:
      "The document's items and the store's revision. A tab-scoped link passes tabId and gets the items that tab shows.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    responseSchema: 'ItemsResponse',
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items',
    segment: 'documents',
    tag: 'Items',
    summary:
      'Make an item: a type, its fields (a title at least) and an optional place (a status, and the item to sit after or before). Needs edit access.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    requestSchema: 'ItemCreate',
    responseSchema: 'ItemResponse',
    statuses: [201, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/bulk',
    segment: 'documents',
    tag: 'Items',
    summary:
      'Make up to 200 items in one write, in order. Needs edit access to the whole document.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: 'ItemsBulkRequest',
    responseSchema: 'ItemsResponse',
    statuses: [201, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/patches',
    segment: 'documents',
    tag: 'Items',
    summary:
      'Change up to 200 items in one write: each an item id with fields to set, fields to clear and optionally a new type. Every item is checked first, so one refusal (naming its item) changes nothing.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    requestSchema: 'ItemsPatchRequest',
    responseSchema: 'ItemsResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/tally',
    segment: 'documents',
    tag: 'Items',
    summary:
      "Add a session vote's tally to up to 200 cards: each a card id and its voters' dots. A card gone meanwhile is skipped. Needs edit access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    requestSchema: 'ItemsTallyRequest',
    responseSchema: 'ItemsResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/{itemId}',
    segment: 'documents',
    tag: 'Items',
    summary:
      'Change an item: fields to set, fields to clear (never the title or votes) and optionally a new type. Other fields are untouched.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    requestSchema: 'ItemPatchRequest',
    responseSchema: 'ItemResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/items/{itemId}',
    segment: 'documents',
    tag: 'Items',
    summary: 'Delete an item. Its key is never reused.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    statuses: [204, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/{itemId}/move',
    segment: 'documents',
    tag: 'Items',
    summary:
      "Move an item to a status and a place in that status's column (after or before another item), optionally setting or clearing a swimlane field (assignee, priority, or any lane field: Labels, Estimate, Start, Due or a custom field such as Parent) or its type.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    requestSchema: 'ItemMoveRequest',
    responseSchema: 'ItemResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/{itemId}/comments',
    segment: 'documents',
    tag: 'Items',
    summary:
      "Add a comment to an item's thread (a resolved thread reopens). The author is the caller; author ids reach only their author. Needs participate access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    requestSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    responseSchema: 'ItemResponse',
    statuses: [200, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/items/{itemId}/comments/{commentId}',
    segment: 'documents',
    tag: 'Items',
    summary: "Delete a comment from an item's thread: your own, or any with edit access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    responseSchema: 'ItemResponse',
    statuses: [200, 401, 403, 404, 405, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/{itemId}/comments/resolve',
    segment: 'documents',
    tag: 'Items',
    summary: "Resolve an item's thread; resolving a resolved thread changes nothing (204).",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    responseSchema: 'ItemResponse',
    statuses: [200, 204, 401, 403, 404, 405, 409, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/items/{itemId}/comments/reopen',
    segment: 'documents',
    tag: 'Items',
    summary: "Reopen an item's thread; reopening an open thread changes nothing (204).",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [ITEM_TAB_QUERY],
    responseSchema: 'ItemResponse',
    statuses: [200, 204, 401, 403, 404, 405, 409, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/tabs/{tabId}/comment-pictures',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "The published profile pictures of a tab's comment authors, keyed by comment id. Empty unless the caller is signed in.",
    auth: 'guest-or-session',
    responseSchema: {
      type: 'object',
      properties: { pictures: { type: 'object', additionalProperties: { type: 'string' } } },
    },
    statuses: [200, 403, 404],
  },
  // ---- Event Storming domain export (docs/specs/021-event-storming/domain-export.md "The zip") ----
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/storm-export',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "An Event Storming board's domain export as the zip's files: `{ language, previous?, bundleOnly? }` answers `{ files, written }`. With the deployment's model (behind the AI gates) the files hold a written spec and types; without one, or with bundleOnly, the board reading and the brief alone. 400 not_event_storming, language_invalid, previous_invalid; 413 board_too_large, previous_too_large; 502 ai_failed. Read access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        previous: { type: 'object', additionalProperties: { type: 'string' } },
        bundleOnly: { type: 'boolean' },
      },
      required: ['language'],
    },
    statuses: [200, 400, 401, 403, 404, 405, 413, 429, 502, 503],
  },
  // ---- Form links (docs/specs/030-forms/forms.md) ----
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/form',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "Replace a Form tab's form whole (an agent's form write): `{ form, rev? }`. The tab takes the form's heading as its name, and the change reaches everyone with the document open. 409 form_changed (with `rev`) when the tab moved past the revision given, 409 form_locked while the form takes responses and the change is more than its settings, 400 not_a_form_tab. Edit access.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { form: { type: 'object' }, rev: { type: 'integer', minimum: 0 } },
      required: ['form'],
    },
    statuses: [200, 400, 401, 403, 404, 409, 410, 413],
  },
  {
    method: 'GET',
    path: '/documents/{id}/tabs/{tabId}/form-link',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "A Form tab's link: whether it is published and open, how many responses it has, and how many the caller has not seen. Anyone who may read the tab; the code itself only to someone who may edit it.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: ref('FormLinkResponse'),
    statuses: [200, 400, 403, 404],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/form-link',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Publish the Form tab: make its public link. 409 form_already_published, 409 form_destination_missing (its board, column or card type is gone), 409 form_not_ready with its problems (no questions, an unworded question, a choice without options, a broken mapping or section rule), 403 form_suspensions (this document has had too many links suspended).',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: ref('FormLinkResponse'),
    statuses: [200, 400, 403, 404, 409],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/tabs/{tabId}/form-link',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Open or close the published form, keeping its link. Edit access.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { open: { type: 'boolean' } },
      required: ['open'],
    },
    responseSchema: ref('FormLinkResponse'),
    statuses: [200, 400, 403, 404],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/tabs/{tabId}/form-link',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Delete the form link; publishing again makes a new one. Edit access.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: ref('FormLinkResponse'),
    statuses: [200, 400, 403, 404],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/form-seen',
    segment: 'documents',
    tag: 'Documents',
    summary: "Mark the form's responses so far as seen by the caller (the Inbox and the New dots).",
    auth: 'guest-or-session',
    responseSchema: ref('FormLinkResponse'),
    statuses: [200, 400, 403, 404],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/form-preview',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'An Editor\'s Preview of the published form: sent as a counted response, its card titled "Preview: ...", taken while the form is closed too, with no email. 404 form_not_published when the form has no live link.',
    auth: 'guest-or-session',
    requestSchema: ref('FormResponseBody'),
    responseSchema: ref('FormResponseAccepted'),
    statuses: [201, 400, 403, 404, 409, 413, 429],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/qa',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "Apply one action to a Q&A board element. Readers may add and vote; running the board needs edit access. The voter and author are derived from the caller, never read from the body. A guest's upvote answers 429 vote_limit once its network holds the most guest voters the document takes.",
    auth: 'guest-or-session',
    requestSchema: {
      type: 'object',
      properties: {
        elementId: { type: 'string' },
        action: {
          type: 'object',
          description:
            'One of: add { id, text, anonymous }; vote { noteId, on }; discuss { noteId | null }; done, reopen or remove { noteId }; clear.',
          properties: {
            type: { enum: ['add', 'vote', 'discuss', 'done', 'reopen', 'remove', 'clear'] },
            id: { type: 'string' },
            text: { type: 'string' },
            anonymous: { type: 'boolean' },
            noteId: { type: ['string', 'null'] },
            on: { type: 'boolean' },
          },
          required: ['type'],
        },
      },
      required: ['elementId', 'action'],
    },
    responseSchema: {
      type: 'object',
      properties: {
        notes: { type: 'array', items: ref('QaNote') },
        rev: { type: 'integer' },
        voterId: { type: 'string' },
      },
      required: ['notes', 'rev', 'voterId'],
    },
    statuses: [200, 400, 401, 403, 404, 409, 410, 413, 429],
  },
  {
    method: 'POST',
    path: '/documents/{id}/tabs/{tabId}/link',
    segment: 'documents',
    tag: 'Documents',
    summary: 'Add (link) an existing tab into this document.',
    auth: 'guest-or-session',
    responseSchema: wrap('tab', 'TabSummary'),
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/share',
    segment: 'documents',
    tag: 'Sharing',
    summary: "List a document's share links and password state.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('links', 'ShareLink'),
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/share',
    segment: 'documents',
    tag: 'Sharing',
    summary: 'Create a share link (edit or view role, optional expiry).',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        role: ref('ShareRole'),
        expiry: ref('ShareLinkExpiry'),
        tabId: { type: ['string', 'null'] },
      },
      required: ['role'],
    },
    responseSchema: wrap('link', 'ShareLink'),
    statuses: [201, 400, 401, 403, 404, 410],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/share',
    segment: 'documents',
    tag: 'Sharing',
    summary: 'Revoke all share links for a document.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/share-password',
    segment: 'documents',
    tag: 'Sharing',
    summary: "Set or clear a document's share password.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { password: { type: ['string', 'null'] } },
      required: ['password'],
    },
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'DELETE',
    path: '/documents/{id}/share/{code}',
    segment: 'documents',
    tag: 'Sharing',
    summary: 'Revoke one share link by its code.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404, 410],
  },
  {
    method: 'PUT',
    path: '/documents/{id}/share/{code}',
    segment: 'documents',
    tag: 'Sharing',
    summary: 'Change which tabs a share link opens: one tab, or null for all.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { tabId: { type: ['string', 'null'] } },
      required: ['tabId'],
    },
    responseSchema: wrap('link', 'ShareLink'),
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'POST',
    path: '/documents/{id}/share/{code}/extend',
    segment: 'documents',
    tag: 'Sharing',
    summary: 'Re-arm an expiring share link.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: wrap('link', 'ShareLink'),
    statuses: [200, 400, 401, 403, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/thumbnail',
    segment: 'documents',
    tag: 'Documents',
    summary:
      "The document's cached SVG snapshot (a tab-scoped share visitor gets their tab). Read-gated like GET /documents/{id}; 404 when there is no snapshot.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      { name: 'v', required: false, description: 'Cache-buster (the savedAt stamp).' },
      {
        name: 'appearance',
        required: false,
        description:
          'light or dark: drawn as a viewer in that appearance sees it. Absent, drawn as stored.',
      },
    ],
    responseSchema: { type: 'string' },
    responseMediaType: 'image/svg+xml',
    statuses: [200, 400, 404],
  },
  {
    method: 'POST',
    path: '/documents/{id}/room-ticket',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'Mint a one-time ticket for opening the realtime room: pass it to the WebSocket upgrade as `?t=`. Same access policy as a read, share password included. Exempt from the write rate limit.',
    auth: 'guest-or-session',
    responseSchema: {
      type: 'object',
      properties: { ticket: { type: 'string' } },
      required: ['ticket'],
    },
    statuses: [200, 404, 410],
  },
  {
    method: 'GET',
    path: '/documents/{id}/ws',
    segment: 'documents',
    tag: 'Documents',
    summary:
      'WebSocket upgrade to the realtime room. The op protocol is documented in docs/specs/015-api/api.md, not here.',
    auth: 'guest-or-session',
    query: [
      { name: 's', required: false, description: 'Share code, for non-owner collaborators.' },
      { name: 'o', required: false, description: 'Owner id (guest path).' },
      { name: 'p', required: false, description: 'Share password, when the document is gated.' },
    ],
    statuses: [101, 403, 404],
  },
  // ---- Folders ----
  {
    method: 'GET',
    path: '/folders',
    segment: 'folders',
    tag: 'Folders',
    summary: "List the caller's personal folder tree.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('folders', 'Folder'),
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/folders',
    segment: 'folders',
    tag: 'Folders',
    summary: 'Create a folder (personal or team).',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        parentId: { type: ['string', 'null'] },
        teamId: { type: ['string', 'null'] },
      },
      required: ['id', 'name'],
    },
    responseSchema: wrap('folder', 'Folder'),
    statuses: [201, 400, 401, 403, 404, 409],
  },
  {
    method: 'PUT',
    path: '/folders/{id}',
    segment: 'folders',
    tag: 'Folders',
    summary: 'Rename or reparent a folder.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, parentId: { type: ['string', 'null'] } },
    },
    responseSchema: wrap('folder', 'Folder'),
    statuses: [200, 400, 401, 403, 404, 409],
  },
  {
    method: 'DELETE',
    path: '/folders/{id}',
    segment: 'folders',
    tag: 'Folders',
    summary: 'Delete a folder.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404],
  },

  // ---- Images ----
  // The blob store's upload (docs/specs/006-document/blob-store.md "Getting bytes in").
  {
    method: 'GET',
    path: '/files',
    segment: 'files',
    tag: 'Files',
    summary:
      "What the caller's blobs count: their bytes, each distinct key once, how many there are, and the deployment's allowance for one owner, null where it sets none. 503 files_unavailable on a host without file storage.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: {
      type: 'object',
      properties: {
        bytes: { type: 'integer' },
        blobs: { type: 'integer' },
        allowanceBytes: { type: ['integer', 'null'] },
      },
      required: ['bytes', 'blobs', 'allowanceBytes'],
    },
    statuses: [200, 401, 503],
  },
  {
    method: 'POST',
    path: '/files/{key}/uploads',
    segment: 'files',
    tag: 'Files',
    summary:
      "Begin storing a file in parts, or resume: size is the whole file's bytes. 200 held when the owner already holds the key; 200 with the owner's unfinished upload of that key and size and the parts storage has; else 201 with a new upload. Parts are partBytes each but the last. 400 key_invalid, size_invalid; 403 usage_exceeded (leftBytes); 413 file_too_large (limitBytes); 502 store_failed; 503 files_unavailable.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      { name: 'size', required: true, description: "The whole file's bytes." },
      {
        name: 'document',
        required: false,
        description: 'The document the bytes are for; they are then its owner’s.',
      },
    ],
    responseSchema: {
      type: 'object',
      properties: {
        held: { type: 'boolean' },
        upload: { type: 'string' },
        partBytes: { type: 'integer' },
        parts: { type: 'array', items: { type: 'integer' } },
      },
    },
    statuses: [201, 200, 400, 401, 403, 404, 413, 502, 503],
  },
  {
    method: 'PUT',
    path: '/files/{key}/uploads/{upload}/parts/{n}',
    segment: 'files',
    tag: 'Files',
    summary:
      'Store part n of an upload, counted from 1: the next part, or one already stored, which it replaces. The body is the part, with Content-Length: partBytes, or what is left of the size for the last. Answers the parts storage has. 400 part_invalid; 404 upload_not_found; 502 store_failed; 503 files_unavailable.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'document',
        required: false,
        description: 'The document the bytes are for; they are then its owner’s.',
      },
    ],
    requestSchema: { type: 'string', format: 'binary' },
    responseSchema: {
      type: 'object',
      properties: { parts: { type: 'array', items: { type: 'integer' } } },
      required: ['parts'],
    },
    statuses: [200, 400, 401, 403, 404, 502, 503],
  },
  {
    method: 'POST',
    path: '/files/{key}/uploads/{upload}/complete',
    segment: 'files',
    tag: 'Files',
    summary:
      'Put an upload’s parts together and store the whole under its key, checked against it as a single request is. 201 stored. 404 upload_not_found; 409 upload_incomplete (parts) before every part is stored; 422 key_mismatch when the whole does not hash to the key, which ends the upload; 502 store_failed, after which the complete may be tried again; 503 files_unavailable.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'document',
        required: false,
        description: 'The document the bytes are for; they are then its owner’s.',
      },
    ],
    responseSchema: {
      type: 'object',
      properties: { stored: { type: 'boolean' } },
      required: ['stored'],
    },
    statuses: [201, 400, 401, 403, 404, 409, 422, 502, 503],
  },
  {
    method: 'GET',
    path: '/files/{key}',
    segment: 'files',
    tag: 'Files',
    summary:
      'Whether the owner already holds the bytes with this key, the question an upload begins with: held true, so nothing need be sent, or false. With document, asked of that document’s owner, for whoever may edit it. 400 key_invalid; 503 files_unavailable on a host without file storage.',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'document',
        required: false,
        description: 'The document the bytes are for; its owner is then asked.',
      },
    ],
    responseSchema: {
      type: 'object',
      properties: { held: { type: 'boolean' } },
      required: ['held'],
    },
    statuses: [200, 400, 401, 403, 404, 503],
  },
  {
    method: 'PUT',
    path: '/files/{key}',
    segment: 'files',
    tag: 'Files',
    summary:
      "Store a file's bytes under their key, the bytes' SHA-256 as 64 lower-case hex characters: the body is the bytes, with Content-Length. 200 held when the owner already holds the key (GET on this path asks first), else 201 stored. With document, the bytes are stored for that document's owner and edit access to it is asked; without, for the caller, who is about to make a document with them. 400 key_invalid; 403 usage_exceeded (leftBytes) when the owner's allowance would be passed; 411 length_required; 413 file_too_large (limitBytes); 422 key_mismatch when the bytes do not hash to the key; 502 store_failed; 503 files_unavailable on a host without file storage.",
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [
      {
        name: 'document',
        required: false,
        description: 'The document the bytes are for; they are then its owner’s.',
      },
    ],
    requestSchema: { type: 'string', format: 'binary' },
    statuses: [201, 200, 400, 401, 403, 404, 411, 413, 422, 502, 503],
  },
  {
    method: 'GET',
    path: '/images',
    segment: 'images',
    tag: 'Images',
    summary: "List the caller's uploaded images.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('images', 'ImageSummary'),
    statuses: [200, 401, 503],
  },
  {
    method: 'POST',
    path: '/images',
    segment: 'images',
    tag: 'Images',
    summary: 'Upload an image (raw bytes; SHA-256 + dimensions in X-Image-* headers).',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: { type: 'string', format: 'binary' },
    responseSchema: {
      type: 'object',
      properties: { image: ref('ImageSummary'), deduped: { type: 'boolean' } },
      required: ['image', 'deduped'],
    },
    statuses: [200, 400, 401, 403, 409, 413, 415, 503],
  },
  {
    method: 'GET',
    path: '/images/usage',
    segment: 'images',
    tag: 'Images',
    summary: 'Map each image to the documents that reference it.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: { type: 'object' },
    statuses: [200, 401, 503],
  },
  {
    method: 'GET',
    path: '/images/{id}',
    segment: 'images',
    tag: 'Images',
    summary: 'Download an image (owner, or a share-code reader).',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [{ name: 'd', required: false, description: 'Document id, for share-code readers.' }],
    responseSchema: { type: 'string', format: 'binary' },
    statuses: [200, 404, 503],
  },
  {
    method: 'DELETE',
    path: '/images/{id}',
    segment: 'images',
    tag: 'Images',
    summary: 'Delete an image from the gallery.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [200, 401, 403, 503],
  },

  // ---- Custom themes ----
  {
    method: 'GET',
    path: '/custom-themes',
    segment: 'custom-themes',
    tag: 'Themes',
    summary: "List the caller's saved custom themes.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('themes', 'CustomTheme'),
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/custom-themes',
    segment: 'custom-themes',
    tag: 'Themes',
    summary: 'Create a custom theme.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        definition: ref('CustomThemeDefinition'),
      },
      required: ['id', 'name', 'definition'],
    },
    responseSchema: wrap('theme', 'CustomTheme'),
    statuses: [201, 400, 401, 413],
  },
  {
    method: 'PUT',
    path: '/custom-themes/{id}',
    segment: 'custom-themes',
    tag: 'Themes',
    summary: "Update a custom theme's name or definition.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, definition: ref('CustomThemeDefinition') },
    },
    responseSchema: wrap('theme', 'CustomTheme'),
    statuses: [200, 400, 401, 403, 404, 413],
  },
  {
    method: 'DELETE',
    path: '/custom-themes/{id}',
    segment: 'custom-themes',
    tag: 'Themes',
    summary: 'Delete a custom theme.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404],
  },

  // ---- Custom stamps (docs/specs/035-pdf-documents/custom-stamps.md "API") ----
  {
    method: 'GET',
    path: '/custom-stamps',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: "List the caller's custom stamps, newest first.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: {
      type: 'object',
      properties: { stamps: { type: 'array', items: CUSTOM_STAMP } },
    },
    statuses: [200, 401, 503],
  },
  {
    method: 'POST',
    path: '/custom-stamps',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: 'Make a custom stamp, its picture a blob the caller already holds.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: CUSTOM_STAMP,
    responseSchema: { type: 'object', properties: { stamp: CUSTOM_STAMP } },
    statuses: [201, 400, 401, 409, 413, 503],
  },
  {
    method: 'PATCH',
    path: '/custom-stamps/{id}',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: 'Rename a custom stamp, or move it to another category.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, category: { type: 'string' } },
    },
    responseSchema: { type: 'object', properties: { stamp: CUSTOM_STAMP } },
    statuses: [200, 400, 401, 404, 503],
  },
  {
    method: 'DELETE',
    path: '/custom-stamps/{id}',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: 'Delete a custom stamp.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 404, 503],
  },
  {
    method: 'PATCH',
    path: '/custom-stamps/categories/{category}',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: "Rename one of the caller's stamp categories, or merge it into another.",
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { category: { type: 'string' } },
      required: ['category'],
    },
    responseSchema: {
      type: 'object',
      properties: { stamps: { type: 'array', items: CUSTOM_STAMP } },
    },
    statuses: [200, 400, 401, 404, 503],
  },
  {
    method: 'DELETE',
    path: '/custom-stamps/categories/{category}',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: "Delete one of the caller's stamp categories and every stamp in it.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: {
      type: 'object',
      properties: { stamps: { type: 'array', items: CUSTOM_STAMP } },
    },
    statuses: [200, 401, 404, 503],
  },
  {
    method: 'GET',
    path: '/custom-stamps/{id}/picture',
    segment: 'custom-stamps',
    tag: 'Custom stamps',
    summary: "A custom stamp's picture, to its owner: PNG or JPEG bytes.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseMediaType: 'application/octet-stream',
    statuses: [200, 401, 404, 503],
  },

  // ---- Shape libraries ----
  {
    method: 'GET',
    path: '/shape-libraries',
    segment: 'shape-libraries',
    tag: 'Shape libraries',
    summary: "List the caller's shape libraries, newest first.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('libraries', 'ShapeLibrary'),
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/shape-libraries',
    segment: 'shape-libraries',
    tag: 'Shape libraries',
    summary: 'Create a shape library; a name already in use is suffixed.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        source: { type: 'string', enum: ['drawio'] },
        items: { type: 'array', items: ref('ShapeLibraryItem') },
      },
      required: ['id', 'name', 'source', 'items'],
    },
    responseSchema: wrap('library', 'ShapeLibrary'),
    statuses: [201, 400, 401, 409, 413],
  },
  {
    method: 'PUT',
    path: '/shape-libraries/{id}',
    segment: 'shape-libraries',
    tag: 'Shape libraries',
    summary: 'Rename a shape library, or replace its items.',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        items: { type: 'array', items: ref('ShapeLibraryItem') },
      },
    },
    responseSchema: wrap('library', 'ShapeLibrary'),
    statuses: [200, 400, 401, 403, 404, 409, 413],
  },
  {
    method: 'DELETE',
    path: '/shape-libraries/{id}',
    segment: 'shape-libraries',
    tag: 'Shape libraries',
    summary: 'Delete a shape library. Placed shapes stay in their documents.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404],
  },

  // ---- API tokens ----
  {
    method: 'GET',
    path: '/tokens',
    segment: 'tokens',
    tag: 'API tokens',
    summary: "List the caller's API tokens (metadata only; the secret is never returned).",
    auth: 'session',
    responseSchema: listOf('tokens', 'ApiToken'),
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/tokens',
    segment: 'tokens',
    tag: 'API tokens',
    summary: 'Mint an API token. The secret is returned once, here only.',
    auth: 'session',
    requestSchema: { type: 'object', properties: { name: { type: 'string' } } },
    responseSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'The secret, shown once.' },
        id: { type: 'string' },
        name: { type: ['string', 'null'] },
        expiresAt: { type: 'number' },
      },
      required: ['token', 'id', 'expiresAt'],
    },
    statuses: [201, 400, 401, 409],
  },
  {
    method: 'GET',
    path: '/tokens/current',
    segment: 'tokens',
    tag: 'API tokens',
    summary:
      "The token this request presented: its account, name, role and expiry (the CLI's auth status).",
    auth: 'session',
    tokenUsable: true,
    responseSchema: ref('CurrentTokenResponse'),
    statuses: [200, 401, 403, 404],
  },
  {
    method: 'DELETE',
    path: '/tokens/current',
    segment: 'tokens',
    tag: 'API tokens',
    summary:
      "Revoke the token this request presented; any token may revoke itself (the CLI's auth logout).",
    auth: 'session',
    tokenUsable: true,
    statuses: [204, 401, 403, 404],
  },
  {
    method: 'DELETE',
    path: '/tokens/{id}',
    segment: 'tokens',
    tag: 'API tokens',
    summary: 'Revoke an API token.',
    auth: 'session',
    statuses: [204, 401, 404],
  },

  // ---- Shared with you ----
  // ---- Report a Bug (docs/specs/016-platform/bug-reports.md) ----
  {
    method: 'POST',
    path: '/bug-reports',
    segment: 'bug-reports',
    tag: 'Bug reports',
    summary:
      "Report a bug: filed as a card on the Bug Tracker's private board (201, its number), else kept to be filed shortly (202). The reporter is the caller's identity, never the body. 400 invalid_bug_report with the problem, 413 payload_too_large past 1.5 MB, 429 rate_limited past 5 reports in 600 s, 503 bug_reports_unavailable.",
    auth: 'public',
    requestSchema: ref('BugReportSubmission'),
    responseSchema: ref('BugReportFiledResponse'),
    statuses: [201, 202, 400, 405, 413, 429, 503],
  },
  {
    method: 'GET',
    path: '/bug-reports/screenshots/{tag}/{file}',
    segment: 'bug-reports',
    tag: 'Bug reports',
    summary:
      "A bug report's screenshot, served only to the Bug Tracker document's owner. 404 for anyone else, an unknown or expired key, or a host with no Bug Tracker.",
    auth: 'guest-or-session',
    tokenUsable: true,
    responseMediaType: 'image/webp',
    statuses: [200, 404],
  },

  // ---- Worker issues (docs/specs/016-platform/worker-issues.md) ----
  {
    method: 'POST',
    path: '/worker-issues',
    segment: 'worker-issues',
    tag: 'Worker issues',
    summary:
      "A Cloudflare Workers Issues automation's webhook, for the host's operator: a new or returning worker error filed on the Bug Tracker (201), stored or held to be filed shortly (202), or a repeat, a vulnerability scan answered 404 or static (logged), or the destination's test (200), and emailed to the Bug Tracker's owner. Authenticated by the cf-webhook-auth secret; a host without WORKER_ISSUES_WEBHOOK_SECRET answers 404 not_found. 400 invalid_json or unknown_shape, 401 unauthorized, 413 payload_too_large past 1 MiB, 429 rate_limited, 503 worker_issues_unavailable.",
    auth: 'public',
    requestSchema: {
      type: 'object',
      description:
        'The Cloudflare Notifications webhook payload (name, text, data, ts, account_id, alert_type, ...).',
    },
    responseSchema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['filed', 'stored', 'held', 'repeat', 'logged', 'test'] },
        number: {
          type: 'integer',
          description: "The card's number on the Bug Tracker, when filed.",
        },
      },
      required: ['outcome'],
    },
    statuses: [201, 200, 202, 400, 401, 405, 413, 429, 503],
  },

  // ---- Forms, the public side (docs/specs/030-forms/forms.md "Filling in a form") ----
  {
    method: 'GET',
    path: '/forms/{code}',
    segment: 'forms',
    tag: 'Forms',
    summary:
      'A published form as respondents see it (never where its answers go), or that it is closed and why. 404 form_not_found for an unknown, deleted or suspended link. Limited per network.',
    auth: 'public',
    responseSchema: ref('PublicFormResponse'),
    statuses: [200, 404, 429],
  },
  {
    method: 'POST',
    path: '/forms/{code}/responses',
    segment: 'forms',
    tag: 'Forms',
    summary:
      "Send a response: it becomes one card on the form's board. 400 invalid_answers with an error per question, 409 form_closed, 413 form_full, 429 form_busy (the form's hourly cap) or rate_limited (per network).",
    auth: 'public',
    requestSchema: ref('FormResponseBody'),
    responseSchema: ref('FormResponseAccepted'),
    statuses: [201, 400, 404, 409, 413, 429],
  },
  {
    method: 'POST',
    path: '/forms/{code}/reports',
    segment: 'forms',
    tag: 'Forms',
    summary:
      'Report a form (spam, phishing, offensive, other), once per browser. Reports from three networks suspend its link for good.',
    auth: 'public',
    requestSchema: ref('FormReportBody'),
    statuses: [201, 400, 404, 429],
  },
  {
    method: 'GET',
    path: '/shared',
    segment: 'shared',
    tag: 'Sharing',
    summary: 'List documents shared with the caller.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('shared', 'SharedWithItem'),
    statuses: [200, 401],
  },
  {
    method: 'DELETE',
    path: '/shared/{documentId}',
    segment: 'shared',
    tag: 'Sharing',
    summary: 'Remove a document from the caller\'s "shared with you" list.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [200, 401],
  },
  {
    method: 'GET',
    path: '/share/{code}',
    segment: 'share',
    tag: 'Sharing',
    summary: 'Resolve a share code to a document and the granted role.',
    auth: 'public',
    query: [{ name: 'password', required: false, description: 'Required when the link is gated.' }],
    responseSchema: {
      type: 'object',
      properties: {
        document: ref('Document'),
        role: ref('ShareRole'),
        tabId: { type: ['string', 'null'] },
        openedTab: {
          description:
            'With `X-Document-Open: 1` and a known visitor: the tab they open first, as the tab read answers it; the open is recorded.',
          oneOf: [ref('TabRecord'), { type: 'null' }],
        },
        reader: {
          description:
            'With `X-Document-Open: 1` and a known visitor: their own participant row, null before they have one.',
          oneOf: [ref('ParticipantRecord'), { type: 'null' }],
        },
      },
      required: ['document', 'role', 'tabId'],
    },
    statuses: [200, 401, 403, 404, 410],
  },
  {
    method: 'GET',
    path: '/share/{code}/image.svg',
    segment: 'share',
    tag: 'Sharing',
    summary:
      'Live image: the shared document as SVG, embeddable by a bare <img>. Public by share code; a password-protected share has no image.',
    auth: 'public',
    query: [
      {
        name: 'tab',
        required: false,
        description: "Tab id; defaults to the first tab (or the link's own tab).",
      },
    ],
    responseSchema: { type: 'string' },
    responseMediaType: 'image/svg+xml',
    statuses: [200, 404, 410],
  },
  {
    method: 'GET',
    path: '/share/{code}/card',
    segment: 'share',
    tag: 'Sharing',
    summary:
      "A link preview's text: the shared document's name. 404 wherever the live image is (a dead code, a share password).",
    auth: 'public',
    responseSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    statuses: [200, 404],
  },
  {
    method: 'GET',
    path: '/share/{code}/image.png',
    segment: 'share',
    tag: 'Sharing',
    summary:
      "A link preview's picture: the live image's drawing on a 1200 x 630 PNG card. Redirects to the brand card when there is nothing to draw.",
    auth: 'public',
    responseSchema: { type: 'string' },
    responseMediaType: 'image/png',
    statuses: [200, 302, 404],
  },

  // ---- Participants ----
  {
    method: 'GET',
    path: '/participants/{id}',
    segment: 'participants',
    tag: 'Participants',
    summary:
      "Get a participant's display name and colour; their published picture only for a signed-in caller. Your own id before you have saved a profile answers { participant: null }.",
    auth: 'public',
    responseSchema: {
      type: 'object',
      properties: { participant: { oneOf: [ref('ParticipantRecord'), { type: 'null' }] } },
      required: ['participant'],
    },
    statuses: [200, 404],
  },
  {
    method: 'PUT',
    path: '/participants/{id}',
    segment: 'participants',
    tag: 'Participants',
    summary: 'Update your own participant display name and colour.',
    auth: 'guest-or-session',
    requestSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, color: { type: 'string' } },
      required: ['name', 'color'],
    },
    responseSchema: wrap('participant', 'ParticipantRecord'),
    statuses: [200, 400, 401, 403, 404],
  },
  {
    method: 'PUT',
    path: '/participants/{id}/picture',
    segment: 'participants',
    tag: 'Participants',
    summary:
      'Set or clear your published profile picture (a Google picture URL; signed-in session only).',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: { pictureUrl: { type: ['string', 'null'] } },
      required: ['pictureUrl'],
    },
    responseSchema: {
      type: 'object',
      properties: { pictureUrl: { type: ['string', 'null'] } },
    },
    statuses: [200, 400, 401, 403, 404],
  },

  // ---- Preferences ----
  {
    method: 'GET',
    path: '/preferences',
    segment: 'preferences',
    tag: 'Account',
    summary: "Get the caller's editor preferences (opaque blob).",
    auth: 'guest-or-session',
    responseSchema: { type: 'object', properties: { prefs: { type: 'object' } } },
    statuses: [200, 401],
  },
  {
    method: 'PUT',
    path: '/preferences',
    segment: 'preferences',
    tag: 'Account',
    summary: 'Replace the editor preferences blob.',
    auth: 'guest-or-session',
    requestSchema: {
      type: 'object',
      properties: { prefs: { type: 'object' } },
      required: ['prefs'],
    },
    statuses: [204, 400, 401],
  },

  // ---- Favourites (docs/specs/013-workspace/favourites.md) ----
  {
    method: 'GET',
    path: '/favourites',
    segment: 'favourites',
    tag: 'Account',
    summary: 'The document ids the caller has starred, newest first.',
    auth: 'guest-or-session',
    responseSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
    },
    statuses: [200, 401],
  },
  {
    method: 'PUT',
    path: '/favourites/{documentId}',
    segment: 'favourites',
    tag: 'Account',
    summary: 'Star a document for the caller. Idempotent; 404 when there is no such document.',
    auth: 'guest-or-session',
    statuses: [204, 401, 404],
  },
  {
    method: 'DELETE',
    path: '/favourites/{documentId}',
    segment: 'favourites',
    tag: 'Account',
    summary: 'Un-star a document for the caller.',
    auth: 'guest-or-session',
    statuses: [204, 401],
  },

  // ---- Tags (docs/specs/013-workspace/tags.md) ----
  {
    method: 'GET',
    path: '/tags',
    segment: 'tags',
    tag: 'Account',
    summary: "The caller's tags, alphabetical, and which live documents each is on.",
    auth: 'guest-or-session',
    responseSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              colour: { type: 'string' },
              createdAt: { type: 'integer' },
            },
          },
        },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: { tagId: { type: 'string' }, documentId: { type: 'string' } },
          },
        },
      },
    },
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/tags',
    segment: 'tags',
    tag: 'Account',
    summary:
      'Make a tag: a client-minted id, a name (1 to 32 characters, one per person ignoring case) and a colour ' +
      '(a standard colour name or #rrggbb). 409 tag_name_taken or tag_limit (100).',
    auth: 'guest-or-session',
    requestSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' }, colour: { type: 'string' } },
      required: ['id', 'name', 'colour'],
    },
    statuses: [201, 400, 401, 409],
  },
  {
    method: 'PUT',
    path: '/tags/{tagId}',
    segment: 'tags',
    tag: 'Account',
    summary: "Rename and / or recolour one of the caller's tags.",
    auth: 'guest-or-session',
    requestSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, colour: { type: 'string' } },
    },
    statuses: [200, 400, 401, 404, 409],
  },
  {
    method: 'DELETE',
    path: '/tags/{tagId}',
    segment: 'tags',
    tag: 'Account',
    summary: "Delete one of the caller's tags; it comes off every document.",
    auth: 'guest-or-session',
    statuses: [204, 401, 404],
  },
  {
    method: 'PUT',
    path: '/tags/{tagId}/documents/{documentId}',
    segment: 'tags',
    tag: 'Account',
    summary:
      "Put a tag on a document. Idempotent; 404 when the tag is not the caller's or there is no such document.",
    auth: 'guest-or-session',
    statuses: [204, 401, 404],
  },
  {
    method: 'DELETE',
    path: '/tags/{tagId}/documents/{documentId}',
    segment: 'tags',
    tag: 'Account',
    summary: 'Take a tag off a document.',
    auth: 'guest-or-session',
    statuses: [204, 401, 404],
  },

  // ---- Default folders (docs/specs/013-workspace/default-folders.md) ----
  {
    method: 'GET',
    path: '/placement-defaults',
    segment: 'placement-defaults',
    tag: 'Folders',
    summary:
      "The caller's default folders, one per key (mode:diagram, mode:draw, kind:event-storming, " +
      'template:retrospective, template:kanban), dangling ones included.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: {
      type: 'object',
      properties: {
        defaults: {
          type: 'array',
          items: {
            type: 'object',
            properties: { key: { type: 'string' }, folderId: { type: 'string' } },
            required: ['key', 'folderId'],
          },
        },
      },
    },
    statuses: [200, 401],
  },
  {
    method: 'PUT',
    path: '/placement-defaults/{key}',
    segment: 'placement-defaults',
    tag: 'Folders',
    summary:
      "Set the caller's default folder for a key: their own personal folder or a folder of a team " +
      'they have joined. Refusals: default_key_invalid, default_folder_invalid (400), ' +
      'folder_not_found (404).',
    auth: 'guest-or-session',
    tokenUsable: true,
    requestSchema: {
      type: 'object',
      properties: { folderId: { type: 'string', minLength: 1 } },
      required: ['folderId'],
    },
    statuses: [204, 400, 401, 404, 429],
  },
  {
    method: 'DELETE',
    path: '/placement-defaults/{key}',
    segment: 'placement-defaults',
    tag: 'Folders',
    summary: "Clear the caller's default folder for a key. Idempotent; default_key_invalid (400).",
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 400, 401, 429],
  },

  // ---- Trash (docs/specs/013-workspace/trash.md) ----
  {
    method: 'GET',
    path: '/trash',
    segment: 'trash',
    tag: 'Trash',
    summary:
      'The documents the caller may restore: their personal Trash and every joined team Trash, newest first.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: listOf('trash', 'TrashedDocument'),
    statuses: [200, 400, 401],
  },
  {
    method: 'DELETE',
    path: '/trash',
    segment: 'trash',
    tag: 'Trash',
    summary: 'Empty the personal Trash, or one team Trash with team=<id> (joined members only).',
    auth: 'guest-or-session',
    tokenUsable: true,
    query: [{ name: 'team', required: false, description: 'Empty this team Trash instead.' }],
    responseSchema: {
      type: 'object',
      properties: { purged: { type: 'number' } },
      required: ['purged'],
    },
    statuses: [200, 400, 401, 404],
  },
  {
    method: 'POST',
    path: '/trash/{id}/restore',
    segment: 'trash',
    tag: 'Trash',
    summary:
      'Restore a document from the Trash to its folder, or the root of its space when that folder is gone.',
    auth: 'guest-or-session',
    tokenUsable: true,
    responseSchema: wrap('document', 'Document'),
    statuses: [200, 400, 401, 404],
  },
  {
    method: 'DELETE',
    path: '/trash/{id}',
    segment: 'trash',
    tag: 'Trash',
    summary: 'Delete a document in the Trash for good.',
    auth: 'guest-or-session',
    tokenUsable: true,
    statuses: [204, 400, 401, 404],
  },

  // ---- Timeline (docs/specs/013-workspace/timeline.md) ----
  {
    method: 'GET',
    path: '/timeline',
    segment: 'timeline',
    tag: 'Account',
    summary: "The caller's activity feed, newest first. Keyset-paginated via nextCursor.",
    auth: 'guest-or-session',
    responseSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/TimelineEvent' } },
        nextCursor: { type: 'string' },
        lastSeenAt: { type: 'number' },
      },
    },
    statuses: [200, 400, 401, 403],
  },
  {
    method: 'GET',
    path: '/timeline/unread',
    segment: 'timeline',
    tag: 'Account',
    summary: "Count of other people's events since the caller last read their feed (capped at 99).",
    auth: 'guest-or-session',
    responseSchema: { type: 'object', properties: { count: { type: 'number' } } },
    statuses: [200, 400, 401],
  },
  {
    method: 'POST',
    path: '/timeline/refresh',
    segment: 'timeline',
    tag: 'Account',
    summary: 'Seed the feed on first use and mark it seen. Throttled to once every 5s.',
    auth: 'guest-or-session',
    responseSchema: { type: 'object', properties: { lastSeenAt: { type: 'number' } } },
    statuses: [200, 400, 401],
  },
  {
    method: 'DELETE',
    path: '/timeline/events/{id}',
    segment: 'timeline',
    tag: 'Account',
    summary:
      "Remove one event from the caller's own feed. Other readers of the same event keep it. 404 when the feed never held it.",
    auth: 'guest-or-session',
    statuses: [204, 401, 404],
  },
  {
    method: 'POST',
    path: '/timeline/events/dismiss',
    segment: 'timeline',
    tag: 'Account',
    summary:
      "Remove several events (a whole stack) from the caller's own feed in one call. Up to 200 ids; unknown ids are ignored.",
    auth: 'guest-or-session',
    requestSchema: {
      type: 'object',
      required: ['ids'],
      properties: { ids: { type: 'array', items: { type: 'string' } } },
    },
    responseSchema: { type: 'object', properties: { dismissed: { type: 'number' } } },
    statuses: [200, 400, 401],
  },

  // ---- Activity (docs/specs/013-workspace/inbox.md) ----
  {
    method: 'GET',
    path: '/activity',
    segment: 'activity',
    tag: 'Account',
    summary:
      'What is outstanding for the caller across every document they can open: open actions assigned to them or by them, open Plan cards assigned to them, and unresolved comment threads they are in, on elements and on Plan cards. Capped at 100 per kind, newest first.',
    auth: 'guest-or-session',
    responseSchema: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { $ref: '#/components/schemas/ActivityAction' } },
        threads: { type: 'array', items: { $ref: '#/components/schemas/ActivityThread' } },
        cards: { type: 'array', items: { $ref: '#/components/schemas/ActivityCard' } },
        cardThreads: {
          type: 'array',
          items: { $ref: '#/components/schemas/ActivityCardThread' },
        },
        formResponses: {
          type: 'array',
          items: { $ref: '#/components/schemas/ActivityFormResponses' },
        },
      },
      required: ['actions', 'threads', 'cards', 'cardThreads'],
    },
    statuses: [200, 400, 401],
  },

  // ---- Explorer Home (docs/specs/013-workspace/explorer-home.md) ----
  {
    method: 'GET',
    path: '/home',
    segment: 'home',
    tag: 'Account',
    summary:
      "The Explorer's Home in one read: Jump back in (the caller's Within reach set: the 4 documents they used on the most days over the last 90, then the 4 they used most recently, none twice; most used first) and What happened (other people's actions on documents the caller can open over the last 14 days, one group per document per day in `tz`). Query: `tz` (IANA, default UTC). 400 `tz_invalid`.",
    auth: 'guest-or-session',
    responseSchema: { $ref: '#/components/schemas/HomeResponse' },
    statuses: [200, 400, 401, 429],
  },

  // ---- Content search (docs/specs/013-workspace/content-search.md) ----
  {
    method: 'GET',
    path: '/search/content',
    segment: 'search',
    tag: 'Documents',
    summary:
      'Documents the caller may open whose content matches `q` (tab text, comments, articles, forms, sheet inputs, cards), best first, one per document, at most 50, each with the tab it was found in and a line of its text with the matched stretches as ranges. Words of 3 or more characters forgive a typo; shorter words must start a word. 400 without `q`; 429 past 120 a minute; 503 `search_unavailable`.',
    auth: 'guest-or-session',
    responseSchema: { $ref: '#/components/schemas/ContentSearchDTO' },
    statuses: [200, 400, 429, 503],
  },

  // ---- Account ----
  {
    method: 'DELETE',
    path: '/account',
    segment: 'account',
    tag: 'Account',
    summary: 'Delete the signed-in account and all of its data (documents, tokens, ...).',
    auth: 'session',
    responseSchema: { type: 'object', properties: { deleted: { type: 'number' } } },
    statuses: [204, 401],
  },
  {
    method: 'POST',
    path: '/migrate',
    segment: 'migrate',
    tag: 'Account',
    summary: 'Migrate a guest owner id onto the signed-in account (used at sign-up).',
    auth: 'guest-or-session',
    statuses: [200, 400, 401, 403],
  },
  {
    method: 'POST',
    path: '/guest-id',
    segment: 'guest-id',
    tag: 'Account',
    summary: 'Mint a signed guest owner id (first-party app).',
    auth: 'public',
    responseSchema: {
      type: 'object',
      properties: { ownerId: { type: 'string' }, ownerSig: { type: ['string', 'null'] } },
      required: ['ownerId'],
    },
    statuses: [200],
  },

  // ---- Teams ----
  {
    method: 'GET',
    path: '/teams',
    segment: 'teams',
    tag: 'Teams',
    summary: "List the caller's teams.",
    auth: 'session',
    tokenUsable: true,
    responseSchema: listOf('teams', 'TeamListItem'),
    statuses: [200, 401],
  },
  {
    method: 'POST',
    path: '/teams',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Create a team.',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        organisation: { type: ['string', 'null'] },
      },
      required: ['id', 'name'],
    },
    responseSchema: wrap('team', 'Team'),
    statuses: [201, 400, 401],
  },
  {
    method: 'GET',
    path: '/teams/invites',
    segment: 'teams',
    tag: 'Teams',
    summary: "List the caller's pending team invites.",
    auth: 'session',
    responseSchema: listOf('invites', 'TeamInvite'),
    statuses: [200, 401],
  },
  {
    method: 'GET',
    path: '/teams/invite-link/{token}',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Resolve a team invite link to its team info.',
    auth: 'public',
    responseSchema: 'TeamInviteLinkInfo',
    statuses: [200, 404],
  },
  {
    method: 'GET',
    path: '/teams/invite-decline/{token}',
    segment: 'teams',
    tag: 'Teams',
    summary: "Read the invite an email's decline token names: its team name and status.",
    auth: 'public',
    responseSchema: 'TeamInviteDecline',
    statuses: [200, 404, 429],
  },
  {
    method: 'POST',
    path: '/teams/invite-decline/{token}',
    segment: 'teams',
    tag: 'Teams',
    summary: "Decline the invite an email's decline token names. No sign-in; idempotent.",
    auth: 'public',
    responseSchema: 'TeamInviteDecline',
    statuses: [200, 404, 409, 429],
  },
  // A text document email's signed settings link (docs/specs/034-text-documents/review.md "Notifications").
  {
    method: 'GET',
    path: '/notification-links/{token}',
    segment: 'notification-links',
    tag: 'Text documents',
    summary:
      "Read the document name and the notification setting a text document email's signed link names. No sign-in; never writes. 404 link_not_found (a bad token, a gone document, or email not configured).",
    auth: 'public',
    responseSchema: 'NoticeLinkDto',
    statuses: [200, 404, 429],
  },
  {
    method: 'PUT',
    path: '/notification-links/{token}',
    segment: 'notification-links',
    tag: 'Text documents',
    summary:
      'Keep the notification setting the signed link names, for that person and document alone. No sign-in. 400 invalid_setting; 404 link_not_found.',
    auth: 'public',
    requestSchema: 'NoticeSettingDto',
    responseSchema: 'NoticeLinkDto',
    statuses: [200, 400, 404, 429],
  },
  {
    method: 'POST',
    path: '/notification-links/{token}',
    segment: 'notification-links',
    tag: 'Text documents',
    summary:
      "One-click unsubscribe (RFC 8058, List-Unsubscribe-Post): sets both of the signed link's settings to none. No sign-in. 404 link_not_found.",
    auth: 'public',
    responseSchema: 'NoticeLinkDto',
    statuses: [200, 404, 429],
  },
  {
    method: 'POST',
    path: '/teams/invite-link/{token}/join',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Join a team via its invite link.',
    auth: 'session',
    statuses: [200, 404],
  },
  {
    method: 'GET',
    path: '/teams/{id}',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Get a team with its members and (for admins) its invite link.',
    auth: 'session',
    tokenUsable: true,
    responseSchema: { type: 'object' },
    statuses: [200, 401, 404],
  },
  {
    method: 'PUT',
    path: '/teams/{id}',
    segment: 'teams',
    tag: 'Teams',
    summary: "Update a team's name or organisation (admin).",
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, organisation: { type: ['string', 'null'] } },
    },
    responseSchema: wrap('team', 'Team'),
    statuses: [200, 400, 401, 403, 404],
  },
  {
    method: 'DELETE',
    path: '/teams/{id}',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Delete a team (admin).',
    auth: 'session',
    statuses: [204, 401, 403, 404],
  },
  {
    method: 'POST',
    path: '/teams/{id}/invite-link',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Create or rotate a team invite link (admin).',
    auth: 'session',
    responseSchema: wrap('inviteLink', 'TeamInviteLink'),
    statuses: [201, 401, 403, 404],
  },
  {
    method: 'DELETE',
    path: '/teams/{id}/invite-link',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Disable a team invite link (admin).',
    auth: 'session',
    statuses: [204, 401, 403, 404],
  },
  {
    method: 'POST',
    path: '/teams/{id}/members',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Invite a member by email (admin).',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
    },
    responseSchema: wrap('member', 'TeamMember'),
    statuses: [201, 400, 401, 403, 404, 409],
  },
  {
    method: 'GET',
    path: '/teams/{id}/access-check',
    segment: 'teams',
    tag: 'Teams',
    summary:
      'Whether a joined teammate can open a document the caller can access (docs/specs/012-collaboration/assigned-actions.md): owner, team-library member, or prior share-link visitor.',
    auth: 'session',
    responseSchema: {
      type: 'object',
      properties: { canAccess: { type: 'boolean' } },
      required: ['canAccess'],
    },
    statuses: [200, 400, 401, 403, 404],
  },
  {
    method: 'POST',
    path: '/teams/{id}/notify-action',
    segment: 'teams',
    tag: 'Teams',
    summary:
      'Email a joined teammate that an action on a document element was assigned to them (docs/specs/012-collaboration/assigned-actions.md). Best-effort; the assignee may have opted out.',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: {
        assigneeUserId: { type: 'string' },
        documentId: { type: 'string' },
        actionName: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['assigneeUserId', 'documentId', 'actionName'],
    },
    statuses: [202, 400, 401, 403, 404],
  },
  {
    method: 'POST',
    path: '/teams/{id}/notify-mention',
    segment: 'teams',
    tag: 'Teams',
    summary:
      "Email the teammates a comment just @-mentioned (docs/specs/012-collaboration/comment-mentions.md). The document must be in this team's library; each mention must be a member of the team. Best-effort; a recipient may have opted out.",
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        commentText: { type: 'string' },
        mentions: {
          type: 'array',
          items: {
            type: 'object',
            properties: { userId: { type: 'string' }, memberId: { type: 'string' } },
          },
        },
        // A Plan card's comment: the card, so the email's button opens it.
        itemId: { type: 'string' },
      },
      required: ['documentId', 'commentText', 'mentions'],
    },
    statuses: [202, 400, 401, 403, 404],
  },
  {
    method: 'POST',
    path: '/teams/{id}/members/{memberId}/accept',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Accept your own team invite.',
    auth: 'session',
    responseSchema: wrap('member', 'TeamMember'),
    statuses: [200, 401, 403, 404],
  },
  {
    method: 'PUT',
    path: '/teams/{id}/members/{memberId}',
    segment: 'teams',
    tag: 'Teams',
    summary: "Change a member's role (admin).",
    auth: 'session',
    requestSchema: { type: 'object', properties: { role: ref('TeamRole') }, required: ['role'] },
    responseSchema: wrap('member', 'TeamMember'),
    statuses: [200, 400, 401, 403, 404, 409],
  },
  {
    method: 'DELETE',
    path: '/teams/{id}/members/{memberId}',
    segment: 'teams',
    tag: 'Teams',
    summary: 'Remove a member, or decline/leave (admin or self).',
    auth: 'session',
    statuses: [204, 401, 403, 404, 409],
  },
  {
    method: 'GET',
    path: '/teams/{id}/library',
    segment: 'teams',
    tag: 'Teams',
    summary: "Get a team's shared folder tree and documents (joined member).",
    auth: 'session',
    tokenUsable: true,
    responseSchema: {
      type: 'object',
      properties: {
        folders: { type: 'array', items: ref('Folder') },
        documents: { type: 'array', items: ref('DocumentSummary') },
      },
    },
    statuses: [200, 401, 403, 404],
  },

  // ---- OAuth (MCP) ----
  {
    method: 'POST',
    path: '/oauth/exchange',
    segment: 'oauth',
    tag: 'API tokens',
    summary: 'Exchange an MCP OAuth authorization for an API token.',
    auth: 'session',
    requestSchema: { type: 'object', properties: { clientName: { type: 'string' } } },
    statuses: [201, 400, 403, 404, 409],
  },

  // ---- AI ----
  {
    method: 'POST',
    path: '/ai',
    segment: 'ai',
    tag: 'AI',
    summary: 'Generate or review a diagram with the optional AI assistant (streamed).',
    auth: 'guest-or-session',
    requestSchema: 'AiRequest',
    statuses: [200, 401, 403, 500, 502, 503],
  },
  {
    method: 'POST',
    path: '/ai/read-notes',
    segment: 'ai',
    tag: 'AI',
    summary: 'Read the handwriting on sticky-note crops cut from a wall photo.',
    auth: 'guest-or-session',
    requestSchema: 'ReadNotesRequest',
    responseSchema: 'ReadNotesResponse',
    statuses: [200, 400, 401, 403, 413, 429, 502, 503],
  },
  // ---- Event Storming asks (docs/specs/021-event-storming/asks.md "The built-in hand") ----
  {
    method: 'POST',
    path: '/storm-ask',
    segment: 'storm-ask',
    tag: 'AI',
    summary:
      "Ask the deployment's small model for suggestions on an Event Storming board: `{ topic, scope, lanes?, tab }`, the board travelling in the request, answers what to add (`{ added, names, changes, lines, dropped, folded? }`). Each line the model answers runs through the edit-operation engine; nothing is stored and nothing on a board changes. 400 not_event_storming, topic_invalid, scope_invalid, lanes_invalid; 413 board_too_large; 502 ai_failed.",
    auth: 'guest-or-session',
    requestSchema: 'StormAskRequest',
    responseSchema: 'StormAskResponse',
    statuses: [200, 400, 401, 403, 413, 429, 502, 503],
  },

  // ---- Link unfurl ----
  {
    method: 'GET',
    path: '/unfurl',
    segment: 'unfurl',
    tag: 'Meta',
    summary: 'Server-side link unfurl for link cards (SSRF-safe, rate-limited).',
    auth: 'public',
    query: [{ name: 'url', required: true, description: 'The URL to unfurl.' }],
    responseSchema: 'UnfurlResult',
    statuses: [200, 400, 429],
  },

  // ---- Google Drive mirror (docs/specs/022-drive-mirror/drive-mirror.md) ----
  // Every route needs a SESSION: the guest header and API tokens are both
  // refused, and each answers 503 drive_not_configured when the deployment has
  // no GOOGLE_CLIENT_ID. First-party only; the mirror runs in the user's browser.
  {
    method: 'POST',
    path: '/drive/state',
    segment: 'drive',
    tag: 'Google Drive',
    summary: 'Mint the signed consent `state` for a redirect URI (broker mode). Session only.',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: { redirectUri: { type: 'string' } },
      required: ['redirectUri'],
    },
    responseSchema: {
      type: 'object',
      properties: { state: { type: 'string' } },
      required: ['state'],
    },
    statuses: [200, 400, 401, 503],
  },
  {
    method: 'POST',
    path: '/drive/connect',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Redeem a Google consent code: the refresh token is sealed and stored, never returned. Session only.',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: { code: { type: 'string' }, state: { type: 'string' } },
      required: ['code', 'state'],
    },
    responseSchema: wrap('connection', 'DriveConnection'),
    statuses: [200, 400, 401, 502, 503],
  },
  {
    method: 'POST',
    path: '/drive/account-switch',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Confirm a pending switch to another Google account: the mirror state is cleared and the new account takes over. 409 drive_account_switch_expired when none is pending. Session only.',
    auth: 'session',
    responseSchema: wrap('connection', 'DriveConnection'),
    statuses: [200, 401, 409, 503],
  },
  {
    method: 'DELETE',
    path: '/drive/account-switch',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Cancel a pending switch to another Google account: its grant is revoked and the connection stays as it was. Session only.',
    auth: 'session',
    statuses: [204, 401, 503],
  },
  {
    method: 'POST',
    path: '/drive/token',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Mint a one-hour Google access token from the stored refresh token. 409 drive_needs_reconnect when Google revoked the grant; 429 drive_token_rate_limited past 10 a minute.',
    auth: 'session',
    responseSchema: 'DriveAccessToken',
    statuses: [200, 401, 404, 409, 429, 502, 503],
  },
  {
    method: 'GET',
    path: '/drive/connection',
    segment: 'drive',
    tag: 'Google Drive',
    summary: "The caller's Drive connection summary, or null.",
    auth: 'session',
    responseSchema: {
      type: 'object',
      properties: { connection: { oneOf: [ref('DriveConnection'), { type: 'null' }] } },
      required: ['connection'],
    },
    statuses: [200, 401, 503],
  },
  {
    method: 'PUT',
    path: '/drive/connection',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Record the mirror root folder and changes page token. In browser mode this also creates the connection.',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: {
        rootFolderId: { type: ['string', 'null'] },
        pageToken: { type: 'string' },
      },
    },
    responseSchema: wrap('connection', 'DriveConnection'),
    statuses: [200, 400, 401, 404, 503],
  },
  {
    method: 'DELETE',
    path: '/drive/connection',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Disconnect: revoke the grant at Google and delete the stored token and mirror rows. Drive files stay.',
    auth: 'session',
    statuses: [204, 401, 503],
  },
  {
    method: 'GET',
    path: '/drive/items',
    segment: 'drive',
    tag: 'Google Drive',
    summary: "The caller's mirrored documents and folders with the Drive state last written.",
    auth: 'session',
    responseSchema: listOf('items', 'DriveItem'),
    statuses: [200, 401, 503],
  },
  {
    method: 'PUT',
    path: '/drive/items',
    segment: 'drive',
    tag: 'Google Drive',
    summary:
      'Upsert up to 100 mirrored items. 409 drive_item_conflict when a Drive file id is already held.',
    auth: 'session',
    requestSchema: listOf('items', 'DriveItem'),
    responseSchema: listOf('items', 'DriveItem'),
    statuses: [200, 400, 401, 404, 409, 503],
  },
  {
    method: 'DELETE',
    path: '/drive/items/{kind}/{ldId}',
    segment: 'drive',
    tag: 'Google Drive',
    summary: 'Forget one mirrored item (`kind` is `document` or `folder`).',
    auth: 'session',
    statuses: [204, 400, 401, 503],
  },
  {
    method: 'POST',
    path: '/drive/lease',
    segment: 'drive',
    tag: 'Google Drive',
    summary: 'Take or renew the cross-device write lease for this holder.',
    auth: 'session',
    requestSchema: {
      type: 'object',
      properties: { holder: { type: 'string' } },
      required: ['holder'],
    },
    responseSchema: 'DriveLease',
    statuses: [200, 400, 401, 404, 503],
  },
  {
    method: 'DELETE',
    path: '/drive/lease',
    segment: 'drive',
    tag: 'Google Drive',
    summary: 'Release the write lease, if this holder has it.',
    auth: 'session',
    query: [{ name: 'holder', required: true, description: 'The device id holding the lease.' }],
    statuses: [204, 400, 401, 503],
  },

  // ---- Telemetry ----
  {
    method: 'POST',
    path: '/events',
    segment: 'events',
    tag: 'Telemetry',
    summary: 'Ingest a batch of anonymous first-party telemetry events.',
    // The route also honours an `X-Internal-Events-Key` header that exempts
    // our own workers from the per-IP rate limiter (docs/specs/017-telemetry/telemetry.md). Deliberately
    // NOT documented here: the public spec describes what a public caller
    // can use, and advertising the bypass header would only invite guessing
    // at the secret. Its absence is a choice, not an oversight.
    auth: 'public',
    requestSchema: {
      type: 'object',
      properties: { events: { type: 'array', items: ref('TelemetryEvent') } },
    },
    statuses: [204],
  },
  {
    method: 'GET',
    path: '/telemetry/summary',
    segment: 'telemetry',
    tag: 'Telemetry',
    summary: 'Public usage summary that powers the /telemetry dashboard.',
    auth: 'public',
    responseSchema: 'TelemetrySummary',
    statuses: [200],
  },

  // ---- Workbench (docs/specs/013-workspace/workbench-embeds.md) ----
  {
    method: 'POST',
    path: '/workbench/tickets',
    segment: 'workbench',
    tag: 'Workbench',
    summary:
      "Mint a single-use, one-minute ticket that opens a document, or the person's whole workspace (scope workspace, on Home or a folder), in a paired developer tool. An origin the token is not paired with for that scope answers 428 with the pairing URL.",
    auth: 'session',
    tokenUsable: true,
    requestSchema: 'WorkbenchTicketRequest',
    responseSchema: {
      anyOf: [ref('WorkbenchTicketResponse'), ref('WorkbenchWorkspaceTicketResponse')],
    },
    statuses: [201, 400, 401, 403, 404, 410, 428, 429],
  },
  {
    method: 'POST',
    path: '/workbench/sessions',
    segment: 'workbench',
    tag: 'Workbench',
    summary:
      "Redeem a ticket for a workbench session: the person's editor on that one document, or in their workspace. The ticket is the credential.",
    auth: 'public',
    requestSchema: 'WorkbenchSessionRequest',
    responseSchema: 'WorkbenchSessionResponse',
    statuses: [201, 400, 401, 404, 410, 429],
  },
  {
    method: 'DELETE',
    path: '/workbench/sessions/current',
    segment: 'workbench',
    tag: 'Workbench',
    summary: 'End the workbench session this request presented.',
    auth: 'public',
    statuses: [204, 401, 403],
  },
  {
    method: 'POST',
    path: '/workbench/pairing-requests',
    segment: 'workbench',
    tag: 'Workbench',
    summary:
      "Ask to pair this token with a workbench origin; the token's owner approves it once in their browser.",
    auth: 'session',
    tokenUsable: true,
    requestSchema: 'WorkbenchPairingRequestCreate',
    responseSchema: 'WorkbenchPairingRequestCreated',
    statuses: [200, 400, 401, 403, 429],
  },
  {
    method: 'GET',
    path: '/workbench/pairing-requests/{code}/status',
    segment: 'workbench',
    tag: 'Workbench',
    summary: 'Poll a pairing request, by the token that asked.',
    auth: 'session',
    tokenUsable: true,
    responseSchema: 'WorkbenchPairingStatusResponse',
    statuses: [200, 403, 404],
  },
  {
    method: 'GET',
    path: '/workbench/pairing-requests/{code}',
    segment: 'workbench',
    tag: 'Workbench',
    summary: "The pairing page's view of a request, for the token's owner.",
    auth: 'session',
    responseSchema: {
      type: 'object',
      properties: { request: ref('WorkbenchPairingRequestView') },
      required: ['request'],
    },
    statuses: [200, 401, 404],
  },
  {
    method: 'POST',
    path: '/workbench/pairing-requests/{code}/approve',
    segment: 'workbench',
    tag: 'Workbench',
    summary: 'Allow the workbench: records the pairing.',
    auth: 'session',
    responseSchema: {
      type: 'object',
      properties: { pairing: ref('WorkbenchPairing') },
      required: ['pairing'],
    },
    statuses: [200, 401, 404, 409, 410],
  },
  {
    method: 'POST',
    path: '/workbench/pairing-requests/{code}/decline',
    segment: 'workbench',
    tag: 'Workbench',
    summary: "Don't allow the workbench: records nothing.",
    auth: 'session',
    statuses: [204, 401, 404, 409, 410],
  },
  {
    method: 'GET',
    path: '/workbench/pairings',
    segment: 'workbench',
    tag: 'Workbench',
    summary: "The signed-in person's paired workbenches, for Settings > API tokens.",
    auth: 'session',
    responseSchema: 'WorkbenchPairingsResponse',
    statuses: [200, 401],
  },
  {
    method: 'DELETE',
    path: '/workbench/pairings/{id}',
    segment: 'workbench',
    tag: 'Workbench',
    summary: 'Unpair a workbench, ending its open sessions.',
    auth: 'session',
    statuses: [204, 401, 404],
  },
];
