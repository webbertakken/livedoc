import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The api worker's bundle (docs/specs/016-platform/web-performance.md "The api"): a fresh isolate, the worker's or
// a document room's, fetches and compiles the whole bundle before it answers, so it ships minified, its names kept
// for logs and error names, and its source maps uploaded so a logged stack still reads as source.

const wrangler = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url).href), 'utf8');
// The top-level keys: everything before the first table.
const topLevel = wrangler.split(/^\[/m)[0] ?? '';

describe('the api worker bundle', () => {
  it('ships minified', () => {
    expect(topLevel).toMatch(/^minify = true$/m);
  });

  it('keeps its names, which error names and logs read', () => {
    expect(topLevel).not.toMatch(/^keep_names = false$/m);
  });

  it('uploads its source maps, so a logged stack reads as source', () => {
    expect(topLevel).toMatch(/^upload_source_maps = true$/m);
  });
});
