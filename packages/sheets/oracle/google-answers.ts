// Google Sheets' answers to a category (docs/specs/029-sheets/formulas.md "The oracle", Google's answers through
// Drive): its workbook uploaded as an .xlsx converted to a Google Sheet in the category's locale and UTC, exported as
// .ods and .xlsx, the answers read from the .ods and the .xlsx's held to them; the Drive file deleted whatever happened.
import { readOds } from '../src/files/ods-read';
import { readXlsx } from '../src/files/xlsx-read';
import { writeXlsx } from '../src/files/xlsx-write';
import { sameBlock, showBlock } from '../src/oracle/compare';
import type { OracleCategory } from '../src/oracle/corpus';
import { answersOf, oracleFile, type FileAnswers } from '../src/oracle/oracle-file';
import { ODS_MIME, XLSX_MIME, type OracleDrive } from './google-drive.ts';

// UTC as the Sheets API names it (CLDR's), no daylight saving.
export const ORACLE_TIME_ZONE = 'Etc/GMT';

/** A BCP 47 tag as the Sheets API takes a locale: `en-US` is `en_US`. */
export function sheetsLocale(tag: string): string {
  return tag.replaceAll('-', '_');
}

async function exportedAnswers(
  category: OracleCategory,
  drive: OracleDrive,
  id: string,
): Promise<FileAnswers> {
  const ods = await readOds(await drive.exportAs(id, ODS_MIME));
  const xlsx = await readXlsx(await drive.exportAs(id, XLSX_MIME), category.locale);
  if (!ods.ok) return { answers: {}, problems: [`the .ods export: ${ods.rejection}`] };
  if (!xlsx.ok) return { answers: {}, problems: [`the .xlsx export: ${xlsx.rejection}`] };
  const fromOds = answersOf(category, ods.file);
  const fromXlsx = answersOf(category, xlsx.file);
  const problems = [...fromOds.problems, ...fromXlsx.problems.map((p) => `xlsx ${p}`)];
  for (const [caseId, answer] of Object.entries(fromOds.answers)) {
    const other = fromXlsx.answers[caseId];
    if (other && !sameBlock(answer, other))
      problems.push(`${caseId}: ods=${showBlock(answer)} xlsx=${showBlock(other)}`);
  }
  return { answers: fromOds.answers, problems };
}

export async function googleAnswers(
  category: OracleCategory,
  drive: OracleDrive,
): Promise<FileAnswers> {
  const name = `Oracle ${category.category}`;
  const written = writeXlsx(oracleFile(category), name);
  if (written.losses.length > 0)
    return { answers: {}, problems: [`unwritten ${JSON.stringify(written.losses)}`] };
  const id = await drive.uploadAsSheet(name, written.data, XLSX_MIME);
  let answered: FileAnswers;
  try {
    await drive.setLocale(id, sheetsLocale(category.locale), ORACLE_TIME_ZONE);
    answered = await exportedAnswers(category, drive, id);
  } catch (err) {
    const removed = await drive.remove(id).then(
      () => '',
      (e: unknown) => ` (and deleting ${id}: ${(e as Error).message})`,
    );
    (err as Error).message += removed;
    throw err;
  }
  await drive.remove(id).catch((e: unknown) => {
    answered.problems.push(`deleting ${id}: ${(e as Error).message}`);
  });
  return answered;
}
