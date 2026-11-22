import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Limits": every limit is a named constant, and the
// spec's table is where its value is decided. This guard holds each constant in the code to the table, so a number
// changed in one place alone fails here. It reads a spec and every source, so it lives beside the repo-wide guards.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Limits the table decides for what is not built yet: none may be in the code until its phase takes it off here. */
const NOT_BUILT: Record<string, string> = {
  PDF_INLINE_MAX_BYTES: 'pictures a change brings (marks and objects)',
  PDF_SEARCH_TEXT_MAX_CHARS: 'the file’s search text (the engine in the api Worker)',
  PDF_PRESENCE_FRESH_MS: 'a selection’s name label (reading)',
};

/** The table's rows: each constant and its value. */
function specLimits(): Map<string, number> {
  const spec = readFileSync(
    `${ROOT}docs/specs/035-pdf-documents/live-editing-and-storage.md`,
    'utf8',
  );
  const table = spec.slice(spec.indexOf('\n## Limits'), spec.indexOf('\n## Share roles'));
  return new Map(
    [...table.matchAll(/^\| `([A-Z][A-Z_]+)`\s*\| ([\d,]+)\s*\|/gm)].map((row) => [
      row[1]!,
      Number(row[2]!.replaceAll(',', '')),
    ]),
  );
}

/**
 * Every number the code declares as a constant, by its name: one read of the sources for them all, since each
 * read walks the whole working tree.
 */
function declaredNumbers(): Map<string, number[]> {
  let out = '';
  try {
    out = execFileSync(
      'git',
      [
        'grep',
        '--untracked',
        '-h',
        '-E',
        '-e',
        '^export const [A-Z][A-Z_]+ = [0-9_]+;',
        '--',
        'apps/*.ts',
        'packages/*.ts',
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  const declared = new Map<string, number[]>();
  for (const line of out.split('\n')) {
    const found = /^export const ([A-Z_]+) = ([0-9_]+);/.exec(line);
    if (!found) continue;
    const values = declared.get(found[1]!) ?? [];
    values.push(Number(found[2]!.replaceAll('_', '')));
    declared.set(found[1]!, values);
  }
  return declared;
}

describe('a PDF’s limits', () => {
  const limits = specLimits();
  const declared = declaredNumbers();
  /** Every value the code gives a constant of that name: one, unless it is declared twice. */
  const codeValues = (name: string): number[] => declared.get(name) ?? [];

  it('are read from the spec’s table', () => {
    expect(limits.size).toBeGreaterThanOrEqual(18);
    expect(limits.get('PDF_LIVE_CHANGES_MAX_BYTES')).toBe(4_194_304);
  });

  it('have the spec’s value in the code, each declared once', () => {
    const built = [...limits].filter(([name]) => !(name in NOT_BUILT));
    expect(built.map(([name]) => [name, codeValues(name)])).toEqual(
      built.map(([name, value]) => [name, [value]]),
    );
  });

  it('are not in the code before the phase that builds them', () => {
    for (const name of Object.keys(NOT_BUILT)) expect(limits.has(name), name).toBe(true);
    expect(Object.keys(NOT_BUILT).filter((name) => codeValues(name).length > 0)).toEqual([]);
  });
});
