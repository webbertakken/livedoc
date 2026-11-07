import { objectOrEmpty, type WorkbenchRole } from '@livedoc/api-schema';
// Shared per-request context for the route handlers. The worker's
// `fetch` entry (src/index.ts) builds one of these after resolving the
// caller's identity + running the cross-cutting gates (CORS, write
// rate-limit), then dispatches on `segments[1]` to the matching
// `routes/<resource>.ts` handler. Each handler owns every request for
// its segment and returns `notFound()` for sub-paths / methods it
// doesn't recognise (preserving the original fall-through-to-404).

import {
  canEditDocument,
  canParticipateDocument,
  canReadDocument,
  resolveDocumentGrant,
  type DocumentGrant,
} from '../auth/document-access';
import type { SharePasswordAttempt } from '../auth/share-access';
import type { WorkbenchReach } from '../db/workbench';
import { clientRateKey } from '../client-ip';
import { getDocument, getMembership, getTrashedDocumentMeta } from '../db';
import { badRequest, documentTrashed, forbidden, json, missingAuth, notFound } from '../responses';
import type { DocumentDTO, DocumentEnv, Env } from '../types';

// A workbench session as the choke point resolved it ("The choke point by
// scope"): one document in the document scope, the workspace (from an optional folder) in the workspace scope.
export type WorkbenchContext = {
  sessionId: string;
  ownerId: string;
  tokenId: string;
  pairingId: string;
  tabId: string | null;
  origin: string;
  level: WorkbenchRole;
  expiresAt: number;
} & WorkbenchReach;

export type RouteContext = {
  request: Request;
  env: Env;
  url: URL;
  // Path split on '/', leading slash stripped: `['api', '<resource>', ...]`.
  segments: string[];
  // The account a verified session token proves, or null. Administration
  // (account deletion, guest-to-account migration, teams, tokens) reads this
  // directly rather than through `resolveOwner` so there's no X-Owner-Id
  // fallback and no API token or workbench session administers.
  sessionAccountId: string | null;
  // The server-verified account id from any credential: a session
  // token, a `livedoc_` API token (whose owner is always an account,
  // docs/specs/015-api/public-api-and-tokens.md §3.3), or a workbench session's owner. This is the identity for team-membership
  // CONTENT access — gateRead/gateEdit and the teams-surface reads — so a
  // token reaches the same documents the app does (docs/specs/015-api/public-api-and-tokens.md §3.4). Account
  // and team ADMINISTRATION (team mutations, token management, account
  // deletion, migration) keeps requiring `sessionAccountId`: a leaked token
  // must not be able to manage membership or mint further credentials.
  verifiedAccountId: string | null;
  // The verified `email` claim from the session token (docs/specs/013-workspace/teams.md), or null
  // when sign-in is off, the caller is a guest or a token, or the address is
  // not verified. Never read from a header — it
  // drives teams' invite auto-connection so it must be unforgeable.
  accountEmail: string | null;
  // When the presenting LiveDoc session was created (seconds), from its session token's `auth_time`; null for any
  // other caller. How fresh a sign-in is, for deleting the account (docs/specs/014-identity/auth-and-guest-access.md
  // "Sessions"). Optional so unit tests can leave it out.
  sessionAuthTime?: number | null;
  // Hybrid identity (docs/specs/014-identity/auth-and-guest-access.md): the verified account id, else the
  // guest X-Owner-Id header, else null. Resolved once in `fetch`.
  resolveOwner: () => string | null;
  // The API token the request presented, or null for a session or a guest. Only a token
  // makes a changeset an agent's, and a token may never do a whole-tab save
  // (docs/specs/024-agents/agent-changesets.md). Optional so unit tests can leave it out.
  token?: { id: string; readOnly?: boolean } | null;
  // The presenting workbench session (docs/specs/013-workspace/workbench-embeds.md), or null for every other
  // caller. Under one, `sessionAccountId` and `token` are null and `resolveOwner()` is the owner: a person's editor on
  // one document, never a token and never an administrator. Optional so unit tests can leave it out.
  workbench?: WorkbenchContext | null;
  // Schedule background work that may outlive the response (docs/specs/014-identity/transactional-email.md email
  // sends). Forwards to the fetch handler's ExecutionContext.waitUntil.
  // Optional so unit tests can build a RouteContext without a real
  // ExecutionContext; the production `fetch` always provides it. Call sites
  // guard with `ctx.waitUntil?.(...)`.
  waitUntil?: (promise: Promise<unknown>) => void;
};

