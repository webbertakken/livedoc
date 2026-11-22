import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/035-pdf-documents/security.md "The boundary": a PDF is read, drawn and written through the engine's one
// interface, so the surface, the api and the CLI never name the library beneath it. This guard reads every source
// file of the repository, so it lives beside the other repo-wide guards: a library’s name outside the engine’s own
// folder is a way round the interface.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Where the libraries may be named: the engine, the fixtures tests make files with, and what lists what ships. */
const ALLOWED = [
  'packages/pdf-documents/src/engine/',
  'packages/pdf-documents/src/testing/',
  'packages/pdf-documents/package.json',
  // The corpus names where its files came from: other software's test files, never code (corpus/README.md).
  'packages/pdf-documents/corpus/',
  // The licences page names every work that ships, and the texts it shows (third-party-licences.md).
  'packages/licences/',
  // The measure reads the engine's binary by its file's name in the export (performance.md "How it is measured").
  'apps/live/scripts/pdf-document-measure.mjs',
  'apps/help/lib/pdf-engine-boundary.test.ts',
];

function sourcesNaming(pattern: string): string[] {
  let out = '';
  try {
    out = execFileSync(
      'git',
      [
        'grep',
        '--untracked',
        '-I',
        '-i',
        '-l',
        '-E',
        '-e',
        pattern,
        '--',
        'apps',
        'packages',
        'scripts',
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  return out
    .split('\n')
    .filter((path) => path !== '' && !path.endsWith('.md'))
    .filter((path) => !ALLOWED.some((allowed) => path.startsWith(allowed)));
}

describe('the engine’s boundary', () => {
  it('keeps the reader’s and the writer’s names inside the engine', () => {
    expect(sourcesNaming('pdfium|libpdf')).toEqual([]);
  });

  it('keeps the names of what reads a signature’s bytes inside the engine', () => {
    expect(sourcesNaming('pkijs|asn1js')).toEqual([]);
  });

  it('finds a name where one is', () => {
    // The guard itself reads the tree: a pattern that matched nothing anywhere would pass for the wrong reason.
    const inside = execFileSync(
      'git',
      ['grep', '--untracked', '-I', '-i', '-l', '-E', '-e', 'pdfium|libpdf', '--', 'packages'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    expect(inside).toContain('packages/pdf-documents/src/engine/reader.ts');
  });
});
