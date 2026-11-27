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

it(`makes the corpus's ${SOURCE} files`, async () => {
  if (SOURCE === 'excel') await excel();
  else if (SOURCE === 'google') await google();
  else if (SOURCE === 'google-chips') await googleChips();
  else libreOffice();
});
