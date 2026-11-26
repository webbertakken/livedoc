// Each mark tool's look (docs/specs/035-pdf-documents/marks.md "Making a mark": The tool's look is remembered, A tool's
// line), one person's, kept in their browser for every PDF: the colour chosen for a kind, and for a kind with a line
// its width and line style, and for a Rectangle, an Ellipse, a Polygon or a Cloud its fill, each over the kind's first look. A stored value
// that is none of these, or a kind that has no such part, is passed over as if nothing were kept. A stamp's colour is
// its own (marks.md "Stamps"), so a stamp has no look here.
import { useSyncExternalStore } from 'react';
import {
  LINE_STYLES,
  MARK_KINDS,
  PDF_MARK_WIDTH_MAX_PT,
  PDF_MARK_WIDTH_MIN_PT,
  type LineStyle,
  type MarkKind,
} from '@livedoc/pdf-documents';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';
import { DRAWING_LOOK, DRAWING_WIDTH_PT } from './pdf-drawing';
import { SHAPE_LOOK, SHAPE_WIDTH_PT } from './pdf-shape';
import { TEXT_MARK_LOOKS } from './pdf-text-mark';
import type { ToolLine, ToolLook } from './pdf-tool-look';
import { TYPED_LOOK } from './pdf-typed';

/** The kinds a person chooses a look for: every kind but a stamp. */
export type LookedKind = Exclude<MarkKind, 'stamp'>;
export const LOOKED_KINDS = MARK_KINDS.filter((kind): kind is LookedKind => kind !== 'stamp');

/** The kinds drawn with a line, whose tool keeps a width and a line style. */
export const LINED_KINDS = [
  'drawing',
  'line',
  'arrow',
  'rectangle',
  'ellipse',
  'polygon',
  'cloud',
  'polyline',
] as const;
export type LinedKind = (typeof LINED_KINDS)[number];
/** The kinds with an inside, whose tool keeps a fill: a Rectangle, an Ellipse, a Polygon and a Cloud. */
export const FILLED_KINDS = ['rectangle', 'ellipse', 'polygon', 'cloud'] as const;
export type FilledKind = (typeof FILLED_KINDS)[number];

export const isLinedKind = (kind: string): kind is LinedKind =>
  (LINED_KINDS as readonly string[]).includes(kind);
export const isFilledKind = (kind: string): kind is FilledKind =>
  (FILLED_KINDS as readonly string[]).includes(kind);

export type MarkLooks = Readonly<Record<LookedKind, ToolLook>>;

/** Each kind's first look, before a person chooses another (marks.md "Making a mark"). */
export const FIRST_LOOKS: MarkLooks = {
  ...TEXT_MARK_LOOKS,
  drawing: { ...DRAWING_LOOK, width: DRAWING_WIDTH_PT },
  line: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  arrow: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  rectangle: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  ellipse: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  polygon: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  cloud: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  polyline: { ...SHAPE_LOOK, width: SHAPE_WIDTH_PT },
  text: TYPED_LOOK,
  callout: TYPED_LOOK,
};

const LOOKS_KEY = 'livedoc:v2:pdf-mark-looks';
const LINES_KEY = 'livedoc:v2:pdf-mark-lines';
const COLOUR = /^#[0-9a-f]{6}$/;

type Colours = Partial<Record<LookedKind, string>>;
type Lines = Partial<Record<LinedKind, ToolLine>>;

let colours: Colours | null = null;
let lines: Lines | null = null;
let looks: MarkLooks | null = null;
const listeners = createListeners();

