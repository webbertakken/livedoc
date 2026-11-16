// The early reads pool (docs/specs/016-platform/web-performance.md "The open path asks in parallel"):
// "The editor takes what was asked early".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askEarly,
  EARLY_READS_WINDOW_MS,
  openEarlyReads,
  resetEarlyReadsForTests,
  takeEarlyRead,
} from './early-reads';

const URL_A = '/api/share/abc';
const GUEST = { 'X-Owner-Id': 'g1', 'X-Owner-Sig': 's1' };

function answering(body = '{"ok":true}', status = 200) {
  return vi.fn(async () => new Response(body, { status }));
}

beforeEach(() => {
  resetEarlyReadsForTests();
  openEarlyReads();
});
afterEach(() => vi.useRealTimers());

describe('early reads', () => {
  it('hands the page the answer asked early, once', async () => {
    const fetchImpl = answering('{"document":1}');
    await askEarly('share', URL_A, GUEST, fetchImpl);

    const taken = takeEarlyRead(URL_A, { headers: { ...GUEST } });
    expect(taken).not.toBeNull();
    expect(await (await taken!)!.json()).toEqual({ document: 1 });
    expect(takeEarlyRead(URL_A, { headers: { ...GUEST } })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('lets the early asker read its own copy without spending the page’s', async () => {
    const early = await askEarly('share', URL_A, GUEST, answering('{"n":2}'));
    expect(await early!.json()).toEqual({ n: 2 });
    expect(await (await takeEarlyRead(URL_A, { headers: GUEST })!)!.json()).toEqual({ n: 2 });
  });

  it('matches headers whatever their case, order or container', async () => {
    await askEarly('share', URL_A, { 'X-Owner-Sig': 's1', 'X-Owner-Id': 'g1' }, answering());
    expect(
      takeEarlyRead(URL_A, { headers: new Headers({ 'x-owner-id': 'g1', 'x-owner-sig': 's1' }) }),
    ).not.toBeNull();
  });

  it('never hands an answer to a request made as someone else', async () => {
    await askEarly('share', URL_A, GUEST, answering());
    expect(
      takeEarlyRead(URL_A, { headers: { 'X-Owner-Id': 'g2', 'X-Owner-Sig': 's2' } }),
    ).toBeNull();
    expect(takeEarlyRead(URL_A, { headers: { Authorization: 'Bearer t' } })).toBeNull();
  });

  it('never hands an answer to a request with another password', async () => {
    await askEarly('share', URL_A, { ...GUEST, 'X-Share-Password': 'spg_old' }, answering());
    expect(takeEarlyRead(URL_A, { headers: { ...GUEST, 'X-Share-Password': 'typed' } })).toBeNull();
    expect(takeEarlyRead(URL_A, { headers: GUEST })).toBeNull();
  });

  it('hands nothing to a write, a request with a body, or one that can be aborted', async () => {
    await askEarly('share', URL_A, GUEST, answering());
    expect(takeEarlyRead(URL_A, { method: 'PUT', headers: GUEST })).toBeNull();
    expect(takeEarlyRead(URL_A, { headers: GUEST, body: '{}' })).toBeNull();
    expect(
      takeEarlyRead(URL_A, { headers: GUEST, signal: new AbortController().signal }),
    ).toBeNull();
    expect(takeEarlyRead(URL_A, { method: 'GET', headers: GUEST })).not.toBeNull();
  });

  it('hands over a read still in flight, so the page waits on it rather than asking again', async () => {
    let answer!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    const early = askEarly('share', URL_A, GUEST, fetchImpl);
    const taken = takeEarlyRead(URL_A, { headers: GUEST });
    expect(taken).not.toBeNull();
    answer(new Response('{"late":true}'));
    expect(await (await taken!)!.json()).toEqual({ late: true });
    await early;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps no read the network failed: the page asks itself', async () => {
    const early = await askEarly(
      'share',
      URL_A,
      GUEST,
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect(early).toBeNull();
    const taken = takeEarlyRead(URL_A, { headers: GUEST });
    expect(taken === null || (await taken) === null).toBe(true);
  });

  it('keeps an answer the server refused, as the page would have had it', async () => {
    await askEarly('share', URL_A, GUEST, answering('{"error":"password_required"}', 401));
    expect((await takeEarlyRead(URL_A, { headers: GUEST })!)!.status).toBe(401);
  });

  it('never asks what the page has already asked itself', async () => {
    expect(takeEarlyRead(URL_A, { headers: GUEST })).toBeNull();
    const fetchImpl = answering();
    expect(askEarly('share', URL_A, GUEST, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks the same read early only once', async () => {
    const fetchImpl = answering();
    await askEarly('share', URL_A, GUEST, fetchImpl);
    expect(askEarly('share', URL_A, GUEST, fetchImpl)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('forgets every answer once the window has passed', async () => {
    vi.useFakeTimers();
    resetEarlyReadsForTests();
    openEarlyReads();
    await askEarly('share', URL_A, GUEST, answering());
    vi.advanceTimersByTime(EARLY_READS_WINDOW_MS + 1);
    expect(takeEarlyRead(URL_A, { headers: GUEST })).toBeNull();
    const fetchImpl = answering();
    expect(askEarly('share', URL_A, GUEST, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks nothing and takes nothing until the page opens the pool', () => {
    resetEarlyReadsForTests();
    const fetchImpl = answering();
    expect(askEarly('share', URL_A, GUEST, fetchImpl)).toBeNull();
    expect(takeEarlyRead(URL_A, { headers: GUEST })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
