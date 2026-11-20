import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every writer of a room's `tabs` must keep `image_refs` in step
// (docs/specs/009-elements/images.md, "Reference index"): a writer that
// doesn't is how a placed image gets reaped once the room pushes its set. This census fails the moment SQL
// writing `tabs` appears somewhere new, so the author has to wire the index
// (and its test in db/image-refs-writers.test.ts) before the count is raised.

const APPS = fileURLToPath(new URL('../../../', import.meta.url).href);
const MIGRATIONS = join(APPS, 'api/migrations');

const WRITES_TABS =
  /\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO|DROP\s+TABLE)\s+tabs\b/gi;

// file -> number of statements writing `tabs`, each one proven in
// db/image-refs-writers.test.ts.
const KNOWN_WRITERS: Record<string, number> = {
  // tabWriteStatements (upsertTab, upsertTabAtRev), seedTabs, deleteTabRow, swapTabData; and
  // stampTabElementCount, renameTab and sheetTabRenameStatement, which write element_count or the name, never `data`,
  // so they have no image reference to keep.
  'api/src/db/tabs.ts': 7,
  // importDocumentCopy (a copy's tabs, references from the copied bodies)
  'api/src/document-room/document-content.ts': 1,
  // takeSharedTab and a shared tab taken in (receiveShares): each writes the body through tabWriteStatements, then
  // dates the row as the copy it took, which sets `updated_at` only and has no image reference to keep.
  'api/src/document-room/tab-shares.ts': 2,
  // TAB_KIND_STEP's backfill of the `kind` column from the bodies already stored, which changes no body.
  'api/src/document-room/document-schema.ts': 1,
};

// The last migration that wrote `tabs` without having to think about the
// index; anything after it must maintain `image_refs` and be listed here.
const LAST_UNINDEXED_MIGRATION = '0050';
const KNOWN_MIGRATION_WRITERS: string[] = [
  // Rewrites element links to another document ({"kind":"diagram","documentId":…} to
  // {"kind":"document","documentId":…}); no image reference changes, so the index stays exact.
  '0055_documents.sql',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    // Test support (a `test-` module, as test-sqlite-d1.ts) arranges rows; it is not a writer.
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith('test-')
      ? [path]
      : [];
  });
}

describe('writers of tabs', () => {
  it('are exactly the known, index-maintaining ones', () => {
    const found: Record<string, number> = {};
    for (const app of readdirSync(APPS)) {
      const src = join(APPS, app, 'src');
      if (!statSync(join(APPS, app)).isDirectory()) continue;
      try {
        statSync(src);
      } catch {
        continue;
      }
      for (const file of sourceFiles(src)) {
        const n = readFileSync(file, 'utf8').match(WRITES_TABS)?.length ?? 0;
        if (n > 0) found[relative(APPS, file)] = n;
      }
    }
    expect(found).toEqual(KNOWN_WRITERS);
  });

  it('include no migration after the index without it being listed', () => {
    const late = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && f.slice(0, 4) > LAST_UNINDEXED_MIGRATION)
      .filter(
        (f) => (readFileSync(join(MIGRATIONS, f), 'utf8').match(WRITES_TABS)?.length ?? 0) > 0,
      );
    expect(late).toEqual(KNOWN_MIGRATION_WRITERS);
  });
});
