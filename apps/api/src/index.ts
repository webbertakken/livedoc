import { CONTENT_MOVE_CRON, sweepContentMoves } from './document-room/content-move-sweep';
import {
  fromLegacyRequest,
  isLegacyDocumentsPath,
  toLegacyResponse,
} from './legacy-documents-alias';
import { getAccountSession } from './auth/session-token';
import { requireAccount } from './auth/account-gate';
import { handleAuth } from './routes/auth';
import { handlePreviewOutbox } from './routes/preview-outbox';
import { deleteExpiredIdentityRows, deleteOldOutboxMail } from './db/identity';
import { runLifecycleSweep } from './email/lifecycle';
import { runTokenExpirySweep } from './email/token-expiry';
import { runTeamInviteSweep } from './email/team-invite-reminders';
import { NOTIFY_EMAIL_DEDUPE_MS } from './email/notifications';
import { runTimelineExpirySweep } from './timeline';
import { runImageRetention } from './image-refs/retention';
import {
  deleteOldEvents,
  deleteOldNotifyEmailClaims,
  deleteOldTimelineEvents,
  purgeExpiredTrash,
  resolveApiToken,
  trashEmptyDocuments,
} from './db';
import {
  apiRouteLabel,
  bearerTokenOf,
  isAccountIdShape,
  TIMELINE_RETENTION_MS,
} from '@livedoc/api-schema';
import {
  API_TOKEN_PREFIX,
  isApiTokenFormat,
  isWorkbenchSessionFormat,
  WORKBENCH_SESSION_PREFIX,
} from '@livedoc/api-schema';
import { verifyOwnerId } from './auth/owner-signature';
import { guestSignatureEnforced, OWNER_SCOPED_SEGMENTS } from './auth/guest-rest';
import { handleTokens } from './routes/tokens';
import { handleOauthExchange } from './routes/oauth';
import { DocumentRoom } from './document-room/document-room';
import { LegacyDocumentRoom } from './document-room/legacy-document-room';
import { CORS_HEADERS, forbidden, json, notFound, payloadTooLarge, rateLimited } from './responses';
import { failedRequestResponse } from './request-failure';
import { deleteOldDocumentOpens } from './db/document-opens';
import { clientIp, clientNetwork, clientRateKey } from './client-ip';
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES } from './limits';
import { handleAccount } from './routes/account';
import { handleAiReadNotes } from './routes/ai-read-notes';
import { handleAi } from './routes/ai';
import { handleCatalogues } from './routes/catalogues';
import { handleCapabilities } from './routes/capabilities';
import { handleOpenapi } from './routes/openapi';
import { handleCustomThemes } from './routes/custom-themes';
import { handleShapeLibraries } from './routes/shape-libraries';
import { handleUnfurl } from './routes/unfurl';
import type { RouteContext, WorkbenchContext } from './routes/context';
import { handleDocuments } from './routes/documents';
import { handleEvents } from './routes/events';
import { handleFolders } from './routes/folders';
import { handleForms } from './routes/forms';
import { handleBugReports } from './bug-reports/route';
import { isBugReportRefileMinute, runBugReportRefile } from './bug-reports/refile';
import { deleteOldBugReportWindows } from './db/bug-reports';
import { handleImages } from './routes/images';
import { handleMigrate } from './routes/migrate';
import { handleGuestId } from './routes/guest-id';
import { handleParticipants } from './routes/participants';
import { handleFavourites } from './routes/favourites';
import { handleTags } from './routes/tags';
import { handlePlacementDefaults } from './routes/placement-defaults';
import { handleTimeline } from './routes/timeline';
import { handleActivity } from './routes/activity';
import { handleContentSearch } from './routes/content-search-route';
import { handleHome } from './routes/home';
import { handlePreferences } from './routes/preferences';
import { handleShare } from './routes/share';
import { isSharePreviewPath } from './routes/share-preview';
import { handleTeams } from './routes/teams';
import { handleShared } from './routes/shared';
import { handleTelemetry } from './routes/telemetry';
import { handleTrash } from './routes/trash';
import { retryRoomPurges, roomCallBudget } from './room-purge-client';
import { handleDrive } from './routes/drive';
import { handleWorkbench } from './routes/workbench';
import { resolveWorkbenchSession } from './auth/workbench-session';
import { workbenchRefusal } from './auth/workbench-confinement';
import { sweepWorkbench } from './db/workbench';
import { withServerRelease } from './server-release-header';
import { backgroundWaitUntil } from './background';
import type { Env } from './types';

