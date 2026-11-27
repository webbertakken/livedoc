// Protections as a file holds them (docs/specs/029-sheets/standard-mapping.md "Protection in the file", D349 to
// D352): each protection with its cells by position; the standard form each suite enforces (a protected sheet and the
// ranges it frees), LiveDoc's exact record beside it with the standard form's fingerprint, and the free cells a file's
// styles leave made into rectangles. Each format's reader and writer maps this (xlsx-protection.ts, ods-protection.ts).
import { formatRange, parseRangeText, type GridRange } from '../address';
import { makeAxisIds, type Rand } from '../ids';
import { idRangeOf, posRangeOf } from '../layout';
import {
  isProtection,
  PROTECTION_DESCRIPTION_MAX,
  PROTECTION_EXCEPTIONS_MAX,
  PROTECTIONS_MAX,
  type Protection,
  type ProtectionKept,
  type ProtectionPermission,
} from '../protection';
import type { IdRange, SheetLayout } from '../sheet';
import { validationFingerprint } from './validation-standard';
import type { FileLoss } from './workbook-file';

/** One protection in a file: a range's (`range`), or its sheet's (no `range`) but its `except` ranges. */
export type FileProtection = {
  range?: GridRange;
  except?: GridRange[];
  description?: string;
  can: ProtectionPermission;
  kept?: ProtectionKept;
};

/** A sheet's protections as a file holds them, in its order; one whose cells are gone is left out. */
export function fileProtectionsOf(layout: SheetLayout): FileProtection[] | undefined {
  const out: FileProtection[] = [];
  for (const p of layout.protections ?? []) {
    const { id: _id, range, except, ...rest } = p;
    if (range) {
      const at = posRangeOf(layout, range);
      if (at) out.push({ ...rest, range: at });
      continue;
    }
    const free = (except ?? []).flatMap((x) => {
      const at = posRangeOf(layout, x);
      return at ? [at] : [];
    });
    out.push({ ...rest, ...(free.length ? { except: free } : {}) });
  }
  return out.length ? out : undefined;
}

/**
 * The protection a format's standard form holds: the sheet's first protection of its whole sheet admitting Editors or
 * the owner alone; neither suite guards a range alone nor warns (D349).
 */
export const standardProtectionOf = (
  list: readonly FileProtection[] | undefined,
): FileProtection | undefined => list?.find((p) => !p.range && p.can !== 'warn');

/** The fingerprint of a standard form: whether the sheet is protected, then each free range's cells, each a line. */
export const protectionFingerprint = (
  protectedSheet: boolean,
  free: readonly GridRange[],
): string => validationFingerprint([protectedSheet ? '1' : '0', ...free.map(formatRange)]);

// A protection as LiveDoc's record holds it: its cells as A1 text, its description as `d`.
type Recorded = { range?: string; except?: string[]; can: ProtectionPermission; d?: string };

/** LiveDoc's record of a sheet's protections, as JSON; what a file of one format kept stays out of it. */
export function protectionRecordText(list: readonly FileProtection[]): string {
  const recorded = list.map((p): Recorded => ({
    ...(p.range ? { range: formatRange(p.range) } : {}),
    ...(p.except?.length ? { except: p.except.map(formatRange) } : {}),
    can: p.can,
    ...(p.description ? { d: p.description } : {}),
  }));
  return JSON.stringify(recorded);
}

const PERMISSIONS: ReadonlySet<string> = new Set(['warn', 'editors', 'owner']);

// One recorded protection, or null when it is not one.
function recordedOf(raw: unknown): FileProtection | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.can !== 'string' || !PERMISSIONS.has(x.can)) return null;
  const out: FileProtection = { can: x.can as ProtectionPermission };
  if (x.d !== undefined) {
    if (typeof x.d !== 'string' || x.d.length > PROTECTION_DESCRIPTION_MAX) return null;
    out.description = x.d;
  }
  if (x.range !== undefined) {
    const range = typeof x.range === 'string' ? parseRangeText(x.range) : null;
    if (!range || x.except !== undefined) return null;
    out.range = range;
    return out;
  }
  if (x.except === undefined) return out;
  if (!Array.isArray(x.except)) return null;
  const except = x.except.map((t) => (typeof t === 'string' ? parseRangeText(t) : null));
  if (except.some((g) => g === null)) return null;
  out.except = except as GridRange[];
  return out;
}

