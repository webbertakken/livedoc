// Makes a source's answers to the oracle corpus (docs/specs/029-sheets/formulas.md "The oracle"). Run by
// `pnpm --filter @livedoc/sheets oracle:libreoffice` (LibreOffice headless) or `oracle:google --from <dir>` (the
// categories' workbooks as Google Sheets downloaded them, `<Category>.ods`). Never in CI's unit run.
// ORACLE_CATEGORY=<name> makes one category's only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import { it } from 'vitest';
import { readOds } from '../src/files/ods-read';
import { writeFlatOds } from '../src/files/ods-write';
import { OracleCorpus, type OracleAnswers, type OracleCategory } from '../src/oracle/corpus';
import { answersOf, oracleFile } from '../src/oracle/oracle-file';

const ROOT = import.meta.dirname;
const SOURCE = process.env.ORACLE_SOURCE === 'google' ? 'google' : 'libreoffice';
const FROM = process.env.ORACLE_FROM;
const ONLY = process.env.ORACLE_CATEGORY;
const today = new Date().toISOString().slice(0, 10);

function categories(): OracleCategory[] {
  return readdirSync(join(ROOT, 'cases'))
    .filter((f) => f.endsWith('.json') && (!ONLY || f === `${ONLY}.json`))
    .map((f) => {
      const read = OracleCorpus.readCategory(
        JSON.parse(readFileSync(join(ROOT, 'cases', f), 'utf8')),
      );
      if (!read.ok) throw new Error(`${f}: ${read.problems.join('; ')}`);
      return read.category;
    });
}

function libreOfficeVersion(): string {
  return execFileSync(process.env.SOFFICE ?? 'soffice', ['--version'], { encoding: 'utf8' })
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

async function answered(category: OracleCategory, by: string): Promise<OracleAnswers> {
  const started = Date.now();
  let bytes: Uint8Array<ArrayBuffer>;
  if (SOURCE === 'google') {
    if (!FROM) throw new Error(`oracle:google needs ORACLE_FROM, the folder of Google's downloads`);
    bytes = new Uint8Array(readFileSync(join(FROM, `${category.category}.ods`)));
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'sheets-oracle-'));
    const source = join(dir, `${category.category}.fods`);
    const written = writeFlatOds(oracleFile(category), `Oracle ${category.category}`);
    if (written.losses.length > 0)
      throw new Error(`${category.category}: unwritten ${JSON.stringify(written.losses)}`);
    writeFileSync(source, written.data);
    bytes = new Uint8Array(
      libreOfficeConvert(source, 'ods', {
        recalculate: true,
        locale: category.locale,
      }),
    );
  }
  const read = await readOds(bytes);
  if (!read.ok) throw new Error(`${category.category}: ${read.rejection}`);
  const { answers, problems } = answersOf(category, read.file);
  if (problems.length > 0) throw new Error(`${category.category}: ${problems.join('; ')}`);
  console.info(
    `[sheets oracle] ${SOURCE} ${category.category} cases=${category.cases.length} ` +
      `answered=${Object.keys(answers).length} ms=${Date.now() - started}`,
  );
  return { source: SOURCE, category: category.category, by, made: today, answers };
}

it(`makes ${SOURCE}'s answers`, { timeout: 600_000 }, async () => {
  const by = SOURCE === 'google' ? 'Google Sheets' : libreOfficeVersion();
  for (const category of categories()) {
    // Written whole per category, and only once every case is answered.
    const answers = await answered(category, by);
    const path = join(ROOT, 'answers', SOURCE, `${category.category}.json`);
    writeFileSync(path, `${JSON.stringify(answers, null, 2)}\n`);
  }
});
