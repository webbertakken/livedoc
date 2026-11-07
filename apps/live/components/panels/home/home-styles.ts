// The classes Home's parts share (docs/specs/013-workspace/explorer-home.md
// "Presentation and UX"), so the sections read as one page.

/** A section's heading row: the title, its quiet link at the end, and the hairline rule under it
 *  in the page's line colour (Headings with a rule). */
export const SECTION_HEADER =
  'flex items-baseline justify-between gap-4 border-b border-slate-200 pb-2 dark:border-slate-700';

/** A section's title: Jump Back In, What Happened. */
export const SECTION_HEADING = 'text-base font-semibold text-slate-900 dark:text-slate-100';

/** The quiet link at the end of a heading row: See More, See Timeline. Its line box is padded
 *  to the 24 px target. */
export const SECTION_LINK =
  'inline-flex min-h-6 items-center rounded-sm text-sm font-medium text-brand-700 hover:underline dark:text-brand-300';

/** Quiet words: places, times, counts. Slate-500 on the page meets 4.5:1; slate-400 in dark. */
export const MUTED = 'text-slate-500 dark:text-slate-400';

/** Every link and button on Home. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

/** A row that opens something: a What Happened entry. */
export const ROW = 'rounded-lg px-2 py-2 transition hover:bg-slate-100 dark:hover:bg-slate-800/70';

/** The page behind Home, for overlays that blend into it (the strip's fade, the avatar rings). */
export const PAGE_RING = 'ring-2 ring-slate-50 dark:ring-slate-900';

/** A placeholder block. */
export const SKELETON = 'rounded-md bg-slate-200/70 motion-safe:animate-pulse dark:bg-slate-800';

// ---- Jump Back In's tiles (desktop and tablet), shared by the tiles and their skeletons ----

/** A grid tile's thumbnail: the column's width, a fixed 80 px high. */
export const GRID_THUMB = 'h-20 w-full';

/** The grid: four across, filled from the top left. */
export const GRID = 'grid grid-cols-4 content-start gap-3';

/** Two tile rows whatever lands in them (D131): 2 × 100 px and the 12 px gap. The grid and its skeleton
 *  both hold it, so fewer documents never shift what follows. */
export const GRID_MIN_HEIGHT = 'min-h-[13.25rem]';

/** An empty list's one slot, the size of the tile it stands in for: a dashed edge. */
export const EMPTY_SLOT = 'rounded-md border border-dashed border-slate-300 dark:border-slate-600';

/** A still surface for the first run's cards: a white card on the page, a hairline edge (the raised surface in dark). */
export const PANEL_SURFACE =
  'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800';

/** A card that opens something: the panel's surface, its edge darkening on hover. */
export const CARD_SURFACE = `${PANEL_SURFACE} transition hover:border-slate-300 dark:hover:border-slate-500`;

/** A strip tile: 128 px wide, the thumbnail 128 × 80. */
export const STRIP_TILE = 'w-32 shrink-0';
export const STRIP_THUMB = 'h-20 w-32';
/** The strip's height: a tile (100 px) plus the scroller's padding for focus rings. */
export const STRIP_HEIGHT = 'h-28';