export { DocumentRoom, LegacyDocumentRoom };

// Per-owner write rate limit (security audit item). Returns true
// when the caller is over the configured cap (wrangler.toml's
// WRITE_RATE_LIMITER binding) so the endpoint can short-circuit
// with a 429. Falls through to "allowed" when the binding is
// absent so self-host deployments without the feature still serve.
async function isWriteRateLimited(env: Env, ownerId: string): Promise<boolean> {
  if (!env.WRITE_RATE_LIMITER) return false;
  const result = await env.WRITE_RATE_LIMITER.limit({ key: ownerId });
  return !result.success;
}

// Every request the worker answers; `fetch` below stamps the document format number on it.
async function routeApiRequest(
  request: Request,
  env: Env,
  executionCtx?: ExecutionContext,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  // The deprecated /api/diagrams… alias: served by the /api/documents… routes, in the old shape.
  if (isLegacyDocumentsPath(new URL(request.url).pathname)) {
    console.warn('[legacy-documents-alias]', request.method, new URL(request.url).pathname);
    const current = await fromLegacyRequest(request, MAX_BODY_BYTES);
    if (!current) return payloadTooLarge();
    return toLegacyResponse(await worker.fetch(current, env, executionCtx));
  }

  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\//, '').split('/');
  if (segments[0] !== 'api') return notFound();
  // Sign-in (docs/specs/014-identity/auth-and-guest-access.md): better-auth's routes authenticate themselves, so
  // they are answered before the api's own identity resolution and gates.
  if (segments[1] === 'auth') return handleAuth(request, env, executionCtx);
  if (segments[1] === 'preview') return handlePreviewOutbox(request, env);

  // Who is calling (docs/specs/014-identity/auth-and-guest-access.md "How the api knows who is calling"), resolved
  // once here; the first credential present decides, and one that is present but wrong is refused, never read as
  // a guest. Token prefixes are checked first: they are cheap string tests, and a session token never carries one.
  const bearer = bearerTokenOf(request.headers.get('Authorization'));
  // 1. API token (docs/specs/015-api/public-api-and-tokens.md): a `Bearer livedoc_…` resolves to its owner account
  // via the hashed-token lookup, so a token request flows through the same ownership and gate checks as a
  // signed-in one. A bearer that carries the prefix claims to be a token even when it is cut short or mistyped
  // (a copy-paste slip): unknown, revoked or expired, it is refused here (§3.3).
  let tokenAuth: { ownerId: string; tokenId: string; readOnly: boolean } | null = null;
  if (bearer?.startsWith(API_TOKEN_PREFIX)) {
    tokenAuth = isApiTokenFormat(bearer) ? await resolveApiToken(env, bearer) : null;
    if (!tokenAuth) {
      console.warn('[tokens] invalid bearer refused', { path: url.pathname });
      return json(
        { error: 'invalid_token' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } },
      );
    }
  }
  // 2. Workbench session (docs/specs/013-workspace/workbench-embeds.md): a `Bearer lvw_…` is a person's editor
  // on one document, minted from their token's ticket. One that does not resolve is refused, cut short or
  // mistyped included. A resolved one is confined at once (auth/workbench-confinement.ts): another document reads
  // as absent, any route outside the allow-list is refused, and a view session writes nothing.
  let workbench: WorkbenchContext | null = null;
  if (bearer?.startsWith(WORKBENCH_SESSION_PREFIX)) {
    const resolved = isWorkbenchSessionFormat(bearer)
      ? await resolveWorkbenchSession(env, bearer, Date.now())
      : ({ ok: false, reason: 'malformed', sessionPrefix: '' } as const);
    if (!resolved.ok) {
      console.warn('[workbench] bearer-refused', {
        reason: resolved.reason,
        sessionPrefix: resolved.sessionPrefix,
      });
      return json(
        { error: 'invalid_session' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } },
      );
    }
    workbench = resolved.workbench;
    const refusal = workbenchRefusal(workbench, request.method, segments, request.headers);
    if (refusal) return refusal;
  }
  // 3. Session token: any other bearer, the account when it verifies. One that does not verify falls through to
  // the guest header (logged by getAccountSession), because the guest path must always serve.
  const accountSession =
    bearer && !tokenAuth && !workbench ? await getAccountSession(env, bearer) : null;
  // The account a session token proves: the only credential that administers (teams, tokens, migration,
  // deleting the account).
  const sessionAccountId = accountSession?.accountId ?? null;
  // The email used for team-invite matching (docs/specs/013-workspace/teams.md): ONLY the session token's
  // verified email claim, never a client-supplied header, which would let a caller claim another address's
  // pending invites.
  const accountEmail = accountSession?.emailVerified ? accountSession.email : null;
  // 4. Guest header. An empty one is no identity at all: as '' it would be one shared, writable owner namespace
  // (and one shared rate-limit bucket) for everyone.
  const resolveOwner = (): string | null =>
    sessionAccountId ??
    tokenAuth?.ownerId ??
    workbench?.ownerId ??
    (request.headers.get('X-Owner-Id') || null);
  // The server-verified account from any credential (session, token or workbench owner). Feeds the
  // team-membership content gates and the teams-surface reads (RouteContext.verifiedAccountId); administration
  // keeps reading `sessionAccountId`.
  const verifiedAccountId = sessionAccountId ?? tokenAuth?.ownerId ?? workbench?.ownerId ?? null;
  // A session token outlives an account deleted within its 15 minutes: administration asks for the live account.
  if (sessionAccountId) {
    const refusal = await requireAccount(env, sessionAccountId, segments[1] ?? '');
    if (refusal) return refusal;
  }

  // An account id presented as the GUEST header is always a replay of a harvested id, never a real client (see
  // auth/guest-rest.ts): the guest credential is a server-minted UUID, and a signed-in caller sends
  // `Authorization` instead. Refused unconditionally, BEFORE the signature gate below, because that gate is off
  // on a host without sign-in. `share` is included even though it is not owner-scoped: its resolver compares the
  // header with the document's owner to decide redaction.
  if (
    !sessionAccountId &&
    !tokenAuth &&
    !workbench &&
    (OWNER_SCOPED_SEGMENTS.has(segments[1] ?? '') || segments[1] === 'share')
  ) {
    const headerOwner = request.headers.get('X-Owner-Id');
    if (headerOwner && isAccountIdShape(headerOwner)) {
      return json({ error: 'account_id_not_a_guest_credential' }, { status: 401 });
    }
  }

  // Guest REST signature gate (docs/specs/015-api/public-api-and-tokens.md §4; docs/specs/014-identity/
  // auth-and-guest-access.md "Signed guest ids"). On owner-scoped routes, a presented `X-Owner-Id` must carry a
  // valid HMAC signature whenever the host signs guest ids (sign-in on), so a harvested guest id can't be used as a
  // credential. Skipped for session, token and workbench callers (they aren't on the guest path) and on a
  // guest-only host, which signs nothing. A request with NO `X-Owner-Id` is untouched (it just resolves to no
  // owner), so public reads still work.
  if (
    !sessionAccountId &&
    !tokenAuth &&
    !workbench &&
    OWNER_SCOPED_SEGMENTS.has(segments[1] ?? '') &&
    guestSignatureEnforced(env)
  ) {
    const headerOwner = request.headers.get('X-Owner-Id');
    if (
      headerOwner &&
      !(await verifyOwnerId(env, headerOwner, request.headers.get('X-Owner-Sig')))
    ) {
      console.warn(`[auth] guest_signature_refused route=${segments[1]}`);
      return json({ error: 'signature_required' }, { status: 401 });
    }
  }

  // Per-owner write rate limit. Gates POST / PUT / DELETE at a
  // generous ceiling (wrangler.toml WRITE_RATE_LIMITER) so a bot
  // pacing under Cloudflare's DDoS threshold still can't spam
  // document / image creation through to D1 / R2 quota
  // exhaustion. Reads pass through untouched. When neither a
  // session token nor X-Owner-Id resolves the caller, fall back to
  // a literal 'anonymous' key so one unauthenticated client still
  // can't burn the global quota. Telemetry ingest (/api/events)
  // is deliberately exempt: it's anonymous, high-frequency, and
  // must never compete with a user's real document writes for the
  // per-owner write budget (docs/specs/017-telemetry/telemetry.md). Client-side batching keeps
  // its volume low instead.
  const isWrite =
    request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE';
  // Read-only token enforcement (docs/specs/015-api/mcp-server.md §4.11): a token minted read-only may
  // only GET/HEAD. Reject every write it presents at this single choke point
  // — so no write route can be reached, present or future, with no per-route
  // changes. sessions and full tokens are unaffected (tokenAuth is null
  // or readOnly false). Guest header requests carry no tokenAuth either.
  // A token revoking itself escalates nothing, so any token may (docs/specs/015-api/cli.md).
  const isSelfRevoke =
    request.method === 'DELETE' && segments[1] === 'tokens' && segments[2] === 'current';
  // Opening and pairing a workbench write nothing a read-only token could misuse: its ticket is minted view-only, so
  // a view token gives a read-only frame (docs/specs/013-workspace/workbench-embeds.md).
  const isWorkbenchAsk =
    request.method === 'POST' &&
    segments.length === 3 &&
    segments[1] === 'workbench' &&
    (segments[2] === 'tickets' || segments[2] === 'pairing-requests');
  if (tokenAuth?.readOnly && isWrite && !isSelfRevoke && !isWorkbenchAsk) {
    return forbidden('read_only_token');
  }
  // One read is a credential, not content: the share-link list carries every
  // code (edit links included), so a read-only token that could list it could
  // promote itself to edit by opening a link.
  const isShareLinkList =
    segments[1] === 'documents' && segments.length === 4 && segments[3] === 'share';
  if (tokenAuth?.readOnly && isShareLinkList) {
    console.warn('[read-only-token] share-link list refused', { tokenId: tokenAuth.tokenId });
    return forbidden('read_only_token');
  }
  // Reject oversized bodies up front (cheap Content-Length gate) so a hostile
  // payload never reaches a route's req.json(). The per-field / per-tab caps
  // in the routes catch the rest; this is the blunt outer bound.
  if (isWrite) {
    const len = Number(request.headers.get('content-length'));
    // Image uploads carry raw bytes with their own, larger cap (docs/specs/009-elements/images.md);
    // the route re-checks it and answers with file_too_large + limitBytes.
    const cap = segments[1] === 'images' ? MAX_IMAGE_BYTES : MAX_BODY_BYTES;
    if (Number.isFinite(len) && len > cap) {
      return payloadTooLarge();
    }
  }
  // Room-ticket mints (docs/specs/015-api/api.md) are exempt like /api/events: the mint
  // is the auth handshake for opening the realtime room, and a 429 —
  // easily reached because it shares the per-owner budget with the
  // ~600ms autosave PUTs — would silently cost a team member their
  // whole session's realtime (the connector has no reconnect loop).
  // Mint volume is one row per room join and the route does no
  // unbounded work, so it isn't a quota-exhaustion vector.
  const isRoomTicketMint = segments[1] === 'documents' && segments[3] === 'room-ticket';
  // ...but not unthrottled: each mint is a D1 write. Its own bucket per
  // caller network (the owner id is caller-chosen for a guest), so a flood is
  // bounded without touching anyone's autosave budget.
  if (isRoomTicketMint && isWrite && env.WRITE_RATE_LIMITER) {
    if (await isWriteRateLimited(env, `room-ticket:${clientRateKey(request)}`))
      return rateLimited();
  }
  // A form link's doors (docs/specs/030-forms/forms.md "Abuse and limits"): respondents are anonymous, so reads and
  // responses are limited per network, each on its own key, apart from everyone's document writes.
  const isFormRequest = segments[1] === 'forms';
  if (isFormRequest && env.FORM_RATE_LIMITER) {
    const ok = await env.FORM_RATE_LIMITER.limit({
      key: `${isWrite ? 'form' : 'form-read'}:${clientNetwork(clientIp(request))}`,
    });
    if (!ok.success) return rateLimited();
  }
  // An invite email's Decline link (docs/specs/013-workspace/teams.md "Declining from the email"): open, so
  // limited per network, reads and declines on one key, apart from everyone's document writes.
  const isInviteDecline = segments[1] === 'teams' && segments[2] === 'invite-decline';
  if (isInviteDecline && env.TEAM_INVITE_RATE_LIMITER) {
    const ok = await env.TEAM_INVITE_RATE_LIMITER.limit({
      key: `invite-decline:${clientNetwork(clientIp(request))}`,
    });
    if (!ok.success) return rateLimited();
  }
  if (
    isWrite &&
    url.pathname !== '/api/events' &&
    !isRoomTicketMint &&
    !isFormRequest &&
    !isInviteDecline
  ) {
    // A token request rate-limits on the TOKEN id (docs/specs/015-api/public-api-and-tokens.md §3.5), so a
    // runaway integration is throttled independently of the owner's
    // interactive app use; everything else keys on the resolved owner.
    // A caller with no identity yet (minting a guest id) is keyed on its
    // network, not one global 'anonymous' bucket every new visitor shares.
    // A workbench session's writes key on the session (WB10), apart from its owner's own app use.
    const key = tokenAuth
      ? `token:${tokenAuth.tokenId}`
      : workbench
        ? `workbench:${workbench.sessionId}`
        : (resolveOwner() ?? `anonymous:${clientRateKey(request)}`);
    if (await isWriteRateLimited(env, key)) return rateLimited();
  }
  // Token-authed READS (docs/specs/015-api/public-api-and-tokens.md §3.5): GETs under a token aren't covered by
  // the write limiter, so an external integration's reads get their own
  // per-token throttle. Optional binding → allow when absent (self-host).
  if (tokenAuth && request.method === 'GET' && env.API_TOKEN_READ_RATE_LIMITER) {
    const ok = await env.API_TOKEN_READ_RATE_LIMITER.limit({ key: `token:${tokenAuth.tokenId}` });
    if (!ok.success) return rateLimited();
  }

  // Throttle blind share-code / password guessing on the share-resolve
  // read (GET /api/share/<code>), which carries the optional share
  // password and is otherwise an unauthenticated read exempt from the
  // write limiter above. Per-IP. Absent binding → allow (self-host).
  // A link preview's two reads (docs/specs/013-workspace/share-link-previews.md) take their own bucket, so a room
  // of people opening one link together never spends the editor's share resolve on previews.
  if (request.method === 'GET' && segments[1] === 'share' && env.SHARE_RATE_LIMITER) {
    const ip = clientRateKey(request);
    const key = isSharePreviewPath(segments) ? `share-preview:${ip}` : ip;
    if (!(await env.SHARE_RATE_LIMITER.limit({ key })).success) return rateLimited();
  }

  // Dispatch on the resource segment to its route module. Each
  // handler owns every request for its segment and returns
  // notFound() for sub-paths / methods it doesn't recognise, so an
  // unmatched resource OR an unmatched sub-route both fall through
  // to the final notFound() (preserving the original behaviour).
  const ctx: RouteContext = {
    request,
    env,
    url,
    segments,
    sessionAccountId,
    verifiedAccountId,
    accountEmail,
    sessionAuthTime: accountSession?.authTime ?? null,
    resolveOwner,
    token: tokenAuth ? { id: tokenAuth.tokenId, readOnly: tokenAuth.readOnly } : null,
    workbench,
    // Every handler's background work logs its failure here (docs/specs/015-api/api.md "Background work").
    waitUntil: backgroundWaitUntil(executionCtx, apiRouteLabel(request.method, url.pathname)),
  };
  switch (segments[1]) {
    case 'capabilities':
      return handleCapabilities(ctx);
    case 'templates':
    case 'icons':
    case 'schema':
      return handleCatalogues(ctx);
    case 'openapi.json':
      return handleOpenapi(ctx);
    case 'unfurl':
      return await handleUnfurl(ctx);
    case 'ai':
      // Two model routes, one gate (docs/specs/007-editor/ai-assistance.md + docs/specs/021-event-storming/event-storming.md Phase 8): the
      // assistant at /api/ai, and the crop reader one segment deeper.
      if (segments[2] === undefined) return await handleAi(ctx);
      if (segments[2] === 'read-notes' && segments.length === 3)
        return await handleAiReadNotes(ctx);
      return notFound();
    case 'events':
      return await handleEvents(ctx);
    case 'telemetry':
      return await handleTelemetry(ctx);
    case 'share':
      return await handleShare(ctx);
    case 'shared':
      return await handleShared(ctx);
    case 'images':
      return await handleImages(ctx);
    case 'documents':
      return await handleDocuments(ctx);
    case 'folders':
      return await handleFolders(ctx);
    // A form link's public doors (docs/specs/030-forms/forms.md "Filling in a form").
    case 'bug-reports':
      return handleBugReports(ctx);
    case 'forms':
      return await handleForms(ctx);
    case 'custom-themes':
      return await handleCustomThemes(ctx);
    case 'shape-libraries':
      return await handleShapeLibraries(ctx);
    case 'teams':
      return await handleTeams(ctx);
    case 'tokens':
      return await handleTokens(ctx);
    case 'oauth':
      return await handleOauthExchange(ctx);
    case 'account':
      return await handleAccount(ctx);
    case 'favourites':
      return await handleFavourites(ctx);
    // Per-person document tags (docs/specs/013-workspace/tags.md).
    case 'tags':
      return await handleTags(ctx);
    case 'placement-defaults':
      return await handlePlacementDefaults(ctx);
    case 'trash':
      return await handleTrash(ctx);
    case 'timeline':
      return await handleTimeline(ctx);
    case 'activity':
      return await handleActivity(ctx);
    case 'home':
      return await handleHome(ctx);
    case 'search':
      return await handleContentSearch(ctx);
    case 'preferences':
      return await handlePreferences(ctx);
    case 'migrate':
      return await handleMigrate(ctx);
    case 'guest-id':
      return await handleGuestId(ctx);
    case 'participants':
      return await handleParticipants(ctx);
    case 'drive':
      return await handleDrive(ctx);
    case 'workbench':
      return await handleWorkbench(ctx);
  }

  return notFound();
}

