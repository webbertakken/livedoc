import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportServerError, setApiErrorReporter } from './error-report';
import { ApiError, expectOk } from './core';
import { apiReadHome } from './home';

// A 5xx is never expected (docs/specs/017-telemetry/telemetry.md `Http<status>.<Action>.<Code>`): every 5xx an
// editor request receives is reported exactly once, whichever helper read it. Two `500`s on `GET /api/home`
// reached no telemetry at all, because the Home read checked `res.ok` itself.

const answer = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function reportsSeen(): string[] {
  const seen: string[] = [];
  setApiErrorReporter((t) => seen.push(t));
  return seen;
}

afterEach(() => {
  setApiErrorReporter(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reportServerError', () => {
  it('reports a 5xx with its action and the worker error token', async () => {
    const seen = reportsSeen();
    await reportServerError(answer(503, { error: 'storage_unavailable' }), 'read home');
    expect(seen).toEqual(['Http503.ReadHome.StorageUnavailable']);
  });

  it('leaves a 4xx and a 2xx to the reader', async () => {
    const seen = reportsSeen();
    await reportServerError(answer(404, { error: 'not_found' }), 'read home');
    await reportServerError(answer(409), 'read home');
    await reportServerError(answer(200), 'read home');
    expect(seen).toEqual([]);
  });

  it('leaves the body for the reader to read', async () => {
    reportsSeen();
    const res = answer(500, { error: 'internal' });
    await reportServerError(res, 'read home');
    await expect(res.json()).resolves.toEqual({ error: 'internal' });
  });

  it('counts a response once, however many helpers read it', async () => {
    const seen = reportsSeen();
    const res = answer(500, { error: 'internal' });
    await reportServerError(res, 'read home');
    await reportServerError(res, 'read home');
    await expect(expectOk(res, 'read home')).rejects.toBeInstanceOf(ApiError);
    expect(seen).toEqual(['Http500.ReadHome.Internal']);
  });
});

describe('apiReadHome', () => {
  it('reports a 5xx and answers null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seen = reportsSeen();
    vi.stubGlobal('fetch', async () => answer(500, { error: 'internal' }));
    await expect(apiReadHome('owner-1', { tz: 'UTC' })).resolves.toBeNull();
    expect(seen).toEqual(['Http500.ReadHome.Internal']);
  });

  it('answers null for a 4xx without reporting it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seen = reportsSeen();
    vi.stubGlobal('fetch', async () => answer(401, { error: 'sign_in_required' }));
    await expect(apiReadHome('owner-1', { tz: 'UTC' })).resolves.toBeNull();
    expect(seen).toEqual([]);
  });
});

// A feature this deployment has not configured is switched off, not failing: its 503 is never a fault
// (docs/specs/017-telemetry/telemetry.md `Http<status>.<Action>.<Code>`). Every other 503 still reports.
describe('a feature switched off', () => {
  it.each(['ai_not_configured', 'images_unavailable'])('does not report a 503 %s', async (code) => {
    const seen = reportsSeen();
    await reportServerError(answer(503, { error: code }), 'read notes');
    await expect(expectOk(answer(503, { error: code }), 'list images')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(seen).toEqual([]);
  });

  it.each([
    ['storage_unavailable', 'Http503.ListImages.StorageUnavailable'],
    ['content_moving', 'Http503.ListImages.ContentMoving'],
    ['room_unavailable', 'Http503.ListImages.RoomUnavailable'],
  ])('still reports a 503 %s, the server failing to serve', async (code, type) => {
    const seen = reportsSeen();
    await reportServerError(answer(503, { error: code }), 'list images');
    expect(seen).toEqual([type]);
  });

  it('still reports a feature-off token on any status but 503', async () => {
    const seen = reportsSeen();
    await reportServerError(answer(500, { error: 'ai_not_configured' }), 'read notes');
    expect(seen).toEqual(['Http500.ReadNotes.AiNotConfigured']);
  });
});
