// A page's first-load scripts compile as they download (docs/specs/016-platform/web-performance.md "A page's
// first-load scripts compile as they download"). Run after `next build` on `out/`: every script a page's HTML
// names gets V8's file-level hint on its first line, so Chrome compiles its functions on the thread that streams
// it in, rather than one by one on the main thread as the page first calls them. Scripts loaded on demand
// stay lazy.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFiles, referencedAssets } from '../../../scripts/first-load.mjs';

export const COMPILE_HINT = '//# allFunctionsCalledOnLoad';

const BUILD_ASSETS = '/_next/static/';

/**
 * The script with the hint as its first line; a script that has it already is returned as it is.
 * @param {string} source
 * @returns {string}
 */
export function withCompileHint(source) {
  return source.startsWith(`${COMPILE_HINT}\n`) ? source : `${COMPILE_HINT}\n${source}`;
}

/**
 * Hints every script some page of the export at `outDir` names, and returns their file names, sorted. A page
 * naming a script the export does not hold is a broken build: it throws, naming it.
 */
export function hintFirstLoadScripts(outDir) {
  /** @type {Set<string>} */
  const urls = new Set();
  for (const page of htmlFiles(outDir)) {
    const html = readFileSync(join(outDir, page), 'utf8');
    for (const url of referencedAssets(html).scripts) urls.add(url);
  }
  /** @type {string[]} */
  const hinted = [];
  for (const url of urls) {
    const file = join(outDir, url.slice(url.indexOf(BUILD_ASSETS)));
    if (!existsSync(file))
      throw new Error(`[compile-hints] a page names ${url}, which the export does not hold`);
    const source = readFileSync(file, 'utf8');
    const next = withCompileHint(source);
    if (next !== source) writeFileSync(file, next);
    hinted.push(url.slice(url.lastIndexOf('/') + 1));
  }
  return hinted.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] ?? 'out');
  const hinted = hintFirstLoadScripts(outDir);
  console.log(`[compile-hints] ${hinted.length} first-load scripts compile as they download`);
}