/** LiveDoc's record read back; null when it is not one. */
export function readProtectionRecord(text: string): FileProtection[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length > PROTECTIONS_MAX) return null;
  const list = raw.map(recordedOf);
  return list.some((p) => p === null) ? null : (list as FileProtection[]);
}

/** What a format's reader found of a sheet's protection: its standard form, and LiveDoc's record beside it. */
export type ProtectionFound = {
  protected: boolean;
  // What the file's protection held that LiveDoc has no form for (D351).
  kept?: ProtectionKept;
  // The ranges the protected sheet frees, in the file's order; the fingerprint is of these.
  free: GridRange[];
  record?: { text: string; fingerprint: string | undefined };
};

/**
 * A sheet's protections from what its file held: LiveDoc's record while its fingerprint is the standard form's as read,
 * the file's kept password on its standard protection; else the standard form, a protected sheet Only the Owner
 * (the Director's ruling) but its free ranges. `changed` when a record was dropped (`protection_changed`, D294).
 */
export function protectionsFound(found: ProtectionFound): {
  protections?: FileProtection[];
  changed: boolean;
} {
  const kept = found.kept ? { kept: found.kept } : {};
  if (found.record) {
    const now = protectionFingerprint(found.protected, found.free);
    const list = found.record.fingerprint === now ? readProtectionRecord(found.record.text) : null;
    if (list) {
      const standard = standardProtectionOf(list);
      const protections = list.map((p) => (p === standard ? { ...p, ...kept } : p));
      return { ...(protections.length ? { protections } : {}), changed: false };
    }
  }
  const changed = found.record !== undefined;
  if (!found.protected) return { changed };
  const except = found.free.length ? { except: found.free } : {};
  return { protections: [{ can: 'owner', ...except, ...kept }], changed };
}

// A range cut to the grid; null when it starts past it.
function onGrid(g: GridRange, layout: SheetLayout): IdRange | null {
  if (g.r1 >= layout.rows.length || g.c1 >= layout.cols.length) return null;
  return idRangeOf(
    layout,
    g.r1,
    g.c1,
    Math.min(g.r2, layout.rows.length - 1),
    Math.min(g.c2, layout.cols.length - 1),
  );
}

/**
 * A file's protections made on a sheet's grid, in order: each cut to the grid, checked as a write is. One that cannot
 * be made (a range off the grid, past PROTECTIONS_MAX) is left out and named (`protection_unread`, logged); an
 * exception off the grid is left out, its cells staying protected.
 */
export function protectionsFromFile(
  list: readonly FileProtection[] | undefined,
  layout: SheetLayout,
  sheet: string,
  rand: Rand,
  losses: FileLoss[],
): Protection[] | undefined {
  const out: Protection[] = [];
  const taken = new Set<string>();
  for (const x of list ?? []) {
    const { range, except, ...rest } = x;
    const [id] = makeAxisIds(1, rand, taken);
    const at = range ? onGrid(range, layout) : null;
    const free = (except ?? []).flatMap((g) => {
      const r = onGrid(g, layout);
      return r ? [r] : [];
    });
    const made: Protection = {
      id: id!,
      ...rest,
      ...(at ? { range: at } : {}),
      ...(free.length ? { except: free } : {}),
    };
    if ((range && !at) || out.length >= PROTECTIONS_MAX || !isProtection(made, made.id, layout)) {
      losses.push({ k: 'protection_unread', sheet });
      continue;
    }
    taken.add(made.id);
    out.push(made);
  }
  return out.length ? out : undefined;
}

