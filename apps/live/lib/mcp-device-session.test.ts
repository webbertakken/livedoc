import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentJson } from '@livedoc/vitest-config/sent-request';
import { MCP_ORIGIN } from './mcp-config';
import {
  completeDevice,
  denyDevice,
  deviceClient,
  fetchDeviceSession,
  userCodeOf,
} from './mcp-device-session';

// docs/specs/015-api/cli.md, CLI36.

function stubFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init?.body ? { body: sentJson(init) } : {}) });
    return answer(url, init);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('userCodeOf', () => {
  it('reads a typed code in any case and spacing, and refuses what cannot be one', () => {
    expect(userCodeOf(' bcdf ghjk ')).toBe('BCDF-GHJK');
    expect(userCodeOf('BCDF-GHJA')).toBeNull();
    expect(userCodeOf('')).toBeNull();
  });
});

describe('fetchDeviceSession', () => {
  it('asks the MCP origin and returns the client, the CLI when it names none', async () => {
    const calls = stubFetch(() => Response.json({ clientName: 'LiveDoc CLI' }));
    expect(await fetchDeviceSession('BCDF-GHJK')).toEqual({
      clientName: 'LiveDoc CLI',
      clientId: 'livedoc-cli',
    });
    stubFetch(() => Response.json({ clientName: 'Runa', clientId: 'runa' }));
    expect(await fetchDeviceSession('BCDF-GHJK')).toEqual({ clientName: 'Runa', clientId: 'runa' });
    expect(calls[0]!.url).toBe(`${MCP_ORIGIN}/oauth/device/session/BCDF-GHJK`);
  });

  it('is null for an unknown code, a malformed answer and a network failure', async () => {
    stubFetch(() => Response.json({ error: 'invalid_code' }, { status: 404 }));
    expect(await fetchDeviceSession('X')).toBeNull();
    stubFetch(() => Response.json({ clientName: '' }));
    expect(await fetchDeviceSession('X')).toBeNull();
    stubFetch(() => Response.json(null));
    expect(await fetchDeviceSession('X')).toBeNull();
    stubFetch(() => {
      throw new Error('offline');
    });
    expect(await fetchDeviceSession('X')).toBeNull();
  });
});

describe('completeDevice and denyDevice', () => {
  it('post the code with the token, or the refusal, and say whether it landed', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    expect(await completeDevice('BCDF-GHJK', 'livedoc_x', 5)).toBe(true);
    expect(await completeDevice('BCDF-GHJK', 'livedoc_y', null)).toBe(true);
    expect(await denyDevice('BCDF-GHJK')).toBe(true);
    expect(calls.map((c) => [c.url.replace(MCP_ORIGIN, ''), c.body])).toEqual([
      ['/oauth/device/complete', { userCode: 'BCDF-GHJK', token: 'livedoc_x', expiresAt: 5 }],
      ['/oauth/device/complete', { userCode: 'BCDF-GHJK', token: 'livedoc_y' }],
      ['/oauth/device/deny', { userCode: 'BCDF-GHJK' }],
    ]);
    stubFetch(() => Response.json({ error: 'invalid_code' }, { status: 400 }));
    expect(await denyDevice('X')).toBe(false);
    stubFetch(() => {
      throw new Error('offline');
    });
    expect(await completeDevice('X', 't', null)).toBe(false);
  });
});

// docs/specs/015-api/mcp-server.md §3 "Runa signs in here too".
describe('deviceClient', () => {
  it('counts and words Runa apart from the CLI', () => {
    expect(deviceClient('runa')).toEqual({
      telemetryType: 'Runa',
      restart: 'Start the sign-in again from Runa.',
    });
    expect(deviceClient('livedoc-cli').telemetryType).toBe('Cli');
  });
});
