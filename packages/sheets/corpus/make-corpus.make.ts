// Makes the corpus of other suites' files (docs/specs/029-sheets/standard-mapping.md "The corpus", D119). Run by
// `pnpm --filter @livedoc/sheets corpus:make` with CORPUS_SOURCE=excel (Apache POI's test data, at a pinned commit),
// libreoffice (each Excel file saved by LibreOffice; SOFFICE names it) or google (through the oracle's Drive, with the
// token oracle:google:consent saved); google-chips makes Google's smart chips the same way (docs/specs/029-sheets/
// inserted-objects.md "Smart chips"). Never in CI's unit run.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import { it } from 'vitest';
import { writeXlsx } from '../src/files/xlsx-write';
import { googleDrive } from '../oracle/google-access.ts';
import { ODS_MIME, XLSX_MIME } from '../oracle/google-drive.ts';
import { CORPUS, GOOGLE_FUNCTIONS, POI_COMMIT, SMART_CHIPS } from './corpus-files';
import { PIVOT_CASES, PIVOT_SOURCE_HEADER, PIVOT_SOURCE_ROWS } from './pivot-cases';

const ROOT = import.meta.dirname;
const SOURCE = process.env.CORPUS_SOURCE ?? 'libreoffice';

function write(folder: string, name: string, bytes: Uint8Array): void {
  mkdirSync(join(ROOT, folder), { recursive: true });
  writeFileSync(join(ROOT, folder, name), bytes);
  console.info(`[sheets corpus] ${folder}/${name} bytes=${bytes.byteLength}`);
}

async function excel(): Promise<void> {
  for (const file of CORPUS.excel) {
    const url = `https://raw.githubusercontent.com/apache/poi/${POI_COMMIT}/test-data/spreadsheet/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    write('excel', file, new Uint8Array(await res.arrayBuffer()));
  }
}

function libreOffice(): void {
  const by = execFileSync(process.env.SOFFICE ?? 'soffice', ['--version'], { encoding: 'utf8' });
  console.info(`[sheets corpus] by ${by.trim()}`);
  for (const file of CORPUS.excel) {
    const base = file.replace(/\.xlsx$/, '');
    write('libreoffice', `${base}.ods`, libreOfficeConvert(join(ROOT, 'excel', file), 'ods'));
    if (!(CORPUS.libreofficeXlsx as readonly string[]).includes(file)) continue;
    // Saved as Excel by LibreOffice: a copy of its own first, so the name it writes is the file's.
    const dir = mkdtempSync(join(tmpdir(), 'sheets-corpus-'));
    const own = join(dir, `${base}.ods`);
    writeFileSync(own, readFileSync(join(ROOT, 'libreoffice', `${base}.ods`)));
    write('libreoffice', `${base}.xlsx`, libreOfficeConvert(own, 'xlsx'));
  }
}

async function google(): Promise<void> {
  const drive = await googleDrive();
  const sources: [string, Uint8Array][] = [
    ...CORPUS.google.map((file): [string, Uint8Array] => [
      file.replace(/\.xlsx$/, ''),
      readFileSync(join(ROOT, 'excel', file)),
    ]),
    ['google-functions', writeXlsx(GOOGLE_FUNCTIONS, 'Google functions').data],
  ];
  for (const [base, bytes] of sources) {
    const id = await drive.uploadAsSheet(`LiveDoc corpus ${base}`, bytes, XLSX_MIME);
    try {
      write('google', `${base}.xlsx`, await drive.exportAs(id, XLSX_MIME));
      write('google', `${base}.ods`, await drive.exportAs(id, ODS_MIME));
    } finally {
      await drive.remove(id);
    }
  }
}

// Google's smart chips (C3: left out, kept as their text): a sheet added with a person chip and a file chip, which
// only Google can make, exported in both formats.
async function googleChips(): Promise<void> {
  const drive = await googleDrive();
  const id = await drive.uploadAsSheet(
    'LiveDoc corpus smart-chips',
    writeXlsx(SMART_CHIPS, 'Chips').data,
    XLSX_MIME,
  );
  try {
    const chip = (text: string, chip: unknown) => ({
      userEnteredValue: { stringValue: text },
      chipRuns: [{ startIndex: text.indexOf('@'), chip }],
    });
    await drive.update(id, [
      { addSheet: { properties: { sheetId: 1000, title: 'Chips' } } },
      {
        updateCells: {
          start: { sheetId: 1000, rowIndex: 0, columnIndex: 0 },
          rows: [
            {
              values: [
                { userEnteredValue: { stringValue: 'Owner' } },
                { userEnteredValue: { stringValue: 'Spec' } },
              ],
            },
            {
              values: [
                chip('@', { personProperties: { email: 'ada@example.com' } }),
                chip('See @', {
                  richLinkProperties: { uri: `https://docs.google.com/spreadsheets/d/${id}/edit` },
                }),
              ],
            },
          ],
          fields: 'userEnteredValue,chipRuns',
        },
      },
    ]);
    write('google', 'smart-chips.xlsx', await drive.exportAs(id, XLSX_MIME));
    write('google', 'smart-chips.ods', await drive.exportAs(id, ODS_MIME));
  } finally {
    await drive.remove(id);
  }
}

