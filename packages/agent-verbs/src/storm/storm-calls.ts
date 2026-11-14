// Agents' Event Storming calls (docs/specs/021-event-storming/suggestions.md "How an agent suggests",
// suggested-changes.md, lane-plans.md), shared by the CLI's storm verbs and the MCP's event-storming tools: read a board
// through the api's storm view, propose notes, contexts, names, note changes and a lane plan as one changeset of the
// `suggest` operations, and remove a board's open suggestions. A refusal comes back in the words agents read; anything not from the api throws.

import { ApiError, type ApiClient } from '@livedoc/api-client';
import { CLIENT_HEADER, type ChangesetResponse } from '@livedoc/api-schema';
import type { TabSummary } from '../addressing';

export type Client = 'mcp' | 'cli';
import type { EsSuggestionSide } from '@livedoc/document';
import { EDIT_OPERATION_NAMES, formatResultLines } from '@livedoc/edit-operations';
import type {
  OlderStormReading,
  StormDeclined,
  StormLanePlan,
  StormReading,
  StormSuggestedChange,
  StormSuggestion,
} from '@livedoc/storm-reading';
import { formatStormView, withReadingDefaults } from '@livedoc/storm-reading';
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
  // The changes suggested to what is on the board, and what a person dismissed before.
  changes: StormSuggestedChange[];
  // The open lane plan, when the board holds one.
  plan: StormLanePlan | null;
  declined: StormDeclined[];
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

