import { describe, it, expect, vi, beforeEach } from 'vitest';

// The token lookup is the first D1 read a CLI request makes, and it runs before any route: a D1 outage there must
// still be answered by the worker (docs/specs/015-api/api.md "When a request fails").
vi.mock('./auth/session-token', () => ({ getAccountSession: async () => null }));
const { resolveApiTokenMock, listDocumentsMock, insertTelemetryEventsMock } = vi.hoisted(() => ({
  resolveApiTokenMock: vi.fn(),
  listDocumentsMock: vi.fn(),
  insertTelemetryEventsMock: vi.fn(),
}));
vi.mock('./db/telemetry', async (original) => ({
  ...(await original<typeof import('./db/telemetry')>()),
  insertTelemetryEvents: insertTelemetryEventsMock,
}));
vi.mock('./db', async (original) => ({
  ...(await original<typeof import('./db')>()),
  resolveApiToken: resolveApiTokenMock,
  listDocumentsByOwner: listDocumentsMock,
}));

import worker from './index';
import { isStorageUnavailable } from './request-failure';
import type { Env } from './types';

const TOKEN = `livedoc_${'a'.repeat(40)}`;
const D1_INTERNAL = new Error('D1_ERROR: internal error; reference = 5jadrun66l32vrvmnfk8kgts');

const env = (): Env => ({ BETTER_AUTH_SECRET: 's'.repeat(40) }) as unknown as Env;
const listDocuments = () =>
  worker.fetch(
    new Request('https://api.test/api/documents', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    env(),
  );

let errors: unknown[][];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  resolveApiTokenMock.mockReset();
  listDocumentsMock.mockReset();
  insertTelemetryEventsMock.mockReset();
});

describe('isStorageUnavailable', () => {
  it.each([
    'D1_ERROR: internal error; reference = abc',
    'D1_ERROR: Network connection lost.',
    'D1_ERROR: D1 DB is overloaded. Requests queued for too long.',
    'D1_ERROR: D1 DB is overloaded. Too many requests queued.',
    'D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window',
    'D1_ERROR: Internal error while starting up D1 DB storage caused object to be reset.',
    'D1_ERROR: Internal error in D1 DB storage caused object to be reset.',
    'D1_ERROR: Cannot resolve D1 DB due to transient issue on remote node.',
    'D1_ERROR: D1 DB reset because its code was updated.',
    'D1_ERROR: Replica disconnected from primary.',
    "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
    "D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
    // 29 October, Cloudflare's D1 incident, as D1's analytics recorded it on a one-row insert.
    'D1_ERROR: out of memory: SQLITE_NOMEM',
    'D1_ERROR: Failed to parse body as JSON, got: <html>502 Bad Gateway</html>',
    // The binding's fetch failing before D1 answers: the runtime's own error, no D1_ERROR prefix.
    'Network connection lost.',
    'internal error; reference = 5jadrun66l32vrvmnfk8kgts',
  ])('recognises %s', (message) => {
    expect(isStorageUnavailable(new Error(message))).toBe(true);
  });

  it.each([
    'D1_ERROR: UNIQUE constraint failed: documents.id: SQLITE_CONSTRAINT',
    'D1_TYPE_ERROR: Type undefined not supported for value undefined',
    'D1_ERROR: no such table: documents: SQLITE_ERROR',
    'D1_COLUMN_NOTFOUND: Column not found (title)',
    'D1_ERROR: No SQL statements detected.',
    // A reset that follows from the query itself: a retry repeats it, and the crash report finds it.
    'D1_ERROR: D1 DB exceeded its CPU time limit and was reset.',
    "D1_ERROR: D1 DB's isolate exceeded its memory limit and was reset.",
    'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.',
    'D1_ERROR: Exceeded maximum DB size.',
    'D1_ERROR: D1 query result exceeded the maximum response size limit of 50 MB',
    // Our own words, not the runtime's: no reference, and SQLITE_NOMEM outside a D1 error.
    'internal error',
    'could not parse SQLITE_NOMEM from the import',
  ])('leaves %s to the 500', (message) => {
    expect(isStorageUnavailable(new Error(message))).toBe(false);
  });

  it('leaves a thrown non-error to the 500', () => {
    expect(isStorageUnavailable('D1_ERROR: internal error')).toBe(false);
  });
});