const worker = {
  // Every response carries the server release signal (docs/specs/016-platform/new-version-prompt.md, stale-builds.md).
  async fetch(request: Request, env: Env, executionCtx?: ExecutionContext): Promise<Response> {
    // One guard for the whole request, identity resolution included (docs/specs/015-api/api.md "When a request
    // fails"): nothing that throws is left to the runtime's bare error page.
    let response: Response;
    try {
      response = await routeApiRequest(request, env, executionCtx);
    } catch (err) {
      response = failedRequestResponse(err, request, env, executionCtx);
    }
    return withServerRelease(response, env.BUILD_ID);
  },

  // Scheduled handler. Wired to the cron schedule in wrangler.toml.
  // One worker invocation per `triggers.crons` entry; dispatch on
  // `event.cron` for each pattern. Today's daily 03:00 UTC trigger
  // fires independent retention sweeps:
  //   - events,     60-day floor (docs/specs/017-telemetry/telemetry.md "Retention").
  //   - images,     30-day floor, unused only, paused until every document has pushed its summary
  //                 (docs/specs/009-elements/images.md "Retention").
  //   - trash,      30 days after deletion (docs/specs/013-workspace/trash.md).
  //   - empty,      documents empty and unsaved for 30 days move to the Trash
  //                 (docs/specs/013-workspace/empty-document-cleanup.md).
  // All are no-ops when nothing is over the floor; all use
  // `ctx.waitUntil` so they run concurrently and the worker can
  // exit as soon as the schedule callback returns. Each step carries its own catch and log line,
  // so one failed step never skips another (docs/specs/015-api/api.md "Background work").
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 3 * * *') {
      const now = Date.now();
      scheduleSweep(ctx, env, 'events', 'rows', now - EVENTS_RETENTION_MS, deleteOldEvents);
      // docs/specs/014-identity/auth-and-guest-access.md: expired sessions and sign-in codes, and the
      // outbox's day of mail (previews only).
      scheduleSweep(ctx, env, 'identity', 'rows', now, deleteExpiredIdentityRows);
      scheduleSweep(
        ctx,
        env,
        'email_outbox',
        'rows',
        now - OUTBOX_RETENTION_MS,
        deleteOldOutboxMail,
      );
      // docs/specs/013-workspace/timeline.md §3.5: the Timeline feed keeps a year.
      scheduleSweep(
        ctx,
        env,
        'timeline',
        'events',
        now - TIMELINE_RETENTION_MS,
        deleteOldTimelineEvents,
      );
      // docs/specs/013-workspace/explorer-home.md "Opens": an open older than the Timeline's year
      // is forgotten, the same retention as the events it sits beside.
      scheduleSweep(
        ctx,
        env,
        'home_opens',
        'rows',
        now - TIMELINE_RETENTION_MS,
        deleteOldDocumentOpens,
      );
      // docs/specs/016-platform/bug-reports.md: a report window a day old counts nothing.
      scheduleSweep(
        ctx,
        env,
        'bug_report_windows',
        'rows',
        now - DAY_MS,
        deleteOldBugReportWindows,
      );
      // docs/specs/012-collaboration/assigned-actions.md §4: a notify-email claim past its dedupe window
      // decides nothing any more.
      scheduleSweep(
        ctx,
        env,
        'notify_email_claims',
        'rows',
        now - NOTIFY_EMAIL_DEDUPE_MS,
        deleteOldNotifyEmailClaims,
      );
      // docs/specs/014-identity/transactional-email.md: send any due onboarding emails (welcome catch-up + week 1 / 2).
      // No-op when RESEND_API_KEY is unset.
      ctx.waitUntil(
        runLifecycleSweep(env).catch((err: unknown) =>
          console.error('lifecycle sweep failed', err),
        ),
      );
      // docs/specs/013-workspace/teams.md "Reminders and expiry": expire invites nobody answered in 28 days
      // (always), then send the 1 / 7 / 21-day reminders (email only). Logs its own outcome.
      ctx.waitUntil(
        runTeamInviteSweep(env, now)
          .then(() => undefined)
          .catch((err) => console.error('[team-invites] sweep failed', err)),
      );
      // docs/specs/014-identity/transactional-email.md (#3): warn owners whose API token is within a week of expiry.
      ctx.waitUntil(
        runTokenExpirySweep(env).catch((err: unknown) =>
          console.error('token expiry sweep failed', err),
        ),
      );
      // docs/specs/013-workspace/timeline.md §4.5: the same window, on the Timeline. Separate from
      // the email sweep above because that one no-ops without a Resend
      // key, and a self-host with no email provider still needs to know
      // its integration is about to break.
      ctx.waitUntil(
        runTimelineExpirySweep(env)
          .then((count) => console.log(`timeline expiry sweep: emitted ${count} events`))
          .catch((err) => console.error('timeline expiry sweep failed', err)),
      );
      // docs/specs/013-workspace/trash.md: the purges rooms still owe first, then what has been in the Trash for
      // 30 days, oldest first, capped per run (TRASH_PURGE_MAX_BATCHES). One budget of room calls for both, so the
      // run stays inside the invocation's subrequests (room-purge-client.ts); what it leaves keeps its tombstone.
      ctx.waitUntil(
        (async () => {
          const roomCalls = roomCallBudget();
          await retryRoomPurges(env, now, roomCalls).catch((err: unknown) =>
            console.error('[room-purge] retry failed', err),
          );
          const count = await purgeExpiredTrash(env, now, { roomCalls });
          console.log(`trash sweep: purged ${count} documents`);
        })().catch((err) => console.error('trash sweep failed', err)),
      );
      // docs/specs/013-workspace/empty-document-cleanup.md: move documents empty and
      // unsaved for 30 days to the Trash, stamped `now`, so the purge above
      // never takes one this run: it waits its full 30 days there.
      ctx.waitUntil(
        trashEmptyDocuments(env, now)
          .then((count) => console.log(`empty sweep: moved ${count} documents to the Trash`))
          .catch((err) => console.error('empty sweep failed', err)),
      );
      // docs/specs/009-elements/images.md "Retention": once every document has pushed its images,
      // then reap unused images. runImageRetention logs its own outcome.
      ctx.waitUntil(runImageRetention(env, now));
      // docs/specs/013-workspace/workbench-embeds.md: spent tickets and requests,
      // sessions past their grace, pairings of tokens no longer live.
      ctx.waitUntil(
        sweepWorkbench(env, now)
          .then((count) => console.log(`workbench sweep: deleted ${count} rows`))
          .catch((err) => console.error('workbench sweep failed', err)),
      );
    }
    // docs/specs/006-document/document-storage-move.md "The sweep": every minute, documents whose content is still
    // in D1 move into their rooms.
    if (event.cron === CONTENT_MOVE_CRON) {
      ctx.waitUntil(
        sweepContentMoves(env, Date.now()).catch((err: unknown) =>
          console.error('[content-move] sweep failed', err),
        ),
      );
      // docs/specs/016-platform/bug-reports.md "Filing": every 15 minutes, stored bug reports are filed again.
      if (isBugReportRefileMinute(event.scheduledTime)) {
        ctx.waitUntil(
          runBugReportRefile(env, Date.now())
            .then(() => undefined)
            .catch((err: unknown) => console.error('[bug-reports] refile.failed', err)),
        );
      }
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;

// Run one daily retention sweep in the background: delete rows older than
// `cutoff`, then log the count (or the failure) to `wrangler tail`. The
// retention sweeps (events / sessions / timeline / opens) share this exact waitUntil +
// then/catch shape; `label` + `unit` keep each log line reading naturally. A
// zero is the normal case most days — observability without a metrics pipeline.
function scheduleSweep(
  ctx: ExecutionContext,
  env: Env,
  label: string,
  unit: string,
  cutoff: number,
  deleteOlderThan: (env: Env, cutoff: number) => Promise<number>,
): void {
  ctx.waitUntil(
    deleteOlderThan(env, cutoff)
      .then((count) => {
        console.log(`${label} sweep: deleted ${count} ${unit} older than ${cutoff}`);
      })
      .catch((err) => {
        console.error(`${label} sweep failed`, err);
      }),
  );
}

// A day in ms: how long a preview's outbox keeps mail (routes/preview-outbox.ts).
const OUTBOX_RETENTION_MS = 86_400_000;

// A day in ms: how long a bug report window is kept (docs/specs/016-platform/bug-reports.md).
const DAY_MS = 86_400_000;

// 60 days in ms. The /telemetry dashboard's longest window is
// "Last 30 days", so anything past 60 days is dead storage (twice
// the surfaced window, leaving headroom for a future "Last 60
// days" view to populate). See docs/specs/017-telemetry/telemetry.md "Retention".
const EVENTS_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
