// The classes a document's History shares across its parts (docs/specs/013-workspace/timeline.md
// §2.10), so the header, strip, chips and rail read as one panel.

/** Quiet words: times, counts, owners. Slate-500 on white meets 4.5:1; slate-400 in dark. */
export const MUTED = 'text-slate-500 dark:text-slate-400';

/** Every button in History. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

/** Show older events, Try again. */
export const HISTORY_BUTTON = `inline-flex min-h-field items-center gap-1 rounded-control border border-slate-200 bg-white px-3 text-body text-slate-700 transition duration-micro hover:border-brand-300 hover:text-brand-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-500/50 dark:hover:text-brand-300 ${FOCUS_RING}`;

/** A quiet text link: Show all, Show all 3. */
export const HISTORY_LINK = `inline-flex items-center gap-1 rounded-control text-supporting text-brand-700 transition duration-micro hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200 ${FOCUS_RING}`;

/** A placeholder block. */
export const SKELETON =
  'rounded-control bg-slate-200/80 motion-safe:animate-pulse dark:bg-slate-700/70';

/** The panel's horizontal inset, one value for every band so their edges line up. */
export const INSET = 'px-4 sm:px-6';

/** A machine-readable instant for `<time datetime>`. */
export const isoInstant = (at: number) => new Date(at).toISOString();
