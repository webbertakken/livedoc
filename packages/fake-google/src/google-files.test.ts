import { describe, expect, it } from 'vitest';
import { FakeGoogle } from './fake-google';
import { GOOGLE_SHEET_MIME, type Convert } from './google-files';

// Google's own files: converted on upload, exported through the test's `convert`, their locale set by the Sheets API.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const BINARY = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x80, 0x0a]);

function setup(convert?: Convert) {
  const fake = new FakeGoogle({ now: () => 1_700_000_000_000, ...(convert ? { convert } : {}) });
  const auth = { Authorization: `Bearer ${fake.issueAccessToken('me')}` };
  const upload = async (mimeType: string, media: Uint8Array) => {
    const head = new TextEncoder().encode(
      `--x\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: 'Oracle', mimeType })}` +
        `\r\n--x\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`,
    );
    const body = new Uint8Array([...head, ...media, ...new TextEncoder().encode('\r\n--x--\r\n')]);
    const res = await fake.fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType',
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'multipart/related; boundary=x' },
        body,
      },
    );
    return (await res.json()) as { id: string; mimeType: string };
  };
  const get = (path: string) => fake.fetch(`https://www.googleapis.com${path}`, { headers: auth });
  const batch = (id: string, body: unknown) =>
    fake.fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { fake, upload, get, batch };
}

const reason = async (res: Response) =>
  ((await res.json()) as { error: { errors: { reason: string }[] } }).error.errors[0]!.reason;

describe('a binary upload', () => {
  it('reads back byte for byte', async () => {
    const { upload, get } = setup();
    const { id } = await upload(XLSX_MIME, BINARY);
    const res = await get(`/drive/v3/files/${id}?alt=media`);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...BINARY]);
  });

  it('is copied with its bytes, and an edit by the person drops them', async () => {
    const { fake, upload } = setup();
    const { id } = await upload(XLSX_MIME, BINARY);
    const copy = fake.userCopy(id, { visibleToApp: true });
    expect([...fake.get(copy)!.bytes!]).toEqual([...BINARY]);
    expect(fake.get(fake.userCopy(id, { content: 'text' }))!.bytes).toBeNull();
    fake.userEditContent(id, 'edited');
    expect(fake.get(id)!.bytes).toBeNull();
  });
});

describe('export', () => {
  it('converts a Google Sheet with its spreadsheet properties', async () => {
    const seen: unknown[] = [];
    const { upload, get, batch } = setup((bytes, toMime, properties) => {
      seen.push([[...bytes], toMime, properties]);
      return new Uint8Array([1, 2, 3]);
    });
    const { id, mimeType } = await upload(GOOGLE_SHEET_MIME, BINARY);
    expect(mimeType).toBe(GOOGLE_SHEET_MIME);
    const set = await batch(id, {
      requests: [
        {
          updateSpreadsheetProperties: {
            properties: { locale: 'de_DE', timeZone: 'Etc/GMT', title: 'kept out' },
            fields: 'locale, timeZone',
          },
        },
      ],
    });
    expect(await set.json()).toEqual({ spreadsheetId: id, replies: [{}] });
    const res = await get(`/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(ODS_MIME)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(ODS_MIME);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(seen).toEqual([[[...BINARY], ODS_MIME, { locale: 'de_DE', timeZone: 'Etc/GMT' }]]);
  });

  it('converts a Google file holding text alone', async () => {
    const { fake, get } = setup((bytes) => bytes);
    const id = fake.otherUserFile({
      owner: 'me',
      name: 'Sheet',
      mimeType: GOOGLE_SHEET_MIME,
      content: 'abc',
      appProperties: {},
    });
    const res = await get(`/drive/v3/files/${id}/export?mimeType=text/csv`);
    expect(await res.text()).toBe('abc');
  });

  it("refuses a file that is not Google's, a folder, a missing type, no convert and an unknown file", async () => {
    const { fake, upload, get } = setup((b) => b);
    const plain = await upload(XLSX_MIME, BINARY);
    expect(await reason(await get(`/drive/v3/files/${plain.id}/export?mimeType=x`))).toBe(
      'fileNotExportable',
    );
    const folder = fake.otherUserFile({
      owner: 'me',
      name: 'F',
      mimeType: 'application/vnd.google-apps.folder',
      content: '',
      appProperties: {},
    });
    expect((await get(`/drive/v3/files/${folder}/export?mimeType=x`)).status).toBe(403);
    expect(await reason(await get(`/drive/v3/files/${plain.id}/export`))).toBe('required');
    expect((await get('/drive/v3/files/nope/export?mimeType=x')).status).toBe(404);
    const bare = setup();
    const sheet = await bare.upload(GOOGLE_SHEET_MIME, BINARY);
    expect((await bare.get(`/drive/v3/files/${sheet.id}/export?mimeType=x`)).status).toBe(400);
  });
});

describe('the Sheets API', () => {
  it('refuses what it does not model', async () => {
    const { upload, batch } = setup();
    const sheet = await upload(GOOGLE_SHEET_MIME, BINARY);
    const plain = await upload(XLSX_MIME, BINARY);
    const props = { updateSpreadsheetProperties: { properties: {}, fields: 'locale' } };
    expect((await batch(plain.id, { requests: [props] })).status).toBe(400);
    expect((await batch(sheet.id, { requests: [] })).status).toBe(400);
    expect((await batch(sheet.id, null)).status).toBe(400);
    expect((await batch(sheet.id, { requests: [{ addSheet: {} }] })).status).toBe(400);
    expect(
      (await batch(sheet.id, { requests: [{ updateSpreadsheetProperties: { fields: 'locale' } }] }))
        .status,
    ).toBe(400);
    expect((await batch('nope', { requests: [props] })).status).toBe(404);
    expect((await batch(sheet.id, { requests: [props] })).status).toBe(200);
  });
});

describe('routes', () => {
  it('serves text media as text, and no other method on export or batchUpdate', async () => {
    const { fake, get } = setup();
    const id = fake.otherUserFile({
      owner: 'me',
      name: 'T',
      mimeType: 'text/plain',
      content: 'hello',
      appProperties: {},
    });
    expect(await (await get(`/drive/v3/files/${id}?alt=media`)).text()).toBe('hello');
    const token = fake.issueAccessToken('me');
    const call = (method: string, url: string) =>
      fake.fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    expect(
      (await call('POST', `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=x`))
        .status,
    ).toBe(404);
    expect(
      (await call('GET', `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`)).status,
    ).toBe(404);
  });
});