describe('worker when D1 is unavailable', () => {
  it('answers 503 storage_unavailable when the token lookup throws', async () => {
    resolveApiTokenMock.mockRejectedValue(D1_INTERNAL);

    const res = await listDocuments();

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(await res.json()).toEqual({ error: 'storage_unavailable' });
    expect(errors).toContainEqual(['[d1] unavailable route=Get.Documents', D1_INTERNAL]);
  });

  it('answers 503 storage_unavailable when a route query throws', async () => {
    resolveApiTokenMock.mockResolvedValue({ ownerId: 'acct-1', tokenId: 't-1', readOnly: false });
    listDocumentsMock.mockRejectedValue(D1_INTERNAL);

    const res = await listDocuments();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'storage_unavailable' });
    expect(errors).toContainEqual(['[d1] unavailable route=Get.Documents', D1_INTERNAL]);
  });

  it('answers 503 storage_unavailable when the transport to D1 fails before D1 answers', async () => {
    const lost = new Error('Network connection lost.');
    resolveApiTokenMock.mockResolvedValue({ ownerId: 'acct-1', tokenId: 't-1', readOnly: false });
    listDocumentsMock.mockRejectedValue(lost);

    const res = await listDocuments();

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(errors).toContainEqual(['[d1] unavailable route=Get.Documents', lost]);
  });
});

describe('worker when a request fails otherwise', () => {
  it('answers 500 internal_error when the token lookup throws a bug', async () => {
    const bug = new TypeError('cannot read properties of undefined');
    resolveApiTokenMock.mockRejectedValue(bug);

    const res = await listDocuments();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
    expect(errors).toContainEqual(['api error route=Get.Documents', bug]);
  });

  it('counts the crash as an Error·Api·Internal row when telemetry is on', async () => {
    resolveApiTokenMock.mockRejectedValue(new TypeError('boom'));
    insertTelemetryEventsMock.mockRejectedValue(D1_INTERNAL);
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
    } as unknown as ExecutionContext;

    const res = await worker.fetch(
      new Request('https://api.test/api/documents', {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { ...env(), TELEMETRY_ENABLED: 'true' },
      ctx,
    );
    await Promise.all(pending);

    expect(res.status).toBe(500);
    expect(insertTelemetryEventsMock).toHaveBeenCalledWith(
      expect.anything(),
      [{ category: 'Error', action: 'Api', type: 'Internal.Get.Documents' }],
      expect.any(Number),
    );
    expect(errors).toContainEqual(['[telemetry] crash report failed', D1_INTERNAL]);
  });

  it('counts a reset that follows from the query as a crash, not an outage', async () => {
    const reset = new Error('D1_ERROR: D1 DB exceeded its CPU time limit and was reset.');
    resolveApiTokenMock.mockResolvedValue({ ownerId: 'acct-1', tokenId: 't-1', readOnly: false });
    listDocumentsMock.mockRejectedValue(reset);
    insertTelemetryEventsMock.mockResolvedValue(undefined);
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
    } as unknown as ExecutionContext;

    const res = await worker.fetch(
      new Request('https://api.test/api/documents', {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { ...env(), TELEMETRY_ENABLED: 'true' },
      ctx,
    );
    await Promise.all(pending);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
    expect(insertTelemetryEventsMock).toHaveBeenCalledWith(
      expect.anything(),
      [{ category: 'Error', action: 'Api', type: 'Internal.Get.Documents' }],
      expect.any(Number),
    );
    expect(errors).toContainEqual(['api error route=Get.Documents', reset]);
  });

  it('answers 503 without a telemetry row when D1 is unavailable', async () => {
    resolveApiTokenMock.mockRejectedValue(D1_INTERNAL);

    const res = await worker.fetch(
      new Request('https://api.test/api/documents', {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { ...env(), TELEMETRY_ENABLED: 'true' },
    );

    expect(res.status).toBe(503);
    expect(insertTelemetryEventsMock).not.toHaveBeenCalled();
  });

  it('never echoes the error text', async () => {
    resolveApiTokenMock.mockRejectedValue(new Error('D1_ERROR: no such table: secret_table'));

    const res = await listDocuments();

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret_table');
  });
});
