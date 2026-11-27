// Google's own files in the fake Drive: an upload whose metadata names a Google type is converted (the fake keeps the
// uploaded bytes as the file and leaves the conversion to the test's `convert`), `files.export` turns it into another
// format, and the Sheets API's `updateSpreadsheetProperties` sets its locale and time zone.

import type { FakeFile } from './drive-store';
import { CORS, driveError, jsonResponse } from './responses';

export const GOOGLE_TYPE_PREFIX = 'application/vnd.google-apps.';
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/** What a Google file is exported as: its bytes as uploaded, the format asked for, its spreadsheet properties. */
export type Convert = (
  bytes: Uint8Array,
  toMime: string,
  properties: Readonly<Record<string, string>>,
) => Uint8Array | Promise<Uint8Array>;

/** A Google file other than a folder: what Drive can export. */
export function isExportable(file: FakeFile): boolean {
  return file.mimeType.startsWith(GOOGLE_TYPE_PREFIX) && !file.mimeType.endsWith('.folder');
}

/** `GET files/{id}/export?mimeType=`: the file converted, or Drive's refusal. */
export async function exportFile(
  file: FakeFile,
  toMime: string | null,
  convert: Convert | undefined,
): Promise<Response> {
  if (!toMime) return driveError(400, 'required', 'The mimeType parameter is required');
  if (!isExportable(file))
    return driveError(403, 'fileNotExportable', 'Only Google Docs Editors files can be exported');
  if (!convert) return driveError(400, 'badRequest', 'fake-google: no convert option given');
  const bytes = await convert(file.bytes ?? new TextEncoder().encode(file.content), toMime, {
    ...file.properties,
  });
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': toMime, ...CORS },
  });
}

type SpreadsheetRequest = {
  updateSpreadsheetProperties?: { properties?: Record<string, unknown>; fields?: string };
};

/** `POST /v4/spreadsheets/{id}:batchUpdate`, as far as `updateSpreadsheetProperties` (locale and time zone). */
export function updateSpreadsheet(file: FakeFile, body: unknown): Response {
  if (file.mimeType !== GOOGLE_SHEET_MIME)
    return driveError(400, 'badRequest', 'This operation is not supported for this document');
  const requests = (body as { requests?: SpreadsheetRequest[] } | null)?.requests;
  if (!Array.isArray(requests) || requests.length === 0)
    return driveError(400, 'badRequest', 'requests is required');
  for (const request of requests) {
    const update = request.updateSpreadsheetProperties;
    if (!update?.fields || !update.properties)
      return driveError(400, 'badRequest', 'only updateSpreadsheetProperties with fields');
    for (const field of update.fields.split(',')) {
      const value = update.properties[field.trim()];
      if (typeof value === 'string') file.properties[field.trim()] = value;
    }
  }
  return jsonResponse(200, { spreadsheetId: file.id, replies: requests.map(() => ({})) });
}

/** `GET /v4/spreadsheets/{id}/values:batchGet?ranges=…`: each range's values as the file holds them, none when unset. */
export function batchGetValues(file: FakeFile, ranges: readonly string[]): Response {
  if (file.mimeType !== GOOGLE_SHEET_MIME)
    return driveError(400, 'badRequest', 'This operation is not supported for this document');
  if (ranges.length === 0) return driveError(400, 'badRequest', 'ranges is required');
  const valueRanges = ranges.map((range) =>
    file.values[range] ? { range, values: file.values[range] } : { range },
  );
  return jsonResponse(200, { spreadsheetId: file.id, valueRanges });
}
