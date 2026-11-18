import { describe, expect, it } from 'vitest';
import {
  chainTo,
  decodeAnalyzerFile,
  firstLoadSizes,
  groupOf,
  pathMatcher,
  reachFrom,
} from '../../../scripts/first-load-why.mjs';

// docs/specs/016-platform/web-performance.md "Measuring": why a page's first load carries a module, read from the
// bundle analyzer's data.

// An analyzer file: a 4-byte JSON length, the JSON, then big-endian adjacency sections.
function analyzerFile(json: Record<string, unknown>, sections: number[][][]): Uint8Array {
  const words = sections.map((lists) => {
    const ends: number[] = [];
    let end = 0;
    for (const list of lists) ends.push((end += list.length));
    return [lists.length, ...ends, ...lists.flat()];
  });
  let offset = 0;
  const head = { ...json };
  words.forEach((w, i) => {
    head[`section_${i}`] = { offset, length: w.length * 4 };
    offset += w.length * 4;
  });
  const body = new TextEncoder().encode(JSON.stringify(head));
  const bytes = new Uint8Array(4 + body.length + offset);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, body.length);
  bytes.set(body, 4);
  let at = 4 + body.length;
  for (const w of words) {
    for (const n of w) {
      view.setUint32(at, n);
      at += 4;
    }
  }
  return bytes;
}

describe('first-load-why', () => {
  it('decodes the JSON head and each node’s edges', () => {
    const file = decodeAnalyzerFile(analyzerFile({ name: 'x' }, [[[1, 2], [], [0]]]));
    const head = file.json as { name: string; section_0: { offset: number } };
    expect(head.name).toBe('x');
    const deps = file.edges(head.section_0);
    expect([deps(0), deps(1), deps(2)]).toEqual([[1, 2], [], [0]]);
  });

  it('sizes only the scripts the page loads up front, by module path', () => {
    const route = {
      sources: [
        { path: '[project]/', parent_source_index: null },
        { path: 'apps/live/a.ts', parent_source_index: 0 },
        { path: 'apps/live/b.ts', parent_source_index: 0 },
      ],
      output_files: [
        { filename: '[client-fs]/_next/static/chunks/first.js' },
        { filename: '[client-fs]/_next/static/chunks/later.js' },
        { filename: '[output]/server/chunk.js' },
      ],
      chunk_groups: [
        { kind: 'bootstrap', output_file_indices: [0, 2] },
        { kind: 'async', output_file_indices: [1] },
      ],
      chunk_parts: [
        { source_index: 1, output_file_index: 0, compressed_size: 100 },
        { source_index: 1, output_file_index: 0, compressed_size: 20 },
        { source_index: 2, output_file_index: 1, compressed_size: 999 },
        { source_index: 2, output_file_index: 2, compressed_size: 999 },
      ],
    };
    expect([...firstLoadSizes(route)]).toEqual([['apps/live/a.ts', 120]]);
  });

  it('groups a module by npm package, workspace package or app folder', () => {
    expect(groupOf('node_modules/.pnpm/a@1/node_modules/@x/y/dist/i.js')).toBe('npm:@x/y');
    expect(groupOf('packages/document/src/mind-grow.ts')).toBe('packages/document');
    expect(groupOf('apps/live/components/canvas/Face.tsx')).toBe('apps/live/components/canvas');
    expect(groupOf('apps/live/page.tsx')).toBe('apps/live/page.tsx');
  });

  it('names the shortest chain of imports to a module, and leaves out what a cut hides', () => {
    // 0 -> 1 -> 3, 0 -> 2 -> 3 -> 4
    const graph: Record<number, number[]> = { 0: [1, 2], 1: [3], 2: [3], 3: [4], 4: [] };
    const deps = (n: number) => graph[n]!;
    const via = reachFrom([0], deps);
    expect(chainTo(via, 4)).toEqual([0, 1, 3, 4]);
    const cut = reachFrom([0], deps, (n) => n === 3);
    expect([...cut.keys()].sort()).toEqual([0, 1, 2]);
  });

  it('matches path fragments joined by a bar, a closing $ anchoring the end', () => {
    const m = pathMatcher('components/canvas/collab/|mind-grow.ts$');
    expect(m.test('apps/live/components/canvas/collab/QaFace.tsx')).toBe(true);
    expect(m.test('packages/document/src/mind-grow.ts')).toBe(true);
    expect(m.test('packages/document/src/mind-grow.ts.map')).toBe(false);
    expect(m.test('packages/document/src/office.ts')).toBe(false);
    expect(pathMatcher('a.b').test('axb')).toBe(false);
  });
});
