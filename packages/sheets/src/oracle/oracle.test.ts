// The oracle corpus, held on every run (docs/specs/029-sheets/formulas.md "The oracle"): each case worked out by the
// engine agrees with the answer of its authority, every pair of sources agrees or names why not, and every answer
// belongs to a case.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heldAnswer, sameBlock, showBlock, unnamedDifferences } from './compare';
import { OracleCorpus, type OracleAnswers, type OracleCategory } from './corpus';
import { engineAnswers } from './oracle-engine';

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
        // LibreOffice answers otherwise than Google and no other answer is in yet: it waits for Google's.
        if (x.differs?.libreoffice) awaiting++;
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
