'use client';

import { useEffect } from 'react';
import { lucidePlay } from '@livedoc/icons/lucide';
import { HoverCard, lucideGlyph } from '@livedoc/ui';
import { useTourOffer } from './tour-offer';
import { useInToolbarGroup } from '@/components/chrome/ToolbarGroup';
import { TOOLBAR_BUTTON } from '@/components/chrome/toolbar-surface';

const PlayGlyph = lucideGlyph(lucidePlay, 10);
// The play triangle inks 0.4px right of its viewBox centre at 10px: moved back by a transform, which lands on the
// device-pixel grid, where padding moves the glyph by whole CSS px (the browser snaps an svg's layout box), so a
// 1px pad left it up to 1.4px off (optical-alignment.md; the guard is in TourOfferButton.test.tsx).
export const PLAY_GLYPH_SHIFT_PX = -0.4;

// Offers already counted as shown in this page load, so each host's telemetry says so once.
const counted = new Set<string>();

/** The button's words for a tour's name: "Sketch" → "Start Sketch Tour". */
export const startTourLabel = (name: string) => `Start ${name} Tour`;

// The bottom bar's Start Tour button (docs/specs/007-editor/editor-tour.md "Where it appears"): the one way into a
// tour. It leads the editor's bottom-bar cluster, immediately left of Search, and offers the most relevant tour on offer
// (tour-offer.ts), "Start Draw Tour", "Start Sankey Tour", whether or not the person has taken it before: it is how a
// tour is taken again. With no tour on offer it is not drawn. A contained chip, as tall as its neighbours, the play
// glyph in a small accent disc and the words beside it; icon only on a phone, and wherever its neighbours drop their
// words (`labelled`), keeping its name for assistive technology.
export function TourOfferButton({ labelled = true }: { labelled?: boolean }) {
  const offer = useTourOffer();
  // In a toolbar group (the editor's actions group) a flat group button, never a bordered pill inside the group.
  const inGroup = useInToolbarGroup();
  const id = offer?.id ?? null;
  useEffect(() => {
    if (!id || counted.has(id)) return;
    counted.add(id);
    offer?.onShown?.();
    // Once per offer: a new name on the same host (another element kind) is a fresh id from its host.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [id]);
  if (!offer) return null;
  const label = startTourLabel(offer.name);
  return (
    <HoverCard title={label} description="A short guided walk round it, on your own work.">
      <button
        type="button"
        onClick={offer.start}
        aria-label={label}
        data-tour-offer={offer.id}
        className={
          inGroup
            ? `${TOOLBAR_BUTTON} ${labelled ? '' : 'w-9 px-0'}`
            : `relative touch-target ml-0.5 flex h-row min-w-row shrink-0 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-1 text-slate-600 transition duration-micro hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:ml-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white ${labelled ? 'sm:pl-1 sm:pr-2' : ''}`
        }
      >
        <span
          aria-hidden
          className="flex size-icon-toolbar shrink-0 items-center justify-center rounded-full bg-brand-700 text-white dark:bg-brand-600"
        >
          <PlayGlyph style={{ translate: `${PLAY_GLYPH_SHIFT_PX}px 0` }} />
        </span>
        {labelled ? (
          <span
            className={`hidden whitespace-nowrap sm:inline ${inGroup ? 'text-optical-centre' : 'text-body'}`}
          >
            {label}
          </span>
        ) : null}
      </button>
    </HoverCard>
  );
}

/** Forgets which offers were counted, for tests. */
export function resetTourOfferButtonForTests(): void {
  counted.clear();
}
