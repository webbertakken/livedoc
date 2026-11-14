// `rm <selector> [all] [keep-arrows]` (docs/specs/024-agents/edit-operations.md
// "Operations"): arrows attached to what is removed go with it, transitively; with `keepArrows`
// their attached ends are freed where they are drawn instead. A mind node's parent link to a removed
// node is removed (EO30).

import type { EditRejection } from '@livedoc/api-schema';
import {
  endpointPosition,
  isCandidateContext,
  noteChangesOf,
  pruneNameSuggestions,
  withNoteChanges,
  type ArrowElement,
  type Element,
  type ElementId,
  type Endpoint,
  type ShapeElement,
  type StickyElement,
} from '@livedoc/document';
import { resolveSome } from '../selectors';
import {
  currentElements,
  type EditState,
  type Removal,
  refsOf,
  refuseLocked,
  removeElement,
  writeFields,
} from '../state';
import type { RmOperation } from '../types';
import { refusal } from './suggestion-rules';

const attachedTo = (end: Endpoint): ElementId | null =>
  end.kind === 'pinned' ? end.elementId : end.kind === 'on-arrow' ? end.arrowId : null;

// Every arrow by the ids its ends are attached to.
function arrowsByAttachment(state: EditState): Map<ElementId, ArrowElement[]> {
  const attached = new Map<ElementId, ArrowElement[]>();
  for (const el of state.byId.values()) {
    if (el.type !== 'arrow') continue;
    for (const id of new Set([attachedTo(el.from), attachedTo(el.to)])) {
      if (id === null) continue;
      const arrows = attached.get(id);
      if (arrows) arrows.push(el);
      else attached.set(id, [el]);
    }
  }
  return attached;
}

// The arrows removed with `target`, each with the element that pulled it, breadth first.
function cascadeOf(
  target: ElementId,
  attached: ReadonlyMap<ElementId, ArrowElement[]>,
): Map<ElementId, ElementId> {
  const pulled = new Map<ElementId, ElementId>();
  const queue = [target];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const arrow of attached.get(queue[i]!) ?? []) {
      if (seen.has(arrow.id)) continue;
      seen.add(arrow.id);
      pulled.set(arrow.id, queue[i]!);
      queue.push(arrow.id);
    }
  }
  return pulled;
}

function freeEnds(state: EditState, arrow: ArrowElement, target: ElementId): ArrowElement {
  const free = (end: Endpoint): Endpoint => {
    if (attachedTo(end) !== target) return end;
    const { x, y } = endpointPosition(end, state.byId);
    return { kind: 'free', x, y };
  };
  return { ...arrow, from: free(arrow.from), to: free(arrow.to) };
}

const lockRejection = (state: EditState, el: Element, operation: number) => {
  const lock = state.locked.get(el.id);
  return lock ? refuseLocked(state, 'rm', operation, el, lock) : null;
};

function keepArrows(
  state: EditState,
  target: ElementId,
  arrows: readonly ArrowElement[],
  operation: number,
): EditRejection | null {
  for (const arrow of arrows) {
    const locked = lockRejection(state, arrow, operation);
    if (locked) return locked;
  }
  for (const arrow of arrows) {
    const freed = freeEnds(state, arrow, target);
    const ends = (['from', 'to'] as const).filter((end) => freed[end] !== arrow[end]);
    writeFields(state, freed, operation, ends);
    state.warnings.push({
      code: 'arrows_freed',
      ref: arrow.id,
      message: `${refsOf(state).refOf(arrow.id)} ${ends.join(' and ')} freed where it was drawn: ${refsOf(state).refOf(target)} was removed`,
    });
  }
  return null;
}

// Mind nodes whose parent is removed lose the link and become roots.
function orphansOf(state: EditState, removed: ReadonlySet<ElementId>): ShapeElement[] {
  const orphans: ShapeElement[] = [];
  for (const el of state.byId.values()) {
    if (el.type !== 'shape' || el.mindParentId === undefined || removed.has(el.id)) continue;
    if (removed.has(el.mindParentId)) orphans.push(el);
  }
  return orphans;
}

export function applyRm(
  state: EditState,
  { target, all, keepArrows: keep, suggested }: RmOperation,
  operation: number,
): EditRejection | null {
  const resolved = resolveSome(state, target, operation, all === true);
  if ('rejection' in resolved) return resolved.rejection;
  if (suggested) return takeBack(state, resolved.els, operation);
  for (const { id } of resolved.els) {
    // An arrow already gone with an earlier target's cascade.
    const el = state.byId.get(id);
    if (!el) continue;
    const rejection = removeOne(state, el, keep === true, operation);
    if (rejection) return rejection;
  }
  return null;
}

