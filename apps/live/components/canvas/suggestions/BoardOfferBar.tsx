'use client';

import { Portal, SOLID_BRAND_DARK_CONTROL } from '@livedoc/ui';
import type { ElementId } from '@livedoc/document';
import type { WayIn } from '@/lib/board-offer-words';

// The bar under a whole board rearranged (docs/specs/021-event-storming/lane-plans.md "How a person sees and
// decides", docs/specs/021-event-storming/arrange.md "How a person arranges"): what the offer is and that the board
// reads the same, with Keep and Put Back while arranging; or why the board was not arranged, each note it names a
// way in to fix the board by hand. Bottom centre and out of flow, in the photo draft bar's family, so nothing on
// the canvas shifts when it comes or goes.

export type OfferAction = { label: string; onSelect: () => void; primary?: boolean };

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
const SECONDARY = `rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 ${FOCUS}`;
const PRIMARY = `rounded-full bg-brand-700 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-800 ${SOLID_BRAND_DARK_CONTROL} ${FOCUS}`;

export function BoardOfferBar({
  line,
  ways = [],
  more = 0,
  actions,
  onWay,
}: {
  // The offer in one line, or why there is none.
  line: string;
  // The notes a refusal names, each a way in; `more` counts those not listed.
  ways?: readonly WayIn[];
  more?: number;
  actions: readonly OfferAction[];
  onWay?: (id: ElementId) => void;
}) {
  const refused = ways.length > 0;
  const buttons = actions.map((action) => (
    <button
      key={action.label}
      type="button"
      onClick={action.onSelect}
      className={action.primary ? PRIMARY : SECONDARY}
    >
      <span className="text-optical-centre">{action.label}</span>
    </button>
  ));
  return (
    <Portal>
      <div
        data-testid="board-offer-bar"
        className="pointer-events-none fixed bottom-20 left-1/2 z-[var(--z-chrome)] w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2"
      >
        <div
          role="group"
          aria-label={refused ? 'Board not arranged' : 'Board preview'}
          className={`pointer-events-auto border border-slate-200 bg-white/95 text-xs text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:shadow-slate-950/40 ${
            refused ? 'max-w-md rounded-xl p-3' : 'flex items-center gap-3 rounded-full px-4 py-1.5'
          }`}
        >
          <p
            role="status"
            aria-live="polite"
            className={refused ? 'font-semibold text-slate-900 dark:text-slate-50' : undefined}
          >
            <span className="text-optical-centre">{line}</span>
          </p>
          {refused ? (
            <>
              <ul className="mt-2 flex flex-col gap-0.5">
                {ways.map((way) => (
                  // A note may be named twice, never in the same words.
                  <li key={`${way.id}:${way.words}`}>
                    <button
                      type="button"
                      aria-label={`Show on the board: ${way.words}`}
                      onClick={() => onWay?.(way.id)}
                      className={`w-full rounded-md px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${FOCUS}`}
                    >
                      {way.words}
                    </button>
                  </li>
                ))}
              </ul>
              {more > 0 ? (
                <p className="mt-1 px-2 text-slate-600 dark:text-slate-400">and {more} more</p>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">{buttons}</div>
            </>
          ) : (
            buttons
          )}
        </div>
      </div>
    </Portal>
  );
}