/** What another app holds less of a protection, in the order the conversion dialog names them. */
export const PROTECTION_SIMPLIFIED = ['ranges', 'warnings', 'exceptions'] as const;
export type ProtectionSimplified = (typeof PROTECTION_SIMPLIFIED)[number];

/**
 * The protections another app holds more simply (standard-mapping.md "Protection in the file"): a range's, a
 * warning, and in `odf` a protected sheet's exceptions; and those whose file password the other standard's file
 * cannot carry.
 */
export function protectionsElsewhere(
  list: readonly FileProtection[],
  to: ProtectionKept['standard'],
): { count: number; features: ProtectionSimplified[]; passwords: number } {
  const all = new Set<ProtectionSimplified>();
  let count = 0;
  for (const p of list) {
    const lost: ProtectionSimplified[] = [];
    if (p.range) lost.push('ranges');
    if (p.can === 'warn') lost.push('warnings');
    if (to === 'odf' && !p.range && p.can !== 'warn' && p.except?.length) lost.push('exceptions');
    for (const f of lost) all.add(f);
    if (lost.length) count++;
  }
  const passwords = list.filter((p) => p.kept && p.kept.standard !== to).length;
  return { count, features: PROTECTION_SIMPLIFIED.filter((f) => all.has(f)), passwords };
}

/** A row's free columns, as runs of first and last column. */
export type FreeRun = readonly [number, number];

/**
 * A row's free runs: `base` (its row's or its columns' style) with its own cells' over it, each cell free or not.
 * Cells in column order.
 */
export function freeRunsOf(
  base: readonly FreeRun[],
  cells: readonly { c: number; free: boolean }[],
): FreeRun[] {
  if (cells.length === 0) return [...base];
  const own = new Map(cells.map((x) => [x.c, x.free]));
  const out: [number, number][] = [];
  const add = (a: number, b: number) => {
    const last = out.at(-1);
    if (last && last[1] === a - 1) last[1] = b;
    else out.push([a, b]);
  };
  const inBase = (c: number) => base.some(([a, b]) => c >= a && c <= b);
  // Between two stops (a cell's column, a base run's first column or the one after its last) the base is the same.
  const stops = [...new Set([...own.keys(), ...base.flatMap(([a, b]) => [a, b + 1])])].sort(
    (x, y) => x - y,
  );
  for (const [i, c] of stops.entries()) {
    const end = (stops[i + 1] ?? c + 1) - 1;
    if (!own.has(c)) {
      if (inBase(c)) add(c, end);
      continue;
    }
    if (own.get(c)) add(c, c);
    if (end > c && inBase(c + 1)) add(c + 1, end);
  }
  return out;
}

/** Rows in order, each span of rows sharing its free runs. */
export type FreeRows = { r1: number; r2: number; runs: readonly FreeRun[] };

/**
 * Free cells as rectangles: each row's runs, a run carried over consecutive rows while they share it. Past `max`
 * the rest are left out, `cut` saying so (D352).
 */
export function freeRectangles(
  rows: Iterable<FreeRows>,
  max = PROTECTION_EXCEPTIONS_MAX,
): { free: GridRange[]; cut: boolean } {
  const done: GridRange[] = [];
  let open = new Map<string, GridRange>();
  let lastRow = -2;
  for (const span of rows) {
    const next = new Map<string, GridRange>();
    for (const [c1, c2] of span.runs) {
      const key = `${c1}:${c2}`;
      const was = open.get(key);
      if (was && lastRow === span.r1 - 1) {
        was.r2 = span.r2;
        next.set(key, was);
        open.delete(key);
      } else next.set(key, { r1: span.r1, c1, r2: span.r2, c2 });
    }
    done.push(...open.values());
    if (done.length > max) return { free: done.slice(0, max), cut: true };
    open = next;
    lastRow = span.r2;
  }
  done.push(...open.values());
  const free = done.sort((a, b) => a.r1 - b.r1 || a.c1 - b.c1);
  return free.length > max ? { free: free.slice(0, max), cut: true } : { free, cut: false };
}
