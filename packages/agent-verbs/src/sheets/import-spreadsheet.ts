// A file opened as a new spreadsheet for an agent (docs/specs/029-sheets/sheet-store.md "Built for agents in a
// spreadsheet", D274): the editor's File › Open flow (`importSpreadsheetFile`) over the agents' api client, in the
// agents' locale and UTC, filed as create_spreadsheet files one. `livedoc spreadsheet import`.
import type { ApiClient } from '@livedoc/api-client';
import {
  CLIENT_HEADER,
  creationIntentOf,
  type DocumentResponse,
  type SheetWriteRequest,
} from '@livedoc/api-schema';
import { keptRequests } from '@livedoc/api-schema/workbook-kept';
import type { Tab } from '@livedoc/document';
import { AGENT_LOCALE, WorkbookRecord } from '@livedoc/sheets';
import {
  fileOpenRefusalWords,
  importReportLine,
  importSpreadsheetFile,
  nameFromFile,
  threadBatches,
  type SpreadsheetFilePort,
} from '@livedoc/sheets/files';
import { apiRefusalOf } from '../plan/api-refusal';
import { galleryPictureStore } from './import-pictures-upload';

export { SPREADSHEET_FILE_BYTES_MAX } from '@livedoc/sheets/files';

/** What a file too large to open is refused with, before its bytes are read. */
export const fileTooLarge = () => ({
  code: 'package_too_large' as const,
  message: fileOpenRefusalWords('package_too_large'),
});
import { sheetWritesPath } from './sheet-state';

export type ImportSpreadsheetInput = {
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
  // The spreadsheet's name; the file's without its extension by default.
  name?: string;
};

export type ImportedSpreadsheetResult =
  | {
      ok: true;
      documentId: string;
      name: string;
      format: string;
      imported: string;
      sheets: { name: string; sheetId: string; tabId: string }[];
      cells: number;
      // The import report's lines (files-and-print.md "The import report").
      report: string[];
    }
  // `code`: the file's rejection (a `FileOpenRejection`), or the api's code for a request it refused.
  | { ok: false; code: string; message: string };

const documentPath = (documentId: string) => `/documents/${encodeURIComponent(documentId)}`;

// The agents' requests for the shared flow: the parts stored unchecked, as an import's are.
function agentPort(
  api: ApiClient,
  client: 'mcp' | 'cli',
  log: (line: string) => void,
): SpreadsheetFilePort {
  let documentId = '';
  const headers = { [CLIENT_HEADER]: client };
  return {
    create: async (made) => {
      documentId = made.documentId;
      const tabs: Tab[] = made.sheets.map((sheet) => ({
        id: sheet.tabId,
        name: sheet.title,
        kind: 'sheet',
        elements: [],
      }));
      await api.json<DocumentResponse>('/documents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: made.documentId,
          name: made.name,
          source: client,
          tabs,
          intent: creationIntentOf(tabs[0]),
          sheets: made.sheets.map(({ id, tabId, title, layout, cells }) => ({
            id,
            tabId,
            title,
            layout,
            cells,
          })),
          workbook: made.record,
        }),
      });
    },
    write: async (sheetId, write) => {
      const body: SheetWriteRequest = { write, wid: crypto.randomUUID(), unchecked: true };
      await api.json(sheetWritesPath(documentId, sheetId), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    },
    keep: async (kept) => {
      const { batches, left } = keptRequests(kept);
      for (const batch of batches)
        await api.json(`${documentPath(documentId)}/workbook/kept`, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        });
      return left;
    },
    // An opened file's comment threads, in parts (standard-mapping.md "Comments in the file").
    threads: async (sheetId, threads) => {
      for (const batch of threadBatches(threads))
        await api.json(
          `${documentPath(documentId)}/sheets/${encodeURIComponent(sheetId)}/file-threads`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ threads: batch }),
          },
        );
    },
    bin: async (id) => {
      const res = await api.fetch(documentPath(id), { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`bin answered ${res.status}`);
    },
    // Into the caller's gallery, each picture as it is (D628).
    storePicture: galleryPictureStore(api, headers, (event, data) =>
      log(`${event} ${JSON.stringify(data)}`),
    ),
    log: (event, data) => log(`${event} ${JSON.stringify(data)}`),
  };
}

export async function importSpreadsheet(
  api: ApiClient,
  input: ImportSpreadsheetInput,
  client: 'mcp' | 'cli',
  // Where the flow's decisions are logged: the CLI's debug log, else the console.
  log: (line: string) => void = (line) => console.info(line),
): Promise<ImportedSpreadsheetResult> {
  const name = input.name?.trim() || nameFromFile(input.fileName) || input.fileName;
  const opened = await importSpreadsheetFile(
    { fileName: input.fileName, name, bytes: input.bytes },
    WorkbookRecord.create({ locale: AGENT_LOCALE, timeZone: 'UTC' }),
    agentPort(api, client, log),
  );
  if (!opened.ok) {
    // A request the api refused is named by the api's code and words; anything else not from the api throws.
    if (opened.rejection === 'import_refused') {
      const refusal = apiRefusalOf(opened.cause);
      if (!refusal) throw opened.cause;
      return { ok: false, code: refusal.code, message: `Nothing was made: ${refusal.message}` };
    }
    return { ok: false, code: opened.rejection, message: fileOpenRefusalWords(opened.rejection) };
  }
  return {
    ok: true,
    documentId: opened.documentId,
    name: opened.name,
    format: opened.format,
    imported: opened.imported,
    sheets: opened.sheets.map(({ id, tabId, title }) => ({ name: title, sheetId: id, tabId })),
    cells: opened.cells,
    report: opened.report.map(importReportLine),
  };
}
