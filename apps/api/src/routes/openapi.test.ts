import { describe, expect, it, vi } from 'vitest';
import { makeTestRouteContext } from './test-route-context';

// GET /api/openapi.json (docs/specs/015-api/api-documentation.md): the document and its schemas are a large
// module that only this route reads, so the worker loads them when the route is first asked, not at start-up
// (docs/specs/016-platform/web-performance.md "The api").

const loaded = vi.hoisted(() => ({ document: false }));
vi.mock('../openapi/document', async (importOriginal) => {
  loaded.document = true;
  return importOriginal();
});

describe('GET /api/openapi.json', () => {
  it('loads the document on the first request, not with the worker', async () => {
    const { handleOpenapi } = await import('./openapi');
    expect(loaded.document).toBe(false);
    const res = await handleOpenapi(makeTestRouteContext('GET', '/api/openapi.json'));
    expect(loaded.document).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await res.json()).toMatchObject({ openapi: expect.stringMatching(/^3\.1/) });
  });

  it('refuses another method and a deeper path', async () => {
    const { handleOpenapi } = await import('./openapi');
    expect((await handleOpenapi(makeTestRouteContext('POST', '/api/openapi.json'))).status).toBe(
      405,
    );
    expect((await handleOpenapi(makeTestRouteContext('GET', '/api/openapi.json/x'))).status).toBe(
      404,
    );
  });
});
