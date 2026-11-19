// The web components (docs/specs/009-elements/web-components-and-no-groups.md): Banner, Callout, Stat row, Process steps and
// Header as single shape kinds, plus the Hero's caption card on an image.
//
// They used to be bundles of primitives held together by a shared groupId,
// which meant a resize was a uniform zoom of loose boxes and a stray drag
// pulled one apart. As single elements they lay themselves out, and the
// layouts below are PURE so the canvas view and the headless SVG renderer
// call the same maths: an export matches the editor.
//
// A leaf module (types only from './index') like data-shapes.ts, so the
// validator and the shape factory can read its constants at module-init time
// without walking the index cycle.

import type { Rect } from './geometry-primitives';
import type { Element, ShapeKind } from './index';
import { CARD_TAGS_MAX, clampCardTag } from './card';
import { CONCEPT_ROWS, boundConceptRows, isConceptShape, type ConceptRow } from './concept';
import { withKeyMeaning } from './diagram-key';

// --- Vocabulary -------------------------------------------------------------

export type WebComponentShape =
  'banner' | 'callout' | 'card' | 'stat-row' | 'process' | 'site-header';

export function isWebComponentShape(kind: ShapeKind): kind is WebComponentShape {
  return (
    kind === 'banner' ||
    kind === 'callout' ||
    kind === 'card' ||
    kind === 'stat-row' ||
    kind === 'process' ||
    kind === 'site-header'
  );
}

// The two that are a solid ACCENT BAR under white text. Their bar paints in
// `fillColor`, falling back to the stroke (the theme accent), and theme
// switches retheme only the stroke: writing the theme's pale element fill
// into an accent bar under white text is how the grouped banner used to go
// unreadable after a theme change.
export function isAccentBarShape(kind: ShapeKind): boolean {
  return kind === 'banner' || kind === 'site-header';
}

// White: the one text colour an accent bar is guaranteed to carry.
export const ACCENT_BAR_TEXT = '#ffffff';

// --- Rows -------------------------------------------------------------------

export type StatItem = { value: string; caption: string };

// Per-string bound for every row of text these elements carry: a stat's value
// or caption, a step, a nav link. Short on purpose; these are labels.
export const WEB_TEXT_MAX = 80;
export const STATS_MIN = 1;
export const STATS_MAX = 6;
export const PROCESS_MIN_STEPS = 2;
export const PROCESS_MAX_STEPS = 8;
export const NAV_LINKS_MAX = 6;

export const STAT_DEFAULTS: readonly StatItem[] = [
  { value: '1.2k', caption: 'Users' },
  { value: '98%', caption: 'Uptime' },
  { value: '4.7', caption: 'Rating' },
];
export const PROCESS_DEFAULT_STEPS: readonly string[] = ['Plan', 'Build', 'Ship'];
export const NAV_DEFAULT_LINKS: readonly string[] = ['Home', 'About', 'Contact'];

// The Hero's caption card (docs/specs/009-elements/web-components-and-no-groups.md): on an ImageElement, present = shown.
export type HeroCaption = { title: string; subtitle: string };
export const HERO_DEFAULT_CAPTION: HeroCaption = {
  title: 'Hero title',
  subtitle: 'A short supporting line of text over the image.',
};

// Trim + bound a row string the way every write path should.
function clampWebText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, WEB_TEXT_MAX);
}

// --- Layout -----------------------------------------------------------------

export type LayoutRect = Rect;

// --- Writes -----------------------------------------------------------------

// The rows a web component carries, as one patch. Each field only lands on
// its own kind, so a selection-wide write over a stat row and a header only
// touches what each one has.
export type WebRows = {
  stats?: StatItem[];
  processSteps?: string[];
  navLinks?: string[];
  // A card's tag chips (docs/specs/009-elements/card.md).
  tags?: string[];
  // A concept graphic's rows (docs/specs/009-elements/concept-graphics.md).
  conceptRows?: ConceptRow[];
  // One diagram key row's meaning (docs/specs/009-elements/diagram-key.md).
  keyMeaning?: { rowId: string; text: string };
};