// A RouteContext inside a document's room (docs/specs/006-document/document-storage.md): its env
// carries the room's own SQLite as `DOCUMENT_DB`, so the handlers under /api/documents/:id/ reach the content.
export type DocumentRouteContext = RouteContext & { env: DocumentEnv };

// Visitor share code carried on edit/view-link requests so a non-owner
// can authorise against a document they don't own.
//
// Exported because its PRESENCE is the only honest signal that a caller
// arrived through a share link. "Isn't the owner" is not that signal: a
// joined team member reads every document in their team's library without a
// code (docs/specs/013-workspace/team-shared-documents.md), so the visitor-facing timeline events keyed on
// `owner !== ownerId` were reporting teammates as strangers with a link.
export function shareCodeOf(request: Request): string | null {
  return request.headers.get('X-Share-Code');
}

// Share password (docs/specs/013-workspace/share-password.md) carried alongside the share code when the
// document the visitor is accessing is password-protected. Owners never
// send it (their identity short-circuits the check); a non-owner with a
// share code must, or the access gate denies password-protected documents.
export function sharePasswordOf(request: Request): SharePasswordAttempt | null {
  const value = request.headers.get('X-Share-Password');
  return value === null ? null : { value, rateKey: clientRateKey(request) };
}

// Route-side wrappers around canReadDocument / canEditDocument. Most
// handler call sites need the same six args to the auth helpers
// (env, documentId, caller, share code, document owner, share
// password); four of them (env, caller, share code, share password)
// fall straight out of the RouteContext, so condensing them into a
// (ctx, documentId, documentOwnerId) helper drops a stack of
// repetitive 6-line invocations to 1-liners. Behaviour stays
// identical: each helper just forwards the ctx-derived args.
//
// `tabId` names the tab the request touches. Leave it off for a
// document-level door: a tab-scoped link is then refused (fail closed,
// docs/specs/013-workspace/tab-scoped-share-links.md).

export function gateRead(
  ctx: RouteContext,
  documentId: string,
  documentOwnerId: string,
  documentTeamId: string | null = null,
  tabId?: string,
): Promise<boolean> {
  return canReadDocument(
    ctx.env,
    documentId,
    ctx.resolveOwner(),
    shareCodeOf(ctx.request),
    documentOwnerId,
    sharePasswordOf(ctx.request),
    documentTeamId,
    // Server-verified account id (session or API token) for the
    // team-membership check — never the unsigned X-Owner-Id header
    // (docs/specs/013-workspace/team-shared-documents.md access trust boundary).
    ctx.verifiedAccountId,
    tabId,
  );
}

// The Participant gate (docs/specs/013-workspace/share-roles.md): every write a Participant may make beside an
// Editor (comments, Q&A notes and upvotes, Plan cards, Sheet cells). A Viewer only looks, so it is refused. Agent
// presence stays on gateRead: an agent acts at its owner's level.
export function gateParticipate(
  ctx: RouteContext,
  documentId: string,
  documentOwnerId: string,
  documentTeamId: string | null = null,
  tabId?: string,
): Promise<boolean> {
  return canParticipateDocument(
    ctx.env,
    documentId,
    ctx.resolveOwner(),
    shareCodeOf(ctx.request),
    documentOwnerId,
    sharePasswordOf(ctx.request),
    documentTeamId,
    ctx.verifiedAccountId,
    tabId,
  );
}

export function gateEdit(
  ctx: RouteContext,
  documentId: string,
  documentOwnerId: string,
  documentTeamId: string | null = null,
  tabId?: string,
): Promise<boolean> {
  return canEditDocument(
    ctx.env,
    documentId,
    ctx.resolveOwner(),
    shareCodeOf(ctx.request),
    documentOwnerId,
    sharePasswordOf(ctx.request),
    documentTeamId,
    // Server-verified account id (session or API token) for the
    // team-membership check — never the unsigned X-Owner-Id header
    // (docs/specs/013-workspace/team-shared-documents.md access trust boundary).
    ctx.verifiedAccountId,
    tabId,
  );
}

