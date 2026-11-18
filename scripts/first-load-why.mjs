#!/usr/bin/env node
// Why a page's first load carries what it does (docs/specs/016-platform/web-performance.md "Measuring"), read from
// the Turbopack bundle analyzer's data as the real module graph. The pure parts are tested in
// apps/help/lib/first-load-why.test.ts.
//
//   cd apps/live && NEXT_DISTDIR=.next-analyze pnpm exec next experimental-analyze -o    write the data
//   node scripts/first-load-why.mjs live 'document/[id]' groups        the first load by package and folder
//   node scripts/first-load-why.mjs live 'document/[id]' top <paths>   its largest modules (matching <paths>)
//   node scripts/first-load-why.mjs live 'document/[id]' why <paths>   the chain of static imports that brings one in
//   node scripts/first-load-why.mjs live 'document/[id]' cut <paths>   what leaves it if those load on demand
//
// Sizes are the analyzer's compressed size of each module's part of a chunk, so they sum a little above
// first-load.mjs's gzip of whole files; compare them with each other, not with its numbers.
// <paths> is one or more fragments of a module's path joined by `|`; a fragment ending in `$` ends the path.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const KIB = 1024;
const PROJECT = '[project]/';
const ANALYZE_DIRS = ['.next-analyze', '.next'];

/**
 * One analyzer data file: its JSON head and a reader for its adjacency sections. A section is a count, then each
 * node's end offset into the edge list, then the edges, all big-endian 32-bit.
 * @param {Uint8Array} bytes
 * @returns {{ json: any, edges: (section: { offset: number }) => (node: number) => number[] }}
 */
export function decodeAnalyzerFile(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(0);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
  const base = 4 + length;
  const edges = (section) => {
    const at = base + section.offset;
    const count = view.getUint32(at);
    const end = (node) => view.getUint32(at + 4 + node * 4);
    const listAt = at + 4 + count * 4;
    return (node) => {
      const out = [];
      for (let k = node === 0 ? 0 : end(node - 1); k < end(node); k++)
        out.push(view.getUint32(listAt + k * 4));
      return out;
    };
  };
  return { json, edges };
}

/**
 * Each first-load module's compressed bytes: the parts of the client scripts in the page's bootstrap and
 * render-dependent chunk groups, never an async one.
 * @param {any} route a route's decoded analyze.data
 * @returns {Map<string, number>}
 */
export function firstLoadSizes(route) {
  const outputs = new Set();
  for (const group of route.chunk_groups) {
    if (group.kind === 'async') continue;
    for (const i of group.output_file_indices) {
      if (/^\[client-fs\].*\.js$/.test(route.output_files[i].filename)) outputs.add(i);
    }
  }
  const pathOf = (i) => {
    let path = '';
    for (let at = i; at != null; at = route.sources[at].parent_source_index)
      path = route.sources[at].path + path;
    return path.startsWith(PROJECT) ? path.slice(PROJECT.length) : path;
  };
  const sizes = new Map();
  for (const part of route.chunk_parts) {
    if (!outputs.has(part.output_file_index)) continue;
    const path = pathOf(part.source_index);
    sizes.set(path, (sizes.get(path) ?? 0) + part.compressed_size);
  }
  return sizes;
}

/**
 * Where a module's bytes are counted: an npm package, a workspace package, or an app's top-level folder.
 * @param {string} path
 * @returns {string}
 */
export function groupOf(path) {
  const npm = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*node_modules\/)/);
  if (npm) return `npm:${npm[1]}`;
  const pkg = path.match(/^(packages\/[^/]+)\//);
  if (pkg) return pkg[1];
  const app = path.match(/^(apps\/[^/]+\/(?:components|hooks|lib|app)\/[^/]+)/);
  return app ? app[1] : path;
}

/**
 * The static import graph from the page's entry modules, skipping any module `cut` names, as each reached module's
 * importer on a shortest chain (the roots map to -1).
 * @param {number[]} roots
 * @param {(node: number) => number[]} deps
 * @param {(node: number) => boolean} cut
 * @returns {Map<number, number>}
 */
export function reachFrom(roots, deps, cut = () => false) {
  const via = new Map(roots.map((r) => [r, -1]));
  const queue = [...roots];
  while (queue.length) {
    const at = /** @type {number} */ (queue.shift());
    for (const next of deps(at)) {
      if (via.has(next) || cut(next)) continue;
      via.set(next, at);
      queue.push(next);
    }
  }
  return via;
}

