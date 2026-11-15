import type { OpenApiDocument } from '../openapi/types';
import { json, methodNotAllowed, notFound } from '../responses';
import type { RouteContext } from './context';

// GET /api/openapi.json — the machine-readable OpenAPI 3.1 description of the
// REST surface (docs/specs/015-api/api-documentation.md). Public, unauthenticated, and cacheable: it's the
// contract, not data, so no credential is needed (mirrors /api/capabilities).
// Built once per isolate from the route manifest + the generated component
// schemas; the assembly is pure, so memoising is safe. Only this route reads them, so they load on its first
// request rather than with the worker (docs/specs/016-platform/web-performance.md "The api").
let cached: OpenApiDocument | null = null;

export async function handleOpenapi(ctx: RouteContext): Promise<Response> {
  if (ctx.segments.length !== 2) return notFound();
  if (ctx.request.method !== 'GET') return methodNotAllowed();
  if (!cached) {
    const { buildOpenApiDocument } = await import('../openapi/document');
    cached = buildOpenApiDocument();
  }
  return json(cached, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
