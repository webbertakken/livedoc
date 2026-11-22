// How the worker answers a request that threw (docs/specs/015-api/api.md "When a request fails"): D1 failing on its
// side is a retryable 503, anything else a 500. Neither body echoes the error's text, which can name tables.

import { apiRouteLabel, errorTypeToken } from '@livedoc/api-schema';
import { insertTelemetryEvents } from './db/telemetry';
import { json } from './responses';
import type { Env } from './types';

// Seconds a caller waits before retrying a request D1 could not serve; the room's own 503s use the same.
export const STORAGE_RETRY_AFTER_SECONDS = 5;

// The failures that are the database's, not the query's: the same call succeeds once D1 recovers, without us
// changing anything (docs/specs/015-api/api.md "When a request fails"). A constraint, type or SQL error is a bug and
// is never matched here, and neither is a reset that follows from the query itself (a CPU, memory or storage
// timeout reset): a retry repeats it, and the crash report is how we find the query.
const D1_UNAVAILABLE = [
  // D1's documented errors (https://developers.cloudflare.com/d1/observability/debug-d1/#list-of-d1_errors).
  'internal error',
  'network connection lost',
  'replica disconnected from primary',
  'cannot resolve d1 db due to transient issue',
  'd1 db reset because its code was updated',
  'd1 db is overloaded',
  "your account has exceeded d1's free tier daily row (?:read|write) limit",
  // SQLite out of memory inside D1: D1's analytics on 29 October, during Cloudflare's D1 incident.
  'out of memory: sqlite_nomem',
  // D1's service answering something other than its JSON (workerd's d1-api.ts, toJson).
  'failed to parse body as json',
];
const D1_ERROR_UNAVAILABLE = new RegExp(`^D1_ERROR: (?:${D1_UNAVAILABLE.join('|')})`, 'i');

// The binding's own transport failing before D1 answers: workerd's d1-api.ts awaits the binding's fetch outside the
// `try` that adds the D1_ERROR prefix, so the runtime's own error arrives bare. A bare `internal error` with no
// reference is not the runtime's shape.
const TRANSPORT_UNAVAILABLE = /^(?:Network connection lost\.?$|internal error; reference = )/;

export function isStorageUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return D1_ERROR_UNAVAILABLE.test(err.message) || TRANSPORT_UNAVAILABLE.test(err.message);
}

export function failedRequestResponse(
  err: unknown,
  request: Request,
  env: Env,
  executionCtx?: ExecutionContext,
): Response {
  const route = apiRouteLabel(request.method, new URL(request.url).pathname);
  if (isStorageUnavailable(err)) {
    console.error(`[d1] unavailable route=${route}`, err);
    return json(
      { error: 'storage_unavailable' },
      { status: 503, headers: { 'Retry-After': String(STORAGE_RETRY_AFTER_SECONDS) } },
    );
  }
  console.error(`api error route=${route}`, err);
  // Self-report the crash to the events table (docs/specs/017-telemetry/telemetry.md 'Error' category): the worker
  // owns the D1 binding, so a server-side exception counts even when no client survives to report it. Off the
  // response's critical path, and its own failure is logged, never thrown: the 500 must still go out.
  if (env.TELEMETRY_ENABLED === 'true') {
    const report = insertTelemetryEvents(
      env,
      [{ category: 'Error', action: 'Api', type: errorTypeToken('Internal', route) }],
      Date.now(),
    ).catch((reportErr: unknown) => console.error('[telemetry] crash report failed', reportErr));
    executionCtx?.waitUntil?.(report);
  }
  return json({ error: 'internal_error' }, { status: 500 });
}
