'use client';

import { CloseIcon } from '@livedoc/ui';
import type { EsNameSuggestion } from '@livedoc/document';
import { suggestionKeys } from '../suggestions/SuggestionPlaceholder';

// The names an agent suggests for a candidate context, as chips
// (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"): under a selected context's
// name, or in the merge offer for several. Pointing at a chip, or focusing it, previews it, with a caption giving the
// reason and who suggested it; choosing it renames the context (or merges and names them); Delete on a focused chip
// dismisses that one, and ✕ after them dismisses those shown. Chrome: drawn at screen size by whoever places it.

export type NameChipActs = {
  onChoose: (name: string) => void;
  onDismiss: (name: string) => void;
  // Dismiss every chip shown; absent where another ✕ already stands beside them (the merge offer's).
  onDismissAll?: () => void;
  onPreview: (name: string) => void;
  onLeave: (name: string) => void;
};

const CHIP =
  'flex h-7 max-w-[28ch] items-center rounded-full border-[1.5px] border-dashed px-3 text-[13px] font-medium leading-none outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-brand-500';
// On the canvas's paper, in the context's own inks; the one pointed at takes the brand colour, as a selected
// outline does.
const CHIP_INK =
  'bg-[var(--lvd-canvas-paper,#ffffff)] [border-color:var(--ctx-line)] text-[color:var(--ctx-name)] hover:[border-color:var(--ctx-active)] hover:text-[color:var(--ctx-active)]';
const CHIP_PREVIEWED = '[border-color:var(--ctx-active)] text-[color:var(--ctx-active)]';

export function NameChips({
  names,
  merge,
  previewed,
  acts,
}: {
  names: readonly EsNameSuggestion[];
  // The names are for several contexts merged into one.
  merge: boolean;
  // The name of the chip being previewed, if one of these.
  previewed: string | null;
  acts: NameChipActs;
}) {
  const shown = names.find((n) => n.name === previewed);
  return (
    <div
      role="group"
      aria-label={merge ? 'Suggested names for the merged context' : 'Suggested names'}
      data-name-chips=""
      onPointerDown={(e) => e.stopPropagation()}
      className="relative flex items-center gap-1.5"
    >
      {names.map(({ name }) => (
        <button
          key={name}
          type="button"
          aria-label={merge ? `Merge and name ${name}` : `Rename to ${name}`}
          aria-description="Delete dismisses it"
          data-name-chip={name}
          onClick={(e) => {
            e.stopPropagation();
            acts.onChoose(name);
          }}
          onPointerEnter={() => acts.onPreview(name)}
          onPointerLeave={() => acts.onLeave(name)}
          onFocus={() => acts.onPreview(name)}
          onBlur={() => acts.onLeave(name)}
          onKeyDown={(e) => {
            // Enter is the button's own click; Delete dismisses this chip alone.
            if (e.key !== 'Enter')
              suggestionKeys(
                e,
                () => {},
                () => acts.onDismiss(name),
              );
          }}
          className={`${CHIP} ${CHIP_INK} ${name === previewed ? CHIP_PREVIEWED : ''}`}
        >
          <span className="truncate">{name}</span>
        </button>
      ))}
      {acts.onDismissAll ? (
        <button
          type="button"
          aria-label="Dismiss name suggestions"
          onClick={(e) => {
            e.stopPropagation();
            acts.onDismissAll?.();
          }}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--lvd-canvas-paper,#ffffff)] text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 in-[[data-dark-canvas]]:text-slate-300 in-[[data-dark-canvas]]:ring-slate-700 in-[[data-dark-canvas]]:hover:bg-slate-800"
        >
          <CloseIcon size={14} />
        </button>
      ) : null}
      {shown && (shown.reason || shown.by) ? (
        <div
          data-name-caption=""
          className="pointer-events-none absolute left-1/2 top-full mt-2 w-[260px] -translate-x-1/2 whitespace-normal rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[13px] font-normal leading-snug text-slate-700 shadow-md shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-slate-950/40"
        >
          {shown.reason ? <p>{shown.reason}</p> : null}
          {shown.by ? (
            <p
              className={`text-xs text-slate-600 dark:text-slate-400 ${shown.reason ? 'mt-1' : ''}`}
            >
              Suggested by {shown.by}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
