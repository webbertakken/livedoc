import { FakeGoogle, type Convert } from '@livedoc/fake-google';
import { describe, expect, it } from 'vitest';
import type { FileValue } from '../src/files/workbook-file';
import { writeOds } from '../src/files/ods-write';
import { readXlsx } from '../src/files/xlsx-read';
import { writeXlsx } from '../src/files/xlsx-write';
import {
  ORACLE_CASES_SHEET,
  OracleLayout,
  type OracleCategory,
  type OracleValue,
} from '../src/oracle/corpus';
import { engineAnswers } from '../src/oracle/oracle-engine';
import { googleAnswers, ORACLE_TIME_ZONE, sheetsLocale } from './google-answers.ts';
import { ODS_MIME, oracleDrive, type OracleDrive } from './google-drive.ts';

// formulas.md "The oracle", Google's answers through Drive: a fake Drive whose conversion works the workbook out with
// LiveDoc's own engine, as Google would with its own.

const CATEGORY: OracleCategory = {
  category: 'Probe',
  locale: 'en-US',
  data: [
    [1, 2],
    [3, 'x'],
  ],
  cases: [
    { id: 'SUM.1', f: '=SUM(Data!A1:B2)', rows: 1, cols: 1, authority: 'google' },
    { id: 'SEQUENCE.1', f: '=SEQUENCE(2)', rows: 2, cols: 1, authority: 'google' },
    { id: 'TEXT.1', f: '=Data!B2&"y"', rows: 1, cols: 1, authority: 'google' },
    { id: 'TRUE.1', f: '=Data!A1<2', rows: 1, cols: 1, authority: 'google' },
    { id: 'DIV.1', f: '=1/0', rows: 1, cols: 1, authority: 'google' },
  ],
};

function fileValue(v: OracleValue): FileValue | undefined {
  if (v === null) return undefined;
  if (typeof v === 'number') return { k: 'n', v };
  if (typeof v === 'string') return { k: 's', v };
  if (typeof v === 'boolean') return { k: 'b', v };
  return { k: 'e', v: v.e as Extract<FileValue, { k: 'e' }>['v'] };
}

/** Google's conversion, as LiveDoc's engine works it out; `tamper` changes what one export says. */
function workedOut(
  category: OracleCategory,
  tamper: (toMime: string, at: { id: string; v: OracleValue }) => OracleValue = (_, at) => at.v,
): Convert {
  return async (bytes, toMime) => {
    const read = await readXlsx(new Uint8Array(bytes));
    if (!read.ok) throw new Error(read.rejection);
    const sheet = read.file.sheets.find((s) => s.name === ORACLE_CASES_SHEET)!;
    const answers = engineAnswers(category);
    for (const b of OracleLayout.blocks(category)) {
      const answer = answers.get(b.id);
      if (!answer?.ok) continue;
      answer.answer.forEach((row, i) =>
        row.forEach((v, j) => {
          const value = fileValue(tamper(toMime, { id: b.id, v }));
          const at = sheet.cells.find((c) => c.r === b.r + i && c.c === b.c + j);
          if (at) at.value = value;
          else if (value) sheet.cells.push({ r: b.r + i, c: b.c + j, value });
        }),
      );
    }
    return toMime === ODS_MIME ? writeOds(read.file, 'G').data : writeXlsx(read.file, 'G').data;
  };
}

function setup(convert: Convert) {
  const fake = new FakeGoogle({ convert });
  const logs: string[] = [];
  const token = fake.issueAccessToken('oracle');
  const drive = oracleDrive(
    fake.fetch,
    token,
    async () => {},
    (line) => logs.push(line),
  );
  return { fake, drive, logs, token };
}

describe('sheetsLocale', () => {
  it("names a locale as the Sheets API does, and UTC as CLDR's", () => {
    expect(sheetsLocale('en-US')).toBe('en_US');
    expect(sheetsLocale('de-DE')).toBe('de_DE');
    expect(ORACLE_TIME_ZONE).toBe('Etc/GMT');
  });
});

