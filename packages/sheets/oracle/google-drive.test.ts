import { FakeGoogle, GOOGLE_SHEET_MIME } from '@livedoc/fake-google';
import { describe, expect, it } from 'vitest';
import {
  DriveCallError,
  ODS_MIME,
  oracleDrive,
  RETRY_DELAYS_MS,
  XLSX_MIME,
  type OracleDrive,
} from './google-drive.ts';
import type { Fetch } from './google-oauth.ts';

// formulas.md "The oracle": Google's answers through Drive, and its retries (D96).

const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x0d, 0x0a]);

function setup() {
  const fake = new FakeGoogle({
    convert: (bytes, toMime) => new Uint8Array([...bytes, toMime.length]),
  });
  const slept: number[] = [];
  const logs: string[] = [];
  const drive = oracleDrive(
    fake.fetch,
    fake.issueAccessToken('oracle'),
    async (ms) => void slept.push(ms),
    (line) => logs.push(line),
  );
  return { fake, drive, slept, logs };
}

const failure = async (call: Promise<unknown>) => {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof DriveCallError)) throw new Error('expected a DriveCallError');
  return err;
};

describe('oracleDrive', () => {
  it('uploads a workbook as a Google Sheet, sets its locale, exports and deletes it', async () => {
    const { fake, drive } = setup();
    const id = await drive.uploadAsSheet('Oracle Math', BYTES, XLSX_MIME);
    const file = fake.get(id)!;
    expect(file).toMatchObject({ name: 'Oracle Math', mimeType: GOOGLE_SHEET_MIME });
    expect([...file.bytes!]).toEqual([...BYTES]);
    await drive.setLocale(id, 'de_DE', 'Etc/GMT');
    expect(file.properties).toEqual({ locale: 'de_DE', timeZone: 'Etc/GMT' });
    expect([...(await drive.exportAs(id, ODS_MIME))]).toEqual([...BYTES, ODS_MIME.length]);
    await drive.remove(id);
    expect(fake.get(id)).toBeUndefined();
  });

  it('tries a 429 and a 5xx again, a second, then 4, then 16 apart', async () => {
    const { fake, drive, slept, logs } = setup();
    const id = await drive.uploadAsSheet('O', BYTES, XLSX_MIME);
    fake.fail({ status: 429, times: 1 });
    fake.fail({ status: 503, times: 2 });
    await drive.exportAs(id, ODS_MIME);
    expect(RETRY_DELAYS_MS).toEqual([1_000, 4_000, 16_000]);
    expect(slept).toEqual([1_000, 4_000, 16_000]);
    expect(logs[0]).toBe(`[sheets oracle] retry export ${ODS_MIME} status=429 in=1000`);
  });

  it('stops after three retries, naming the call and status', async () => {
    const { fake, drive, slept } = setup();
    fake.fail({ status: 500, times: 4, reason: 'backendError' });
    const err = await failure(drive.uploadAsSheet('O', BYTES, XLSX_MIME));
    expect(err).toMatchObject({ call: 'upload', status: 500 });
    expect(err.message).toBe('upload answered 500 backendError');
    expect(slept).toHaveLength(3);
  });

  it('stops at once on any other failure', async () => {
    const { fake, drive, slept } = setup();
    const id = await drive.uploadAsSheet('O', BYTES, GOOGLE_SHEET_MIME);
    fake.fail({ status: 403, reason: 'rateLimitExceeded' });
    expect((await failure(drive.setLocale(id, 'en_US', 'Etc/GMT'))).message).toBe(
      'locale answered 403 rateLimitExceeded',
    );
    expect((await failure(drive.remove('nope'))).message).toBe('delete answered 404 notFound');
    expect(slept).toEqual([]);
  });

  it("names the Sheets API's status, a bare failure, and an upload without an id", async () => {
    const answers: Response[] = [
      Response.json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, { status: 403 }),
      new Response('not json', { status: 400 }),
      Response.json({}),
    ];
    const fetch: Fetch = async () => answers.shift()!;
    const drive: OracleDrive = oracleDrive(
      fetch,
      't',
      async () => {},
      () => {},
    );
    expect((await failure(drive.setLocale('x', 'en_US', 'Etc/GMT'))).message).toBe(
      'locale answered 403 PERMISSION_DENIED',
    );
    expect((await failure(drive.exportAs('x', ODS_MIME))).message).toBe(
      `export ${ODS_MIME} answered 400`,
    );
    expect((await failure(drive.uploadAsSheet('O', BYTES, XLSX_MIME))).message).toBe(
      'upload answered 200 no id',
    );
  });

  it('sends the access token on every call', async () => {
    const seen: (string | null)[] = [];
    const fetch: Fetch = async (_url, init) => {
      seen.push(new Headers(init?.headers).get('Authorization'));
      return new Response(null, { status: 204 });
    };
    await oracleDrive(
      fetch,
      'tok',
      async () => {},
      () => {},
    ).remove('x');
    expect(seen).toEqual(['Bearer tok']);
  });
});
