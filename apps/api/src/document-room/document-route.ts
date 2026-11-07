// An API request about one document, answered inside the document's room (docs/specs/006-document/document-storage.md
// "Reaching the content"). The worker resolves who is calling (session, API token, workbench
// session, guest header) and runs the cross-cutting gates (rate limits, read-only tokens, workbench confinement, body
// caps), then hands the request and that identity to the room (`route` RPC). The room rebuilds the RouteContext with
// its own SQLite as `DOCUMENT_DB` and runs the same handlers, so every per-route access check (gateRead, gateEdit,
// gateParticipate and the owner guards) is unchanged.

import type { DocumentRouteContext, RouteContext, WorkbenchContext } from '../routes/context';
import { handleDocumentRequest } from '../routes/documents';
import { json } from '../responses';
import type { DocumentEnv } from '../types';

// The caller as the worker resolved it: plain data, so it crosses the RPC boundary.
export type RouteIdentity = {
  sessionAccountId: string | null;
  verifiedAccountId: string | null;
  accountEmail: string | null;
  sessionAuthTime: number | null;
  // resolveOwner()'s answer.
  owner: string | null;
  token: { id: string; readOnly?: boolean } | null;
  workbench: WorkbenchContext | null;
};

export function identityOf(ctx: RouteContext): RouteIdentity {
  return {
    sessionAccountId: ctx.sessionAccountId,
    verifiedAccountId: ctx.verifiedAccountId,
    accountEmail: ctx.accountEmail,
    sessionAuthTime: ctx.sessionAuthTime ?? null,
    owner: ctx.resolveOwner(),
    token: ctx.token ?? null,
    workbench: ctx.workbench ?? null,
  };
}

// The RouteContext the room's handlers run with, rebuilt from the request and the identity.
export function documentRouteContext(
  env: DocumentEnv,
  request: Request,
  identity: RouteIdentity,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
): DocumentRouteContext {
  const url = new URL(request.url);
  return {
    request,
    env,
    url,
    segments: url.pathname.replace(/^\//, '').split('/'),
    sessionAccountId: identity.sessionAccountId,
    verifiedAccountId: identity.verifiedAccountId,
    accountEmail: identity.accountEmail,
    sessionAuthTime: identity.sessionAuthTime,
    resolveOwner: () => identity.owner,
    token: identity.token,
    workbench: identity.workbench,
    ...(waitUntil ? { waitUntil } : {}),
  };
}

// The room's `route` RPC. A throw crosses back to the worker, which answers it as the room's failure
// (roomUnavailable).
export function answerDocumentRequest(
  env: DocumentEnv,
  request: Request,
  identity: RouteIdentity,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
): Promise<Response> {
  return handleDocumentRequest(documentRouteContext(env, request, identity, waitUntil));
}

/** Seconds a document request refused with 503 waits before it tries again. */
export const RETRY_AFTER_S = 5;

// What a document request answers when its room throws or cannot be reached: 503 `room_unavailable`, logged with
// the path (D16).
export function roomUnavailable(request: Request, error: unknown): Response {
  const url = new URL(request.url);
  const id = url.pathname.split('/')[3] ?? '';
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[room-route] failed id=${id} path=${url.pathname} error=${name}`, error);
  return json(
    { error: 'room_unavailable', message: 'The document is not available right now.' },
    { status: 503, headers: { 'Retry-After': String(RETRY_AFTER_S) } },
  );
}
