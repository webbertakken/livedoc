// The event-storming tools (docs/specs/015-api/mcp-server.md §4.9f, docs/specs/021-event-storming/suggestions.md):
// read_event_storming and suggest_notes, over the calls the CLI shares (@livedoc/agent-verbs). A refusal is a tool
// error that says what is there.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '@livedoc/api-client';
import { readStorm, suggestNotes, type SuggestionInput } from '@livedoc/agent-verbs';
import { mcpReadEventStorming, mcpSuggestNotes } from '@livedoc/agent-verbs/mcp';
import { clientFor } from './api';
import type { Env } from './env';
import { registerTool } from './tool-annotations';
import { deepLink, errorResult, requireToken, textResult } from './tool-helpers';

type DocumentTabs = {
  document: { id: string; tabs: { id: string; name: string; orderIndex: number }[] };
};

async function boardOf(api: ApiClient, documentId: string, tab: string | undefined) {
  const { document } = await api.json<DocumentTabs>(`/documents/${encodeURIComponent(documentId)}`);
  return readStorm(api, { id: documentId, tabs: document.tabs }, tab);
}

export function registerStormTools(server: McpServer, env: Env): void {
  registerTool(server, env, mcpReadEventStorming, async (args, extra) => {
    const api = clientFor(env, requireToken(extra));
    const read = await boardOf(api, args.documentId, args.tab);
    if (!read.ok) return errorResult(read.message);
    return textResult({
      documentId: read.documentId,
      tabId: read.tabId,
      text: read.lines.join('\n'),
      reading: read.reading,
      gaps: read.reading.gaps.length,
      suggestions: read.suggestions.filter((s) => !s.orphan).length,
      url: deepLink(env, read.documentId),
    });
  });

  registerTool(server, env, mcpSuggestNotes, async (args, extra) => {
    const api = clientFor(env, requireToken(extra));
    const read = await boardOf(api, args.documentId, args.tab);
    if (!read.ok) return errorResult(read.message);
    const written = await suggestNotes(api, read, args.suggestions as SuggestionInput[], 'mcp');
    if (!written.ok) return errorResult(written.message);
    return textResult({
      documentId: written.documentId,
      tabId: written.tabId,
      changesetId: written.changesetId,
      lines: written.lines,
      url: deepLink(env, written.documentId),
    });
  });
}
