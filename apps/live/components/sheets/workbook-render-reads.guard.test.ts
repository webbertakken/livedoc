import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isArrowFunction,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodDeclaration,
  isPropertyAccessExpression,
  isVariableDeclaration,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';
import { parseSourceFiles } from '@livedoc/source-ast';
import { describe, expect, it } from 'vitest';

// A render reads the page's workbook through readWorkbook (docs/specs/003-system-architecture/react-state-and-effects.md
// "The React Compiler"). The workbook is one mutable copy whose identity never changes, so the compiler keeps a
// render's read memoised on the instance and its arguments: Insert Link's card read the active cell's link before the
// write and never again. Vitest runs without the compiler, so a render test passes either way; this guard holds the
// call sites instead: no component or hook calls the workbook, or hands it to a call, outside readWorkbook.
const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const NOT_SOURCE_DIRS = new Set([
  'node_modules',
  '.next',
  '.next-dev',
  'out',
  'e2e',
  'coverage',
  '.turbo',
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (NOT_SOURCE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$|test-utils|\.d\.ts$/.test(entry))
      acc.push(full);
  }
  return acc;
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  node.forEachChild((child) => {
    walk(child, visit);
  });
}

// The workbook as a render holds it: `c.workbook`, `workbook` or `wb`.
function isWorkbook(node: Node): boolean {
  if (isIdentifier(node)) return node.text === 'workbook' || node.text === 'wb';
  return isPropertyAccessExpression(node) && node.name.text === 'workbook';
}

// The function a node runs in, and its name when it is declared as one.
function enclosing(node: Node): { fn: Node; name: string | null } | null {
  for (let at = node.parent; at; at = at.parent) {
    if (isFunctionDeclaration(at)) return { fn: at, name: at.name?.text ?? null };
    if (isArrowFunction(at) || isFunctionExpression(at)) {
      const decl = at.parent;
      return {
        fn: at,
        name:
          decl && isVariableDeclaration(decl) && isIdentifier(decl.name) ? decl.name.text : null,
      };
    }
    if (isMethodDeclaration(at)) return { fn: at, name: null };
  }
  return null;
}

const RENDER = /^(use[A-Z]|[A-Z])/;

function renderReads(file: SourceFile): string[] {
  const out: string[] = [];
  walk(file, (node) => {
    if (!isCallExpression(node)) return;
    const callee = node.expression;
    const reads =
      (isPropertyAccessExpression(callee) && isWorkbook(callee.expression)) ||
      (!(isIdentifier(callee) && /^(use[A-Z]|readWorkbook$)/.test(callee.text)) &&
        node.arguments.some(isWorkbook));
    if (!reads) return;
    const at = enclosing(node);
    if (!at?.name || !RENDER.test(at.name)) return;
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    out.push(`${relative(APP_DIR, file.fileName)}:${line + 1} ${at.name}`);
  });
  return out;
}

describe('the workbook in a render', () => {
  const files = parseSourceFiles(sourceFiles(APP_DIR));

  it('is read through readWorkbook, so a compiled render reads it again when the store moves', () => {
    expect(files.flatMap(renderReads)).toEqual([]);
  });

  it('finds the renders it guards', () => {
    const reading = files.filter((file) => file.text.includes('readWorkbook(c.version'));
    expect(reading.length).toBeGreaterThan(15);
  });
});