// The kind each single-kind row field lands on; concept rows land on any of the three concept graphics.
const ROW_KIND: Record<Exclude<keyof WebRows, 'conceptRows' | 'keyMeaning'>, ShapeKind> = {
  stats: 'stat-row',
  processSteps: 'process',
  navLinks: 'site-header',
  tags: 'card',
};

// Apply `rows` to a shape, bounded the way validate.ts bounds them: each
// string clamped, the count held between the kind's minimum and maximum (a
// process with one step is not a process; the menu can't remove below it).
// Returns the element unchanged when none of the fields fit its kind.
export function withWebRows<T extends { shape: ShapeKind }>(el: T, rows: WebRows): T {
  const patch: WebRows = {};
  if (rows.stats && el.shape === ROW_KIND.stats) {
    const next = rows.stats
      .slice(0, STATS_MAX)
      .map((st) => ({ value: clampWebText(st.value), caption: clampWebText(st.caption) }));
    if (next.length >= STATS_MIN) patch.stats = next;
  }
  if (rows.processSteps && el.shape === ROW_KIND.processSteps) {
    const next = rows.processSteps.slice(0, PROCESS_MAX_STEPS).map(clampWebText);
    if (next.length >= PROCESS_MIN_STEPS) patch.processSteps = next;
  }
  if (rows.navLinks && el.shape === ROW_KIND.navLinks) {
    patch.navLinks = rows.navLinks.slice(0, NAV_LINKS_MAX).map(clampWebText);
  }
  if (rows.tags && el.shape === ROW_KIND.tags) {
    // No tags is a card with no tag row, stored as nothing.
    const next = rows.tags.slice(0, CARD_TAGS_MAX).map(clampCardTag);
    if (next.length === 0) {
      const { tags: _gone, ...rest } = el as T & { tags?: string[] };
      return rest as T;
    }
    patch.tags = next;
  }
  if (rows.keyMeaning && el.shape === 'diagram-key') {
    return withKeyMeaning(
      el as unknown as Element,
      rows.keyMeaning.rowId,
      rows.keyMeaning.text,
    ) as unknown as T;
  }
  if (rows.conceptRows && isConceptShape(el.shape)) {
    const next = boundConceptRows(el.shape, rows.conceptRows);
    if (next) patch.conceptRows = next;
  }
  return Object.keys(patch).length > 0 ? { ...el, ...patch } : el;
}

// The next row to append, and whether there is room for it. Used by both the
// canvas "+" and the menu's Add button, so they add the same thing.
export function appendWebRow<T extends { shape: ShapeKind } & WebRows>(el: T): T {
  if (!canAppendWebRow(el)) return el;
  if (el.shape === 'stat-row') {
    const stats = el.stats ?? [];
    return withWebRows(el, { stats: [...stats, { value: '0', caption: 'Metric' }] });
  }
  if (el.shape === 'process') {
    const steps = el.processSteps ?? [];
    return withWebRows(el, { processSteps: [...steps, `Step ${steps.length + 1}`] });
  }
  if (el.shape === 'site-header') {
    return withWebRows(el, { navLinks: [...(el.navLinks ?? []), 'Link'] });
  }
  if (el.shape === 'card') return withWebRows(el, { tags: [...(el.tags ?? []), 'Tag'] });
  if (isConceptShape(el.shape)) {
    const rows = (el as { conceptRows?: ConceptRow[] }).conceptRows ?? [];
    const label = `${CONCEPT_ROWS[el.shape].noun} ${rows.length + 1}`;
    // Appending is the one write that may start below the minimum, one row at a time.
    return { ...el, conceptRows: [...rows, { label }] };
  }
  return el;
}

export function canAppendWebRow(el: { shape: ShapeKind } & WebRows): boolean {
  if (el.shape === 'stat-row') return (el.stats?.length ?? 0) < STATS_MAX;
  if (el.shape === 'process') return (el.processSteps?.length ?? 0) < PROCESS_MAX_STEPS;
  if (el.shape === 'site-header') return (el.navLinks?.length ?? 0) < NAV_LINKS_MAX;
  if (el.shape === 'card') return (el.tags?.length ?? 0) < CARD_TAGS_MAX;
  if (isConceptShape(el.shape))
    return (
      ((el as { conceptRows?: ConceptRow[] }).conceptRows?.length ?? 0) < CONCEPT_ROWS[el.shape].max
    );
  return false;
}
