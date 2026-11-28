// `text import` (docs/specs/034-text-documents/agents-and-sync.md "CLI"): a file from this computer opened as a new
// text document as File › Open opens it; its size checked before its bytes are read.
import {
  openTextDocument,
  TEXT_DOCUMENT_FILE_BYTES_MAX,
  textDocumentFileTooLarge,
  VerbRefusal,
  type VerbContext,
} from '@livedoc/agent-verbs';
import type { CliIo } from '../io';

export type TextDocumentImportInput = { file: string; name?: string };

const HINT =
  'LiveDoc opens .odt, .fodt, .ott, .docx, .dotx, .docm, .txt, .md, .html and .rtf files';

export async function textDocumentImport(
  io: CliIo,
  ctx: VerbContext,
  input: TextDocumentImportInput,
): Promise<{ lines: string[] }> {
  const path = input.file.startsWith('/') ? input.file : `${io.cwd}/${input.file}`;
  const size = await io.files.size(path);
  if (size !== null && size > TEXT_DOCUMENT_FILE_BYTES_MAX)
    throw new VerbRefusal({
      status: 413,
      ...textDocumentFileTooLarge(),
      hint: `a file of up to ${TEXT_DOCUMENT_FILE_BYTES_MAX / 1024 / 1024} MB opens`,
    });
  const bytes = size === null ? null : await io.files.readBytes(path);
  if (!bytes)
    throw new VerbRefusal({
      status: 404,
      code: 'file_not_found',
      message: `No file ${input.file}.`,
      hint: HINT,
    });
  const opened = await openTextDocument(
    ctx.api,
    {
      fileName: input.file.split('/').at(-1)!,
      bytes,
      ...(input.name !== undefined ? { name: input.name } : {}),
      newId: ctx.newId,
    },
    'cli',
  );
  if (!opened.ok)
    throw new VerbRefusal({ status: 400, code: opened.code, message: opened.message, hint: HINT });
  ctx.log(`text import ${opened.documentId} ${opened.format} ${bytes.length} bytes`);
  return {
    lines: [
      `+ text-document ${opened.documentId.slice(0, 8)} ${JSON.stringify(opened.name)} · ${opened.format === 'ooxml' ? 'docx' : 'odt'} · ${ctx.host}/document/${opened.documentId}`,
    ],
  };
}
