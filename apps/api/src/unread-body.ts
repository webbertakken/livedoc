// No answer leaves a request body unread (docs/specs/015-api/api.md "Request bodies"). The router streams each body on
// into the api; its runtime closes that stream once the router's answer is sent, and a body still streaming then
// throws in the router (`Can't read from request stream after response has been sent.`). Reading a small body to its
// end finishes the stream before the api answers; a long one, or one of no declared length, is cancelled.

// How long a body the api reads to its end may be, in bytes (default): far above any body a route ignores today (the
// editor's `{}`), and small enough that reading it costs nothing.
export const UNREAD_BODY_DRAIN_MAX_BYTES = 65_536;

function declaredLength(request: Request): number | null {
  const raw = request.headers.get('content-length');
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function discardUnreadBody(request: Request): Promise<void> {
  const body = request.body;
  if (!body || request.bodyUsed || body.locked) return;
  const declared = declaredLength(request);
  try {
    if (declared !== null && declared <= UNREAD_BODY_DRAIN_MAX_BYTES) await request.arrayBuffer();
    else await body.cancel();
  } catch (error) {
    console.warn('[request] body.discard_failed', {
      path: new URL(request.url).pathname,
      why: String(error).slice(0, 200),
    });
  }
}
