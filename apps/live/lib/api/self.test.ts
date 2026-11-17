import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiLoadSelf, apiMintGuestId, apiSaveSelf, resetSelfForTests } from './self';

// /new hands the new document to the editor in place (docs/specs/007-editor/new-document-route.md), and
// both load the participant: the editor must reuse the one /new just read and saved rather than
// asking the server again on every new document.

describe('the participant the page already knows', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
        const participant = { id: 'p-1', name: 'Swift Otter', color: '#0ea5e9' };
        return Promise.resolve(new Response(JSON.stringify({ participant }), { status: 200 }));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('answers a load straight after a save without a request', async () => {
    await apiSaveSelf({ id: 'p-save', name: 'Brave Heron', color: '#22c55e', status: 'online' });
    const self = await apiLoadSelf('p-save');
    expect(self?.name).toBe('Brave Heron');
    expect(calls.filter((c) => c.startsWith('GET'))).toEqual([]);
  });

  it('asks the server for a participant it has not seen', async () => {
    await apiSaveSelf({ id: 'p-save-2', name: 'Brave Heron', color: '#22c55e', status: 'online' });
    await apiLoadSelf('p-other');
    expect(calls.filter((c) => c.startsWith('GET'))).toHaveLength(1);
  });

  it('asks again once the handoff window has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await apiSaveSelf({ id: 'p-old', name: 'Brave Heron', color: '#22c55e', status: 'online' });
    vi.setSystemTime(Date.now() + 31_000);
    await apiLoadSelf('p-old');
    expect(calls.filter((c) => c.startsWith('GET'))).toHaveLength(1);
  });
});

// docs/specs/015-api/api.md: the api answers the caller's own absent profile with { participant: null },
// which it can only tell when the load says who is asking.
describe('loading your own profile before you have saved one', () => {
  let requests: { url: string; headers: Headers }[];

  beforeEach(() => {
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        requests.push({ url: String(url), headers: new Headers(init?.headers) });
        return Promise.resolve(
          new Response(JSON.stringify({ participant: null }), { status: 200 }),
        );
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks as yourself and reads no profile as null', async () => {
    expect(await apiLoadSelf('p-fresh')).toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers.get('X-Owner-Id')).toBe('p-fresh');
  });

  it('still loads a signed-in profile, anonymously, while the session token is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const participant = { id: 'acct_ann', name: 'Ann', color: '#f00', createdAt: 1 };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        requests.push({ url: String(url), headers: new Headers(init?.headers) });
        return Promise.resolve(new Response(JSON.stringify({ participant }), { status: 200 }));
      }),
    );
    expect((await apiLoadSelf('acct_ann'))?.name).toBe('Ann');
    expect(requests[0]!.headers.get('X-Owner-Id')).toBeNull();
    expect(requests[0]!.headers.get('Authorization')).toBeNull();
  });
});

// docs/specs/016-platform/web-performance.md "The open path asks in parallel".
describe('a participant this page is still making', () => {
  let calls: string[];
  let saveAnswer: { resolve: () => void; reject: () => void } | null;

  beforeEach(() => {
    calls = [];
    saveAnswer = null;
    resetSelfForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${String(url)}`);
        if (String(url).endsWith('/guest-id'))
          return Promise.resolve(
            new Response(JSON.stringify({ ownerId: 'g-minted', ownerSig: 'sig' }), {
              status: 200,
            }),
          );
        if (method === 'PUT')
          return new Promise<Response>((resolve) => {
            saveAnswer = {
              resolve: () => resolve(new Response('{}', { status: 200 })),
              reject: () => resolve(new Response('{}', { status: 500 })),
            };
          });
        return Promise.resolve(
          new Response(JSON.stringify({ participant: null }), { status: 200 }),
        );
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const gets = () => calls.filter((c) => c.startsWith('GET'));

  it('reads no row for a guest id the api minted for this page', async () => {
    await apiMintGuestId();
    expect(await apiLoadSelf('g-minted')).toBeNull();
    expect(gets()).toEqual([]);
  });

  it('reads the row again once this page has saved it and the handoff window has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await apiMintGuestId();
    const saved = apiSaveSelf({
      id: 'g-minted',
      name: 'Swift Otter',
      color: '#0ea5e9',
      status: 'online',
    });
    await vi.waitFor(() => expect(saveAnswer).not.toBeNull());
    saveAnswer!.resolve();
    await saved;
    vi.setSystemTime(Date.now() + 31_000);
    await apiLoadSelf('g-minted');
    expect(gets()).toHaveLength(1);
  });

  it('answers a read made while the row is being saved with what the save wrote', async () => {
    const saved = apiSaveSelf({
      id: 'p-saving',
      name: 'Brave Heron',
      color: '#22c55e',
      status: 'online',
    });
    await vi.waitFor(() => expect(saveAnswer).not.toBeNull());
    const read = apiLoadSelf('p-saving');
    saveAnswer!.resolve();
    await saved;
    expect((await read)?.name).toBe('Brave Heron');
    expect(gets()).toEqual([]);
  });

  it('asks the server when the save it waited for failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saved = apiSaveSelf({
      id: 'p-failed',
      name: 'Brave Heron',
      color: '#22c55e',
      status: 'online',
    });
    saved.catch(() => {});
    await vi.waitFor(() => expect(saveAnswer).not.toBeNull());
    const read = apiLoadSelf('p-failed');
    saveAnswer!.reject();
    expect(await read).toBeNull();
    expect(gets()).toHaveLength(1);
  });
});
