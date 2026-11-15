import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  budgetReport,
  firstLoadRows,
  pageName,
  referencedAssets,
} from '../../../scripts/first-load.mjs';

// docs/specs/016-platform/web-performance.md "Measuring" and "Every page has a budget".
describe('first-load', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function exportOf(files: Record<string, string | Buffer>): string {
    const root = mkdtempSync(join(tmpdir(), 'first-load-'));
    dir = root;
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), body);
    }
    return root;
  }

  const script = (name: string) =>
    `<script src="/live/_next/static/chunks/${name}" async=""></script>`;
  const gzip = (body: Buffer) => gzipSync(body, { level: 9 }).length;

  describe('referencedAssets', () => {
    it('finds the build scripts and stylesheets a page loads, once each, whatever their prefix', () => {
      const html = [
        '<link rel="stylesheet" href="/live/_next/static/chunks/a.css" data-precedence="next"/>',
        '<link rel="preload" as="script" href="/live/_next/static/chunks/b.js"/>',
        script('b.js'),
        script('b.js'),
        '<script src="/_next/static/chunks/c.js?dpl=1" async=""></script>',
        '<script src="https://accounts.google.com/gsi/client"></script>',
        '<script>self.__next_f.push([1,"/_next/static/chunks/d.js"])</script>',
      ].join('');

      expect(referencedAssets(html)).toEqual({
        scripts: ['/_next/static/chunks/c.js', '/live/_next/static/chunks/b.js'],
        styles: ['/live/_next/static/chunks/a.css'],
      });
    });
  });

  describe('pageName', () => {
    it('names a page by the path it is served at', () => {
      expect(pageName('index.html')).toBe('/');
      expect(pageName('explorer/home.html')).toBe('/explorer/home');
      expect(pageName('about/index.html')).toBe('/about');
      expect(pageName('404.html')).toBe('/404');
    });
  });

  describe('firstLoadRows', () => {
    it('sums the gzipped scripts of each page, sharing a row between pages that load the same files', () => {
      const shared = randomBytes(4096);
      const editor = randomBytes(8192);
      const root = exportOf({
        '_next/static/chunks/shared.js': shared,
        '_next/static/chunks/editor.js': editor,
        'sign-in.html': `<html>${script('shared.js')}</html>`,
        'join.html': `<html>${script('shared.js')}</html>`,
        'document/placeholder.html': `<html>${script('shared.js')}${script('editor.js')}</html>`,
        // A page inside the build folder is an asset, not a page.
        '_next/static/chunks/not-a-page.html': '<html></html>',
      });

      const rows = firstLoadRows(root);

      expect(rows.map((row) => [row.pages, row.js])).toEqual([
        [['/document/placeholder'], gzip(shared) + gzip(editor)],
        [['/join', '/sign-in'], gzip(shared)],
      ]);
    });

    it('counts a script the export does not hold as nothing, rather than failing', () => {
      const root = exportOf({ 'index.html': `<html>${script('gone.js')}</html>` });

      expect(firstLoadRows(root)[0]?.js).toBe(0);
    });
  });

  describe('the budget files', () => {
    const APPS = ['live', 'marketing', 'help', 'telemetry'];
    const budgetsOf = (app: string) =>
      (
        JSON.parse(
          readFileSync(join(__dirname, '..', '..', app, 'first-load-budget.json'), 'utf8'),
        ) as { budgets: { page: string; kib: number }[] }
      ).budgets;

    it('give every app with pages a budget for each page, the last one for any page', () => {
      for (const app of APPS) {
        const budgets = budgetsOf(app);
        expect(budgets.length, app).toBeGreaterThan(0);
        for (const { page, kib } of budgets) {
          expect(() => new RegExp(page), `${app}: ${page}`).not.toThrow();
          expect(kib, `${app}: ${page}`).toBeGreaterThan(0);
        }
        expect(budgets.at(-1)?.page, app).toBe('.');
      }
    });

    it('check each app’s export as part of its build', () => {
      for (const app of APPS) {
        const { scripts } = JSON.parse(
          readFileSync(join(__dirname, '..', '..', app, 'package.json'), 'utf8'),
        ) as { scripts: { build: string } };
        expect(scripts.build, app).toContain(`first-load.mjs --check ${app}`);
      }
    });
  });

  describe('budgetReport', () => {
    const KIB = 1024;
    const rows = [
      { pages: ['/document/placeholder', '/embed'], js: 1300 * KIB },
      { pages: ['/explorer/home'], js: 600 * KIB },
      { pages: ['/sign-in'], js: 380 * KIB },
    ];

    it('passes pages at or under the first budget that names them', () => {
      const budgets = [
        { page: '^/(document|embed)(/|$)', kib: 1300 },
        { page: '^/explorer/', kib: 650 },
        { page: '.', kib: 400 },
      ];

      expect(budgetReport(rows, budgets)).toEqual({ over: [], unbudgeted: [] });
    });

    it('names every page over its budget, with what it loads and what it may', () => {
      const budgets = [
        { page: '^/explorer/', kib: 550 },
        { page: '.', kib: 1299 },
      ];

      expect(budgetReport(rows, budgets).over).toEqual([
        { page: '/document/placeholder', kib: 1300, budget: 1299 },
        { page: '/embed', kib: 1300, budget: 1299 },
        { page: '/explorer/home', kib: 600, budget: 550 },
      ]);
    });

    it('names a page no budget covers, so a new page cannot ship without one', () => {
      const budgets = [{ page: '^/explorer/', kib: 650 }];

      expect(budgetReport(rows, budgets).unbudgeted).toEqual([
        '/document/placeholder',
        '/embed',
        '/sign-in',
      ]);
    });
  });
});
