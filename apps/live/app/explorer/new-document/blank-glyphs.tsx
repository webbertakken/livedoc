'use client';

// One glyph and tint per blank of the New Document menu (docs/specs/013-workspace/new-document-menu.md "The menu"):
// a mode's own mark where the blank is a whole mode (Diagram, Whiteboard, Workshop), else the mark its start already
// wears for it (a page kind's, a Start Planning group's), so a blank looks the same wherever it is met. Brainstorm,
// which no start names, wears the lightbulb of an idea (D222).
import type { ComponentType } from 'react';
import {
  lucideClipboardList,
  lucideFileText,
  lucideGrid3x3,
  lucideLightbulb,
  lucidePresentation,
  lucideSquareKanban,
} from '@livedoc/icons/lucide';
import { TAB_OPENING_ICONS, lucideGlyph } from '@livedoc/ui';
import type { NewDocumentBlankId } from '@livedoc/templates';

export const BLANK_GLYPHS: Readonly<Record<NewDocumentBlankId, ComponentType>> = {
  diagram: TAB_OPENING_ICONS.diagram,
  brainstorm: lucideGlyph(lucideLightbulb, 16),
  whiteboard: TAB_OPENING_ICONS.draw,
  page: lucideGlyph(lucideFileText, 16),
  sheet: lucideGlyph(lucideGrid3x3, 16),
  board: lucideGlyph(lucideSquareKanban, 16),
  slides: lucideGlyph(lucidePresentation, 16),
  form: lucideGlyph(lucideClipboardList, 16),
  workshop: TAB_OPENING_ICONS.workshop,
};

// Each glyph's colour: 600 on the light surface, 400 on the dark, so each holds 3:1 against its row.
export const BLANK_TINTS: Readonly<Record<NewDocumentBlankId, string>> = {
  diagram: 'text-sky-600 dark:text-sky-400',
  brainstorm: 'text-rose-600 dark:text-rose-400',
  whiteboard: 'text-pink-600 dark:text-pink-400',
  page: 'text-amber-600 dark:text-amber-300',
  sheet: 'text-emerald-600 dark:text-emerald-400',
  board: 'text-violet-600 dark:text-violet-400',
  slides: 'text-orange-600 dark:text-orange-400',
  form: 'text-teal-600 dark:text-teal-400',
  workshop: 'text-yellow-600 dark:text-yellow-400',
};

export function BlankGlyph({ id }: { id: NewDocumentBlankId }) {
  const Glyph = BLANK_GLYPHS[id];
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center ${BLANK_TINTS[id]}`}
    >
      <Glyph />
    </span>
  );
}
