// Agents' Event Storming calls (docs/specs/021-event-storming/suggestions.md "How an agent suggests"), shared by the
// CLI's storm verbs and the MCP's event-storming tools: read a board through the api's storm view, propose notes as one
// changeset of `suggest` operations, and remove a board's open suggestions. A refusal comes back in the words agents
// read; anything not from the api throws.

import { ApiError, type ApiClient } from '@livedoc/api-client';
import { CLIENT_HEADER, type ChangesetResponse } from '@livedoc/api-schema';
import type { TabSummary } from '../addressing';

export type Client = 'mcp' | 'cli';
import type { EsSuggestionSide } from '@livedoc/document';
import { formatResultLines } from '@livedoc/edit-operations';
import type { StormReading, StormSuggestion } from '@livedoc/storm-reading';
import { formatStormView } from '@livedoc/storm-reading';
import { apiRefusalOf } from '../plan/api-refusal';
import { tabPath } from '../verbs/shared';

// Suggestions one call may send (docs/specs/015-api/mcp-server.md §4.9f).
export const SUGGEST_NOTES_MAX = 30;
// Tabs looked through for a board when none is named.
const BOARD_SEARCH_MAX_TABS = 20;

export type StormRefusal = { ok: false; code: string; message: string };

export type StormRead = {
  ok: true;
  documentId: string;
  tabId: string;
  tabName: string;
  rev: number;
  reading: StormReading;
  suggestions: StormSuggestion[];
  lines: string[];
};

export type SuggestionInput = {
  kind: string;
  words: string;
  anchor: string;
  side: EsSuggestionSide;
  reason?: string;
  gap?: string;
};

export type StormWrite = {
  ok: true;
  documentId: string;
  tabId: string;
  changesetId: string | null;
  rev: number | null;
  // The result lines, as `livedoc edit` prints them.
  lines: string[];
};

const refuse = (code: string, message: string): StormRefusal => ({ ok: false, code, message });

// The engine's refusal, as `livedoc edit` prints it: the code, then the formatted rejections.
function engineRefusalOf(err: unknown): StormRefusal | null {
  if (!(err instanceof ApiError) || err.status >= 500 || err.code === null) return null;
  // A code was read from the body, so the body is a JSON object.
  const text: unknown = Reflect.get(JSON.parse(err.body) as object, 'text');
  return typeof text === 'string' ? refuse(err.code, text) : null;
}

const NOT_A_BOARD = 'not_event_storming';

// An api older than candidate contexts sends a reading without them (docs/specs/021-event-storming/candidate-contexts.md).
type StormViewBody = {
  reading: Omit<StormReading, 'contexts'> & { contexts?: StormReading['contexts'] };
  suggestions: StormSuggestion[];
  rev: number;
};

async function stormViewOf(
  api: ApiClient,
  documentId: string,
  tabId: string,
): Promise<StormViewBody | null> {
  try {
    return await api.json<StormViewBody>(`${tabPath(documentId, tabId)}?view=storm&json=1`);
  } catch (err) {
    if (err instanceof ApiError && err.code === NOT_A_BOARD) return null;
    throw err;
  }
}

// The board a call means: the tab named (by id, id prefix or name), else the first Event Storming tab.
export async function readStorm(
  api: ApiClient,
  document: { id: string; tabs: readonly TabSummary[] },
  tabRef?: string,
): Promise<StormRead | StormRefusal> {
  const ordered = [...document.tabs].sort((a, b) => a.orderIndex - b.orderIndex);
  const lower = tabRef?.toLowerCase();
  const named =
    lower === undefined
      ? ordered.slice(0, BOARD_SEARCH_MAX_TABS)
      : ordered.filter(
          (t) => t.id === tabRef || t.id.startsWith(tabRef!) || t.name.toLowerCase() === lower,
        );
  if (named.length === 0) return refuse('tab_not_found', `No tab "${tabRef}" in this document.`);
  if (named.length > 1 && lower !== undefined)
    return refuse(
      'tab_ambiguous',
      `"${tabRef}" names ${named.length} tabs: ${named.map((t) => t.name).join(', ')}.`,
    );
  try {
    for (const tab of named) {
      const body = await stormViewOf(api, document.id, tab.id);
      if (!body) continue;
      const reading: StormReading = { ...body.reading, contexts: body.reading.contexts ?? [] };
      return {
        ok: true,
        documentId: document.id,
        tabId: tab.id,
        tabName: tab.name,
        rev: body.rev,
        reading,
        suggestions: body.suggestions,
        lines: formatStormView(reading, body.suggestions),
      };
    }
  } catch (err) {
    const refusal = apiRefusalOf(err);
    if (!refusal) throw err;
    return { ok: false, ...refusal };
  }
  return refuse(
    NOT_A_BOARD,
    tabRef === undefined
      ? 'This document has no Event Storming board.'
      : `"${named[0]!.name}" is not an Event Storming board.`,
  );
}

