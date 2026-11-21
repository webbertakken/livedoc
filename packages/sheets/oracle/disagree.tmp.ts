import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { heldAnswer, sameBlock, showBlock, unnamedDifferences } from '../src/oracle/compare.ts';
import { OracleCorpus } from '../src/oracle/corpus.ts';
import { engineAnswers } from '../src/oracle/oracle-engine.ts';

const out: Record<string, unknown>[] = [];
for (const f of readdirSync('oracle/cases').sort()) {
  const read = OracleCorpus.readCategory(JSON.parse(readFileSync(`oracle/cases/${f}`, 'utf8')));
  if (!read.ok) throw new Error(f);
  const cat = read.category;
  const ans = (s: string) => {
    try { return JSON.parse(readFileSync(`oracle/answers/${s}/${f}`, 'utf8')).answers; } catch { return {}; }
  };
  const g = ans('google'), l = ans('libreoffice');
  const engine = engineAnswers(cat);
  for (const x of cat.cases) {
    const a = { ...(g[x.id] ? { google: g[x.id] } : {}), ...(l[x.id] ? { libreoffice: l[x.id] } : {}) };
    const held = heldAnswer(x, a);
    const mine = engine.get(x.id)!;
    const engineFails = held && (!mine.ok || !sameBlock(mine.answer, held.answer, x.tol));
    const unnamed = unnamedDifferences(x, a);
    if (!engineFails && unnamed.length === 0) continue;
    out.push({
      cat: cat.category, id: x.id, f: x.f, authority: x.authority,
      engine: mine.ok ? showBlock(mine.answer) : `!${mine.why}`,
      google: g[x.id] ? showBlock(g[x.id]) : undefined,
      libre: l[x.id] ? showBlock(l[x.id]) : undefined,
      cited: x.expect ? showBlock(x.expect) : undefined,
      held: held?.source, engineFails: !!engineFails, unnamed: unnamed.length > 0,
      differs: x.differs,
    });
  }
}
writeFileSync('/tmp/gbox/s2/disagreements.json', JSON.stringify(out, null, 1));
console.log('rows', out.length, 'engine', out.filter((r) => r.engineFails).length, 'unnamed', out.filter((r) => r.unnamed).length);
