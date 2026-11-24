'use client';

// The first-time question (docs/specs/035-pdf-documents/dark-pages.md "The first-time question", fork F13 (default)):
// asked once per person, ever, while Dark pages is offered and not yet answered. Either answer sets the setting; a
// dismissal leaves it off, counts as asked, and says once where the setting lives. Shown and answered are counted.
import { useCallback, useEffect, useRef } from 'react';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

/** "The first-time question": what a dismissal says, once. */
export const DARK_PAGES_LATER_COPY = 'You can turn on Dark pages in the View menu.';

export type DarkPagesAnswer = 'Use' | 'Keep' | 'Dismissed';

export function usePdfDarkPagesQuestion({
  offered,
  setting,
  choose,
  say,
}: {
  // Whether Dark pages is offered here: the dark scheme, no forced colours.
  offered: boolean;
  // The setting: undefined until answered.
  setting: boolean | undefined;
  // Sets it, kept for the person.
  choose: (on: boolean) => void;
  // A one-line toast.
  say: (message: string) => void;
}) {
  const asking = offered && setting === undefined;
  // Counted once a surface, as it shows.
  const told = useRef(false);
  useEffect(() => {
    if (!asking || told.current) return;
    told.current = true;
    track('Pdf', 'Opened', 'DarkPagesQuestion');
    debugLog('[pdf] dark-pages asked');
  }, [asking]);

  const answer = useCallback(
    (how: DarkPagesAnswer) => {
      track('Pdf', 'Selected', `DarkPagesQuestion.${how}`);
      choose(how === 'Use');
      if (how === 'Dismissed') say(DARK_PAGES_LATER_COPY);
    },
    [choose, say],
  );

  return { asking, answer };
}
