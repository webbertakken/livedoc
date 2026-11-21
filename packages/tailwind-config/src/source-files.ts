// The walk every static guard in this package shares: the files under a folder that are a site's own source, never
// its dependencies, build output, coverage or end-to-end suites.

import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Folders that are never source: dependencies, build and dev output, coverage, end-to-end suites. */
export const SKIPPED_FOLDERS: ReadonlySet<string> = new Set([
  'node_modules',
  '.next',
  '.next-dev',
  '.next-analyze',
  'out',
  'coverage',
  'e2e',
  '.turbo',
  'dist',
]);

/** A unit test or a type declaration: never held to a guard's rule. */
export const isTestOrDeclaration = (name: string): boolean =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || name.endsWith('.d.ts');

/** A TypeScript source file that is neither a test nor a declaration. */
export const isTypeScriptSource = (path: string): boolean =>
  /\.tsx?$/.test(path) && !isTestOrDeclaration(basename(path));

/** Every file under `dir` whose path `accept` takes, depth first, skipping the folders that are never source. */
export function listSourceFiles(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    // A file can vanish between the listing and the stat while other tasks run (a bundler's timestamped config, a
    // dev server's output); it was never source, so skip it rather than fail the walk.
    let isDir: boolean;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      return [];
    }
    if (isDir) return SKIPPED_FOLDERS.has(name) ? [] : listSourceFiles(path, accept);
    return accept(path) ? [path] : [];
  });
}