/**
 * The chain of imports from an entry to `node`, entry first.
 * @param {Map<number, number>} via
 * @param {number} node
 * @returns {number[]}
 */
export function chainTo(via, node) {
  const chain = [];
  for (let at = node; at !== -1 && at !== undefined; at = /** @type {number} */ (via.get(at)))
    chain.push(at);
  return chain.reverse();
}

/**
 * A test for module paths: `fragments` is path fragments joined by `|`; a path matches one it holds, and a
 * fragment ending in `$` only at the path's end. Plain text, never a regular expression built from input.
 * @param {string} fragments
 * @returns {{ test: (path: string) => boolean }}
 */
export function pathMatcher(fragments) {
  const terms = fragments.split('|').filter(Boolean);
  return {
    test: (path) =>
      terms.some((t) => (t.endsWith('$') ? path.endsWith(t.slice(0, -1)) : path.includes(t))),
  };
}

const kib = (bytes) => (bytes / KIB).toFixed(1).padStart(7);

function main(argv) {
  const [app, route, command = 'groups', pattern] = argv;
  if (!app || !route) {
    console.error(
      'usage: first-load-why.mjs <app> <route> groups|top [paths]|why <paths>|cut <paths>',
    );
    return 2;
  }
  const appDir = join(SCRIPT_ROOT, 'apps', app);
  const dataDir = ANALYZE_DIRS.map((d) => join(appDir, d, 'diagnostics/analyze/data')).find(
    existsSync,
  );
  if (!dataDir) {
    console.error(
      `[first-load-why] AnalyzeDataMissing: run next experimental-analyze -o in apps/${app} first`,
    );
    return 1;
  }
  const routeData = decodeAnalyzerFile(readFileSync(join(dataDir, route, 'analyze.data'))).json;
  const sizes = firstLoadSizes(routeData);
  const total = [...sizes.values()].reduce((a, b) => a + b, 0);
  const re = pattern ? pathMatcher(pattern) : null;
  console.log(`${kib(total)} KiB in ${sizes.size} modules, the first load of ${route}`);

  if (command === 'groups' || command === 'top') {
    const rows = new Map();
    for (const [path, size] of sizes) {
      if (command === 'top' && re && !re.test(path)) continue;
      const key = command === 'groups' ? groupOf(path) : path;
      rows.set(key, (rows.get(key) ?? 0) + size);
    }
    for (const [key, size] of [...rows].sort((a, b) => b[1] - a[1]).slice(0, 60))
      console.log(kib(size), key);
    return 0;
  }
  if (!re) {
    console.error(`[first-load-why] PatternMissing: ${command} needs path fragments`);
    return 2;
  }
  const modules = decodeAnalyzerFile(readFileSync(join(dataDir, 'modules.data')));
  const deps = modules.edges(modules.json.module_dependencies);
  const pathOf = (i) => modules.json.modules[i].path.replace(PROJECT, '');
  const roots = routeData.chunk_groups
    .filter((g) => g.kind !== 'async')
    .map((g) => g.trigger_module_index);
  const via = reachFrom(roots, deps);
  if (command === 'why') {
    // A module the bundler holds in more than one layer is named once, by its shortest chain.
    const byPath = new Map();
    for (const i of via.keys())
      if (re.test(pathOf(i)) && sizes.has(pathOf(i)) && !byPath.has(pathOf(i)))
        byPath.set(pathOf(i), i);
    const hits = [...byPath.values()].slice(0, 5);
    if (!hits.length) console.log('nothing in the first load matches');
    for (const hit of hits) {
      console.log(`\n${kib(sizes.get(pathOf(hit)))} KiB ${pathOf(hit)}`);
      for (const at of chainTo(via, hit)) console.log(`          ${pathOf(at)}`);
    }
    return 0;
  }
  if (command === 'cut') {
    const kept = new Set([...reachFrom(roots, deps, (i) => re.test(pathOf(i))).keys()].map(pathOf));
    const freed = [...new Set([...via.keys()].map(pathOf))].filter(
      (p) => !kept.has(p) && sizes.has(p),
    );
    const bytes = freed.reduce((a, p) => a + /** @type {number} */ (sizes.get(p)), 0);
    console.log(`${kib(bytes)} KiB in ${freed.length} modules leave the first load`);
    for (const p of freed.sort((a, b) => sizes.get(b) - sizes.get(a)).slice(0, 30))
      console.log(kib(sizes.get(p)), p);
    return 0;
  }
  console.error(`[first-load-why] UnknownCommand: ${command}`);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
