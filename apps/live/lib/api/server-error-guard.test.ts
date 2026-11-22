import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isAsExpression,
  isAwaitExpression,
  isBinaryExpression,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isNoSubstitutionTemplateLiteral,
  isNonNullExpression,
  isNumericLiteral,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isStringLiteral,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';
import { FEATURE_OFF_ERROR, FEATURE_OFF_ERRORS } from '@livedoc/api-schema';
import { parseSourceFiles } from '@livedoc/source-ast';
import { describe, expect, it } from 'vitest';

// A 5xx is never expected (docs/specs/017-telemetry/telemetry.md `Http<status>.<Action>.<Code>`). A read that
// judges its own response, `if (!res.ok) return null`, never reached the reporting path, so two `500`s on
// `GET /api/home` reached no telemetry at all. This guard reads every editor module that asks the api: a function that
// holds a response hands it to the reporting path before it reads its `ok` or `status`. Before then it may only ask
// whether the status equals a code under 500 (`res.status === 409`), which cannot swallow a 5xx.

const API_DIR = fileURLToPath(new URL('.', import.meta.url));
const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const API_WORKER_DIR = fileURLToPath(new URL('../../../api/src', import.meta.url));
const NOT_SOURCE_DIRS = new Set(['node_modules', '.next', '.next-dev', 'out', 'e2e']);

// The reporting path: each reports a 5xx it is handed (core.ts).
const REPORTING = new Set([
  'reportServerError',
  'reportResponseFailure',
  'expectOk',
  'expectOkOrNull',
  'expectOkVoid',
  'expectOkOr404Void',
  'failedResponse',
]);

// Functions that read a response without being its reader, each with why.
const NOT_A_READER = new Map([
  // Watches every response for a lapsed workbench session (a 401); the request's own reader reports the rest.
  ['workbench-confinement.ts noteWorkbenchResponse', 'observes every response'],
]);

const FUNCTION_KINDS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
]);

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  node.forEachChild((child) => {
    walk(child, visit);
  });
}

function unwrap(node: Node): Node {
  let at = node;
  while (
    isAwaitExpression(at) ||
    isParenthesizedExpression(at) ||
    isAsExpression(at) ||
    isNonNullExpression(at)
  ) {
    at = at.expression;
  }
  return at;
}

// What answers an api request: `apiFetch` everywhere, and in `lib/api` also the plain `fetch` (or an injected
// `fetcher`) of a page kept free of editor modules. Elsewhere a plain `fetch` asks something other than the api.
const API_FETCHERS: ReadonlySet<string> = new Set(['apiFetch', 'fetch', 'fetcher']);
const APP_FETCHERS: ReadonlySet<string> = new Set(['apiFetch']);

const isFetchCall = (node: Node | undefined, fetchers: ReadonlySet<string>): boolean => {
  if (!node) return false;
  const call = unwrap(node);
  return (
    isCallExpression(call) && isIdentifier(call.expression) && fetchers.has(call.expression.text)
  );
};

/** `res.status === 409` (either way round): a status under 500 asked for by equality, which no 5xx matches. */
function asksForAnAnswerUnder500(read: Node): boolean {
  const comparison = read.parent;
  if (!comparison || !isBinaryExpression(comparison)) return false;
  const op = comparison.operatorToken.kind;
  if (op !== SyntaxKind.EqualsEqualsEqualsToken && op !== SyntaxKind.EqualsEqualsToken)
    return false;
  const other = comparison.left === read ? comparison.right : comparison.left;
  return isNumericLiteral(other) && Number(other.text) < 500;
}

function enclosingFunction(node: Node): Node {
  let at = node.parent;
  while (at && !FUNCTION_KINDS.has(at.kind)) at = at.parent;
  return at ?? node.getSourceFile();
}

function functionName(fn: Node): string {
  if ((isFunctionDeclaration(fn) || isMethodDeclaration(fn)) && fn.name && isIdentifier(fn.name)) {
    return fn.name.text;
  }
  const holder = fn.parent;
  if (holder && isVariableDeclaration(holder) && isIdentifier(holder.name)) return holder.name.text;
  return '(anonymous)';
}

/** Each response a function holds: a variable that took a fetch, or a parameter typed `Response`. */
function responsesIn(
  sf: SourceFile,
  fetchers: ReadonlySet<string>,
): { name: string; scope: Node }[] {
  const found: { name: string; scope: Node }[] = [];
  walk(sf, (node) => {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      isFetchCall(node.initializer, fetchers)
    ) {
      found.push({ name: node.name.text, scope: enclosingFunction(node) });
    }
    if (
      isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.EqualsToken &&
      isIdentifier(node.left) &&
      isFetchCall(node.right, fetchers)
    ) {
      found.push({ name: node.left.text, scope: enclosingFunction(node) });
    }
    if (
      isParameterDeclaration(node) &&
      isIdentifier(node.name) &&
      node.type &&
      isTypeReferenceNode(node.type) &&
      isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'Response'
    ) {
      found.push({ name: node.name.text, scope: node.parent });
    }
  });
  return found;
}

