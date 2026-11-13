// The event-storming tools (docs/specs/015-api/mcp-server.md §4.9f, docs/specs/021-event-storming/suggestions.md):
// read_event_storming and suggest_notes, over the calls the CLI shares (@livedoc/agent-verbs). A refusal is a tool
// error that says what is there.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '@livedoc/api-client';
import { addPhotoNotes, readStorm, suggestNotes, type SuggestionInput } from '@livedoc/agent-verbs';
import {
  mcpAddPhotoNotes,
  mcpExportEventStorming,
  mcpReadEventStorming,
  mcpSuggestNotes,
} from '@livedoc/agent-verbs/mcp';
import {
  buildExportBundle,
  bundleFolderName,
  hasChanges,
  parsePreviousReading,
} from '@livedoc/storm-reading';
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

  // A whole wall from the agent's own reading of its photos (docs/specs/021-event-storming/event-storming.md Phase 11).
  registerTool(server, env, mcpAddPhotoNotes, async (args, extra) => {
    const api = clientFor(env, requireToken(extra));
    const read = await boardOf(api, args.documentId, args.tab);
    if (!read.ok) return errorResult(read.message);
    const written = await addPhotoNotes(api, read, args.photos, 'mcp');
    if (!written.ok) return errorResult(written.message);
    return textResult({
      documentId: written.documentId,
      tabId: written.tabId,
      changesetId: written.changesetId,
      lines: written.lines,
      url: deepLink(env, written.documentId),
    });
  });

  registerTool(server, env, mcpExportEventStorming, async (args, extra) => {
    const api = clientFor(env, requireToken(extra));
    const read = await boardOf(api, args.documentId, args.tab);
    if (!read.ok) return errorResult(read.message);
    const previous = args.previous === undefined ? null : parsePreviousReading(args.previous);
    if (args.previous !== undefined && previous === null)
      return errorResult(
        'previous is not the storm.json of an earlier export (schema livedoc.storm/1).',
      );
    const language = args.language ?? null;
    const bundle = buildExportBundle({
      reading: read.reading,
      previous,
      language,
      because: language ? 'chosen by the caller' : 'identified by the agent from its repository',
      board: { documentId: read.documentId, tabId: read.tabId, name: read.tabName, rev: read.rev },
      livedoc: 'mcp',
      exportedAt: new Date().toISOString(),
    });
    const changes = bundle.changes;
    return textResult({
      documentId: read.documentId,
      tabId: read.tabId,
      folder: `.livedoc/storm/${bundleFolderName(read.tabName, read.tabId)}`,
      files: Object.entries(bundle.files).map(([name, text]) => ({ name, text })),
      changes:
        changes === null ? null : hasChanges(changes) ? Object.values(changes).flat().length : 0,
      url: deepLink(env, read.documentId),
    });
  });
}
