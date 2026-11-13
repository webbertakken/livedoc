// Candidate contexts on an event-storming board (docs/specs/021-event-storming/candidate-contexts.md): a name and the
// workshop notes it groups, carried as a `shape` element with `esContext` so it travels like any element (changesets,
// the room, undo, merge). It is drawn from its notes (candidate-context-outline.ts), never by the element painters:
// the layer funnels drop it as they drop a suggestion. Pure: every write answers the board after it, unchanged (the
// same array) when nothing changes.

import { eventStormingKindOf } from './event-storming';
import {
  isSuggestion,
  SUGGESTION_BY_MAX,
  SUGGESTION_REASON_MAX,
} from './event-storming-suggestions';
import type { Rect } from './geometry-primitives';
import type { Element, ElementId, ShapeElement, StickyElement } from './index';

/** The longest name, characters. */
export const CONTEXT_NAME_MAX = 60;
/** The most notes one context groups: as many as a domain export reads (safe range: 100 to 1000). */
export const CONTEXT_NOTES_MAX = 400;
/** How far clear of its own outline a dragged note must land to leave it, canvas px: half a note. */
export const CONTEXT_LEAVE_PX = 100;

/** Who suggested a context and why; present while it is suggested, dropped when a person applies it. */
export type EsContextSuggestion = { reason?: string; by?: string };

export type EsContext = {
  /** The workshop notes it groups, by id. */
  notes: ElementId[];
  suggestion?: EsContextSuggestion;
};

export type CandidateContextElement = ShapeElement & { esContext: EsContext; label: string };

const optionalText = (v: unknown, max: number) =>
  v === undefined || (typeof v === 'string' && v.length <= max);

function isValidSuggestion(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return optionalText(s.reason, SUGGESTION_REASON_MAX) && optionalText(s.by, SUGGESTION_BY_MAX);
}

export function isValidEsContext(v: unknown): v is EsContext {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    Array.isArray(c.notes) &&
    c.notes.length > 0 &&
    c.notes.length <= CONTEXT_NOTES_MAX &&
    c.notes.every((id) => typeof id === 'string' && id.length > 0) &&
    (c.suggestion === undefined || isValidSuggestion(c.suggestion))
  );
}

/** A name a context may carry: 1 to CONTEXT_NAME_MAX characters, not only space. */
export function isValidContextName(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= CONTEXT_NAME_MAX;
}

export function isCandidateContext(el: {
  type: string;
  esContext?: unknown;
}): el is CandidateContextElement {
  return el.type === 'shape' && el.esContext !== undefined;
}

export function isSuggestedContext(el: { type: string; esContext?: unknown }): boolean {
  return isCandidateContext(el) && el.esContext.suggestion !== undefined;
}

export function isKeptContext(el: { type: string; esContext?: unknown }): boolean {
  return isCandidateContext(el) && el.esContext.suggestion === undefined;
}

/** A suggestion a person has yet to apply or dismiss: a suggested note or a suggested context. */
export function isOpenSuggestion(el: Element): boolean {
  return isSuggestion(el) || isSuggestedContext(el);
}

export function candidateContexts(elements: readonly Element[]): CandidateContextElement[] {
  return elements.filter(isCandidateContext);
}

const isNote = (el: Element | undefined): el is StickyElement =>
  el !== undefined && el.type === 'sticky' && eventStormingKindOf(el) !== null;

/** A context's notes: the workshop notes it names that still exist, in its order. */
export function contextNotes(
  context: CandidateContextElement,
  byId: ReadonlyMap<ElementId, Element>,
): StickyElement[] {
  return context.esContext.notes.map((id) => byId.get(id)).filter(isNote);
}

/** The context, kept or suggested, a note belongs to. */
export function contextOf(
  elements: readonly Element[],
  noteId: ElementId,
): CandidateContextElement | null {
  return candidateContexts(elements).find((c) => c.esContext.notes.includes(noteId)) ?? null;
}

/** The box round some notes: what a context stores as its snapshot `x`, `y`, `width` and `height`. */
export function contextBounds(notes: readonly Rect[]): Rect {
  if (notes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...notes.map((n) => n.x));
  const y = Math.min(...notes.map((n) => n.y));
  return {
    x,
    y,
    width: Math.max(...notes.map((n) => n.x + n.width)) - x,
    height: Math.max(...notes.map((n) => n.y + n.height)) - y,
  };
}