// An api older than candidate contexts or the board structure sends a reading without them, one older than suggested
// changes no `changes` or `declined`, and one older than lane plans no `plan`
// (docs/specs/021-event-storming/board-reading.md "Output").
type StormViewBody = {
  reading: OlderStormReading;
  suggestions: StormSuggestion[];
  changes?: StormSuggestedChange[];
  plan?: StormLanePlan | null;
  declined?: StormDeclined[];
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
      const reading = withReadingDefaults(body.reading);
      const { changes = [], plan = null, declined = [] } = body;
      return {
        ok: true,
        documentId: document.id,
        tabId: tab.id,
        tabName: tab.name,
        rev: body.rev,
        reading,
        suggestions: body.suggestions,
        changes,
        plan,
        declined,
        lines: formatStormView(reading, body.suggestions, { changes, plan, declined }),
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

// Another name for a candidate context, or one name for several merged
// (docs/specs/021-event-storming/suggested-changes.md "Name suggestions"), its contexts by the refs the reading prints.
export type NameSuggestionInput = {
  name: string;
  contexts: string[];
  reason?: string;
};

// A change to one workshop note (suggested-changes.md "Note changes"): `change` says which, and the members its edit
// operation takes say what (a reword's `words`, `term` and `to`; a `kind`; a split's `parts`).
export type NoteChangeInput = {
  note: string;
  change: 'reword' | 'kind' | 'split' | 'remove';
  words?: string;
  term?: string;
  to?: string;
  kind?: string;
  parts?: string[];
  reason?: string;
};

// One lane of a lane plan (docs/specs/021-event-storming/lane-plans.md "How an agent suggests one"): its name, and
// what it holds, said any of four ways: the lanes the reading numbers, note kinds, candidate contexts and notes by ref.
export type LaneInput = {
  name: string;
  lanes?: number[];
  kinds?: string[];
  contexts?: string[];
  notes?: string[];
};

// What one call proposes: notes, candidate contexts, names for contexts, changes to notes, and the lanes of one lane
// plan, top to bottom, with why.
export type Proposals = {
  suggestions?: readonly SuggestionInput[];
  contexts?: readonly ContextSuggestionInput[];
  names?: readonly NameSuggestionInput[];
  changes?: readonly NoteChangeInput[];
  lanes?: readonly LaneInput[];
  lanesReason?: string;
};

type ProposalCounts = {
  notes: number;
  contexts: number;
  names: number;
  changes: number;
  lanes: number;
};

// What a call proposes, counted as one changeset says it: "suggest 2 notes, 1 context and 3 changes".
function suggestSummary(counts: ProposalCounts): string {
  const parts = (
    [
      [counts.notes, 'note'],
      [counts.contexts, 'context'],
      [counts.names, 'name'],
      [counts.lanes, 'lane'],
      [counts.changes, 'change'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`);
  const last = parts.pop();
  return `suggest ${parts.length ? `${parts.join(', ')} and ${last}` : last}`;
}

// Proposals as one changeset of the suggest operations, all or nothing.
export async function suggestNotes(
  api: ApiClient,
  board: { documentId: string; tabId: string },
  { suggestions = [], contexts = [], names = [], changes = [], lanes = [], lanesReason }: Proposals,
  client: Client,
): Promise<StormWrite | StormRefusal> {
  const count = suggestions.length + contexts.length + names.length + changes.length + lanes.length;
  if (count === 0) return refuse('nothing_to_suggest', 'Give at least one suggestion.');
  if (count > SUGGEST_NOTES_MAX)
    return refuse(
      'too_many_suggestions',
      `At most ${SUGGEST_NOTES_MAX} suggestions a call; send the rest after.`,
    );
  const operations = [
    ...suggestions.map((s) => ({ op: 'suggest', ...s })),
    ...contexts.map((c) => ({ op: 'suggest-context', ...c })),
    ...names.map((n) => ({ op: 'suggest-name', ...n })),
    ...changes.map(({ change, ...rest }) => ({ op: `suggest-${change}`, ...rest })),
    // The plan's reason rides its first line: the engine takes the first given.
    ...lanes.map((lane, i) => ({
      op: 'suggest-lane',
      ...lane,
      ...(i === 0 && lanesReason ? { reason: lanesReason } : {}),
    })),
  ];
  const summary = suggestSummary({
    notes: suggestions.length,
    contexts: contexts.length,
    names: names.length,
    changes: changes.length,
    lanes: lanes.length,
  });
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

// The operations that only propose: the suggest family.
const SUGGEST_OPERATIONS: readonly string[] = EDIT_OPERATION_NAMES.filter((name) =>
  name.startsWith('suggest'),
);

// The suggest operation a line is, in the line form or as a JSON line; null for anything else.
function suggestOperationOf(line: string): string | null {
  const name = /^([a-z-]+)(\s|$)/.exec(line)?.[1] ?? /^\{\s*"op"\s*:\s*"([a-z-]+)"/.exec(line)?.[1];
  return name !== undefined && SUGGEST_OPERATIONS.includes(name) ? name : null;
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
  const other = lines.find((l) => suggestOperationOf(l) === null);
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
  const named = lines.map(suggestOperationOf);
  const notes = named.filter((name) => name === 'suggest').length;
  const contexts = named.filter((name) => name === 'suggest-context').length;
  const names = named.filter((name) => name === 'suggest-name').length;
  const lanes = named.filter((name) => name === 'suggest-lane').length;
  const summary = suggestSummary({
    notes,
    contexts,
    names,
    lanes,
    changes: lines.length - notes - contexts - names - lanes,
  });
  return postOperations(api, board.documentId, board.tabId, lines.join('\n'), summary, client);
}

// Every open suggestion on the board, orphans included, removed as one changeset: the suggested notes and contexts
// and the open lane plan go, and what is suggested on a note or a kept context is taken back (`rm <ref> suggested`),
// the note or context staying. An agent's own, never a person's dismissal: nothing is remembered as declined.
export async function clearSuggestions(
  api: ApiClient,
  read: StormRead,
  client: Client,
): Promise<StormWrite | StormRefusal> {
  const count = read.suggestions.length + read.changes.length + (read.plan ? 1 : 0);
  if (count === 0)
    return {
      ok: true,
      documentId: read.documentId,
      tabId: read.tabId,
      changesetId: null,
      rev: null,
      lines: [],
    };
  const going = new Set(read.suggestions.map((s) => s.ref));
  // What a change is kept on: its note, or the first of a name's contexts. One a removal already takes needs no more.
  const holders = new Set(
    read.changes
      .map((c) => (c.type === 'name' ? c.contextRefs[0]! : c.noteRef))
      .filter((ref) => !going.has(ref)),
  );
  const operations = [
    ...read.suggestions.map((s) => ({ op: 'rm', target: s.ref })),
    ...[...holders].map((ref) => ({ op: 'rm', target: ref, suggested: true })),
    ...(read.plan ? [{ op: 'rm', target: read.plan.ref }] : []),
  ];
  const summary = `clear ${count} suggestion${count === 1 ? '' : 's'}`;
  return postOperations(api, read.documentId, read.tabId, operations, summary, client);
}