// `rm <target> suggested` (docs/specs/021-event-storming/suggested-changes.md): what is suggested on each target goes
// (a note's changes, a context's name suggestions) and the target stays. How an agent takes its own back.
function takeBack(
  state: EditState,
  els: readonly Element[],
  operation: number,
): EditRejection | null {
  let changes = 0;
  let names = 0;
  for (const el of els) {
    const held = el.type === 'sticky' ? noteChangesOf(el).length : 0;
    const named = isCandidateContext(el) ? (el.esContext.names?.length ?? 0) : 0;
    if (held + named === 0) continue;
    const locked = lockRejection(state, el, operation);
    if (locked) return locked;
    if (isCandidateContext(el)) {
      const { names: _dropped, ...rest } = el.esContext;
      writeFields(state, { ...el, esContext: rest }, operation, ['esContext']);
    } else writeFields(state, withNoteChanges(el as StickyElement, []), operation, ['esChanges']);
    changes += held;
    names += named;
  }
  if (changes + names === 0)
    return refusal(
      'nothing_suggested',
      operation,
      [`nothing is suggested on ${els.map((el) => refsOf(state).refOf(el.id)).join(', ')}`],
      'the storm view lists the suggested changes with the refs they are on',
    );
  state.log('[edit-ops] took back', { operation, changes, names });
  return null;
}

// The name suggestions that named a context now gone go with it (suggested-changes.md "It goes with its contexts").
function pruneNames(state: EditState, operation: number): void {
  const before = [...currentElements(state)];
  const after = pruneNameSuggestions(before);
  after.forEach((el, i) => {
    if (el !== before[i]) writeFields(state, el, operation, ['esContext']);
  });
}

// Removes one element with its cascade; `removal` says why it went when no operation named it.
export function removeOne(
  state: EditState,
  el: Element,
  keep: boolean,
  operation: number,
  removal: Removal = {},
): EditRejection | null {
  const targetLocked = lockRejection(state, el, operation);
  if (targetLocked) return targetLocked;
  const attached = arrowsByAttachment(state);
  const pulled = keep ? new Map<ElementId, ElementId>() : cascadeOf(el.id, attached);
  for (const id of pulled.keys()) {
    const locked = lockRejection(state, state.byId.get(id)!, operation);
    if (locked) return locked;
  }
  const removed = new Set([el.id, ...pulled.keys()]);
  const orphans = orphansOf(state, removed);
  for (const orphan of orphans) {
    const locked = lockRejection(state, orphan, operation);
    if (locked) return locked;
  }
  if (keep) {
    const kept = keepArrows(state, el.id, attached.get(el.id) ?? [], operation);
    if (kept) return kept;
  }
  for (const orphan of orphans) {
    const { mindParentId: _removed, ...rest } = orphan;
    writeFields(state, rest, operation, ['mindParentId']);
  }
  removeElement(state, el.id, operation, removal);
  for (const [id, by] of pulled) removeElement(state, id, operation, { pinnedTo: by });
  // The suggestions anchored on what went, and on those, go too (docs/specs/021-event-storming/suggestions.md "It goes
  // with its anchor"), whether or not the arrows are kept.
  const anchored = anchoredOn(state, removed);
  for (const [id, by] of anchored) removeElement(state, id, operation, { anchoredTo: by });
  // A candidate context left with none of its notes goes too (docs/specs/021-event-storming/candidate-contexts.md
  // "A note leaving takes nothing with it"); one that keeps a note stays, its notes untouched.
  const emptied = emptiedBy(state, new Set([...removed, ...anchored.keys()]));
  for (const id of emptied) removeElement(state, id, operation, { emptiedBy: el.id });
  if (emptied.length > 0 || isCandidateContext(el)) pruneNames(state, operation);
  return null;
}

// The candidate contexts that held one of the removed ids and now hold no note that is left.
function emptiedBy(state: EditState, removed: ReadonlySet<ElementId>): ElementId[] {
  const out: ElementId[] = [];
  for (const el of state.byId.values()) {
    if (!isCandidateContext(el)) continue;
    const notes = el.esContext.notes;
    if (notes.some((id) => removed.has(id)) && !notes.some((id) => state.byId.has(id)))
      out.push(el.id);
  }
  return out;
}

// The suggestions anchored on any removed id, transitively, each with the element it was anchored on.
function anchoredOn(state: EditState, removed: ReadonlySet<ElementId>): Map<ElementId, ElementId> {
  const out = new Map<ElementId, ElementId>();
  const gone = new Set(removed);
  for (let grew = true; grew;) {
    grew = false;
    for (const el of state.byId.values()) {
      if (
        el.type !== 'sticky' ||
        !el.esSuggestion ||
        gone.has(el.id) ||
        !gone.has(el.esSuggestion.anchorId)
      )
        continue;
      out.set(el.id, el.esSuggestion.anchorId);
      gone.add(el.id);
      grew = true;
    }
  }
  return out;
}
