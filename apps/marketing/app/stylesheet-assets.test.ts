import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/specs/016-platform/web-performance.md "Delivery": a file a stylesheet loads is a build asset. Named relative to
// the stylesheet, the build hashes it under /_next/static/ and it is cached immutable; named from the site root, it is
// a fixed name under public/ and is revalidated on every visit.

const APP = __dirname;

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

describe("the marketing site's stylesheets", () => {
  it('load every file they name from beside them, never from the site root', () => {
    const rooted = stylesheets(APP).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/url\(\s*['"]?(\/[^'")]*)/g)].map(
        (m) => `${relative(APP, path)}: ${m[1]}`,
      ),
    );
    expect(rooted).toEqual([]);
  });
});
