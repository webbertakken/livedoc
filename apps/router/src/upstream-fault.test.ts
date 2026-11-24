import { afterEach, describe, expect, it, vi } from 'vitest';
import router, { type Env } from './index';

// docs/specs/016-platform/router-app.md "When a service answers 5xx": the answer passes through unchanged, and one
// warning names the service that gave it.

function answering(status: number, body = 'upstream'): Fetcher {
  return {
    fetch: () => Promise.resolve(new Response(body, { status, headers: { 'X-From': 'upstream' } })),
  } as unknown as Fetcher;
}

function envWith(overrides: Partial<Env>): Env {
  const ok = answering(200);
  return { MARKETING: ok, LIVE: ok, API: ok, TELEMETRY: ok, HELP: ok, ...overrides };
}

const send = (path: string, env: Env, method = 'GET') =>
  router.fetch(new Request(`https://docs.nu${path}`, { method }), env);

describe('a service that answers 5xx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hands its answer to the caller unchanged', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = envWith({ MARKETING: answering(500, 'broken') });

    const res = await send('/2026', env, 'HEAD');

    expect(res.status).toBe(500);
    expect(res.headers.get('X-From')).toBe('upstream');
    expect(await res.text()).toBe('broken');
  });

  it.each([
    ['/2026', 'MARKETING', 'marketing'],
    ['/document/abc', 'LIVE', 'live'],
    ['/api/home', 'API', 'api'],
    ['/telemetry/x', 'TELEMETRY', 'telemetry'],
    ['/help/canvas', 'HELP', 'help'],
  ] as const)('names the service behind %s in one warning', async (path, binding, service) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = envWith({ [binding]: answering(503) });

    await send(path, env, 'HEAD');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`[router] upstream fault service=${service} status=503`, {
      method: 'HEAD',
    });
  });

  it('writes no error line, so the 5xx opens one Worker issue, not two', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await send('/2026', envWith({ MARKETING: answering(500) }));

    expect(error).not.toHaveBeenCalled();
  });

  it('warns for a local dev origin that answers 5xx too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 502 })));

    const res = await send('/about', { MARKETING_ORIGIN: 'http://127.0.0.1:4001' });

    expect(res.status).toBe(502);
    expect(warn).toHaveBeenCalledWith('[router] upstream fault service=marketing status=502', {
      method: 'GET',
    });
  });

  it.each([200, 301, 404, 499])('stays quiet when the service answers %i', async (status) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await send('/2026', envWith({ MARKETING: answering(status) }));

    expect(warn).not.toHaveBeenCalled();
  });
});
