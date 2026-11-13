import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the two async deps the request path touches before dispatch, so we can
// drive the worker's top-level §4 guest-signature gate (docs/specs/015-api/public-api-and-tokens.md) directly.
vi.mock('./auth/session-token', () => ({ getAccountSession: async () => null }));
const { resolveApiTokenMock } = vi.hoisted(() => ({ resolveApiTokenMock: vi.fn() }));
vi.mock('./db', () => ({
  resolveApiToken: resolveApiTokenMock,
  listDocumentsByOwner: async () => [],
  deleteOldEvents: async () => {},
}));

const { resolveWorkbenchSessionMock, handleWorkbenchMock, handleBugReportsMock } = vi.hoisted(
  () => ({
    resolveWorkbenchSessionMock: vi.fn(),
    handleWorkbenchMock: vi.fn(async () => new Response(null, { status: 204 })),
    handleBugReportsMock: vi.fn(async () => new Response(null, { status: 204 })),
  }),
);
vi.mock('./bug-reports/route', () => ({ handleBugReports: handleBugReportsMock }));
vi.mock('./auth/workbench-session', async (original) => ({
  ...(await original<typeof import('./auth/workbench-session')>()),
  resolveWorkbenchSession: resolveWorkbenchSessionMock,
}));
vi.mock('./routes/workbench', () => ({ handleWorkbench: handleWorkbenchMock }));

import worker from './index';
import type { RouteContext, WorkbenchContext } from './routes/context';
import { signOwnerId } from './auth/owner-signature';
import { resolveBugReporter } from './bug-reports/reporter';
import type { Env } from './types';

// Enforcement on: the host has a sign-in secret, so it signs guest ids.
function env(): Env {
  return { BETTER_AUTH_SECRET: 's'.repeat(40) } as unknown as Env;
}
function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://api.test${path}`, { method: 'GET', headers });
}

describe('worker §4 guest X-Owner-Id signature gate', () => {
  beforeEach(() => resolveApiTokenMock.mockResolvedValue(null));
  it('401s an unsigned X-Owner-Id on an owner-scoped route when enforcing', async () => {
    const res = await worker.fetch(get('/api/documents', { 'X-Owner-Id': 'guest-1' }), env());
    expect(res.status).toBe(401);
  });

  it('401s an X-Owner-Id carrying an account id with no signature (signed-up Bearer-only)', async () => {
    const res = await worker.fetch(get('/api/documents', { 'X-Owner-Id': 'acct_abc' }), env());
    expect(res.status).toBe(401);
  });

  it('401s an invalid signature', async () => {
    const res = await worker.fetch(
      get('/api/documents', { 'X-Owner-Id': 'guest-1', 'X-Owner-Sig': 'bogus' }),
      env(),
    );
    expect(res.status).toBe(401);
  });

  it('lets a validly signed X-Owner-Id through the gate', async () => {
    const sig = (await signOwnerId(env(), 'guest-1'))!;
    const res = await worker.fetch(
      get('/api/documents', { 'X-Owner-Id': 'guest-1', 'X-Owner-Sig': sig }),
      env(),
    );
    expect(res.status).not.toBe(401);
  });

  it('does not gate when no X-Owner-Id is presented (public reads still resolve)', async () => {
    const res = await worker.fetch(get('/api/documents'), env());
    expect(res.status).not.toBe(401);
  });
});

// The account-id refusal sits BEFORE the signature gate above and, unlike it,
// is unconditional: the shape has never been a legitimate guest credential, so
// it holds on a guest-only host too, where the signature gate is off. That is
// the configuration these tests use.
describe('worker refusal of an account id in X-Owner-Id', () => {
  // Enforcement OFF: a guest-only host, no sign-in secret. The gate above cannot fire here.
  const noEnforcement = () => ({}) as unknown as Env;

  beforeEach(() => resolveApiTokenMock.mockResolvedValue(null));

  it('401s an account id presented as the guest header, with the gate disarmed', async () => {
    const res = await worker.fetch(
      get('/api/documents', { 'X-Owner-Id': 'acct_2abcDEF' }),
      noEnforcement(),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'account_id_not_a_guest_credential' });
  });

  it('covers every owner-scoped resource, not just documents', async () => {
    for (const seg of ['folders', 'images', 'custom-themes', 'preferences', 'shared', 'timeline']) {
      const res = await worker.fetch(
        get(`/api/${seg}`, { 'X-Owner-Id': 'acct_2abcDEF' }),
        noEnforcement(),
      );
      expect(res.status, seg).toBe(401);
    }
  });

  // The share resolver compares the header with the document owner, so a
  // harvested account id must not reach it either.
  it('refuses an account id as the guest header on the share resolver', async () => {
    const res = await worker.fetch(
      get('/api/share/abc', { 'X-Owner-Id': 'acct_2abcDEF' }),
      noEnforcement(),
    );
    expect(res.status).toBe(401);
  });

  // An empty header must not be a shared owner everyone can write as.
  it('treats an empty guest header as no owner at all', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/api/folders', {
        method: 'POST',
        headers: { 'X-Owner-Id': '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'f' }),
      }),
      noEnforcement(),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('authentication required');
  });

  it('lets a real guest UUID through (the shape the server actually mints)', async () => {
    const res = await worker.fetch(
      get('/api/documents', { 'X-Owner-Id': crypto.randomUUID() }),
      noEnforcement(),
    );
    expect(res.status).not.toBe(401);
  });

  it('does not touch a Bearer caller, whose owner id IS an account id', async () => {
    // A token request resolves its owner from the hashed-token lookup, so the
    // account id never arrives as a header and must not be penalised for
    // being one.
    resolveApiTokenMock.mockResolvedValue({
      ownerId: 'acct_2abcDEF',
      tokenId: 'tok-1',
      readOnly: false,
    });
    const res = await worker.fetch(
      get('/api/documents', { Authorization: `Bearer livedoc_${'a'.repeat(40)}` }),
      noEnforcement(),
    );
    expect(res.status).not.toBe(401);
  });
});