// The caller's grant on a document, scope included, for the doors that narrow
// what they return to a scoped visitor's tab rather than refuse them
// (docs/specs/013-workspace/tab-scoped-share-links.md). Null = no access.
export function gateGrant(
  ctx: RouteContext,
  documentId: string,
  documentOwnerId: string,
  documentTeamId: string | null = null,
): Promise<DocumentGrant | null> {
  return resolveDocumentGrant(
    ctx.env,
    documentId,
    ctx.resolveOwner(),
    shareCodeOf(ctx.request),
    documentOwnerId,
    sharePasswordOf(ctx.request),
    documentTeamId,
    ctx.verifiedAccountId,
  );
}

// Route-entry guards. Each resolves the caller / loads + authorises the
// document and returns EITHER the value the handler needs OR the exact
// Response it should return instead. The caller's one-liner is:
//
//   const owner = requireOwner(ctx);
//   if (owner instanceof Response) return owner;
//
// which collapses the `const owner = resolveOwner(); if (!owner) return
// missingAuth();` pair (and its load-and-check cousins) that every
// owner-scoped path in documents.ts repeated by hand. Centralising them
// means the authz status-code mapping (400 / 404 / 403) lives in one
// place a reviewer can check, instead of N copies that can drift.

// The resolved owner id, or the 400 to return when neither a credential
// nor X-Owner-Id identifies the caller.
// The one tab a request's grant confines it to (docs/specs/013-workspace/tab-scoped-share-links.md), or null: the
// owner, a team member and an All-tabs link reach every tab. Only a share code can confine a request, so one without
// costs no read: the owner's autosave pays nothing.
export async function tabScopeOf(
  ctx: RouteContext,
  doc: { id: string; ownerId: string; teamId: string | null },
): Promise<string | null> {
  if (shareCodeOf(ctx.request) === null) return null;
  return (await gateGrant(ctx, doc.id, doc.ownerId, doc.teamId))?.tabScope ?? null;
}

export function requireOwner(ctx: RouteContext): string | Response {
  return ctx.resolveOwner() ?? missingAuth();
}

// Is `ctx` the owner of this document? The one rule both owner-only guards
// below share, and the reason it isn't a bare `owner === ownerId`.
//
// For a PERSONAL document the hybrid identity is safe: the owner id is either
// an account id the caller proved with a verified JWT, or a guest UUID that
// is unguessable.
//
// For a TEAM document it is NOT. A team's owner id is an account id deliberately
// visible to every teammate (`GET /api/teams/<id>` lists `members[].userId`),
// so accepting the unsigned `X-Owner-Id` header here would let anyone who
// ever learned it — a removed member, an invitee who declined — present it as
// a credential and reach the owner-only surfaces: reading the share password
// in the clear, minting an edit-role share link, clearing the password,
// deleting the document. So a team document's ownership must be proven with a
// server-VERIFIED account id (session or API token), never the header.
//
// This is the same trust boundary auth/document-access.ts draws for the
// read/edit gates; it belongs here too rather than only there.
//
// And the owner of a team document must still BE in the team. A member who
// leaves or is removed has their team work handed on (handTeamWorkToHeir),
// but rows from before that existed are still owned by people who have gone,
// and ownership is what the share-link, password, delete and move-out routes
// check first.
export async function ownsDocument(
  ctx: RouteContext,
  liveDoc: Pick<DocumentDTO, 'ownerId' | 'teamId'>,
): Promise<boolean> {
  if (liveDoc.teamId) {
    if (ctx.verifiedAccountId == null || ctx.verifiedAccountId !== liveDoc.ownerId) return false;
    const membership = await getMembership(ctx.env, liveDoc.teamId, ctx.verifiedAccountId);
    return membership?.status === 'joined';
  }
  return ctx.resolveOwner() === liveDoc.ownerId;
}

// Does `ctx` manage this document? Its owner, OR a joined member of its team
// (docs/specs/013-workspace/team-shared-documents.md: a team's library belongs to
// every joined member, so each may share, delete and restore its documents). NOT a
// share-link visitor: editing content via a link is one thing, deciding who else
// gets in or destroying the document is owner/team-only. The member leg is checked
// against the verified account id, never the header, like ownsDocument.
async function managesDocument(
  ctx: RouteContext,
  liveDoc: Pick<DocumentDTO, 'ownerId' | 'teamId'>,
): Promise<boolean> {
  if (await ownsDocument(ctx, liveDoc)) return true;
  if (!liveDoc.teamId || !ctx.verifiedAccountId) return false;
  const membership = await getMembership(ctx.env, liveDoc.teamId, ctx.verifiedAccountId);
  return membership?.status === 'joined';
}