async function postOperations(
  api: ApiClient,
  documentId: string,
  tabId: string,
  operations: unknown[] | string,
  summary: string,
  client: Client,
): Promise<StormWrite | StormRefusal> {
  try {
    const answer = await api.json<ChangesetResponse>(`${tabPath(documentId, tabId)}/changesets`, {
      method: 'POST',
      headers: { [CLIENT_HEADER]: client },
      body: JSON.stringify({ operations, summary }),
    });
    return {
      ok: true,
      documentId,
      tabId,
      changesetId: answer.changeset?.id ?? null,
      rev: answer.changeset?.rev ?? null,
      lines: formatResultLines(answer.results),
    };
  } catch (err) {
    const engine = engineRefusalOf(err);
    if (engine) return engine;
    const refusal = apiRefusalOf(err);
    if (!refusal) throw err;
    return { ok: false, ...refusal };
  }
}

// A candidate context proposed round some notes (docs/specs/021-event-storming/candidate-contexts.md), its notes by the
// refs the reading prints.
export type ContextSuggestionInput = {
  name: string;
  notes: string[];
  reason?: string;
};

// What a call proposes, counted as one changeset says it: "suggest 2 notes and 1 context".
function suggestSummary(notes: number, contexts: number): string {
  const say = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [notes ? say(notes, 'note') : null, contexts ? say(contexts, 'context') : null];
  return `suggest ${parts.filter(Boolean).join(' and ')}`;
}

// Suggestions as one changeset of `suggest` and `suggest-context` operations, all or nothing.
export async function suggestNotes(
  api: ApiClient,
  board: { documentId: string; tabId: string },
  suggestions: readonly SuggestionInput[],
  client: Client,
  contexts: readonly ContextSuggestionInput[] = [],
): Promise<StormWrite | StormRefusal> {
  const count = suggestions.length + contexts.length;
  if (count === 0) return refuse('nothing_to_suggest', 'Give at least one suggestion.');
  if (count > SUGGEST_NOTES_MAX)
    return refuse(
      'too_many_suggestions',
      `At most ${SUGGEST_NOTES_MAX} suggestions a call; send the rest after.`,
    );
  const operations = [
    ...suggestions.map((s) => ({ op: 'suggest', ...s })),
    ...contexts.map((c) => ({ op: 'suggest-context', ...c })),
  ];
  const summary = suggestSummary(suggestions.length, contexts.length);
  return postOperations(api, board.documentId, board.tabId, operations, summary, client);
}

// A whole wall from several photos as one draft (docs/specs/021-event-storming/event-storming.md Phase 11): the notes
// read off each photo, in wall order, stitched by the engine against the board as it is.
export type WallPhotoInput = {
  width: number;
  height: number;
  notes: { kind?: string; words?: string; x: number; y: number; w: number; h: number }[];
};

export async function addPhotoNotes(
  api: ApiClient,
  board: { documentId: string; tabId: string },
  photos: readonly WallPhotoInput[],
  client: Client,
): Promise<StormWrite | StormRefusal> {
  if (photos.length === 0) return refuse('nothing_to_add', 'Give at least one photo.');
  const notes = photos.reduce((sum, p) => sum + p.notes.length, 0);
  const summary = `add ${notes} note${notes === 1 ? '' : 's'} from ${photos.length} photo${photos.length === 1 ? '' : 's'}`;
  return postOperations(
    api,
    board.documentId,
    board.tabId,
    [{ op: 'wall', photos }],
    summary,
    client,
  );
}

// Suggest lines as written (the line form or JSON lines), checked to hold nothing but suggestions.
export async function suggestFromText(
  api: ApiClient,
  board: { documentId: string; tabId: string },
  text: string,
  client: Client,
): Promise<StormWrite | StormRefusal> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return refuse('nothing_to_suggest', 'The file holds no suggest lines.');
  const other = lines.find(
    (l) => !/^suggest(-context)?\s/.test(l) && !/^\{\s*"op"\s*:\s*"suggest(-context)?"/.test(l),
  );
  if (other)
    return refuse(
      'not_a_suggestion',
      `Only suggest lines go here; send other edits with livedoc edit: ${other}`,
    );
  if (lines.length > SUGGEST_NOTES_MAX)
    return refuse(
      'too_many_suggestions',
      `At most ${SUGGEST_NOTES_MAX} suggestions a call; send the rest after.`,
    );
  const contexts = lines.filter((l) =>
    /^suggest-context\s|^\{\s*"op"\s*:\s*"suggest-context"/.test(l),
  ).length;
  const summary = suggestSummary(lines.length - contexts, contexts);
  return postOperations(api, board.documentId, board.tabId, lines.join('\n'), summary, client);
}

// Every open suggestion on the board, orphans included, removed as one changeset: what Dismiss All does.
export async function clearSuggestions(
  api: ApiClient,
  read: StormRead,
  client: Client,
): Promise<StormWrite | StormRefusal> {
  if (read.suggestions.length === 0)
    return {
      ok: true,
      documentId: read.documentId,
      tabId: read.tabId,
      changesetId: null,
      rev: null,
      lines: [],
    };
  const operations = read.suggestions.map((s) => ({ op: 'rm', target: s.ref }));
  const summary = `clear ${read.suggestions.length} suggestion${read.suggestions.length === 1 ? '' : 's'}`;
  return postOperations(api, read.documentId, read.tabId, operations, summary, client);
}
