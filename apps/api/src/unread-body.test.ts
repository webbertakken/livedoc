import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import { sqliteD1 } from './test-sqlite-d1';
import { discardUnreadBody, UNREAD_BODY_DRAIN_MAX_BYTES } from './unread-body';

// docs/specs/015-api/api.md "Request bodies": no answer leaves a request body unread.

// A body that records whether it was read to its end or cancelled.
function watchedRequest(bytes: number, init: { declare?: boolean } = {}) {
  const seen = { pulled: 0, ended: false, cancelled: false };
  const chunk = new Uint8Array(Math.min(bytes, 16_384));
  let left = bytes;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (left <= 0) {
        seen.ended = true;
        controller.close();
        return;
      }
      const piece = chunk.subarray(0, Math.min(left, chunk.length));
      left -= piece.length;
      seen.pulled += piece.length;
      controller.enqueue(piece);
    },
    cancel() {
      seen.cancelled = true;
    },
  });
  const headers = new Headers();
  if (init.declare !== false) headers.set('content-length', String(bytes));
  const request = new Request('https://docs.test/api/x', {
    method: 'POST',
    body,
    headers,
    duplex: 'half',
  } as RequestInit);
  return { request, seen };
}

describe('discardUnreadBody', () => {
  it('reads a small declared body to its end', async () => {
    const { request, seen } = watchedRequest(2);
    await discardUnreadBody(request);
    expect(seen).toEqual({ pulled: 2, ended: true, cancelled: false });
    expect(request.bodyUsed).toBe(true);
  });

  it('reads a body of exactly the bound to its end', async () => {
    const { request, seen } = watchedRequest(UNREAD_BODY_DRAIN_MAX_BYTES);
    await discardUnreadBody(request);
    expect(seen.ended).toBe(true);
  });

  it('cancels a body over the bound, and one of no declared length', async () => {
    for (const watched of [
      watchedRequest(UNREAD_BODY_DRAIN_MAX_BYTES + 1),
      watchedRequest(10, { declare: false }),
    ]) {
      await discardUnreadBody(watched.request);
      expect(watched.seen.cancelled).toBe(true);
      expect(watched.seen.ended).toBe(false);
    }
  });

  it('leaves alone a body a route read or is reading, and a request without one', async () => {
    const read = watchedRequest(2);
    await read.request.text();
    await discardUnreadBody(read.request);

    const reading = watchedRequest(2);
    const reader = reading.request.body!.getReader();
    await discardUnreadBody(reading.request);
    expect(reading.seen.cancelled).toBe(false);
    reader.releaseLock();

    await expect(
      discardUnreadBody(new Request('https://docs.test/api/x')),
    ).resolves.toBeUndefined();
  });

  it('logs a body that cannot be discarded, and resolves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = new ReadableStream({
      pull() {
        throw new Error('stream broke');
      },
    });
    const request = new Request('https://docs.test/api/x', {
      method: 'POST',
      body,
      headers: { 'content-length': '2' },
      duplex: 'half',
    } as RequestInit);
    await expect(discardUnreadBody(request)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[request] body.discard_failed', {
      path: '/api/x',
      why: 'Error: stream broke',
    });
    warn.mockRestore();
  });
});

describe('the api, at its front door', () => {
  it('answers POST /api/guest-id with its {} body read to the end', async () => {
    const { env } = sqliteD1({});
    const request = new Request('https://docs.test/api/guest-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(200);
    expect(request.bodyUsed).toBe(true);
  });
});
