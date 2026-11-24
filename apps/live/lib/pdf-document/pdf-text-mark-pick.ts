// The text tool the toolbar's Highlight holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the last
// of Highlight, Underline and Strikethrough a person took from it, kept in their browser for every PDF; Highlight
// until they take another.
import type { TextMarkKind } from '@livedoc/pdf-documents';
import { createToolPick } from './pdf-tool-pick';

/** The tools behind the Highlight control's chevron, in its order. */
export const HELD_TEXT_MARKS = [
  'highlight',
  'underline',
  'strikeout',
] as const satisfies readonly TextMarkKind[];
export type HeldTextMark = (typeof HELD_TEXT_MARKS)[number];

const pick = createToolPick<HeldTextMark>('livedoc:v2:pdf-text-mark-tool', HELD_TEXT_MARKS);

export const isHeldTextMark = pick.holds;
export const textMarkPick = pick.read;
export const setTextMarkPick = pick.set;
export const useTextMarkPick = pick.use;
// For tests: forget the pick read so far.
export const resetTextMarkPick = pick.reset;