const LVD = `livedoc_${'a'.repeat(40)}`;

describe('read-only API token enforcement (docs/specs/015-api/mcp-server.md §4.11)', () => {
  beforeEach(() => {
    resolveApiTokenMock.mockReset();
    resolveApiTokenMock.mockResolvedValue({
      ownerId: 'user_ro',
      tokenId: 'tok-ro',
      readOnly: true,
    });
  });

  const RO = { Authorization: `Bearer ${LVD}` };
  const req = (method: string) =>
    new Request('https://api.test/api/documents', { method, headers: RO });

  it('403s a POST from a read-only token', async () => {
    const res = await worker.fetch(req('POST'), env());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'read_only_token' });
  });

  it('403s a PUT from a read-only token', async () => {
    const res = await worker.fetch(
      new Request('https://api.test/api/documents/d1', { method: 'PUT', headers: RO }),
      env(),
    );
    expect(res.status).toBe(403);
  });

  it('403s a DELETE from a read-only token', async () => {
    const res = await worker.fetch(
      new Request('https://api.test/api/documents/d1', { method: 'DELETE', headers: RO }),
      env(),
    );
    expect(res.status).toBe(403);
  });

  it('403s the share-link list, which holds every code and the password', async () => {
    // A read-only token must not be able to lift an edit link.
    const res = await worker.fetch(
      new Request('https://api.test/api/documents/d1/share', { headers: RO }),
      env(),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'read_only_token' });
  });

  it('lets a read-only token revoke itself, and only itself', async () => {
    const self = await worker.fetch(
      new Request('https://api.test/api/tokens/current', { method: 'DELETE', headers: RO }),
      env(),
    );
    expect(self.status).not.toBe(403);
    const other = await worker.fetch(
      new Request('https://api.test/api/tokens/tok-other', { method: 'DELETE', headers: RO }),
      env(),
    );
    expect(other.status).toBe(403);
  });

  it('lets a read-only token open and pair a workbench, whose frame it caps to view', async () => {
    for (const path of ['/api/workbench/tickets', '/api/workbench/pairing-requests']) {
      const res = await worker.fetch(
        new Request(`https://api.test${path}`, { method: 'POST', headers: RO }),
        env(),
      );
      expect(res.status, path).not.toBe(403);
    }
    const session = await worker.fetch(
      new Request('https://api.test/api/workbench/sessions/current', {
        method: 'DELETE',
        headers: RO,
      }),
      env(),
    );
    expect(session.status).toBe(403);
  });

  it('lets a GET through (reads are allowed)', async () => {
    const res = await worker.fetch(req('GET'), env());
    expect(res.status).not.toBe(403);
  });

  it('does NOT block a full (read+write) token', async () => {
    resolveApiTokenMock.mockResolvedValue({
      ownerId: 'user_rw',
      tokenId: 'tok-rw',
      readOnly: false,
    });
    const res = await worker.fetch(req('POST'), env());
    expect(res.status).not.toBe(403);
  });
});

