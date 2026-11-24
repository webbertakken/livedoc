import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/035-pdf-documents/parity-matrix.md "Tests": every row reads one of the matrix's statuses, its status
// table counts the rows truly, the rows are the inventory's 403 topics, and every test a built row names exists. It
// reads the spec and the repo's files, so it lives beside the other repo-wide guards.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MATRIX = readFileSync(`${ROOT}docs/specs/035-pdf-documents/parity-matrix.md`, 'utf8');
/** The inventory's topics (docs/research/pdf-documents/acrobat-inventory.md). */
const TOPICS = 403;

/** Each status the table names, as the pattern a row's status cell matches. */
const STATUSES: Record<string, RegExp> = {
  '`specified`': /^specified(?: \(Phases? [\d, and]+\))?$/,
  '`specified, in part`': /^specified, in part(?: \(Phases? [\d, and]+\))?$/,
  '`left out (<ruling>)`': /^left out \((?:C4|F5|F10|F12|F14)\)$/,
  '`not a function`': /^not a function$/,
  '`built (<test>)`': /^built \(`[^)]+`\)$/,
  '`built, in part (<test>)`': /^built, in part \(`[^)]+`\)$/,
  '`built so far: <what> (<test>); the rest: Phase N`':
    /^built so far: [^(]+ \(`[^)]+`\); the rest: [^|]*Phases? \d[\d, and to]*$/,
};

/** The topic rows: every table row under a section of Adobe's, up to "Left out". */
function rows(): { topic: string; status: string }[] {
  const body = MATRIX.slice(MATRIX.indexOf('\n## '), MATRIX.indexOf('\n## Left out'));
  return body
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Topic') && !/^\| -/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());
      return { topic: cells[1]!, status: cells[4]! };
    });
}

/** The status table at the top: each status and the rows it claims. */
function claimed(): Map<string, number> {
  const table = MATRIX.slice(
    MATRIX.indexOf('| Status'),
    MATRIX.indexOf('\n\n', MATRIX.indexOf('| Status')),
  );
  return new Map(
    table
      .split('\n')
      .slice(2)
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .map((cells) => [cells[1]!, Number(cells[3])]),
  );
}

const statusOf = (status: string): string | undefined =>
  Object.keys(STATUSES).find((name) => STATUSES[name]!.test(status));

describe('the PDF parity matrix', () => {
  it('holds one row for each of the inventory’s topics', () => {
    expect(rows()).toHaveLength(TOPICS);
  });

  it('gives every row one of the statuses its table names', () => {
    const unnamed = rows().filter((row) => statusOf(row.status) === undefined);
    expect(unnamed).toEqual([]);
    expect([...claimed().keys()].toSorted()).toEqual(Object.keys(STATUSES).toSorted());
  });

  it('counts its rows truly in its status table', () => {
    const counted = new Map<string, number>();
    for (const row of rows()) {
      const status = statusOf(row.status)!;
      counted.set(status, (counted.get(status) ?? 0) + 1);
    }
    for (const status of Object.keys(STATUSES)) counted.set(status, counted.get(status) ?? 0);
    expect(counted).toEqual(claimed());
  });

  it('names only tests that exist, in every built row', () => {
    const files = new Set(
      execFileSync('git', ['ls-files', 'apps', 'packages'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .map((path) => basename(path)),
    );
    const named = rows()
      .filter((row) => row.status.startsWith('built'))
      .flatMap((row) => [...row.status.matchAll(/`([^`]+)`/g)].map((found) => found[1]!));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((test) => !files.has(test))).toEqual([]);
  });
});
