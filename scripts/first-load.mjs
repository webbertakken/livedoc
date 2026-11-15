#!/usr/bin/env node
// First-load weight per page (docs/specs/016-platform/web-performance.md "Measuring"): for every page
// of a static export, the gzipped size of the scripts and stylesheets its HTML references, and of the
// HTML itself. Pages that load the same files are printed as one row. The pure parts are tested in
// apps/help/lib/first-load.test.ts.
//
//   node scripts/first-load.mjs                 every app with an `out/` folder
//   node scripts/first-load.mjs live help       only those apps
//   node scripts/first-load.mjs --json          the same rows as JSON, to diff two builds
//   node scripts/first-load.mjs --chunks live   an app's largest first-load scripts and how many pages load each
//   node scripts/first-load.mjs --check live    fail when a page's scripts are over its budget
//                                               (apps/<app>/first-load-budget.json, "Every page has a budget")
//   node scripts/first-load.mjs --root=<dir>    another checkout's exports (a worktree, a second build)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SCRIPT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const KIB = 1024;
const GZIP_LEVEL = 9;
const APPS = ['live', 'marketing', 'help', 'telemetry'];
const BUILD_ASSETS = '/_next/static/';
const BUDGET_FILE = 'first-load-budget.json';

/**
 * One row of the report: the pages that load the same files, and their gzipped sizes in bytes.
 * @typedef {{ pages: string[], scripts: string[], js: number, css: number, html: number }} FirstLoadRow
 */

/**
 * A page's budget: `page` is a regular expression over the page's name, `kib` the most gzipped JavaScript it
 * may load up front.
 * @typedef {{ page: string, kib: number }} Budget
 */

/**
 * Every `.html` file under `dir` outside its build folder, as paths relative to it.
 * @param {string} dir
 * @returns {string[]}
 */
export function htmlFiles(dir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} at */
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '_next') walk(full);
      } else if (entry.name.endsWith('.html')) found.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
}

/**
 * The path a page is served at: `explorer/home.html` is `/explorer/home`, `index.html` is `/`.
 * @param {string} htmlPath
 * @returns {string}
 */
export function pageName(htmlPath) {
  const path = htmlPath.replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return `/${path}`;
}

/**
 * The build files an HTML document loads up front: its scripts and its stylesheets, once each.
 * @param {string} html
 * @returns {{ scripts: string[], styles: string[] }}
 */
export function referencedAssets(html) {
  /** @type {Set<string>} */
  const scripts = new Set();
  /** @type {Set<string>} */
  const styles = new Set();
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)[^"]*"/g)) {
    if (src?.includes(BUILD_ASSETS)) scripts.add(src);
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    if (!/\brel="stylesheet"/.test(tag)) continue;
    const href = /\bhref="([^"]+\.css)[^"]*"/.exec(tag)?.[1];
    if (href?.includes(BUILD_ASSETS)) styles.add(href);
  }
  return { scripts: [...scripts].sort(), styles: [...styles].sort() };
}

/**
 * Gzipped sizes of an export's build files, by the URL a page names them with (any prefix or base path).
 * @param {string} outDir
 * @returns {(url: string) => number}
 */
function gzipSizer(outDir) {
  /** @type {Map<string, number>} */
  const sizes = new Map();
  return (url) => {
    const known = sizes.get(url);
    if (known !== undefined) return known;
    const file = join(outDir, url.slice(url.indexOf(BUILD_ASSETS)));
    // A file the export does not hold weighs nothing here; the stale-build guards own that failure.
    const size = existsSync(file) ? gzipSync(readFileSync(file), { level: GZIP_LEVEL }).length : 0;
    sizes.set(url, size);
    return size;
  };
}

/**
 * One row per set of pages that load the same files, heaviest scripts first. Sizes are gzipped bytes; a row's
 * `html` is its largest page's.
 * @param {string} outDir
 * @returns {FirstLoadRow[]}
 */
export function firstLoadRows(outDir) {
  const sizeOf = gzipSizer(outDir);
  /** @type {Map<string, FirstLoadRow>} */
  const rows = new Map();
  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(join(outDir, file));
    const { scripts, styles } = referencedAssets(html.toString('utf8'));
    const key = [...scripts, ...styles].join('|');
    const row = rows.get(key) ?? {
      pages: [],
      scripts,
      js: scripts.reduce((sum, url) => sum + sizeOf(url), 0),
      css: styles.reduce((sum, url) => sum + sizeOf(url), 0),
      html: 0,
    };
    row.pages.push(pageName(file));
    row.html = Math.max(row.html, gzipSync(html, { level: GZIP_LEVEL }).length);
    rows.set(key, row);
  }
  for (const row of rows.values()) row.pages.sort();
  return [...rows.values()].sort((a, b) => b.js - a.js);
}

/**
 * An app's first-load scripts, largest first, each with how many pages load it.
 * @param {string} outDir
 * @returns {{ file: string, gzip: number, pages: number }[]}
 */
export function chunkRows(outDir) {
  const sizeOf = gzipSizer(outDir);
  /** @type {Map<string, number>} */
  const pagesOf = new Map();
  for (const row of firstLoadRows(outDir)) {
    for (const url of row.scripts) pagesOf.set(url, (pagesOf.get(url) ?? 0) + row.pages.length);
  }
  return [...pagesOf.entries()]
    .map(([url, pages]) => ({
      file: url.slice(url.lastIndexOf('/') + 1),
      gzip: sizeOf(url),
      pages,
    }))
    .sort((a, b) => b.gzip - a.gzip);
}

