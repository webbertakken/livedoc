// What an agent does to a text document, for the CLI's verbs and the MCP's tools alike
// (docs/specs/034-text-documents/agents-and-sync.md "Verbs"): find its text document tab, read a view with the state
// vector it was read at, and send operations as one changeset. A refusal is answered as data, the line it names kept.
import { ApiError, type ApiClient } from '@livedoc/api-client';
import {
  TEXT_DOCUMENT_STATE_VECTOR_HEADER,
  type TextChangesetRefusal,
  type TextChangesetResponse,
} from '@livedoc/api-schema';
import { tabPath } from '../verbs/shared';

export type TextDocumentTabRef = { id: string; name: string; orderIndex: number; kind?: string };

export type TextDocumentTabFound =
  | { ok: true; tab: TextDocumentTabRef }
  | { ok: false; message: string; tabs: TextDocumentTabRef[] };

/** A document's text document tab: the one `tab` names (id, name, id prefix), else its first; or why not. */
export function textDocumentTabIn(
  document: { name: string; tabs: readonly TextDocumentTabRef[] },
  tab: string | undefined,
): TextDocumentTabFound {
  const tabs = document.tabs
    .filter((t) => t.kind === 'text-document')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const found =
    tab === undefined
      ? tabs[0]
      : (tabs.find((t) => t.id === tab) ??
        tabs.find((t) => t.name.toLowerCase() === tab.toLowerCase()) ??
        tabs.find((t) => t.id.startsWith(tab)));
  if (found) return { ok: true, tab: found };
  return {
    ok: false,
    message:
      tabs.length === 0
        ? `${document.name} holds no text document`
        : `${document.name} holds no text document tab ${JSON.stringify(tab)}`,
    tabs,
  };
}

export type TextDocumentViewName = 'outline' | 'text' | 'structure';

export type TextDocumentViewQuery = {
  view?: TextDocumentViewName;
  only?: string;
  range?: string;
  lines?: boolean;
};

/** A view of a text document tab (the outline by default) and the state vector it was read at, which `replace` takes. */
export async function readTextDocumentView(
  api: ApiClient,
  documentId: string,
  tabId: string,
  query: TextDocumentViewQuery,
): Promise<{ text: string; stateVector: string | null }> {
  const params = new URLSearchParams({ view: query.view ?? 'outline' });
  if (query.only !== undefined) params.set('only', query.only);
  if (query.range !== undefined) params.set('range', query.range);
  if (query.lines) params.set('lines', '1');
  const { body, headers } = await api.text(`${tabPath(documentId, tabId)}?${params.toString()}`);
  return { text: body, stateVector: headers.get(TEXT_DOCUMENT_STATE_VECTOR_HEADER) };
}

export type TextDocumentEditInput = {
  ops: string;
  documentTab?: string;
  summary?: string;
  base?: string;
  dryRun?: boolean;
};

export type TextDocumentEdited =
  | {
      ok: true;
      dryRun: boolean;
      changeset: {
        id: string;
        counts: { added: number; changed: number; removed: number };
      } | null;
      results: string[];
    }
  | {
      ok: false;
      status: number;
      code: string;
      /** The operation's line in the text; null for the changeset as a whole. */
      line: number | null;
      message: string;
    };

function refusedEdit(error: ApiError): TextDocumentEdited {
  let refusal: Partial<TextChangesetRefusal> = {};
  try {
    refusal = JSON.parse(error.body) as Partial<TextChangesetRefusal>;
  } catch {
    // Not a refusal's JSON: the status and the error's own words speak for it.
  }
  return {
    ok: false,
    status: error.status,
    code: refusal.error ?? error.code ?? 'refused',
    line: refusal.line || null,
    message: refusal.message ?? error.message,
  };
}

/** Operations sent to a text document tab as one changeset, all or nothing; a refusal answered with its line. */
export async function editTextDocument(
  api: ApiClient,
  documentId: string,
  tabId: string,
  input: TextDocumentEditInput,
): Promise<TextDocumentEdited> {
  try {
    const answer = await api.json<TextChangesetResponse>(
      `${tabPath(documentId, tabId)}/changesets${input.dryRun ? '?dryRun=1' : ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ops: input.ops,
          ...(input.documentTab !== undefined ? { documentTab: input.documentTab } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.base !== undefined ? { base: input.base } : {}),
        }),
      },
    );
    return {
      ok: true,
      dryRun: answer.dryRun,
      changeset: answer.changeset && { id: answer.changeset.id, counts: answer.changeset.counts },
      results: answer.results,
    };
  } catch (error) {
    if (error instanceof ApiError) return refusedEdit(error);
    throw error;
  }
}
