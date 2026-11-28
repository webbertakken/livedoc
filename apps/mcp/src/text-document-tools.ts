// The text document tools (docs/specs/034-text-documents/agents-and-sync.md "Verbs", docs/specs/015-api/mcp-server.md
// §4.9g): read_text_document and edit_text_document, over the calls the CLI's text verbs make (@livedoc/agent-verbs),
// and create_document's text document (kind "text-document"). A refusal is a tool error that names the line, or the
// text document tabs there are.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '@livedoc/api-client';
import {
  createTextDocument,
  editTextDocument,
  readTextDocumentView,
  textDocumentTabIn,
  type TextDocumentTabRef,
} from '@livedoc/agent-verbs';
import { mcpEditTextDocument, mcpReadTextDocument } from '@livedoc/agent-verbs/mcp';
import { clientFor } from './api';
import { createdFolderLabel } from './created-folder';
import type { Env } from './env';
import { registerTool } from './tool-annotations';
import { deepLink, errorResult, requireToken, textResult, type ToolResult } from './tool-helpers';

type Found = { ok: true; tabId: string } | { ok: false; result: ToolResult };

async function textDocumentTab(
  api: ApiClient,
  documentId: string,
  tab: string | undefined,
): Promise<Found> {
  const { document } = await api.json<{
    document: { name: string; tabs: TextDocumentTabRef[] };
  }>(`/documents/${encodeURIComponent(documentId)}`);
  const found = textDocumentTabIn(document, tab);
  if (found.ok) return { ok: true, tabId: found.tab.id };
  const there = found.tabs.map((t) => `"${t.name}" (${t.id})`).join(', ');
  return {
    ok: false,
    result: errorResult(
      `${found.message}.${there ? ` Text document tabs: ${there}.` : ' read_document reads its tabs.'}`,
    ),
  };
}

export function registerTextDocumentTools(server: McpServer, env: Env): void {
  registerTool(server, env, mcpReadTextDocument, async (args, extra) => {
    const api = clientFor(env, requireToken(extra));
    const found = await textDocumentTab(api, args.documentId, args.tabId);
    if (!found.ok) return found.result;
    const view = args.view ?? 'outline';
    const read = await readTextDocumentView(api, args.documentId, found.tabId, {
      view,
      ...(args.only !== undefined ? { only: args.only } : {}),
      ...(args.range !== undefined ? { range: args.range } : {}),
      ...(args.lines !== undefined ? { lines: args.lines } : {}),
    });
    return textResult({
      documentId: args.documentId,
      tabId: found.tabId,
      view,
      text: read.text,
      stateVector: read.stateVector,
      url: deepLink(env, args.documentId),
    });
  });

  registerTool(server, env, mcpEditTextDocument, async (args, extra) => {
    const api = clientFor(env, requireToken(extra));
    const found = await textDocumentTab(api, args.documentId, args.tabId);
    if (!found.ok) return found.result;
    const edited = await editTextDocument(api, args.documentId, found.tabId, {
      ops: args.ops,
      ...(args.documentTab !== undefined ? { documentTab: args.documentTab } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.base !== undefined ? { base: args.base } : {}),
      ...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}),
    });
    if (!edited.ok)
      return errorResult(
        `${edited.code}${edited.line ? ` line ${edited.line}` : ''}: ${edited.message}`,
      );
    return textResult({
      documentId: args.documentId,
      tabId: found.tabId,
      dryRun: edited.dryRun,
      results: edited.results,
      changeset: edited.changeset,
      url: deepLink(env, args.documentId),
    });
  });
}

/** create_document with kind "text-document": one text document, born in ODF, its body from Markdown when given. */
export async function createTextDocumentResult(
  env: Env,
  token: string,
  args: { name: string; markdown?: string; markUsed?: boolean },
): Promise<ToolResult> {
  const made = await createTextDocument(
    clientFor(env, token),
    {
      name: args.name,
      ...(args.markdown !== undefined ? { markdown: args.markdown } : {}),
      ...(args.markUsed !== undefined ? { markUsed: args.markUsed } : {}),
      newId: () => crypto.randomUUID(),
    },
    'mcp',
  );
  if (!made.ok) return errorResult(`${made.code}: ${made.message}`);
  return textResult({
    id: made.documentId,
    documentId: made.documentId,
    name: made.name,
    tabCount: 1,
    tabIds: [made.tabId],
    folder: await createdFolderLabel(env, token, made.document),
    url: deepLink(env, made.documentId),
    lint: [],
  });
}
