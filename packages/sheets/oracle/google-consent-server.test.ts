import { FakeGoogle } from '@livedoc/fake-google';
import { describe, expect, it, vi } from 'vitest';
import { awaitConsent, CONSENT_TIMEOUT_MS, type ConsentOptions } from './google-consent-server.ts';
import type { Fetch } from './google-oauth.ts';

// formulas.md "The oracle", Consent (D95): a real server on 127.0.0.1, Google's token endpoint faked.

const client = { clientId: 'cid', clientSecret: 'secret' };

function start(overrides: Partial<ConsentOptions> = {}) {
  const fake = new FakeGoogle();
  const logs: string[] = [];
  let printed!: (url: URL) => void;
  const shown = new Promise<URL>((resolve) => (printed = resolve));
  const result = awaitConsent({
    client,
    fetch: fake.fetch,
    random: (size) => crypto.getRandomValues(new Uint8Array(size)),
    print: (line) => printed(new URL(line)),
    log: (line) => logs.push(line),
    timeoutMs: 5_000,
    ...overrides,
  });
  const visit = async (query: string, path = '/') => {
    const url = await shown;
    const res = await fetch(`${url.searchParams.get('redirect_uri')}${path}?${query}`);
    return { status: res.status, text: await res.text() };
  };
  return { fake, logs, shown, result, visit };
}

describe('awaitConsent', () => {
  it('waits at most ten minutes by default', () => {
    expect(CONSENT_TIMEOUT_MS).toBe(600_000);
  });

  it('prints the consent URL with a loopback redirect, and saves nothing it prints', async () => {
    const { fake, shown, result, visit, logs } = start();
    const url = await shown;
    expect(url.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const state = url.searchParams.get('state')!;
    const page = await visit(`state=${state}&code=${fake.consent('me')}`);
    expect(page).toEqual({ status: 200, text: 'Saved. You can close this tab.\n' });
    const got = await result;
    expect(got).toMatchObject({ ok: true, token: expect.stringMatching(/^1\/\/refresh-/) });
    expect(logs.join('\n')).not.toContain(got.ok ? got.token : '-');
    expect(logs[0]).toMatch(/^\[sheets oracle\] consent listening on http:\/\/127\.0\.0\.1:/);
  });

  it('refuses a foreign state and keeps waiting; answers 404 elsewhere', async () => {
    const { fake, shown, result, visit, logs } = start();
    const state = (await shown).searchParams.get('state')!;
    expect(await visit('state=forged&code=x')).toMatchObject({ status: 400 });
    expect(logs).toContain('[sheets oracle] consent refused state');
    expect(await visit('', '/favicon.ico')).toMatchObject({ status: 404 });
    // The fake's exchange answers at once, so a second visit comes after the first is taken.
    const first = visit(`state=${state}&code=${fake.consent('me')}`);
    expect((await first).status).toBe(200);
    await result;
  });

  it("ends on Google's refusal", async () => {
    const { shown, result, visit } = start();
    const state = (await shown).searchParams.get('state')!;
    expect(await visit(`state=${state}&error=access_denied`)).toMatchObject({ status: 400 });
    expect(await result).toEqual({ ok: false, problem: 'Google answered access_denied' });
  });

  it('answers 410 to a visit while the code is being exchanged', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const fetch: Fetch = async () => {
      await held;
      return Response.json({ refresh_token: 'r' });
    };
    const { shown, result, visit } = start({ fetch });
    const state = (await shown).searchParams.get('state')!;
    const first = visit(`state=${state}&code=c`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await visit(`state=${state}&code=c`)).toMatchObject({ status: 410 });
    release();
    expect((await first).status).toBe(200);
    expect(await result).toEqual({ ok: true, token: 'r' });
  });

  it('says when the exchange fails or throws', async () => {
    const refusing = start({
      fetch: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
    });
    const s1 = (await refusing.shown).searchParams.get('state')!;
    expect(await refusing.visit(`state=${s1}&code=c`)).toMatchObject({ status: 502 });
    expect(await refusing.result).toMatchObject({ ok: false });
    const throwing = start({
      fetch: async () => {
        throw new Error('offline');
      },
    });
    const s2 = (await throwing.shown).searchParams.get('state')!;
    expect(await throwing.visit(`state=${s2}&code=c`)).toMatchObject({ status: 502 });
    expect(await throwing.result).toEqual({
      ok: false,
      problem: 'the token endpoint failed: offline',
    });
  });

  it('keeps the timeout it gave when an exchange answers after it', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const fetch: Fetch = async () => {
      await held;
      return Response.json({ refresh_token: 'late' });
    };
    const { shown, result, visit } = start({ fetch, timeoutMs: 200 });
    const state = (await shown).searchParams.get('state')!;
    const page = visit(`state=${state}&code=c`);
    expect(await result).toMatchObject({ ok: false, problem: /^no consent within/ });
    release();
    expect((await page).status).toBe(200);
  });

  it('waits ten minutes when not told otherwise', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { shown, result } = start({ timeoutMs: undefined });
      await shown;
      vi.advanceTimersByTime(CONSENT_TIMEOUT_MS);
      expect(await result).toEqual({ ok: false, problem: 'no consent within 10 minutes' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after its timeout', async () => {
    const { result } = start({ timeoutMs: 30 });
    expect(await result).toEqual({ ok: false, problem: 'no consent within 0.0005 minutes' });
  });

  it('says when it cannot listen', async () => {
    const { result } = start({ host: '192.0.2.1' });
    expect(await result).toMatchObject({ ok: false, problem: /^the server failed: / });
  });
});