/** A new context round some notes: suggested when it carries a suggestion, kept otherwise. */
export function newContextElement(input: {
  id: ElementId;
  name: string;
  notes: readonly StickyElement[];
  suggestion?: EsContextSuggestion;
}): CandidateContextElement {
  const first = input.notes[0];
  return {
    id: input.id,
    type: 'shape',
    shape: 'square',
    ...contextBounds(input.notes),
    label: input.name,
    ...(first?.layerId !== undefined ? { layerId: first.layerId } : {}),
    esContext: {
      notes: input.notes.map((n) => n.id),
      ...(input.suggestion ? { suggestion: input.suggestion } : {}),
    },
  };
}

// The context with its notes set to `notes`, its snapshot box redrawn round them.
function withNotes(
  context: CandidateContextElement,
  notes: ElementId[],
  byId: ReadonlyMap<ElementId, Element>,
): CandidateContextElement {
  const rects = notes.map((id) => byId.get(id)).filter(isNote);
  return { ...context, ...contextBounds(rects), esContext: { ...context.esContext, notes } };
}

// Every context's notes rewritten by `next` (null drops the context); the same array when nothing changed.
function rewrite(
  elements: Element[],
  next: (c: CandidateContextElement) => ElementId[] | null,
): Element[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  let changed = false;
  const out: Element[] = [];
  for (const el of elements) {
    if (!isCandidateContext(el)) {
      out.push(el);
      continue;
    }
    const notes = next(el);
    const same =
      notes !== null &&
      notes.length === el.esContext.notes.length &&
      notes.every((id, i) => id === el.esContext.notes[i]);
    if (same) {
      out.push(el);
      continue;
    }
    changed = true;
    if (notes !== null && notes.some((id) => isNote(byId.get(id))))
      out.push(withNotes(el, notes, byId));
  }
  return changed ? out : elements;
}

/** Notes join a context, leaving any other; a context left with no note goes. Only workshop notes join. */
export function joinContext(
  elements: Element[],
  contextId: ElementId,
  noteIds: readonly ElementId[],
): Element[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const target = byId.get(contextId);
  if (!target || !isCandidateContext(target)) return elements;
  const joining = noteIds.filter((id) => isNote(byId.get(id)));
  const moving = new Set(joining);
  return rewrite(elements, (c) => {
    const others = c.esContext.notes.filter((id) => !moving.has(id));
    if (c.id !== contextId) return others;
    const fresh = joining.filter((id) => !c.esContext.notes.includes(id));
    return fresh.length === 0 ? c.esContext.notes : [...c.esContext.notes, ...fresh];
  });
}

/** Notes leave whatever context holds them; a context left with no note goes. */
export function leaveContext(elements: Element[], noteIds: readonly ElementId[]): Element[] {
  const leaving = new Set(noteIds);
  return rewrite(elements, (c) => c.esContext.notes.filter((id) => !leaving.has(id)));
}

/** A context renamed: trimmed, runs of space as one, cut to CONTEXT_NAME_MAX. An empty name keeps the old one. */
export function renameContext(elements: Element[], contextId: ElementId, name: string): Element[] {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, CONTEXT_NAME_MAX).trim();
  const target = elements.find((el) => el.id === contextId);
  if (!clean || !target || !isCandidateContext(target) || target.label === clean) return elements;
  return elements.map((el) => (el.id === contextId ? { ...target, label: clean } : el));
}

/** Contexts removed; their notes stay. */
export function removeContexts(elements: Element[], ids: readonly ElementId[]): Element[] {
  const gone = new Set(ids);
  const out = elements.filter((el) => !(gone.has(el.id) && isCandidateContext(el)));
  return out.length === elements.length ? elements : out;
}

/** Suggested contexts kept, in the order given: each drops its suggestion and takes its notes from any other. */
export function applyContextSuggestions(elements: Element[], ids: readonly ElementId[]): Element[] {
  let board = elements;
  for (const id of ids) {
    const s = board.find((el) => el.id === id);
    if (!s || !isSuggestedContext(s)) continue;
    const c = s as CandidateContextElement;
    const { suggestion: _dropped, ...kept } = c.esContext;
    const byId = new Map(board.map((el) => [el.id, el]));
    if (!kept.notes.some((n) => isNote(byId.get(n)))) {
      board = board.filter((el) => el.id !== id);
      continue;
    }
    const taken = new Set(kept.notes);
    board = board.map((el) => (el.id === id ? { ...c, esContext: kept } : el));
    board = rewrite(board, (other) =>
      other.id === id ? other.esContext.notes : other.esContext.notes.filter((n) => !taken.has(n)),
    );
  }
  return board;
}

/** The contexts left with no workshop note once `gone` is removed: a delete takes them in the same step. */
export function emptyContextIds(
  elements: readonly Element[],
  gone: ReadonlySet<ElementId>,
): ElementId[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return candidateContexts(elements)
    .filter((c) => !c.esContext.notes.some((id) => !gone.has(id) && isNote(byId.get(id))))
    .map((c) => c.id);
}
