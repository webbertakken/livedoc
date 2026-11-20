// The oracle corpus, held on every run (docs/specs/029-sheets/formulas.md "The oracle"): each case worked out by the
// engine agrees with the answer of its authority, every pair of sources agrees or names why not, and every answer
// belongs to a case.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heldAnswer, sameBlock, showBlock, unnamedDifferences } from './compare';
import { OracleCorpus, type OracleAnswers, type OracleCategory } from './corpus';
import { engineAnswers } from './oracle-engine';
import { FUNCTIONS } from '../formula/registry';

const ROOT = join(import.meta.dirname, '../../oracle');

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function categories(): OracleCategory[] {
  return readdirSync(join(ROOT, 'cases'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const read = OracleCorpus.readCategory(json(join(ROOT, 'cases', f)));
      if (!read.ok) throw new Error(`${f}: ${read.problems.join('; ')}`);
      expect(`${read.category.category}.json`).toBe(f);
      return read.category;
    });
}

function answers(source: OracleAnswers['source'], category: string): OracleAnswers | null {
  const file = join(ROOT, 'answers', source, `${category}.json`);
  let raw: unknown;
  try {
    raw = json(file);
  } catch {
    return null;
  }
  const read = OracleCorpus.readAnswers(raw);
  if (!read || read.category !== category || read.source !== source)
    throw new Error(`${file} is not ${source}'s answers to ${category}`);
  return read;
}

const corpus = categories();

describe('the oracle corpus', () => {
  it.each(corpus.map((c) => [c.category, c] as const))('%s: the engine agrees', (_, category) => {
    const google = answers('google', category.category);
    const libre = answers('libreoffice', category.category);
    const engine = engineAnswers(category);
    const failed: string[] = [];
    let provisional = 0;
    let awaiting = 0;
    for (const x of category.cases) {
      const held = heldAnswer(x, {
        ...(google?.answers[x.id] ? { google: google.answers[x.id] } : {}),
        ...(libre?.answers[x.id] ? { libreoffice: libre.answers[x.id] } : {}),
      });
      if (!held) {
        // LibreOffice answers otherwise than Google and no other answer is in yet: it waits for Google's. A
        // LibreOffice that has come to agree (a newer one) leaves the difference named for nothing.
        const libreAnswer = libre?.answers[x.id];
        const mine = engine.get(x.id)!;
        if (
          x.differs?.libreoffice &&
          libreAnswer &&
          mine.ok &&
          sameBlock(mine.answer, libreAnswer, x.tol)
        )
          failed.push(`${x.id}: LibreOffice now agrees; drop its differs`);
        else if (x.differs?.libreoffice) awaiting++;
        else failed.push(`${x.id}: unanswered`);
        continue;
      }
      if (held.provisional) provisional++;
      const mine = engine.get(x.id)!;
      if (!mine.ok) failed.push(`${x.id}: ${mine.why}`);
      else if (!sameBlock(mine.answer, held.answer, x.tol))
        failed.push(
          `${x.id} ${x.f}: engine=${showBlock(mine.answer)} ${held.source}=${showBlock(held.answer)}`,
        );
    }
    if (provisional > 0)
      console.info(`[sheets oracle] provisional ${category.category} ${provisional}`);
    if (awaiting > 0)
      console.info(`[sheets oracle] awaiting google ${category.category} ${awaiting}`);
    for (const f of failed) console.error(`[sheets oracle] failed ${f}`);
    expect(failed).toEqual([]);
  });

  it.each(corpus.map((c) => [c.category, c] as const))(
    '%s: the sources agree or name why not',
    (_, category) => {
      const google = answers('google', category.category);
      const libre = answers('libreoffice', category.category);
      const ids = new Set(category.cases.map((x) => x.id));
      const orphans = [google, libre].flatMap((a) =>
        Object.keys(a?.answers ?? {})
          .filter((id) => !ids.has(id))
          .map((id) => `${a!.source} answers ${id}, no case`),
      );
      const differences = category.cases.flatMap((x) =>
        unnamedDifferences(x, {
          ...(google?.answers[x.id] ? { google: google.answers[x.id] } : {}),
          ...(libre?.answers[x.id] ? { libreoffice: libre.answers[x.id] } : {}),
        }),
      );
      expect([...orphans, ...differences]).toEqual([]);
    },
  );
});

// The catalogue's categories whose boxes have landed (plan 0020 Phase 6): every function built in them is measured.
// The list grows by one with each category box, and holds every category by the end of the phase.
const MEASURED_CATEGORIES = [
  'Array',
  'Database',
  'Engineering',
  'Date',
  'Filter',
  'Financial',
  'Info',
  'Logical',
  'Lookup',
  'Math',
  'Operator',
  'Parser',
  'Text',
];

// A built catalogue row of formulas.md: its name and category.
function builtRows(): { name: string; category: string }[] {
  const spec = readFileSync(
    join(import.meta.dirname, '../../../../docs/specs/029-sheets/formulas.md'),
    'utf8',
  );
  const out: { name: string; category: string }[] = [];
  for (const line of spec.split('\n')) {
    const m = /^\| `([A-Z][A-Z0-9._]*)`\s*\| (\w[\w ]*?)\s*\|.*\| built\s*\|$/.exec(line);
    if (m) out.push({ name: m[1]!, category: m[2]! });
  }
  return out;
}

describe('the catalogue against the corpus', () => {
  it('measures every function built in a measured category', () => {
    const measured = new Set(
      corpus.flatMap((c) => c.cases.map((x) => x.id.split('.').slice(0, -1).join('.'))),
    );
    const rows = builtRows();
    expect(rows.length).toBeGreaterThan(100);
    const unmeasured = rows
      // A volatile function (NOW, RAND) is held by its own unit tests, never an oracle's answer: no two runs agree.
      .filter((r) => MEASURED_CATEGORIES.includes(r.category) && !measured.has(r.name))
      .filter((r) => !FUNCTIONS[r.name]?.volatile)
      .map((r) => `${r.category} ${r.name}`);
    expect(unmeasured).toEqual([]);
  });
});
