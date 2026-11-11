import type { CSSProperties } from 'react';
import { eventStormingNote, type EventStormingNoteKind } from '@livedoc/document';

// The colour a suggestion's dashed outline wears (docs/specs/021-event-storming/suggestions.md "How a person sees
// them"): the kind's own hue, never its paper. A dashed stroke is non-text UI, so it needs 3:1 against the canvas
// (WCAG 2.2 1.4.11): on the light canvas the kind's 700 shade, on the dark canvas the kind's own fill, which is a
// pale 100-300 shade and stands well clear of the dark ground.
const LIGHT_STROKE: Readonly<Record<EventStormingNoteKind, string>> = {
  'domain-event': '#c2410c',
  command: '#1d4ed8',
  actor: '#a16207',
  policy: '#7e22ce',
  'read-model': '#15803d',
  'external-system': '#be185d',
  aggregate: '#b45309',
  hotspot: '#b91c1c',
};

export function suggestionStroke(kind: EventStormingNoteKind, scheme: 'light' | 'dark'): string {
  return scheme === 'light' ? LIGHT_STROKE[kind] : eventStormingNote(kind).fill;
}

// The two strokes as custom properties, so one class picks the scheme's: `suggestionStrokeClass` reads them.
export function suggestionStrokeVars(kind: EventStormingNoteKind): CSSProperties {
  return {
    '--suggestion-stroke-light': suggestionStroke(kind, 'light'),
    '--suggestion-stroke-dark': suggestionStroke(kind, 'dark'),
  } as CSSProperties;
}

export const SUGGESTION_STROKE_BORDER =
  '[border-color:var(--suggestion-stroke-light)] dark:[border-color:var(--suggestion-stroke-dark)]';
export const SUGGESTION_STROKE_TEXT =
  '[color:var(--suggestion-stroke-light)] dark:[color:var(--suggestion-stroke-dark)]';
// A breath of the kind's hue inside a hint, so a small outline still reads as a colour; never paper.
export const SUGGESTION_TINT =
  '[background-color:color-mix(in_srgb,var(--suggestion-stroke-light)_12%,transparent)] dark:[background-color:color-mix(in_srgb,var(--suggestion-stroke-dark)_16%,transparent)]';
