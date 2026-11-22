import type { StormAskRequest, StormAskResponse } from '@livedoc/api-schema';
import { API_BASE, apiFetch, apiHeaders } from './core';
import { reportServerError } from './error-report';

// The built-in hand of an ask (docs/specs/021-event-storming/asks.md "The built-in hand"): the board travels in the
// request and the answer is what to add. A refusal comes back as its error token.

export type BuiltInAnswer = ({ ok: true } & StormAskResponse) | { ok: false; error: string };

export async function askBuiltIn(
  request: StormAskRequest,
  caller: { ownerId: string; share: string | null; signal: AbortSignal },
): Promise<BuiltInAnswer> {
  const res = await apiFetch(`${API_BASE}/storm-ask`, {
    method: 'POST',
    headers: await apiHeaders(caller.ownerId, { body: true, share: caller.share }),
    body: JSON.stringify(request),
    signal: caller.signal,
  });
  await reportServerError(res, 'storm ask');
  if (res.ok) return { ok: true, ...((await res.json()) as StormAskResponse) };
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return { ok: false, error: typeof body?.error === 'string' ? body.error : 'ai_failed' };
}