// A `livedoc_` bearer is a claim to be a token; one that resolves to no live row (unknown, revoked or expired) is
// refused at the front door with 401 `invalid_token`, never treated as a guest or as nobody
// (docs/specs/015-api/public-api-and-tokens.md §3.3).
describe('worker refusal of an unknown API token', () => {
  const noEnforcement = () => ({}) as unknown as Env;
  const TOKEN = `livedoc_${'x'.repeat(43)}`;
  beforeEach(() => resolveApiTokenMock.mockResolvedValue(null));

  it('401s a livedoc_ bearer that resolves to no live token, on owner-scoped and token routes alike', async () => {
    for (const path of ['/api/documents', '/api/tokens/current', '/api/teams']) {
      const res = await worker.fetch(
        get(path, { Authorization: `Bearer ${TOKEN}` }),
        noEnforcement(),
      );
      expect(res.status, path).toBe(401);
      expect(await res.json(), path).toEqual({ error: 'invalid_token' });
      expect(res.headers.get('WWW-Authenticate'), path).toBe('Bearer error="invalid_token"');
    }
  });

  it('refuses it even beside a guest header, so a dead token never falls back to a guest', async () => {
    const res = await worker.fetch(
      get('/api/documents', { Authorization: `Bearer ${TOKEN}`, 'X-Owner-Id': 'guest-1' }),
      noEnforcement(),
    );
    expect(res.status).toBe(401);
  });

  it('refuses a token cut short or mistyped as a token, not as a request with no credential', async () => {
    for (const bearer of ['livedoc_', 'livedoc_notreal', `livedoc_${'x'.repeat(12)}`]) {
      const res = await worker.fetch(
        get('/api/documents', { Authorization: `Bearer ${bearer}`, 'X-Owner-Id': 'guest-1' }),
        noEnforcement(),
      );
      expect(res.status, bearer).toBe(401);
      expect(await res.json(), bearer).toEqual({ error: 'invalid_token' });
    }
  });

  it('leaves a bearer that is not token-shaped to the session-token path', async () => {
    const res = await worker.fetch(
      get('/api/documents', { Authorization: 'Bearer eyJ.jwt.sig' }),
      noEnforcement(),
    );
    expect(res.status).not.toBe(401);
  });
});

// Room-ticket mints skip the per-owner write budget (autosave shares it), but
// each is a D1 write, so they have their own bucket keyed on the network.
describe('worker room-ticket throttle', () => {
  beforeEach(() => resolveApiTokenMock.mockResolvedValue(null));

  it('429s a mint once the per-network bucket is spent, keyed on the /64', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const res = await worker.fetch(
      new Request('https://api.test/api/documents/d1/room-ticket', {
        method: 'POST',
        headers: { 'X-Owner-Id': crypto.randomUUID(), 'CF-Connecting-IP': '2001:db8:0:1::9' },
      }),
      { WRITE_RATE_LIMITER: { limit } } as unknown as Env,
    );
    expect(res.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'room-ticket:2001:0db8:0000:0001::/64' });
  });
});

// docs/specs/013-workspace/teams.md "Declining from the email": the open decline doors are limited per network,
// on their own bucket, and never spend the owner-keyed write budget.
describe('worker invite-decline throttle', () => {
  beforeEach(() => resolveApiTokenMock.mockResolvedValue(null));

  it('429s a read or a decline once the per-network bucket is spent, apart from the write limiter', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const writes = vi.fn(async () => ({ success: true }));
    for (const method of ['GET', 'POST']) {
      const res = await worker.fetch(
        new Request('https://api.test/api/teams/invite-decline/m.secret', {
          method,
          headers: { 'CF-Connecting-IP': '203.0.113.9' },
        }),
        {
          TEAM_INVITE_RATE_LIMITER: { limit },
          WRITE_RATE_LIMITER: { limit: writes },
        } as unknown as Env,
      );
      expect(res.status).toBe(429);
    }
    expect(limit).toHaveBeenCalledWith({ key: 'invite-decline:203.0.113.0/24' });
    expect(writes).not.toHaveBeenCalled();
  });
});

