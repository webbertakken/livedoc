// Concept graphics (docs/specs/009-elements/concept-graphics.md): the Layer stack, the Pyramid (with its Inverted and
// Funnel variants), the Cycle, the Hub (and spoke), the Onion, the Chevron process and the Timeline, each one element
// laying out its own rows. What every board reads of them: their kinds, rows, variants, animations and writes. Where
// each row sits is concept-layout.ts's, which only a board drawing one loads.
//
// A LEAF module: types only from './index'.

import type { AnimationSpeed, Element, ShapeElement } from './index';

export type ConceptShape =
  | 'layer-stack'
  | 'pyramid'
  | 'cycle'
  | 'hub'
  | 'onion'
  | 'chevrons'
  // The Timeline keeps the kind it was made as, a timeline rail, so every saved one opens as it.
  | 'timeline-rail';
export type ConceptRow = { label: string; note?: string };
export type PyramidVariant = 'pyramid' | 'inverted' | 'funnel';
export type ConceptAnim = 'build' | 'pulse' | 'flow';

export const PYRAMID_VARIANTS: readonly PyramidVariant[] = ['pyramid', 'inverted', 'funnel'];
const CONCEPT_ANIMS: readonly ConceptAnim[] = ['build', 'pulse', 'flow'];
export const CONCEPT_LABEL_MAX = 60;
export const CONCEPT_NOTE_MAX = 40;

export const CONCEPT_ROWS: Readonly<
  Record<ConceptShape, { min: number; max: number; noun: string; noteNoun?: string }>
> = {
  'layer-stack': { min: 2, max: 8, noun: 'Layer' },
  pyramid: { min: 2, max: 6, noun: 'Tier' },
  cycle: { min: 3, max: 8, noun: 'Step' },
  hub: { min: 3, max: 8, noun: 'Satellite' },
  onion: { min: 2, max: 6, noun: 'Ring' },
  chevrons: { min: 2, max: 8, noun: 'Stage' },
  // A milestone's note is its when: a date, a quarter, a sprint.
  'timeline-rail': { min: 2, max: 8, noun: 'Milestone', noteNoun: 'When' },
};

export function isConceptShape(kind: string): kind is ConceptShape {
  return Object.hasOwn(CONCEPT_ROWS, kind);
}

export function isPyramidVariant(v: unknown): v is PyramidVariant {
  return v === 'pyramid' || v === 'inverted' || v === 'funnel';
}

function isConceptAnim(v: unknown): v is ConceptAnim {
  return v === 'build' || v === 'pulse' || v === 'flow';
}

export function pyramidVariantOf(el: ShapeElement): PyramidVariant {
  return isPyramidVariant(el.pyramidVariant) ? el.pyramidVariant : 'pyramid';
}

/** The Concept animations a kind is offered: Flow runs along a Cycle's arcs, so only a Cycle has it. */
export function conceptAnimsFor(kind: ConceptShape): readonly ConceptAnim[] {
  return kind === 'cycle' ? CONCEPT_ANIMS : ['build', 'pulse'];
}

/** The animation an element plays: its own when its kind offers it, else none. */
export function conceptAnimOf(el: ShapeElement): ConceptAnim | null {
  if (!isConceptShape(el.shape) || !isConceptAnim(el.conceptAnim)) return null;
  return conceptAnimsFor(el.shape).includes(el.conceptAnim) ? el.conceptAnim : null;
}

/** Whether a row draws its note: a layer's side note, a funnel tier's value, a stage's note and a milestone's when. */
export function conceptDrawsNotes(el: ShapeElement): boolean {
  return (
    el.shape === 'layer-stack' ||
    el.shape === 'chevrons' ||
    el.shape === 'timeline-rail' ||
    (el.shape === 'pyramid' && pyramidVariantOf(el) === 'funnel')
  );
}

/** Whether a hub draws its spokes (on unless switched off). */
export function hubDrawsSpokes(el: ShapeElement): boolean {
  return el.hubSpokes !== false;
}

/** Trim + bound a row's text the way every write path should. */
function clampConceptText(s: string, max: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Rows bounded for a kind: each string clamped, a blank note dropped, the list cut to the kind's max. Null when the
 *  list is below the kind's min (the write is ignored, as a web component's rows are). */
export function boundConceptRows(
  kind: ConceptShape,
  rows: readonly ConceptRow[],
): ConceptRow[] | null {
  const { min, max } = CONCEPT_ROWS[kind];
  const next = rows.slice(0, max).map((r) => {
    const label = clampConceptText(r.label, CONCEPT_LABEL_MAX);
    const note = r.note !== undefined ? clampConceptText(r.note, CONCEPT_NOTE_MAX) : '';
    return note ? { label, note } : { label };
  });
  return next.length >= min ? next : null;
}

// --- Writes ---------------------------------------------------------------------------------------

/** Set (or clear back to Pyramid) a pyramid's variant. */
export function withPyramidVariant<T extends Element>(el: T, variant: PyramidVariant | null): T {
  if (el.type !== 'shape' || el.shape !== 'pyramid') return el;
  const next = { ...el } as T & { pyramidVariant?: PyramidVariant };
  if (variant && variant !== 'pyramid') next.pyramidVariant = variant;
  else delete next.pyramidVariant;
  return next;
}

/** Switch a hub's spokes on (the default, so the field is dropped) or off. */
export function withHubSpokes<T extends Element>(el: T, on: boolean): T {
  if (el.type !== 'shape' || el.shape !== 'hub') return el;
  const next = { ...el } as T & { hubSpokes?: boolean };
  if (on) delete next.hubSpokes;
  else next.hubSpokes = false;
  return next;
}

/** Set (or clear) a concept graphic's animation, its speed or its repeat. */
export function withConceptAnim<T extends Element>(
  el: T,
  patch: { anim?: ConceptAnim | null; speed?: AnimationSpeed; repeat?: boolean },
): T {
  if (el.type !== 'shape' || !isConceptShape(el.shape)) return el;
  // An animation its kind cannot play is not written (Flow picked across a cycle and a layer stack lands on the cycle
  // alone), so a stored value always plays.
  if (patch.anim && !conceptAnimsFor(el.shape).includes(patch.anim)) return el;
  const next = { ...el } as T & {
    conceptAnim?: ConceptAnim;
    conceptAnimSpeed?: AnimationSpeed;
    conceptAnimRepeat?: boolean;
  };
  if (patch.anim !== undefined) {
    if (patch.anim) next.conceptAnim = patch.anim;
    else delete next.conceptAnim;
  }
  if (patch.speed !== undefined) next.conceptAnimSpeed = patch.speed;
  if (patch.repeat !== undefined) next.conceptAnimRepeat = patch.repeat;
  return next;
}

/** Whether the animation repeats: Build plays once unless asked; Pulse and Flow loop unless asked not to. */
export function conceptAnimRepeats(el: ShapeElement): boolean {
  const anim = conceptAnimOf(el);
  if (el.conceptAnimRepeat !== undefined) return el.conceptAnimRepeat;
  return anim !== 'build';
}
