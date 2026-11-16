import { describe, expect, it, vi } from 'vitest';

// The worker's part of an answer's Server-Timing (docs/specs/016-platform/web-performance.md "The api"): its whole
// answer, and whether this isolate answered for the first time, on a successful answer only.

vi.mock('./auth/session-token', () => ({ getAccountSession: async () => null }));
vi.mock('./db', () => ({
  resolveApiToken: async () => null,
  listDocumentsByOwner: async () => [],
  deleteOldEvents: async () => {},
}));

import worker from './index';
import { signOwnerId } from './auth/owner-signature';
import type { Env } from './types';

const env = () => ({ BETTER_AUTH_SECRET: 's'.repeat(40) }) as unknown as Env;

async function listAs(owner: string, signed: boolean): Promise<Response> {
  const headers: Record<string, string> = { 'X-Owner-Id': owner };
  if (signed) headers['X-Owner-Sig'] = (await signOwnerId(env(), owner))!;
  return worker.fetch(new Request('https://api.test/api/documents', { headers }), env());
}

describe('the worker timing its answers', () => {
  it('names the isolate cold on its first answer and times every answer', async () => {
    const first = await listAs('guest-1', true);
    const second = await listAs('guest-1', true);
    expect(first.status).toBe(200);
    expect(first.headers.get('Server-Timing')).toMatch(/^api-cold;dur=0, api;dur=\d+$/);
    expect(second.headers.get('Server-Timing')).toMatch(/^api;dur=\d+$/);
  });

  it('times nothing on a refusal', async () => {
    const res = await listAs('guest-2', false);
    expect(res.status).toBe(401);
    expect(res.headers.get('Server-Timing')).toBeNull();
  });
});