/**
 * Pages against their budgets. `budgets` is ordered: the first whose pattern matches a page's name is that
 * page's budget. Answers the pages over budget and the pages no budget names.
 * @param {Pick<FirstLoadRow, 'pages' | 'js'>[]} rows
 * @param {Budget[]} budgets
 * @returns {{ over: { page: string, kib: number, budget: number }[], unbudgeted: string[] }}
 */
export function budgetReport(rows, budgets) {
  const tests = budgets.map(({ page, kib }) => ({ matches: new RegExp(page), kib }));
  /** @type {{ page: string, kib: number, budget: number }[]} */
  const over = [];
  /** @type {string[]} */
  const unbudgeted = [];
  for (const row of rows) {
    const kib = Math.round(row.js / KIB);
    for (const page of row.pages) {
      const budget = tests.find(({ matches }) => matches.test(page));
      if (!budget) unbudgeted.push(page);
      else if (kib > budget.kib) over.push({ page, kib, budget: budget.kib });
    }
  }
  return {
    over: over.sort((a, b) => a.page.localeCompare(b.page)),
    unbudgeted: unbudgeted.sort(),
  };
}

/** @param {number} bytes */
const kib = (bytes) => `${Math.round(bytes / KIB).toLocaleString('en-GB')} KiB`;

/** @param {string[]} pages */
function pagesLabel(pages) {
  return pages.length <= 3
    ? pages.join(', ')
    : `${pages.slice(0, 3).join(', ')} (+${pages.length - 3})`;
}

/**
 * @param {string[]} header
 * @param {string[][]} lines
 */
function printTable(header, lines) {
  const widths = header.map((cell, i) =>
    Math.max(cell.length, ...lines.map((line) => (line[i] ?? '').length)),
  );
  /** @param {string[]} line */
  const format = (line) =>
    line
      .map((cell, i) => (i === 0 ? cell.padEnd(widths[i] ?? 0) : cell.padStart(widths[i] ?? 0)))
      .join('  ');
  console.log(format(header));
  for (const line of lines) console.log(format(line));
}

/**
 * Checks one app's export against its budget file; answers whether it holds, having said why not.
 * @param {string} root
 * @param {string} app
 * @returns {boolean}
 */
function checkApp(root, app) {
  const budgetPath = join(root, 'apps', app, BUDGET_FILE);
  if (!existsSync(budgetPath)) {
    console.error(`[first-load] ${app}: no ${BUDGET_FILE}; every app with pages has one`);
    return false;
  }
  /** @type {{ budgets: Budget[] }} */
  const { budgets } = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const { over, unbudgeted } = budgetReport(firstLoadRows(join(root, 'apps', app, 'out')), budgets);
  for (const { page, kib: loads, budget } of over) {
    console.error(
      `[first-load] ${app}: over budget: ${page} loads ${loads} KiB of JavaScript up front, its budget is ${budget} KiB`,
    );
  }
  for (const page of unbudgeted) {
    console.error(
      `[first-load] ${app}: no budget names ${page}: add one to apps/${app}/${BUDGET_FILE}`,
    );
  }
  if (over.length > 0) {
    console.error(
      `[first-load] what a page loads: node scripts/first-load.mjs --chunks ${app}; the rules: docs/specs/016-platform/web-performance.md "Every page has a budget"`,
    );
  }
  const holds = over.length === 0 && unbudgeted.length === 0;
  if (holds) console.log(`[first-load] ok: every ${app} page is within its budget`);
  return holds;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const named = args.filter((arg) => !arg.startsWith('--'));
  const rootFlag = args.find((arg) => arg.startsWith('--root='));
  const root = rootFlag ? resolve(rootFlag.slice('--root='.length)) : SCRIPT_ROOT;
  /** @param {string} app */
  const outOf = (app) => join(root, 'apps', app, 'out');
  const apps = (named.length > 0 ? named : APPS).filter((app) => existsSync(outOf(app)));
  if (apps.length === 0) {
    console.error(
      '[first-load] no export found: build an app first (pnpm --filter @livedoc/<app> build)',
    );
    process.exit(1);
  }
  if (flags.has('--check')) {
    const held = apps.map((app) => checkApp(root, app));
    process.exit(held.every(Boolean) ? 0 : 1);
  }
  if (flags.has('--chunks')) {
    for (const app of apps) {
      console.log(`\n${app}`);
      printTable(
        ['Script', 'gzip', 'Pages'],
        chunkRows(outOf(app))
          .slice(0, 40)
          .map((row) => [row.file, kib(row.gzip), String(row.pages)]),
      );
    }
  } else if (flags.has('--json')) {
    console.log(
      JSON.stringify(
        Object.fromEntries(apps.map((app) => [app, firstLoadRows(outOf(app))])),
        null,
        2,
      ),
    );
  } else {
    for (const app of apps) {
      console.log(`\n${app}`);
      printTable(
        ['Pages', 'JS', 'CSS', 'HTML'],
        firstLoadRows(outOf(app)).map((row) => [
          pagesLabel(row.pages),
          kib(row.js),
          kib(row.css),
          kib(row.html),
        ]),
      );
    }
  }
}
