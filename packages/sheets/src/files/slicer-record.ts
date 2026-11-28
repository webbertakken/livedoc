// LiveDoc's record of a sheet's slicers (docs/specs/029-sheets/standard-mapping.md "Filters in the file", LiveDoc's
// record of slicers): the `slicers` of the filters record (filter-record.ts), each its range and cell as A1 text and its
// column by letter, read whenever the record parses, apart from the filter's fingerprint (D490).
import {
  columnIndex,
  columnLetters,
  formatA1,
  formatRange,
  parseA1,
  parseRangeText,
} from '../address';
import { isSlicerCondition, SLICER_TITLE_MAX } from '../objects/sheet-slicer';
import type { FileSlicer } from './file-slicers';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The record's entries of a sheet's slicers, in paint order. */
export function slicerRecordEntries(slicers: readonly FileSlicer[]): Record<string, unknown>[] {
  return slicers.map((s) => ({
    at: formatA1(s.at.r, s.at.c),
    dx: s.at.dx,
    dy: s.at.dy,
    width: s.width,
    height: s.height,
    ...(s.range ? { range: formatRange(s.range) } : {}),
    ...(s.c !== undefined ? { c: columnLetters(s.c) } : {}),
    ...(s.filter ? { filter: s.filter } : {}),
    ...(s.title ? { title: s.title } : {}),
    ...(s.pivots === false ? { pivots: false } : {}),
    ...(s.name ? { name: s.name } : {}),
  }));
}

// One entry read back; null when it is not one.
function recordedSlicer(v: unknown): FileSlicer | null {
  if (!isRecord(v) || typeof v.at !== 'string') return null;
  const at = parseA1(v.at);
  const { dx = 0, dy = 0, width, height } = v;
  if (!at || !isSize(dx) || !isSize(dy) || !isSize(width) || !isSize(height)) return null;
  const range =
    v.range === undefined
      ? undefined
      : typeof v.range === 'string'
        ? parseRangeText(v.range)
        : null;
  const c = typeof v.c === 'string' && /^[A-Z]{1,4}$/.test(v.c) ? columnIndex(v.c) : undefined;
  if (range === null || (v.c !== undefined && c === undefined)) return null;
  if (v.filter !== undefined && !isSlicerCondition(v.filter)) return null;
  if (v.title !== undefined && (typeof v.title !== 'string' || v.title.length > SLICER_TITLE_MAX))
    return null;
  if (v.pivots !== undefined && v.pivots !== false) return null;
  if (v.name !== undefined && typeof v.name !== 'string') return null;
  return {
    at: { r: at.r, c: at.c, dx, dy },
    width,
    height,
    ...(range ? { range } : {}),
    ...(c !== undefined ? { c } : {}),
    ...(v.filter !== undefined ? { filter: v.filter } : {}),
    ...(v.title ? { title: v.title } : {}),
    ...(v.pivots === false ? { pivots: false as const } : {}),
    ...(v.name ? { name: v.name } : {}),
  };
}

/** The slicers a record holds, and how many of its entries are not slicers; none from a record that does not parse. */
export function readSlicerRecord(text: string): { slicers: FileSlicer[]; unread: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { slicers: [], unread: 0 };
  }
  if (!isRecord(raw) || raw.slicers === undefined) return { slicers: [], unread: 0 };
  if (!Array.isArray(raw.slicers)) return { slicers: [], unread: 1 };
  const slicers: FileSlicer[] = [];
  for (const entry of raw.slicers) {
    const read = recordedSlicer(entry);
    if (read) slicers.push(read);
  }
  return { slicers, unread: raw.slicers.length - slicers.length };
}
