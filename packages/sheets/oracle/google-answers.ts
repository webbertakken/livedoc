// Google Sheets' answers to a category (docs/specs/029-sheets/formulas.md "The oracle", Google's answers through
// Drive): its workbook uploaded as an .xlsx converted to a Google Sheet in the category's locale and UTC, exported as
// .xlsx and its answers read from it (Google's .ods export writes booleans as numbers and newer functions as #NAME?);
// the Drive file deleted whatever happened.
import { readXlsx } from '../src/files/xlsx-read';
import { writeXlsx } from '../src/files/xlsx-write';
import type { OracleCategory } from '../src/oracle/corpus';
import { answersOf, oracleFile, type FileAnswers } from '../src/oracle/oracle-file';
import { XLSX_MIME, type OracleDrive } from './google-drive.ts';

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
  const xlsx = await readXlsx(await drive.exportAs(id, XLSX_MIME), category.locale);
  if (!xlsx.ok) return { answers: {}, problems: [`the .xlsx export: ${xlsx.rejection}`] };
  return answersOf(category, xlsx.file);
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