// What is kept under a key, as an object; anything else is nothing kept.
function keptObject(key: string): Readonly<Record<string, unknown>> {
  try {
    const raw: unknown = JSON.parse(readLocalStorageSafe(key) ?? '{}');
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// The colours kept, by kind; anything else kept is let go.
const keptColours = (): Colours =>
  Object.fromEntries(
    Object.entries(keptObject(LOOKS_KEY)).filter(
      ([kind, colour]) =>
        LOOKED_KINDS.includes(kind as LookedKind) &&
        typeof colour === 'string' &&
        COLOUR.test(colour),
    ),
  );

const isWidth = (width: unknown): width is number =>
  typeof width === 'number' && width >= PDF_MARK_WIDTH_MIN_PT && width <= PDF_MARK_WIDTH_MAX_PT;

/** A kind's line as kept, each part checked on its own: a part that is not one is let go. */
function lineOf(kind: LinedKind, raw: unknown): ToolLine {
  if (typeof raw !== 'object' || raw === null) return {};
  const { width, lineStyle, fill } = raw as Record<string, unknown>;
  return {
    ...(isWidth(width) ? { width } : {}),
    ...(typeof lineStyle === 'string' &&
    lineStyle !== 'solid' &&
    LINE_STYLES.includes(lineStyle as LineStyle)
      ? { lineStyle: lineStyle as Exclude<LineStyle, 'solid'> }
      : {}),
    ...(isFilledKind(kind) && typeof fill === 'string' && COLOUR.test(fill) ? { fill } : {}),
  };
}

const keptLines = (): Lines =>
  Object.fromEntries(
    Object.entries(keptObject(LINES_KEY)).flatMap(([kind, raw]) => {
      if (!isLinedKind(kind)) return [];
      const line = lineOf(kind, raw);
      return Object.keys(line).length > 0 ? [[kind, line]] : [];
    }),
  );

const lookedWith = (colours: Colours, lines: Lines): MarkLooks =>
  Object.fromEntries(
    LOOKED_KINDS.map((kind) => [
      kind,
      {
        ...FIRST_LOOKS[kind],
        ...(colours[kind] ? { colour: colours[kind] } : {}),
        ...(isLinedKind(kind) ? lines[kind] : {}),
      },
    ]),
  ) as unknown as MarkLooks;

export function markLooks(): MarkLooks {
  colours ??= keptColours();
  lines ??= keptLines();
  looks ??= lookedWith(colours, lines);
  return looks;
}

function changed(nextColours: Colours, nextLines: Lines): void {
  colours = nextColours;
  lines = nextLines;
  looks = lookedWith(nextColours, nextLines);
  listeners.notify();
}

/** A kind's colour chosen, `#rrggbb`; null returns it to the kind's first look. */
export function setMarkColour(kind: LookedKind, colour: string | null): void {
  const chosen = colour?.toLowerCase() ?? null;
  if (chosen !== null && !COLOUR.test(chosen)) return;
  const next = { ...(colours ?? keptColours()) };
  if (chosen === null) delete next[kind];
  else next[kind] = chosen;
  // A blocked write keeps the look for this page only.
  writeLocalStorageSafe(LOOKS_KEY, JSON.stringify(next));
  changed(next, lines ?? keptLines());
}

/**
 * Part of a lined kind's line chosen: a width within the range a mark's may be, a line style (Solid the kind's own),
 * or a Rectangle's or an Ellipse's fill, `#rrggbb`, null for none. Answers whether it was taken.
 */
export function setMarkLine(
  kind: LinedKind,
  part: { width: number } | { lineStyle: LineStyle } | { fill: string | null },
): boolean {
  const held = { ...(lines ?? keptLines())[kind] };
  if ('width' in part) {
    if (!isWidth(part.width)) return false;
    held.width = part.width;
  } else if ('lineStyle' in part) {
    if (!LINE_STYLES.includes(part.lineStyle)) return false;
    if (part.lineStyle === 'solid') delete held.lineStyle;
    else held.lineStyle = part.lineStyle;
  } else {
    const fill = part.fill?.toLowerCase() ?? null;
    if (!isFilledKind(kind) || (fill !== null && !COLOUR.test(fill))) return false;
    if (fill === null) delete held.fill;
    else held.fill = fill;
  }
  const next: Lines = { ...(lines ?? keptLines()), [kind]: held };
  if (Object.keys(held).length === 0) delete next[kind];
  writeLocalStorageSafe(LINES_KEY, JSON.stringify(next));
  changed(colours ?? keptColours(), next);
  return true;
}

export function useMarkLooks(): MarkLooks {
  return useSyncExternalStore(listeners.subscribe, markLooks, () => FIRST_LOOKS);
}

// For tests: forget the looks read so far.
export function resetMarkLooks(): void {
  colours = null;
  lines = null;
  looks = null;
}
