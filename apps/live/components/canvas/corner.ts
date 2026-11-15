// The top right corner of an Event Storming board (docs/specs/021-event-storming/suggestions.md "The suggestions
// corner"): where the Ask pill, the suggestions count and the Review pill stand, and the surface every card that
// opens from it is drawn on.

/** Where the corner stands: clear of the header, against the right edge. */
export const CORNER_PLACE = 'fixed right-3 top-16';
/** The corner's paper: the pill's and the cards' alike. */
export const CORNER_SURFACE =
  'z-[var(--z-overlay)] border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-slate-950/40';
