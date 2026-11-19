// The modules of a bundle `wrangler deploy --dry-run --outdir` wrote, listed as Miniflare takes them
// (scripts/e2e-api.mjs, docs/specs/003-system-architecture/e2e-smoke.md "The api worker"): the entry script first,
// each other file typed by the first of wrangler's module rules whose `**/*.ext` glob its name meets. A file no
// rule names (the source map, a README) is not a module. Type-only TypeScript, which Node runs as is.

import { readdirSync } from 'node:fs';
import path from 'node:path';

export type ModuleRule = { type: string; include: string[] };
export type BundleModule = { type: string; path: string };

// The extension a `**/*.ext` glob names (a `?module` suffix aside), or null for any other glob.
function extensionOf(glob: string): string | null {
  return /^\*\*\/\*(\.[\w-]+)$/.exec(glob.replace(/\?module$/, ''))?.[1] ?? null;
}

export function moduleTypeOf(file: string, rules: readonly ModuleRule[]): string | null {
  if (/\.m?js$/.test(file)) return 'ESModule';
  const rule = rules.find((r) =>
    r.include.some((glob) => {
      const ext = extensionOf(glob);
      return ext !== null && file.endsWith(ext);
    }),
  );
  return rule?.type ?? null;
}

export function listModules(
  files: readonly string[],
  rules: readonly ModuleRule[],
  entry = 'index.js',
): { type: string; file: string }[] {
  return [entry, ...files.filter((file) => file !== entry)].flatMap((file) => {
    const type = moduleTypeOf(file, rules);
    return type === null ? [] : [{ type, file }];
  });
}

export function bundleModules(dir: string, rules: readonly ModuleRule[]): BundleModule[] {
  return listModules(readdirSync(dir), rules).map(({ type, file }) => ({
    type,
    path: path.join(dir, file),
  }));
}