// docs/specs/013-workspace/workbench-embeds.md: a `Bearer lvw_` is a person's editor on one document, confined at
// the front door before any route runs.
describe('workbench sessions at the front door', () => {
  const LVW = `lvw_${'w'.repeat(43)}`;
  const SESSION: WorkbenchContext = {
    sessionId: 'abcdef12-0000-4000-8000-000000000000',
    ownerId: 'user_1',
    tokenId: 'tok1',
    pairingId: 'pair1',
    scope: 'document',
    documentId: 'doc1',
    folderId: null,
    tabId: null,
    origin: 'https://w.example',
    level: 'edit',
    expiresAt: 1,
  };
  const call = (method: string, path: string, headers: Record<string, string> = {}, e = {}) =>
    worker.fetch(
      new Request(`https://api.test${path}`, {
        method,
        headers: { Authorization: `Bearer ${LVW}`, ...headers },
      }),
      e as unknown as Env,
    );

  beforeEach(() => {
    resolveApiTokenMock.mockReset();
    resolveWorkbenchSessionMock.mockReset();
    handleWorkbenchMock.mockClear();
    resolveWorkbenchSessionMock.mockResolvedValue({ ok: true, workbench: SESSION });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('401s a session cut short or mistyped, without looking it up', async () => {
    resolveWorkbenchSessionMock.mockClear();
    const res = await call('GET', '/api/documents/doc1', {
      Authorization: 'Bearer lvw_short',
      'X-Owner-Id': 'guest-1',
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_session' });
    expect(resolveWorkbenchSessionMock).not.toHaveBeenCalled();
  });

  it('401s a session that does not resolve, never reading it as a guest', async () => {
    resolveWorkbenchSessionMock.mockResolvedValue({
      ok: false,
      reason: 'expired',
      sessionPrefix: 'abcdef12',
    });

    const res = await call('GET', '/api/documents/doc1', { 'X-Owner-Id': 'guest-1' });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_session' });
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
    expect(console.warn).toHaveBeenCalledWith('[workbench] bearer-refused', {
      reason: 'expired',
      sessionPrefix: 'abcdef12',
    });
  });

  it('confines the library, answers another document as absent, and refuses an ambient share code', async () => {
    const library = await call('GET', '/api/documents');
    const other = await call('GET', '/api/documents/doc2');
    const ambient = await call('GET', '/api/documents/doc1', { 'X-Share-Code': 'CODE2345' });

    expect([library.status, other.status, ambient.status]).toEqual([403, 404, 403]);
    expect(await library.json()).toEqual({ error: 'workbench_confined' });
  });

  it('refuses a view session its writes', async () => {
    resolveWorkbenchSessionMock.mockResolvedValue({
      ok: true,
      workbench: { ...SESSION, level: 'view' },
    });

    const res = await call('PUT', '/api/documents/doc1/tabs/t1');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'workbench_read_only' });
  });

  it('hands an allowed route the owner as a person: no account id, no token, writes keyed on the session', async () => {
    const limit = vi.fn(async () => ({ success: true }));

    const res = await call(
      'DELETE',
      '/api/workbench/sessions/current',
      {},
      { WRITE_RATE_LIMITER: { limit } },
    );
    const ctx = (handleWorkbenchMock.mock.calls[0] as unknown as [RouteContext])[0];

    expect(res.status).toBe(204);
    expect(ctx.workbench).toEqual(SESSION);
    expect(ctx.sessionAccountId).toBeNull();
    expect(ctx.token).toBeNull();
    expect(ctx.resolveOwner()).toBe('user_1');
    expect(ctx.verifiedAccountId).toBe('user_1');
    expect(limit).toHaveBeenCalledWith({ key: `workbench:${SESSION.sessionId}` });
  });

  // docs/specs/016-platform/bug-reports.md "From an embed": the frame's report is the person's, from a view session too.
  it.each(['edit', 'view'] as const)(
    'hands a bug report from a session at %s level to its route, filed as the account',
    async (level) => {
      resolveWorkbenchSessionMock.mockResolvedValue({ ok: true, workbench: { ...SESSION, level } });
      handleBugReportsMock.mockClear();

      const res = await call('POST', '/api/bug-reports');
      const ctx = (handleBugReportsMock.mock.calls[0] as unknown as [RouteContext])[0];

      expect(res.status).toBe(204);
      expect(await resolveBugReporter(ctx)).toEqual({ kind: 'account', id: 'user_1' });
    },
  );

  it('leaves a token bearer to the token path', async () => {
    resolveApiTokenMock.mockResolvedValue({ ownerId: 'user_1', tokenId: 'tok1', readOnly: false });

    await worker.fetch(
      new Request('https://api.test/api/workbench/tickets', {
        method: 'POST',
        headers: { Authorization: `Bearer livedoc_${'x'.repeat(43)}` },
      }),
      {} as unknown as Env,
    );
    const ctx = (handleWorkbenchMock.mock.calls[0] as unknown as [RouteContext])[0];

    expect(resolveWorkbenchSessionMock).not.toHaveBeenCalled();
    expect(ctx.workbench).toBeNull();
    expect(ctx.token).toEqual({ id: 'tok1', readOnly: false });
  });
});

// docs/specs/001-project-vision/purpose.md "Boundaries that have moved": LiveDoc has no Community gallery,
// so its old api addresses are unknown routes like any other.
describe('the retired Community routes', () => {
  beforeEach(() => resolveApiTokenMock.mockResolvedValue(null));

  it.each(['/api/community/posts', '/api/community/featured', '/api/community/sitemap'])(
    '404s %s',
    async (path) => {
      const res = await worker.fetch(get(path), env());
      expect(res.status).toBe(404);
    },
  );
});
