// `spreadsheet download` (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet", D272): the
// spreadsheet's file as the api writes it (GET .../workbook/file), its charts with it, written to --to or under the name
// the api gives it in the working folder.
import { documentOf, VerbRefusal, type VerbContext } from '@livedoc/agent-verbs';
import type { CliIo } from '../io';

export type SpreadsheetDownloadInput = {
  doc: string;
  format?: string;
  sheet?: string;
  to?: string;
};

// The file name a Content-Disposition header gives, else the document's id with the format.
export function attachmentName(header: string | null, fallback: string): string {
  const named = header?.match(/filename="([^"]+)"/)?.[1];
  return named && !named.includes('/') && !named.startsWith('.') ? named : fallback;
}

export async function spreadsheetDownload(
  io: CliIo,
  ctx: VerbContext,
  input: SpreadsheetDownloadInput,
): Promise<{ lines: string[] }> {
  const document = await documentOf(ctx, input.doc);
  const query = new URLSearchParams();
  if (input.format) query.set('format', input.format);
  if (input.sheet !== undefined) {
    const wanted = input.sheet.trim().toLowerCase();
    const tab = document.tabs.find((t) => t.name.toLowerCase() === wanted);
    if (!tab)
      throw new VerbRefusal({
        status: 404,
        code: 'sheet_not_found',
        message: `No sheet "${input.sheet}". Sheets: ${document.tabs.map((t) => `"${t.name}"`).join(', ')}.`,
        hint: 'list the sheets with: livedoc sheet ls <doc>',
      });
    query.set('tab', tab.id);
  }
  const path = `/documents/${encodeURIComponent(document.id)}/workbook/file${query.size ? `?${query}` : ''}`;
  const res = await ctx.api.fetch(path);
  if (!res.ok) {
    const body = await res.text();
    const code = /"error":\s*"([a-z_]+)"/.exec(body)?.[1] ?? `http_${res.status}`;
    throw new VerbRefusal({
      status: res.status,
      code,
      message:
        code === 'workbook_not_found'
          ? `"${document.name}" is no spreadsheet.`
          : `The api refused the download (${code}).`,
      hint: 'csv and tsv take one sheet: --sheet <name>',
    });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const name = attachmentName(
    res.headers.get('Content-Disposition'),
    `${document.id}.${input.format ?? 'ods'}`,
  );
  const target = input.to ?? name;
  await io.files.writeBytes(target, bytes);
  ctx.log(`spreadsheet download ${document.id} ${bytes.length} bytes to ${target}`);
  return { lines: [`${target}  ${Math.max(1, Math.round(bytes.length / 1024))} KB`] };
}
