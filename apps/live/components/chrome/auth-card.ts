// The account and connect pages' card and its title (the page's h1), on the sizing scale
// (docs/specs/004-interface-design/sizing.md): the page title's step, regular; the card a surface.

/** The card's title, shared by the account, connect and pairing pages. */
export const AUTH_TITLE = 'text-page-title text-indigo-950 dark:text-slate-100';

/** The card. Exported so a page can tell its own surface apart in tests; the classes are the look. */
export const AUTH_STAGE_CARD =
  'w-full rounded-surface border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-800/95 dark:shadow-black/40';