// May `ctx` delete this document? Exactly who manages it (managesDocument). Also
// gates what the delete confirmation reads first (the shared-tabs notice).
export const mayDeleteDocument = managesDocument;

// The answer for a document id no LIVE row holds (docs/specs/013-workspace/trash.md):
// 410 `document_trashed` when it is in the Trash and the caller could have
// opened it (owner, joined team member, share-code holder), else the 404 a
// never-existing id gets, so the deleted state leaks nothing to a stranger.
export async function missingDocument(ctx: RouteContext, documentId: string): Promise<Response> {
  const trashed = await getTrashedDocumentMeta(ctx.env, documentId);
  if (!trashed) return notFound();
  const grant = await gateGrant(ctx, documentId, trashed.ownerId, trashed.teamId);
  return grant ? documentTrashed() : notFound();
}

// The share-link family's guard (docs/specs/013-workspace/team-shared-documents.md): resolve the caller,
// load the document, and confirm the caller manages it. Returns the document, or 400 (no owner) / 404
// (missing) / 403 (foreign). 404-before-403 means a foreign id can't be distinguished from a missing one
// until access is proven. A joined member of a team document passes as well as its owner, since the
// team's documents are all of theirs to share.
export async function requireManagedDocument(
  ctx: RouteContext,
  documentId: string,
): Promise<DocumentDTO | Response> {
  const owner = ctx.resolveOwner();
  if (!owner) return missingAuth();
  const existing = await getDocument(ctx.env, documentId);
  if (!existing) return missingDocument(ctx, documentId);
  if (!(await managesDocument(ctx, existing))) return forbidden();
  return existing;
}

// A refused request on a tab: 404 when the caller's grant is confined to another tab, 403 otherwise.
export async function deniedOnTab(
  ctx: RouteContext,
  liveDoc: { id: string; ownerId: string; teamId: string | null },
): Promise<Response> {
  const grant = await gateGrant(ctx, liveDoc.id, liveDoc.ownerId, liveDoc.teamId);
  return grant ? notFound() : forbidden();
}

// The refusal for a Participant door (docs/specs/013-workspace/share-roles.md): no grant, 403; a grant confined
// to another tab, 404, as deniedOnTab; a grant whose level is below Participant (a Viewer), 403.
export async function deniedParticipate(
  ctx: RouteContext,
  liveDoc: { id: string; ownerId: string; teamId: string | null },
  tabId?: string,
): Promise<Response> {
  const grant = await gateGrant(ctx, liveDoc.id, liveDoc.ownerId, liveDoc.teamId);
  if (grant && grant.tabScope !== null && grant.tabScope !== tabId) return notFound();
  if (grant)
    console.info('[access-levels] participation refused', { documentId: liveDoc.id, tabId });
  return forbidden();
}

// A body whose every field is optional: the JSON object, or `{}` for an absent or empty body and for any JSON value
// that is not an object (`null`, a string, an array), so reading a field off it never throws. A body that does not
// read to its end (the stream broke off: a client gone mid-upload) or does not parse is no body at all, never `{}`:
// on these routes `{}` is a choice (no share password, an edit link to every tab), so a broken request must not make
// it. Answered 400 `body_unreadable` / `invalid json`.
export async function readOptionalBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  let text: string;
  try {
    text = await request.text();
  } catch (err) {
    console.warn('[request] body unreadable', {
      path: new URL(request.url).pathname,
      err: String(err),
    });
    return json(
      { error: 'body_unreadable', message: 'the request body broke off before it was read' },
      { status: 400 },
    );
  }
  if (text.trim() === '') return {};
  try {
    return objectOrEmpty(JSON.parse(text));
  } catch {
    return badRequest('invalid json');
  }
}

// The request's JSON body as an object, or the 400 to return: `invalid json` when it doesn't
// parse, `expected a JSON object` when it parses to anything but a plain object.
export async function readBody(ctx: RouteContext): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await ctx.request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : badRequest('expected a JSON object');
  } catch {
    return badRequest('invalid json');
  }
}
