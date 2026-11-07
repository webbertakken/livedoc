// API-worker type surface. The wire-format DTOs are now defined in
// `@livedoc/api-schema` so the api worker and the live editor
// share the same source of truth (no more parallel type definitions
// drifting between them — see AGENTS.md's reuse-over-duplication
// rule). This file re-exports the canonical names under the
// historical `*DTO` aliases the worker code already uses, and adds
// the worker-only `Env` binding shape that has nowhere else to live.

export type {
  LiveDoc as DocumentDTO,
  DocumentSummary,
  TabSummary as TabSummaryDTO,
  TabRecord as TabDTO,
  Folder as FolderDTO,
  CustomTheme as CustomThemeDTO,
  CustomThemeDefinition,
  ApiToken as ApiTokenDTO,
  ImageSummary,
  ParticipantRecord as ParticipantDTO,
  ParticipantPresence,
  ShareRole,
  ShareLink as ShareLinkDTO,
  ServerMessage,
  ClientMessage,
} from '@livedoc/api-schema';

// What a content module runs with (docs/specs/006-document/document-storage.md): the worker's bindings
// and the document's own SQLite as `DOCUMENT_DB`, inside the document's room. The worker's Env has no DOCUMENT_DB,
// so a content module called from the worker does not compile.
export type DocumentEnv = Env & { DOCUMENT_DB: D1Database };

