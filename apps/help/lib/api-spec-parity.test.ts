import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/015-api/api.md is where a reader finds what the api answers. This guard holds the parts of it that
// name code to the code: the segment table to what the Worker dispatches, and a PDF document's and the blob store's
// doors to the routes the OpenAPI manifest declares (apps/api/src/openapi/manifest.ts, itself held to the Worker by
// route-parity.test.ts). It reads a spec and the api's source, so it lives beside the other repo-wide guards.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');

const SPEC = read('docs/specs/015-api/api.md');

/** The segments the Worker's switch dispatches, in its order. */
function dispatchedSegments(): string[] {
  return [...read('apps/api/src/index.ts').matchAll(/^\s+case '([a-z.-]+)':/gm)].map(
    (found) => found[1]!,
  );
}

/** The rows of the spec's segment table, by their first cell. */
function specSegments(): string[] {
  const table = SPEC.slice(SPEC.indexOf('| Segment'), SPEC.indexOf('Owner-only routes'));
  return [...table.matchAll(/^\| `([a-z.-]+)`/gm)].map((found) => found[1]!);
}

/** Every route the manifest declares, as the spec writes one: its method, and its path with `:name` parameters. */
function manifestRoutes(): Array<{ method: string; path: string }> {
  const manifest = read('apps/api/src/openapi/manifest.ts');
  return [...manifest.matchAll(/method: '([A-Z]+)',\s+path: '([^']+)'/g)].map((found) => ({
    method: found[1]!,
    path: `/api${found[2]!.replace(/\{([a-zA-Z]+)\}/g, ':$1')}`,
  }));
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the spec has a table row for the route: its method among the row's, its path with any query after it. */
function specHasRow(route: { method: string; path: string }): boolean {
  const row = new RegExp(
    `^\\| [A-Z, /]*\\b${route.method}\\b[A-Z, /]*\\| \`${escaped(route.path)}(\\?[^\`]*)?\``,
    'm',
  );
  return row.test(SPEC);
}

/** The modules whose every refusal the spec's "PDF documents" block names. */
const PDF_DOORS = [
  'apps/api/src/routes/pdf-document-routes.ts',
  'apps/api/src/routes/pdf-thumbnail-routes.ts',
  'apps/api/src/pdf-documents/pdf-browser-thumbnail.ts',
  'apps/api/src/pdf-documents/seed-pdf-documents.ts',
];

describe('the api’s spec', () => {
  it('lists every segment the Worker dispatches, and says how many', () => {
    const dispatched = dispatchedSegments();
    expect(dispatched.length).toBeGreaterThan(30);
    expect([...specSegments()].sort()).toEqual([...dispatched].sort());
    expect(SPEC).toContain(`with ${dispatched.length} resource segments`);
  });

  it('has a row for every door of a PDF document and of the blob store', () => {
    const doors = manifestRoutes().filter(
      ({ path }) =>
        path.includes('/pdf-documents/') ||
        path.startsWith('/api/files') ||
        path.startsWith('/api/documents/:id/files/'),
    );
    // A PDF's state, updates and two thumbnail doors, a document's file, and the blob store's six.
    expect(doors.length).toBeGreaterThanOrEqual(11);
    expect(doors.filter((door) => !specHasRow(door))).toEqual([]);
  });

  it('names every refusal a PDF document’s doors answer', () => {
    const block = SPEC.slice(SPEC.indexOf('**PDF documents ('), SPEC.indexOf('**Files ('));
    const names = new Set(
      PDF_DOORS.flatMap((path) =>
        [...read(path).matchAll(/'([a-z]+(?:_[a-z]+)+)'/g)].map((found) => found[1]!),
      ),
    );
    expect(names.size).toBeGreaterThan(10);
    const named = (name: string) => new RegExp(`\\b${name}\\b`).test(block);
    expect([...names].filter((name) => !named(name)).sort()).toEqual([]);
  });
});