/** Every function that reads a response's `ok` or `status` before handing it to the reporting path. */
export function unreportedResponseReads(
  paths: readonly string[],
  fetchers: ReadonlySet<string> = API_FETCHERS,
): string[] {
  const findings: string[] = [];
  const files = parseSourceFiles(paths);
  files.forEach((sf, i) => {
    const file = basename(paths[i]!);
    for (const { name, scope } of responsesIn(sf, fetchers)) {
      const fn = functionName(scope);
      if (REPORTING.has(fn) || NOT_A_READER.has(`${file} ${fn}`)) continue;
      const reads: Node[] = [];
      let reportedAt = Number.POSITIVE_INFINITY;
      walk(scope, (node) => {
        if (
          isPropertyAccessExpression(node) &&
          isIdentifier(node.expression) &&
          node.expression.text === name &&
          (node.name.text === 'ok' || node.name.text === 'status')
        ) {
          reads.push(node);
        }
        if (
          isCallExpression(node) &&
          isIdentifier(node.expression) &&
          REPORTING.has(node.expression.text) &&
          node.arguments[0] &&
          isIdentifier(node.arguments[0]) &&
          node.arguments[0].text === name
        ) {
          reportedAt = Math.min(reportedAt, node.getStart());
        }
      });
      const early = reads.find(
        (read) => read.getStart() < reportedAt && !asksForAnAnswerUnder500(read),
      );
      if (early) {
        const line = sf.getLineAndCharacterOfPosition(early.getStart()).line + 1;
        findings.push(`${file}:${line} ${fn} reads ${early.getText()}`);
      }
    }
  });
  return [...new Set(findings)];
}

const isSource = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);

/** The editor's source files under `dir`, outside `lib/api`, its dependencies and its build output. */
function appSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!NOT_SOURCE_DIRS.has(entry.name) && `${path}/` !== API_DIR) appSources(path, out);
    } else if (isSource(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe('every editor response read reaches the reporting path', () => {
  it('finds no lib/api function that reads a response without reporting its 5xx', () => {
    const modules = readdirSync(API_DIR)
      .filter(isSource)
      .map((name) => join(API_DIR, name));
    expect(modules.length).toBeGreaterThan(30);
    expect(unreportedResponseReads(modules)).toEqual([]);
  });

  it('finds none elsewhere in the editor that asks the api through apiFetch', () => {
    const modules = appSources(APP_DIR).filter((path) =>
      readFileSync(path, 'utf8').includes('apiFetch('),
    );
    expect(modules.length).toBeGreaterThan(3);
    expect(unreportedResponseReads(modules, APP_FETCHERS)).toEqual([]);
  });

  it('catches a read that judges its own response, and passes one that reports it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'server-error-guard-'));
    try {
      const unreported = join(dir, 'unreported.ts');
      writeFileSync(
        unreported,
        [
          'export async function readA() {',
          "  const res = await apiFetch('/api/a');",
          '  if (!res.ok) return null;',
          '  return res.json();',
          '}',
          'export async function readB() {',
          '  let res: Response;',
          "  res = await apiFetch('/api/b');",
          '  return res.status >= 500 ? null : res;',
          '}',
          'async function judge(res: Response) {',
          '  return res.ok;',
          '}',
          // Skips a feature-off 503 by hand, before the reporting path: it would swallow every other 503 too.
          'export async function readC() {',
          "  const res = await fetcher('/api/c');",
          '  if (res.status === 503) return null;',
          "  return expectOk(res, 'read c');",
          '}',
          'export async function readD() {',
          "  const res = await apiFetch('/api/d');",
          '  if (res.status !== 404) return null;',
          "  return expectOk(res, 'read d');",
          '}',
        ].join('\n'),
      );
      const reported = join(dir, 'reported.ts');
      writeFileSync(
        reported,
        [
          'export async function readA() {',
          "  const res = await apiFetch('/api/a');",
          "  await reportServerError(res, 'read a');",
          '  if (!res.ok) return null;',
          '  return res.json();',
          '}',
          'export async function readB() {',
          "  const res = await apiFetch('/api/b');",
          "  if (res.status === 409) return 'taken';",
          "  return expectOk(res, 'read b');",
          '}',
          // Leaves a feature-off 503 to the reporting path, which knows it is no fault, then answers the gallery off.
          'export async function readC() {',
          "  const res = await apiFetch('/api/images');",
          "  await reportServerError(res, 'list images');",
          '  if (res.status === 503) return null;',
          "  return expectOk(res, 'list images');",
          '}',
        ].join('\n'),
      );
      expect(unreportedResponseReads([unreported])).toEqual([
        'unreported.ts:3 readA reads res.ok',
        'unreported.ts:9 readB reads res.status',
        'unreported.ts:12 judge reads res.ok',
        'unreported.ts:16 readC reads res.status',
        'unreported.ts:21 readD reads res.status',
      ]);
      expect(unreportedResponseReads([reported])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A feature switched off is not a fault, so its 503 tokens are the one exception to reporting every 5xx
  // (docs/specs/017-telemetry/telemetry.md). The api answers them from that same list, or a token renamed on one side
  // would turn a switched-off feature into a standing false fault.
  it('finds the api answering every feature-off 503 from the shared list, never from a literal', () => {
    const workerSources = appSources(API_WORKER_DIR);
    expect(workerSources.length).toBeGreaterThan(50);
    const literals: string[] = [];
    const files = workerSources.filter((path) => {
      const text = readFileSync(path, 'utf8');
      return FEATURE_OFF_ERRORS.some((token) => text.includes(token));
    });
    parseSourceFiles(files).forEach((sf, i) => {
      walk(sf, (node) => {
        const isText = isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);
        if (isText && (FEATURE_OFF_ERRORS as readonly string[]).includes(node.text)) {
          literals.push(`${basename(files[i]!)}: ${node.getText()}`);
        }
      });
    });
    expect(literals).toEqual([]);
    const workerText = workerSources.map((path) => readFileSync(path, 'utf8')).join('\n');
    for (const feature of Object.keys(FEATURE_OFF_ERROR)) {
      expect(workerText).toContain(`FEATURE_OFF_ERROR.${feature}`);
    }
  });
});
