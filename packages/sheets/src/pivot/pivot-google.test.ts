// docs/specs/029-sheets/pivot-tables.md "The output" (D379): each evidence case's output, worked out here, is the
// output Google Sheets worked out for it (corpus/google/pivot-answers.json, made by CORPUS_SOURCE=google-pivots from
// corpus/pivot-cases.ts), both as the output alone and as the engine lays it into a sheet. Cases whose fields are
// formulas (calculated fields, custom summaries, custom formula filters, D600) are worked out by the engine alone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GETPIVOTDATA_PROBES,
  PIVOT_CASES,
  PIVOT_SOURCE_HEADER,
  PIVOT_SOURCE_ROWS,
} from '../../corpus/pivot-cases';
import { pivotOutput } from './pivot-output';
import { isoFromSerial } from '../dates';
import { casesInTheGrid, specOf } from '../testing/pivot-cases-book';
import { isError } from '../formula/values';
import type { PivotSource } from './pivot-spec';

const ANSWERS = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'corpus', 'google', 'pivot-answers.json'),
    'utf8',
  ),
) as Record<string, unknown[][]>;

const WITH_FORMULAS = new Set(['Calculated field', 'Custom summary', 'Filter by formula']);

const SOURCE: PivotSource = {
  header: PIVOT_SOURCE_HEADER,
  rows: PIVOT_SOURCE_ROWS.map((row) =>
    row.map((v, c) => ({
      v,
      shown: v === null ? '' : c === 2 ? isoFromSerial(v as number) : String(v),
    })),
  ),
};

// An output as Google answers it: blank as '', each row without its trailing blanks.
function asGoogle(rows: { v: unknown }[][]): unknown[][] {
  return rows.map((cells) => {
    const out = cells.map((c) => (c.v === null ? '' : c.v));
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  });
}

// Google's error answers read `#VALUE! (why)`; an error is compared by its code, as the words are each engine's own.
const asAnswer = (v: unknown, g: unknown) =>
  isError(v) && typeof g === 'string' && g.startsWith('#') ? [v.e, g.split(' ')[0]] : [v, g];

function close(ours: unknown[][], google: unknown[][]): void {
  expect(ours.length).toBe(google.length);
  ours.forEach((row, r) => {
    expect(row.length, `row ${r}`).toBe(google[r]!.length);
    row.forEach((v, c) => {
      const g = google[r]![c];
      if (typeof g === 'number' && typeof v === 'number')
        expect(Math.abs(v - g) / Math.max(1, Math.abs(g)), `${r},${c}`).toBeLessThan(1e-12);
      else {
        const [a, b] = asAnswer(v, g);
        expect(a, `${r},${c}`).toEqual(b);
      }
    });
  });
}

describe('pivotOutput against Google Sheets', () => {
  const cases = PIVOT_CASES.filter(({ title }) => ANSWERS[title] && !WITH_FORMULAS.has(title));
  it('covers every case Google made but those with formulas', () => {
    expect(cases.length).toBe(Object.keys(ANSWERS).length - WITH_FORMULAS.size);
  });
  it.each(cases.map((c) => [c.title, c.pivot] as const))(
    'lays out "%s" as Google does',
    (title, pivot) => {
      close(asGoogle(pivotOutput(SOURCE, specOf(pivot)).rows), ANSWERS[title]!);
    },
  );
});

// The source as a sheet (Sales, the dates formatted as dates), each case a sheet of its own titled as Google's, its
// pivot table that sheet's object by column id, and the GETPIVOTDATA probes, one a row, on Probes.

describe('pivot tables in the grid against Google Sheets', () => {
  const cases = PIVOT_CASES.filter(({ title }) => ANSWERS[title]);
  const made = casesInTheGrid();
  it('covers every case Google made', () => {
    expect(cases.length).toBe(Object.keys(ANSWERS).length);
  });
  it.each(cases.map((c) => [c.title] as const))(
    'lays out "%s" in a sheet as Google does',
    (title) => {
      close(asGoogle(made.grid(title)), ANSWERS[title]!);
    },
  );
});

const PROBED = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'corpus', 'google', 'getpivotdata-answers.json'),
    'utf8',
  ),
) as Record<string, unknown>;

describe('GETPIVOTDATA against Google Sheets', () => {
  const made = casesInTheGrid();
  it('covers every probe Google answered', () => {
    expect(Object.keys(PROBED)).toEqual([...GETPIVOTDATA_PROBES]);
  });
  it.each(GETPIVOTDATA_PROBES.map((p, i) => [p, i] as const))(
    'answers %s as Google does',
    (probe, i) => {
      const ours = made.v(`A${i + 1}`, 'Probes');
      close([[ours]], [[PROBED[probe]]]);
      // GETPIVOTDATA's own refusals in Google's words.
      const answer = PROBED[probe];
      if (isError(ours) && ours.e === '#REF!') expect(`${ours.e} (${ours.why})`).toBe(answer);
    },
  );
});