describe('googleAnswers', () => {
  it("reads every block from the .ods, holds the .xlsx's to it, and deletes the file", async () => {
    let seen: Record<string, string> = {};
    const { fake, drive } = setup(async (bytes, toMime, properties) => {
      seen = properties;
      return workedOut(CATEGORY)(bytes, toMime, properties);
    });
    const got = await googleAnswers(CATEGORY, drive);
    expect(got.problems).toEqual([]);
    expect(got.answers).toEqual({
      'SUM.1': [[6]],
      'SEQUENCE.1': [[1], [2]],
      'TEXT.1': [['xy']],
      'TRUE.1': [[true]],
      'DIV.1': [[{ e: '#DIV/0!' }]],
    });
    expect(seen).toEqual({ locale: 'en_US', timeZone: 'Etc/GMT' });
    expect(fake.appFiles('oracle')).toEqual([]);
  });

  it('names a case the two exports answer differently, never as an answer', async () => {
    const { drive } = setup(
      workedOut(CATEGORY, (toMime, at) => (toMime !== ODS_MIME && at.id === 'SUM.1' ? 7 : at.v)),
    );
    const got = await googleAnswers(CATEGORY, drive);
    expect(got.problems).toEqual(['SUM.1: ods=6 xlsx=7']);
    expect(got.answers['SUM.1']).toEqual([[6]]);
  });

  it("names the .xlsx's own problems apart", async () => {
    const { drive } = setup(async (bytes, toMime, p) => {
      if (toMime === ODS_MIME) return workedOut(CATEGORY)(bytes, toMime, p);
      return writeXlsx({ sheets: [{ name: 'Other', rows: 1, cols: 1, cells: [] }] }, 'G').data;
    });
    const read = await googleAnswers(CATEGORY, drive);
    expect(read.problems).toEqual(['xlsx no Cases sheet']);
    expect(read.answers['SUM.1']).toEqual([[6]]);
  });

  it('names an empty answer the other export holds', async () => {
    const { drive } = setup(
      workedOut(CATEGORY, (toMime, at) =>
        toMime !== ODS_MIME && at.id === 'SEQUENCE.1' && at.v === 2 ? null : at.v,
      ),
    );
    const read = await googleAnswers(CATEGORY, drive);
    expect(read.problems).toEqual(['SEQUENCE.1: ods=[[1],[2]] xlsx=[[1],[null]]']);
  });

  it('names an export it cannot read', async () => {
    const odsBad = setup(async (bytes, toMime, p) =>
      toMime === ODS_MIME ? new Uint8Array([1, 2]) : workedOut(CATEGORY)(bytes, toMime, p),
    );
    expect((await googleAnswers(CATEGORY, odsBad.drive)).problems[0]).toMatch(
      /^the \.ods export: /,
    );
    const xlsxBad = setup(async (bytes, toMime, p) =>
      toMime === ODS_MIME ? workedOut(CATEGORY)(bytes, toMime, p) : new Uint8Array([1, 2]),
    );
    expect((await googleAnswers(CATEGORY, xlsxBad.drive)).problems[0]).toMatch(
      /^the \.xlsx export: /,
    );
    expect(odsBad.fake.appFiles('oracle')).toEqual([]);
  });

  it('names what the workbook cannot carry, uploading nothing', async () => {
    const { fake, drive } = setup(workedOut(CATEGORY));
    const long = { ...CATEGORY, data: [['x'.repeat(40_000)]] };
    expect((await googleAnswers(long, drive)).problems[0]).toMatch(/^unwritten .*text_cut/);
    expect(fake.requests).toEqual([]);
  });

  it('names a failed delete after the answers', async () => {
    const { fake, drive } = setup(workedOut(CATEGORY));
    fake.fail({
      status: 403,
      reason: 'insufficientFilePermissions',
      match: (r) => r.method === 'DELETE',
    });
    const got = await googleAnswers(CATEGORY, drive);
    expect(got.problems).toEqual([
      expect.stringMatching(/^deleting file\d+: delete answered 403 insufficientFilePermissions$/),
    ]);
  });

  it('deletes the file when a call fails, and says so with the failure', async () => {
    const { fake, drive } = setup(workedOut(CATEGORY));
    fake.fail({ status: 400, reason: 'badRequest', match: (r) => r.path.endsWith(':batchUpdate') });
    await expect(googleAnswers(CATEGORY, drive)).rejects.toThrow(
      /^locale answered 400 badRequest$/,
    );
    expect(fake.appFiles('oracle')).toEqual([]);
  });

  it('deletes every upload of a run that fails midway, logging each by id alone', async () => {
    const { fake, drive, logs, token } = setup(workedOut(CATEGORY));
    const second = { ...CATEGORY, category: 'Second' };
    await googleAnswers(CATEGORY, drive);
    let exports = 0;
    fake.fail({
      status: 403,
      reason: 'exportSizeLimitExceeded',
      match: (r) => r.path.endsWith('/export') && ++exports === 2,
    });
    await expect(googleAnswers(second, drive)).rejects.toThrow(
      /^export .* answered 403 exportSizeLimitExceeded$/,
    );
    expect(fake.appFiles('oracle')).toEqual([]);
    const ids = fake.requests
      .filter((r) => r.method === 'DELETE')
      .map((r) => r.path.split('/').pop());
    expect(ids).toHaveLength(2);
    expect(logs).toEqual(
      ids.flatMap((id) => [
        `[sheets oracle] uploaded id=${id}`,
        `[sheets oracle] deleted id=${id}`,
      ]),
    );
    expect(logs.join('\n')).not.toMatch(new RegExp(`${token}|Oracle|Data|SUM`));
  });

  it('joins a failed delete to the failure it follows', async () => {
    const failing: OracleDrive = {
      uploadAsSheet: async () => 'id1',
      setLocale: async () => {
        throw new Error('locale answered 400');
      },
      exportAs: async () => new Uint8Array(),
      remove: async () => {
        throw new Error('delete answered 500');
      },
    };
    await expect(googleAnswers(CATEGORY, failing)).rejects.toThrow(
      'locale answered 400 (and deleting id1: delete answered 500)',
    );
  });
});
