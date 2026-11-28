// A text document made for an agent (docs/specs/034-text-documents/agents-and-sync.md "CLI", files-and-print.md
// "Opening"): a file opened as File › Open opens it (in the format its name says, another kind read into ODF), or a
// new one born in ODF from Markdown (create_document). The api reads the file under the package's guards and answers
// a named rejection, which this words.
import { ApiError, type ApiClient } from '@livedoc/api-client';
import { CLIENT_HEADER, creationIntentOf, type LiveDoc } from '@livedoc/api-schema';
import type { Tab } from '@livedoc/document';
import {
  base64OfBytes,
  formatOfFileName,
  importTypeOfFileName,
  TEXT_DOCUMENT_OPEN_REFUSAL_WORDS,
} from '@livedoc/text-documents';

/**
 * The largest file an agent opens: its base64 stays under the Worker's 100 MB request body with room for the rest of
 * the request (safe range 1 to 70 MB).
 */
export const TEXT_DOCUMENT_FILE_BYTES_MAX = 64 * 1024 * 1024;

export const textDocumentFileTooLarge = () => ({
  code: 'package_too_large' as const,
  message: TEXT_DOCUMENT_OPEN_REFUSAL_WORDS.package_too_large!,
});

export type OpenTextDocumentInput = {
  fileName: string;
  bytes: Uint8Array;
  /** Its name; the file's without its extension by default. */
  name?: string;
  newId: () => string;
};

export type OpenedTextDocument =
  | { ok: true; documentId: string; tabId: string; name: string; format: 'odf' | 'ooxml' }
  | { ok: false; code: string; message: string };

const nameOf = (fileName: string) => fileName.replace(/\.[^./\\]+$/, '') || fileName;

type TextDocumentPost = {
  name: string;
  format: 'odf' | 'ooxml';
  /** The body it opens, base64, with the import's type for a file of another kind. */
  body?: { file: string; type?: string };
  markUsed?: boolean;
  newId: () => string;
};

type MadeTextDocument =
  | {
      ok: true;
      documentId: string;
      tabId: string;
      name: string;
      format: 'odf' | 'ooxml';
      document: LiveDoc | undefined;
    }
  | { ok: false; code: string; message: string };

// One text document tab, tagged with the client that made it (the Explorer's Made by AI), and the file it opens.
async function postTextDocument(
  api: ApiClient,
  post: TextDocumentPost,
  client: 'mcp' | 'cli',
): Promise<MadeTextDocument> {
  const documentId = post.newId();
  const tabId = post.newId();
  const tab: Tab = {
    id: tabId,
    name: post.name,
    kind: 'text-document',
    format: post.format,
    elements: [],
  };
  try {
    const answer = await api.json<{ document?: LiveDoc }>(`/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CLIENT_HEADER]: client },
      body: JSON.stringify({
        id: documentId,
        name: post.name,
        tabs: [tab],
        source: client,
        intent: creationIntentOf(tab),
        ...(post.markUsed !== undefined ? { markUsed: post.markUsed } : {}),
        ...(post.body ? { textDocuments: [{ tabId, ...post.body }] } : {}),
      }),
    });
    return {
      ok: true,
      documentId,
      tabId,
      name: post.name,
      format: post.format,
      document: answer.document,
    };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
    const code = error.code ?? `http_${error.status}`;
    return {
      ok: false,
      code,
      message: TEXT_DOCUMENT_OPEN_REFUSAL_WORDS[code] ?? `The api refused the file (${code}).`,
    };
  }
}

export async function openTextDocument(
  api: ApiClient,
  input: OpenTextDocumentInput,
  client: 'mcp' | 'cli',
): Promise<OpenedTextDocument> {
  const type = importTypeOfFileName(input.fileName);
  const made = await postTextDocument(
    api,
    {
      name: input.name?.trim() || nameOf(input.fileName),
      format: type ? 'odf' : formatOfFileName(input.fileName),
      body: { file: base64OfBytes(input.bytes), ...(type ? { type } : {}) },
      newId: input.newId,
    },
    client,
  );
  if (!made.ok) return made;
  const { document: _document, ...opened } = made;
  return opened;
}

export type CreateTextDocumentInput = {
  name: string;
  /** Its body, read as an opened Markdown file is; blank when left out. */
  markdown?: string;
  markUsed?: boolean;
  newId: () => string;
};

/** A new text document, born in ODF (fork C5), its body from Markdown when given; the document the api answered. */
export async function createTextDocument(
  api: ApiClient,
  input: CreateTextDocumentInput,
  client: 'mcp' | 'cli',
): Promise<MadeTextDocument> {
  return postTextDocument(
    api,
    {
      name: input.name,
      format: 'odf',
      ...(input.markdown !== undefined
        ? { body: { file: base64OfBytes(new TextEncoder().encode(input.markdown)), type: 'md' } }
        : {}),
      ...(input.markUsed !== undefined ? { markUsed: input.markUsed } : {}),
      newId: input.newId,
    },
    client,
  );
}
