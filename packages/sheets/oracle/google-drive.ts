// The Drive and Sheets calls the oracle makes for Google's answers (docs/specs/029-sheets/formulas.md "The oracle",
// D96): upload a workbook converted to a Google Sheet, set its locale and time zone, export it, delete it. A 429 or a
// 5xx is tried again after RETRY_DELAYS_MS; any other failure throws a DriveCallError naming the call and status.
// Each upload and delete is logged by its file id, never by what the file holds.
import type { Fetch } from './google-oauth.ts';

export const DRIVE_API = 'https://www.googleapis.com';
export const SHEETS_API = 'https://sheets.googleapis.com';
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
export const RETRY_DELAYS_MS: readonly number[] = [1_000, 4_000, 16_000];
// A zip's bytes are compressed: this line never occurs in an .xlsx.
const BOUNDARY = 'livedoc-oracle-part';

export class DriveCallError extends Error {
  readonly call: string;
  readonly status: number;

  constructor(call: string, status: number, reason: string) {
    super(`${call} answered ${status}${reason ? ` ${reason}` : ''}`);
    this.name = 'DriveCallError';
    this.call = call;
    this.status = status;
  }
}

export type OracleDrive = {
  /** Uploads a workbook converted to a Google Sheet; its Drive id. */
  uploadAsSheet(name: string, bytes: Uint8Array, mimeType: string): Promise<string>;
  setLocale(id: string, locale: string, timeZone: string): Promise<void>;
  exportAs(id: string, mimeType: string): Promise<Uint8Array<ArrayBuffer>>;
  remove(id: string): Promise<void>;
};

// Google's reason for a failure, never more of its body: Drive's (`fileNotExportable`), else the Sheets API's
// detail (`SERVICE_DISABLED`), else its status (`PERMISSION_DENIED`).
async function reasonOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { status?: unknown; errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] };
  } | null;
  const reason =
    body?.error?.errors?.[0]?.reason ?? body?.error?.details?.[0]?.reason ?? body?.error?.status;
  return typeof reason === 'string' ? reason : '';
}

export function oracleDrive(
  fetch: Fetch,
  accessToken: string,
  sleep: (ms: number) => Promise<void>,
  log: (line: string) => void,
): OracleDrive {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const call = async (name: string, url: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { ...init, headers: { ...auth, ...init.headers } });
      if (res.ok) return res;
      const delay = RETRY_DELAYS_MS[attempt];
      if ((res.status !== 429 && res.status < 500) || delay === undefined)
        throw new DriveCallError(name, res.status, await reasonOf(res));
      log(`[sheets oracle] retry ${name} status=${res.status} in=${delay}`);
      await sleep(delay);
    }
  };
  return {
    async uploadAsSheet(name, bytes, mimeType) {
      const head = new TextEncoder().encode(
        `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify({ name, mimeType: GOOGLE_SHEET_MIME })}\r\n` +
          `--${BOUNDARY}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      );
      const tail = new TextEncoder().encode(`\r\n--${BOUNDARY}--\r\n`);
      const body = new Uint8Array(head.length + bytes.length + tail.length);
      body.set(head);
      body.set(bytes, head.length);
      body.set(tail, head.length + bytes.length);
      const res = await call(
        'upload',
        `${DRIVE_API}/upload/drive/v3/files?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${BOUNDARY}` },
          body,
        },
      );
      const { id } = (await res.json()) as { id?: unknown };
      if (typeof id !== 'string') throw new DriveCallError('upload', res.status, 'no id');
      log(`[sheets oracle] uploaded id=${id}`);
      return id;
    },
    async setLocale(id, locale, timeZone) {
      await call('locale', `${SHEETS_API}/v4/spreadsheets/${id}:batchUpdate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: { locale, timeZone },
                fields: 'locale,timeZone',
              },
            },
          ],
        }),
      });
    },
    async exportAs(id, mimeType) {
      const query = new URLSearchParams({ mimeType }).toString();
      const res = await call(
        `export ${mimeType}`,
        `${DRIVE_API}/drive/v3/files/${id}/export?${query}`,
      );
      return new Uint8Array(await res.arrayBuffer());
    },
    async remove(id) {
      await call('delete', `${DRIVE_API}/drive/v3/files/${id}`, { method: 'DELETE' });
      log(`[sheets oracle] deleted id=${id}`);
    },
  };
}
