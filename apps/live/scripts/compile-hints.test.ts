import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COMPILE_HINT, hintFirstLoadScripts, withCompileHint } from './compile-hints.mjs';

// A page's first-load scripts compile as they download (docs/specs/016-platform/web-performance.md "A page's
// first-load scripts compile as they download"): V8's file-level hint, on the first line of each.
describe('withCompileHint', () => {
  it("is V8's file-level eager-compile comment", () => {
    expect(COMPILE_HINT).toBe('//# allFunctionsCalledOnLoad');
  });

  it('puts the hint on a line of its own before the first byte of code', () => {
    expect(withCompileHint('(globalThis.TURBOPACK||=[]).push([])')).toBe(
      '//# allFunctionsCalledOnLoad\n(globalThis.TURBOPACK||=[]).push([])',
    );
  });

  it('leaves a script that already starts with the hint as it is', () => {
    const hinted = withCompileHint('a()');
    expect(withCompileHint(hinted)).toBe(hinted);
  });
});

describe('hintFirstLoadScripts', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function exportTree(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'compile-hints-'));
    dir = root;
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), body);
    }
    return root;
  }

  const page = (...chunks: string[]) =>
    `<html><head>${chunks.map((c) => `<script src="/live/_next/static/chunks/${c}" async=""></script>`).join('')}</head></html>`;
  const read = (root: string, chunk: string) =>
    readFileSync(join(root, '_next/static/chunks', chunk), 'utf8');

  it('hints every script some page names, once, and no other', () => {
    const root = exportTree({
      'index.html': page('shared.js', 'home.js'),
      'document/placeholder.html': page('shared.js', 'editor.js'),
      '_next/static/chunks/shared.js': 'shared()',
      '_next/static/chunks/home.js': 'home()',
      '_next/static/chunks/editor.js': 'editor()',
      '_next/static/chunks/on-demand.js': 'later()',
    });

    const hinted = hintFirstLoadScripts(root);

    expect(hinted).toEqual(['editor.js', 'home.js', 'shared.js']);
    expect(read(root, 'shared.js')).toBe(`${COMPILE_HINT}\nshared()`);
    expect(read(root, 'editor.js')).toBe(`${COMPILE_HINT}\neditor()`);
    expect(read(root, 'on-demand.js')).toBe('later()');
  });

  it('changes nothing on a second run over the same export', () => {
    const root = exportTree({
      'index.html': page('a.js'),
      '_next/static/chunks/a.js': 'a()',
    });

    hintFirstLoadScripts(root);
    hintFirstLoadScripts(root);

    expect(read(root, 'a.js')).toBe(`${COMPILE_HINT}\na()`);
  });

  it('fails, naming it, when a page names a script the export does not hold', () => {
    const root = exportTree({ 'index.html': page('missing.js') });

    expect(() => hintFirstLoadScripts(root)).toThrow(/missing\.js/);
  });
});
