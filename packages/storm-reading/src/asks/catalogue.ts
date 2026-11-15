// The catalogue of asks (docs/specs/021-event-storming/asks.md "The topics", "The three hands"): what a person may
// ask for on an Event Storming board, what each ask may be about, and who may answer. Closed: a new topic is a new
// row in the spec first. Pure.

import {
  eventStormingKindOf,
  isCandidateContext,
  isSuggestion,
  type Element,
  type ElementId,
} from '@livedoc/document';

export const STORM_ASK_TOPICS = ['gaps', 'contexts', 'names', 'merge', 'wording', 'lanes'] as const;
export type StormAskTopic = (typeof STORM_ASK_TOPICS)[number];

/** Who answers an ask. The CLI comes first: it is the one recommended. */
export const STORM_ASK_HANDS = ['cli', 'mcp', 'built-in'] as const;
export type StormAskHand = (typeof STORM_ASK_HANDS)[number];

/** What an ask is about, read from the selection. */
export type AskScope =
  | { type: 'board' }
  | { type: 'notes'; ids: ElementId[] }
  | { type: 'context'; id: ElementId }
  | { type: 'contexts'; ids: ElementId[] };

type Ask = {
  // What the menu calls it.
  menu: string;
  // The suggest lines that answer it.
  operations: readonly string[];
  // What it may be about.
  scopes: readonly AskScope['type'][];
};

const NAME_LINES = ['suggest-name'] as const;

export const STORM_ASKS: Record<StormAskTopic, Ask> = {
  gaps: { menu: 'Fill the Gaps', operations: ['suggest'], scopes: ['board', 'notes'] },
  contexts: { menu: 'Group into Contexts', operations: ['suggest-context'], scopes: ['board'] },
  names: { menu: 'Suggest Names', operations: NAME_LINES, scopes: ['context'] },
  merge: { menu: 'Name the Merge', operations: NAME_LINES, scopes: ['contexts'] },
  wording: {
    menu: 'Sharpen the Wording',
    operations: ['suggest-reword', 'suggest-kind', 'suggest-split', 'suggest-remove'],
    scopes: ['board', 'context', 'notes'],
  },
  lanes: { menu: 'Reorganise into Lanes', operations: ['suggest-lane'], scopes: ['board'] },
};

export function isAskTopic(value: unknown): value is StormAskTopic {
  return STORM_ASK_TOPICS.some((topic) => topic === value);
}

/** The topics a scope offers, in menu order. */
export function askTopicsFor(scope: AskScope): StormAskTopic[] {
  return STORM_ASK_TOPICS.filter((topic) => askFits(topic, scope));
}

export function askFits(topic: StormAskTopic, scope: AskScope): boolean {
  return STORM_ASKS[topic].scopes.includes(scope.type);
}

const isId = (v: unknown): v is ElementId => typeof v === 'string' && v.length > 0;
const areIds = (v: unknown, atLeast: number): v is ElementId[] =>
  Array.isArray(v) && v.length >= atLeast && v.every(isId);

/** A scope as it arrives over the wire: well formed, whatever board it names. */
export function isAskScope(value: unknown): value is AskScope {
  if (typeof value !== 'object' || value === null) return false;
  const scope = value as { type?: unknown; id?: unknown; ids?: unknown };
  switch (scope.type) {
    case 'board':
      return true;
    case 'notes':
      return areIds(scope.ids, 1);
    case 'context':
      return isId(scope.id);
    case 'contexts':
      return areIds(scope.ids, 2);
    default:
      return false;
  }
}

const isWorkshopNote = (el: Element) => eventStormingKindOf(el) !== null && !isSuggestion(el);

/** Whether everything a scope names is on the board, as what the scope names it for. */
export function askScopeHolds(scope: AskScope, elements: readonly Element[]): boolean {
  if (scope.type === 'board') return true;
  const byId = new Map(elements.map((el) => [el.id, el]));
  const are = (ids: readonly ElementId[], is: (el: Element) => boolean) =>
    ids.every((id) => {
      const el = byId.get(id);
      return el !== undefined && is(el);
    });
  if (scope.type === 'notes') return are(scope.ids, isWorkshopNote);
  return are(scope.type === 'context' ? [scope.id] : scope.ids, isCandidateContext);
}

/** What an ask is about, from what is selected: the contexts, else the workshop notes, else the board. A context
 *  counts kept or suggested alike; a suggested note, and anything that is no workshop note, never does. */
export function askScopeOf(
  elements: readonly Element[],
  selected: { notes: readonly ElementId[]; contexts: readonly ElementId[] },
): AskScope {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const held = (ids: readonly ElementId[], is: (el: Element) => boolean) =>
    [...new Set(ids)].filter((id) => {
      const el = byId.get(id);
      return el !== undefined && is(el);
    });
  const contexts = held(selected.contexts, isCandidateContext);
  if (contexts.length === 1) return { type: 'context', id: contexts[0]! };
  if (contexts.length > 1) return { type: 'contexts', ids: contexts };
  const notes = held(selected.notes, isWorkshopNote);
  return notes.length > 0 ? { type: 'notes', ids: notes } : { type: 'board' };
}