// Google's pivot tables (pivot-tables.md): the source written to a sheet of its own, then each case's pivot table on a
// sheet of its own at A1, one request each so a case Google refuses is named and the rest still made; exported in both
// formats.
async function googlePivots(): Promise<void> {
  const drive = await googleDrive();
  const id = await drive.uploadAsSheet(
    'LiveDoc corpus pivot-tables',
    writeXlsx(SMART_CHIPS, 'Pivots').data,
    XLSX_MIME,
  );
  const SOURCE_ID = 2000;
  const cell = (v: string | number | null) =>
    v === null
      ? {}
      : typeof v === 'number'
        ? { userEnteredValue: { numberValue: v } }
        : { userEnteredValue: { stringValue: v } };
  try {
    await drive.update(id, [
      { addSheet: { properties: { sheetId: SOURCE_ID, title: 'Sales' } } },
      {
        updateCells: {
          start: { sheetId: SOURCE_ID, rowIndex: 0, columnIndex: 0 },
          rows: [PIVOT_SOURCE_HEADER, ...PIVOT_SOURCE_ROWS].map((row) => ({
            values: row.map(cell),
          })),
          fields: 'userEnteredValue',
        },
      },
      {
        repeatCell: {
          range: { sheetId: SOURCE_ID, startColumnIndex: 2, endColumnIndex: 3, startRowIndex: 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
    ]);
    const source = {
      sheetId: SOURCE_ID,
      startRowIndex: 0,
      endRowIndex: PIVOT_SOURCE_ROWS.length + 1,
      startColumnIndex: 0,
      endColumnIndex: PIVOT_SOURCE_HEADER.length,
    };
    const made: string[] = [];
    for (const [i, { title, pivot }] of PIVOT_CASES.entries()) {
      const sheetId = 3000 + i;
      try {
        await drive.update(id, [
          { addSheet: { properties: { sheetId, title } } },
          {
            updateCells: {
              start: { sheetId, rowIndex: 0, columnIndex: 0 },
              rows: [{ values: [{ pivotTable: { source, ...pivot } }] }],
              fields: 'pivotTable',
            },
          },
        ]);
        made.push(title);
        console.info(`[sheets corpus] pivot "${title}" made`);
      } catch (e) {
        console.error(`[sheets corpus] pivot "${title}" refused: ${(e as Error).message}`);
      }
    }
    // Each case's output as Google works it out (an export alone leaves most of them empty).
    const values = await drive.values(
      id,
      made.map((title) => `'${title}'!A1:Z60`),
    );
    const answers = Object.fromEntries(made.map((title, i) => [title, values[i]]));
    write(
      'google',
      'pivot-answers.json',
      new TextEncoder().encode(`${JSON.stringify(answers, null, 1)}\n`),
    );
    write('google', 'pivot-tables.xlsx', await drive.exportAs(id, XLSX_MIME));
    write('google', 'pivot-tables.ods', await drive.exportAs(id, ODS_MIME));
  } finally {
    await drive.remove(id);
  }
}

it(`makes the corpus's ${SOURCE} files`, async () => {
  if (SOURCE === 'excel') await excel();
  else if (SOURCE === 'google') await google();
  else if (SOURCE === 'google-chips') await googleChips();
  else if (SOURCE === 'google-pivots') await googlePivots();
  else libreOffice();
});