// Worker bindings injected by Cloudflare at runtime. Not part of the
// wire format (purely a server-side capability handle).
export type Env = {
  DB: D1Database;
  DOCUMENT_ROOM: DurableObjectNamespace<import('./document-room/document-room').DocumentRoom>;
  // The key-value rooms from before the content moved (docs/specs/006-document/document-storage-move.md).
  LEGACY_DOCUMENT_ROOM: DurableObjectNamespace<
    import('./document-room/legacy-document-room').LegacyDocumentRoom
  >;
  // The live build id: the deploy's commit, the same one baked into the editor build as
  // NEXT_PUBLIC_BUILD_ID (docs/specs/016-platform/stale-builds.md). Unset (local dev, a self-host that
  // sets neither) leaves it off the server release signal.
  BUILD_ID?: string;
  // The OAuth server the CLI signs in through (docs/specs/015-api/cli.md), an https origin.
  OAUTH_ISSUER?: string;
  // The oldest CLI the api accepts writes from, x.y.z; unset for no floor.
  CLI_MIN_VERSION?: string;
  // R2 bucket holding image-element bytes (docs/specs/009-elements/images.md). Optional so
  // self-hosters who haven't provisioned R2 can still deploy the
  // api worker: when unbound, the image endpoints all return 503
  // and the live app hides the Image palette entry.
  IMAGES?: R2Bucket;
  // Report a Bug (docs/specs/016-platform/bug-reports.md): the screenshots bucket (90-day lifecycle), the burst gate
  // per network, and the Bug Tracker document and board tab reports are filed on. Each optional: without the bucket a
  // report goes without its screenshot, without the limiter only the D1 window limits, and without the two ids every
  // report is stored (reason `unconfigured`).
  BUG_SCREENSHOTS?: R2Bucket;
  BUG_REPORT_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  BUG_REPORT_DOCUMENT_ID?: string;
  BUG_REPORT_TAB_ID?: string;
  // Cloudflare Workers Rate Limiting API binding. Caps per-owner
  // writes (POST / PUT / DELETE) at the configured limit/period in
  // wrangler.toml. Optional so self-host deployments without the
  // feature flag still serve (the check helper returns "allowed"
  // when the binding is absent).
  WRITE_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Per-IP limiter for the anonymous telemetry ingest (docs/specs/017-telemetry/telemetry.md),
  // SEPARATE from WRITE_RATE_LIMITER so it never competes with users'
  // real document writes. Keyed on CF-Connecting-IP. Optional: absent
  // (self-host) falls through to "allow", same as the write limiter.
  EVENTS_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Per-IP limiter for share-code resolution (GET /api/share/<code>),
  // which carries the optional share password and is otherwise an
  // unauthenticated read exempt from WRITE_RATE_LIMITER. Bounds blind
  // password / share-code guessing. Keyed on CF-Connecting-IP. Optional:
  // absent (self-host) → "allow".
  SHARE_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Share-password guesses (docs/specs/013-workspace/share-password.md "Guessing is limited"): per network, per document.
  SHARE_GUESS_VISITOR_LIMITER?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  };
  SHARE_GUESS_ITEM_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Per-IP throttle for GET /api/unfurl (docs/specs/009-elements/link-cards.md) — an unauthenticated
  // outbound page fetch, so bound abuse. Keyed on CF-Connecting-IP. Optional:
  // absent (self-host) → "allow".
  UNFURL_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Per-owner limiter for POST /api/drive/token (docs/specs/022-drive-mirror/drive-mirror.md,
  // "Tokens"): each call reaches Google's token endpoint, so it gets a far
  // tighter bound than the general write limiter. Keyed on the account id.
  // Optional: absent (self-host) → "allow".
  DRIVE_TOKEN_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Per-network limiter for a form link's reads and responses (docs/specs/030-forms/forms.md "Abuse and limits").
  FORM_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Per-network limiter for an invite email's Decline link (docs/specs/013-workspace/teams.md "Declining from the
  // email"), keyed `invite-decline:<address range>`: open doors, so the owner-keyed limiter cannot key them.
  // Optional: absent (self-host) → "allow".
  TEAM_INVITE_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Telemetry on/off switch (docs/specs/017-telemetry/telemetry.md). Authoritative: gates both
  // POST /api/events and GET /api/telemetry/summary. A plain
  // wrangler.toml [vars] string; only the literal "true" enables it.
  // Absent/anything-else keeps telemetry fully off — the self-host
  // default, so OSS forks never ingest or serve analytics unless they
  // opt in.
  TELEMETRY_ENABLED?: string;
  // Shared secret proving a /api/events post came from one of our own
  // workers over a service binding, not the open internet (docs/specs/017-telemetry/telemetry.md, issue
  // #36). Those calls carry no CF-Connecting-IP, so they all collapsed onto
  // one 'anonymous' rate-limit key and throttled each other. Optional:
  // unset means no caller is ever exempt, which is the pre-existing
  // behaviour and keeps self-hosting working with no configuration.
  INTERNAL_EVENTS_KEY?: string;
  // Resend API key (docs/specs/014-identity/transactional-email.md): the email transport when no `EMAIL` binding
  // exists (email/transport.ts). `wrangler secret put RESEND_API_KEY`; `apps/api/.dev.vars` locally.
  RESEND_API_KEY?: string;
  // Cloudflare Email Service's send_email binding: the preferred email transport (email/transport.ts).
  EMAIL?: { send: (message: Record<string, unknown>) => Promise<{ messageId: string }> };
  // "1" on previews and in the local e2e stack: every email is kept in `email_outbox` instead of being sent,
  // and `GET /api/preview/outbox` reads it back (docs/specs/014-identity/auth-and-guest-access.md "Previews").
  EMAIL_OUTBOX?: string;
  // From identity for outbound email (optional). Defaults to "LiveDoc <hello@docs.nu>". Its domain must be one
  // the transport may send from.
  EMAIL_FROM?: string;
  // Sign-in (docs/specs/014-identity/auth-and-guest-access.md). The secret is the switch: unset, the deployment is
  // guest-only. BETTER_AUTH_SECRETS ("2:new,1:old") rotates it. Secrets via `wrangler secret put`.
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_SECRETS?: string;
  // Google sign-in: the OAuth client (a var) and its secret. Separate from the Drive mirror's client.
  GOOGLE_AUTH_CLIENT_ID?: string;
  GOOGLE_AUTH_CLIENT_SECRET?: string;
  // Sign-in rate limits: every POST under /api/auth per IP, and code sends per
  // address. Absent bindings (self-host) allow.
  AUTH_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  AUTH_EMAIL_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Public origin of the deployment: links in emails, and sign-in's base URL and token issuer. Defaults to
  // "https://docs.nu" for emails; sign-in is off without it.
  APP_BASE_URL?: string;
  // WHOSE model, and where (docs/specs/007-editor/ai-assistance.md). The PROVIDER is inferred from which of
  // these keys is set, because a key is provider-specific and its name should
  // say so — see ai-provider.ts. Each feature takes its own provider from them
  // (the assistant prefers OpenAI, the crop reader Google); one key serves
  // both. None = the whole AI surface is hidden (capabilities reports aiEnabled:false and the AI routes
  // answer 503), which is the self-host default.
  //
  // Set via `wrangler secret put <NAME>` in production; drop into
  // `apps/api/.dev.vars` for local dev (gitignored, never commit).
  GOOGLE_AI_STUDIO_API_KEY?: string;
  OPENAI_API_KEY?: string;
  // Any other OpenAI-compatible endpoint (Mistral, OpenRouter, a local
  // llama.cpp or Ollama). Needs AI_BASE_URL and AI_MODEL with it.
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  // The assistant's model, overriding its provider's default. Reaches the
  // reader only when the reader runs on the same provider.
  AI_MODEL?: string;
  // The crop reader's model (docs/specs/021-event-storming/event-storming.md Phase 8), beating every default.
  AI_VISION_MODEL?: string;
  // Per-IP rate limiter for POST /api/ai. Caps AI requests at 20/60s
  // per IP so a single client can't exhaust the operator's model budget.
  // Optional: absent (self-host) falls through to "allow".
  AI_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Explorer Home's reads (docs/specs/013-workspace/explorer-home.md), per owner. Absent binding
  // (a self-host) allows every read.
  HOME_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Content search (docs/specs/013-workspace/content-search.md "Limits and abuse"): 120 a minute per person.
  SEARCH_RATE_LIMITER?: { limit: (input: { key: string }) => Promise<{ success: boolean }> };
  // Workbench ticket mints and pairing requests (docs/specs/013-workspace/workbench-embeds.md), keyed on the
  // token id: WORKBENCH_TICKETS_PER_MINUTE a minute. Absent binding (a self-host) allows every mint.
  WORKBENCH_TICKET_RATE_LIMITER?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  };
  // Per-token read limiter for token-authed GETs (docs/specs/015-api/public-api-and-tokens.md §3.5), keyed on the
  // token id. Token writes ride the WRITE_RATE_LIMITER (also keyed on the
  // token id); this covers reads, which that one doesn't. Optional: absent
  // (self-host) falls through to "allow".
  API_TOKEN_READ_RATE_LIMITER?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  };
  // Comma-separated Origin allow-list for POST /api/ai (docs/specs/007-editor/ai-assistance.md).
  // When set, the worker rejects 403 unless the request's Origin
  // header exactly matches one of the entries (trimmed for
  // whitespace). Unset = no check, matching the historical
  // behaviour so self-host upgrades don't break. Hosted
  // docs.nu sets this in apps/api/wrangler.toml [vars] (NOT the
  // dashboard, which a deploy wipes) to the apex "https://docs.nu"
  // alone: www.docs.nu 301s to the apex, so the apex is what a browser sends.
  AI_ALLOWED_ORIGINS?: string;
  // When the literal string "true", POST /api/ai requires a verified
  // session token and rejects the X-Owner-Id guest path with 401
  // (docs/specs/007-editor/ai-assistance.md). Anything else (unset, "false", any other value) keeps
  // the guest path open. Self-hosters who run without sign-in stay on
  // the open path by default.
  AI_REQUIRE_ACCOUNT?: string;
  // Per-owner soft cap on the number of images one owner may keep
  // in the gallery (docs/specs/009-elements/images.md). Stored as a decimal string in
  // wrangler.toml [vars]; parsed via parseInt at request time.
  // Unset or non-positive = no limit (the OSS self-host default
  // where the operator runs their own storage budget). Hosted
  // docs.nu sets this to "100".
  IMAGE_MAX_PER_OWNER?: string;
  // Per-owner soft cap on the total bytes one owner may keep in
  // the gallery (docs/specs/009-elements/images.md). Stored as a decimal byte count in
  // wrangler.toml [vars]; parsed via parseInt at request time.
  // Unset or non-positive = no limit. Hosted docs.nu sets
  // this to "104857600" (100 MB).
  IMAGE_MAX_BYTES_PER_OWNER?: string;
  // Google Drive mirror (docs/specs/022-drive-mirror/drive-mirror.md, "Self-hosting").
  // GOOGLE_CLIENT_ID (plain var) switches the feature on at all; with
  // GOOGLE_CLIENT_SECRET and DRIVE_TOKEN_KEY (both secrets) the worker brokers
  // refresh tokens, otherwise the browser holds its own short-lived tokens.
  // Unset = every /api/drive route answers 503 drive_not_configured.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // base64 of 32 random bytes (`openssl rand -base64 32`): seals refresh
  // tokens (AES-GCM) and, through HKDF, signs the consent state.
  DRIVE_TOKEN_KEY?: string;
  // Test-only: where the token exchange and revoke go instead of
  // https://oauth2.googleapis.com (the e2e suite's fake Google). Never set
  // by a real deployment.
  GOOGLE_OAUTH_BASE_URL?: string;
};
