import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentBounds } from './content-bounds';

// docs/specs/016-platform/web-performance.md "Pictures of the board": a deck fits to its content and a library shape
// is placed by it while the board is open, so the bounds never bring the SVG renderer into the editor's first load.
describe('content-bounds', () => {
  it('imports the arrow routes, the point bounds and the pointer tip, never the renderer', () => {
    const src = readFileSync(join(__dirname, 'content-bounds.ts'), 'utf8');
    const imports = [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map(
      (match) => match[1],
    );

    expect(imports).toEqual(['./arrow-label-layout', './geometry-primitives', './pointer-note']);
  });

  it('reads an empty tab as a page', () => {
    expect(contentBounds([])).toEqual({ x: 0, y: 0, w: 600, h: 400 });
  });
});
