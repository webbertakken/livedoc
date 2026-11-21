import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTestOrDeclaration, listSourceFiles } from './source-files';

describe('listSourceFiles', () => {
  let root: string;
  const write = (path: string): void => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), '');
  };
  const list = (accept: (path: string) => boolean = () => true): string[] =>
    listSourceFiles(root, accept).map((path) => relative(root, path));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'source-files-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('walks nested folders and keeps what the filter takes', () => {
    write('a/Row.tsx');
    write('a/b/menu.ts');
    write('a/b/notes.md');

    expect(list((path) => /\.tsx?$/.test(path)).sort()).toEqual(['a/Row.tsx', 'a/b/menu.ts']);
  });

  it('never enters dependencies, build output or end-to-end suites', () => {
    write('node_modules/x/index.ts');
    write('.next/page.ts');
    write('e2e/flow.ts');
    write('coverage/report.ts');
    write('src/Row.tsx');

    expect(list()).toEqual(['src/Row.tsx']);
  });

  it('skips a file that vanishes before it can be read', () => {
    symlinkSync(join(root, 'gone.ts'), join(root, 'dangling.ts'));
    write('Row.tsx');

    expect(list()).toEqual(['Row.tsx']);
  });
});

describe('isTestOrDeclaration', () => {
  it('names unit tests, specs and declarations', () => {
    for (const name of [
      'Row.test.tsx',
      'row.test.ts',
      'flow.spec.ts',
      'x.test.mjs',
      'types.d.ts',
    ]) {
      expect(isTestOrDeclaration(name), name).toBe(true);
    }
  });

  it('leaves source alone', () => {
    for (const name of ['Row.tsx', 'testing.ts', 'spec-reader.ts', 'd.ts.ts']) {
      expect(isTestOrDeclaration(name), name).toBe(false);
    }
  });
});
