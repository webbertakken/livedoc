// A spreadsheet converted for an agent (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet",
// D271): what a file of the new format cannot hold, in the conversion dialog's words, then the conversion through the
// workbook's own door; with `check`, the losses alone. MCP convert_spreadsheet and the CLI's `spreadsheet convert`.
import type { ApiClient } from '@livedoc/api-client';
import {
  CLIENT_HEADER,
  type WorkbookConversionResponse,
  type WorkbookConvertRequest,
  type WorkbookSettingsResponse,
} from '@livedoc/api-schema';
import type { WorkbookFormat } from '@livedoc/sheets';
import { conversionLead, conversionLine } from '@livedoc/sheets/files';
import { apiRefusalOf } from '../plan/api-refusal';

export type ConvertedSpreadsheet =
  | { ok: true; from: WorkbookFormat; to: WorkbookFormat; converted: boolean; losses: string[] }
  | { ok: false; code: string; message: string };

const workbookPath = (documentId: string) =>
  `/documents/${encodeURIComponent(documentId)}/workbook`;

export async function convertSpreadsheet(
  api: ApiClient,
  documentId: string,
  input: { to: WorkbookFormat; check?: boolean },
  client: 'mcp' | 'cli',
): Promise<ConvertedSpreadsheet> {
  try {
    const read = await api.json<WorkbookConversionResponse>(
      `${workbookPath(documentId)}/conversion?to=${input.to}`,
    );
    const losses = [
      conversionLead(input.to, read.losses),
      ...read.losses.map((loss) => conversionLine(loss, input.to)),
    ];
    if (input.check) return { ok: true, from: read.from, to: input.to, converted: false, losses };
    await api.json<WorkbookSettingsResponse>(`${workbookPath(documentId)}/conversion`, {
      method: 'POST',
      headers: { [CLIENT_HEADER]: client },
      body: JSON.stringify({ format: input.to } satisfies WorkbookConvertRequest),
    });
    console.info('[workbook] agent converted', { from: read.from, to: input.to });
    return { ok: true, from: read.from, to: input.to, converted: true, losses };
  } catch (err) {
    const refusal = apiRefusalOf(err);
    if (!refusal) throw err;
    return { ok: false, ...refusal };
  }
}
