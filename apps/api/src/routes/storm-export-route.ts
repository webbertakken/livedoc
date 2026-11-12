import { isEventStormingTab } from '@livedoc/document';
import type {
  StormExportError,
  StormExportRequest,
  StormExportResponse,
} from '@livedoc/api-schema';
import {
  DOMAIN_EXPORT_MAX_NOTES,
  buildExportBundle,
  isDomainLanguage,
  parseWrittenFiles,
  previousExport,
  readBoard,
  writeMessages,
  zipFiles,
  type PreviousExport,
} from '@livedoc/storm-reading';
import { chatCompletions } from '../ai-client';
import { resolveAiProvider } from '../ai-provider';
import { readChatStream } from '../ai-stream';
import { getDocument, getTab } from '../db';
import { json, methodNotAllowed, notFound } from '../responses';
import { aiGate } from './ai-gate';
import {
  deniedOnTab,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';

// The zip export of an Event Storming board (docs/specs/021-event-storming/domain-export.md "The zip"):
// POST /api/documents/:id/tabs/:tabId/storm-export. Reads the board as anyone who may read it does, builds the
// bundle, and, when the deployment has a model, has it write the spec and the types; answers the zip's files, which
// the editor writes into the archive. Without a model the bundle alone, and no model budget is touched.

// Room for a spec and its types in one answer. Safe range: 8k to 64k (the provider's output cap bounds it).
export const STORM_EXPORT_MAX_TOKENS = 32_000;

const refuse = (error: StormExportError, status: number, message: string) => {
  console.info('[storm] export refused', { error });
  return json({ error, message }, { status });
};

const isTextRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((text) => typeof text === 'string');

export async function handleStormExport(
  ctx: DocumentRouteContext,
  documentId: string,
  tabId: string,
): Promise<Response> {
  const { request, env } = ctx;
  if (request.method !== 'POST') return methodNotAllowed();
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const document = await getDocument(env, documentId);
  if (!document) return missingDocument(ctx, documentId);
  // Read access, as every export: a tab-scoped link reads only its own tab.
  const grant = await gateGrant(ctx, documentId, document.ownerId, document.teamId);
  if (!grant || (grant.tabScope !== null && grant.tabScope !== tabId))
    return deniedOnTab(ctx, document);
  const tab = await getTab(env, documentId, tabId);
  if (!tab) return notFound();
  if (!isEventStormingTab(tab))
    return refuse('not_event_storming', 400, 'the domain export reads an Event Storming board');

  const body = (await request.json().catch(() => null)) as Partial<StormExportRequest> | null;
  const language = body?.language;
  if (typeof language !== 'string' || !isDomainLanguage(language))
    return refuse('language_invalid', 400, 'language is one of the domain export languages');
  let previous: PreviousExport | null = null;
  if (body?.previous !== undefined) {
    if (!isTextRecord(body.previous))
      return refuse('previous_invalid', 400, 'previous is the earlier zip’s text files by path');
    previous = previousExport(body.previous);
    if (!previous.ok)
      return refuse(
        previous.error,
        previous.error === 'previous_too_large' ? 413 : 400,
        previous.error === 'previous_too_large'
          ? 'the earlier export is larger than an export may update'
          : 'the earlier zip holds no livedoc/storm.json of an export',
      );
  }

  const started = Date.now();
  const reading = readBoard(tab, { documentId });
  if (reading.notes.length > DOMAIN_EXPORT_MAX_NOTES)
    return refuse(
      'board_too_large',
      413,
      `a board of up to ${DOMAIN_EXPORT_MAX_NOTES} notes exports`,
    );
  const bundle = buildExportBundle({
    reading,
    previous: previous?.ok ? previous.reading : null,
    language,
    because: 'chosen in the export dialog',
    board: { documentId, tabId, name: tab.name, rev: tab.rev ?? null },
    livedoc: 'web',
    exportedAt: new Date().toISOString(),
  });
  const sources = previous?.ok ? previous.sources : {};

  const answer = (files: Record<string, string>, written: boolean, dropped = 0): Response => {
    console.info('[storm] export', {
      doc: documentId,
      tab: tabId,
      notes: reading.notes.length,
      written,
      files: Object.keys(files).length,
      dropped,
      ms: Date.now() - started,
    });
    return json({ files, written } satisfies StormExportResponse);
  };

  // No model on this deployment, or the bundle asked for alone: the README says what to do with it.
  if (body?.bundleOnly === true || !resolveAiProvider(env, 'assistant'))
    return answer(zipFiles(bundle, null), false);

  const refused = await aiGate(ctx, 'assistant');
  if (refused) return refused;
  const provider = resolveAiProvider(env, 'assistant')!;
  let text: string;
  try {
    const res = await chatCompletions(provider, {
      model: provider.model,
      messages: writeMessages(bundle, sources),
      stream: true,
      max_tokens: STORM_EXPORT_MAX_TOKENS,
      response_format: { type: 'json_object' },
    });
    if (!res.ok || !res.body) {
      console.error('[storm] export model error', { status: res.status });
      return refuse('ai_failed', 502, 'the model could not write the export');
    }
    text = await readChatStream(res.body as ReadableStream<Uint8Array>);
  } catch (err) {
    console.error(
      '[storm] export model unreachable',
      err instanceof Error ? err.message : String(err),
    );
    return refuse('ai_failed', 502, 'the model could not write the export');
  }
  const written = parseWrittenFiles(text);
  if (!written.ok) {
    console.error('[storm] export answer unreadable', { chars: text.length });
    return refuse('ai_failed', 502, 'the model answered something other than the export');
  }
  if (written.dropped.length > 0)
    console.warn('[storm] export paths dropped', { paths: written.dropped });
  // A file of the earlier export the model left out stays as it was.
  const kept = Object.fromEntries(
    Object.entries(sources).filter(([path]) => !(path in written.files)),
  );
  return answer(zipFiles(bundle, { ...kept, ...written.files }), true, written.dropped.length);
}
