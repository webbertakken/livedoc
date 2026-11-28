// `text download` (docs/specs/034-text-documents/agents-and-sync.md "CLI"; files-and-print.md "Downloading"): the
// text document's file as the api writes it, in its own format (odt, or docx for a Word one) or --format, written to
// --to or under the name the api gives it in the working folder.
import { textDocumentTabOf, VerbRefusal, type VerbContext } from '@livedoc/agent-verbs';
import type { CliIo } from '../io';
import { attachmentName } from './spreadsheet-download';

export type TextDocumentDownloadInput = { doc: string; tab?: string; format?: string; to?: string };

export async function textDocumentDownload(
  io: CliIo,
  ctx: VerbContext,
  input: TextDocumentDownloadInput,
): Promise<{ lines: string[] }> {
  const { document, tab } = await textDocumentTabOf(ctx, input.doc, input.tab);
  const base = `/documents/${encodeURIComponent(document.id)}`;
  const type =
    input.format ??
    ((await ctx.api.json<{ format?: string }>(`${base}/tabs/${encodeURIComponent(tab.id)}`))
      .format === 'ooxml'
      ? 'docx'
      : 'odt');
  const res = await ctx.api.fetch(
    `${base}/text-documents/${encodeURIComponent(tab.id)}/file?type=${encodeURIComponent(type)}`,
  );
  if (!res.ok) {
    const body = await res.text();
    const code = /"error":\s*"([a-z_]+)"/.exec(body)?.[1] ?? `http_${res.status}`;
    throw new VerbRefusal({
      status: res.status,
      code,
      message: `The api refused the download (${code}).`,
      hint: 'formats: odt, fodt, docx, txt, md, html, epub, rtf',
    });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const target =
    input.to ?? attachmentName(res.headers.get('Content-Disposition'), `${document.name}.${type}`);
  await io.files.writeBytes(target, bytes);
  ctx.log(`text download ${document.id} ${type} ${bytes.length} bytes to ${target}`);
  return { lines: [`${target}  ${Math.max(1, Math.round(bytes.length / 1024))} KB`] };
}
