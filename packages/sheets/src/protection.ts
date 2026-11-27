// Protected sheets and ranges (docs/specs/029-sheets/data-tools.md "Protected ranges", D345, D347): a protection
// guards a range, or a whole sheet but its exceptions, from writes by those its permission does not admit. The room
// asks `protectionRefusal` of every write; the grid asks the same, and `protectionsTouched` for its warnings.
import { layoutIndex, posRangeOf } from './layout';
import type { IdRange, SheetLayout } from './sheet';
import type { SheetWrite } from './store';
import type { LayoutChange } from './store-layout';

/** Who writes where a protection stands: anyone after a warning, Editors (and the owner), or the owner alone. */
export type ProtectionPermission = 'warn' | 'editors' | 'owner';

/**
 * What a protected sheet's file held that LiveDoc has no form for, as the file wrote it: its password hash and Excel's
 * allowances, by their attribute names (standard-mapping.md "Protection in the file", D351). Never shown nor checked;
 * written back only to a file of its `standard`.
 */
export type ProtectionKept = {
  readonly standard: 'ooxml' | 'odf';
  readonly attributes: Readonly<Record<string, string>>;
};

/** A protection of a range (`range`), or of its whole sheet (no `range`) but its `except` ranges. */
export type Protection = {
  readonly id: string;
  readonly range?: IdRange;
  readonly except?: readonly IdRange[];
  readonly description?: string;
  readonly can: ProtectionPermission;
  // A protected sheet's, from the file it was read from.
  readonly kept?: ProtectionKept;
};

/** Who is writing: the spreadsheet's owner, an Editor (owner included), or neither (a Participant). */
export type ProtectionCaller = { readonly owner: boolean; readonly editor: boolean };

/** The most protections a sheet holds, exceptions a protected sheet holds, and a description's length (D345). */
export const PROTECTIONS_MAX = 100;
export const PROTECTION_EXCEPTIONS_MAX = 50;
export const PROTECTION_DESCRIPTION_MAX = 200;

const PERMISSIONS: readonly ProtectionPermission[] = ['warn', 'editors', 'owner'];

/** The attributes a file's protection keeps, by standard: SpreadsheetML's `sheetProtection`, ODF's `table:table`. */
export const PROTECTION_KEPT_ATTRIBUTES: Readonly<
  Record<ProtectionKept['standard'], ReadonlySet<string>>
> = {
  ooxml: new Set([
    'password',
    'algorithmName',
    'hashValue',
    'saltValue',
    'spinCount',
    'objects',
    'scenarios',
    'formatCells',
    'formatColumns',
    'formatRows',
    'insertColumns',
    'insertRows',
    'insertHyperlinks',
    'deleteColumns',
    'deleteRows',
    'selectLockedCells',
    'sort',
    'autoFilter',
    'pivotTables',
    'selectUnlockedCells',
  ]),
  odf: new Set([
    'table:protection-key',
    'table:protection-key-digest-algorithm',
    'loext:protection-key-digest-algorithm-2',
  ]),
};

/** The longest kept attribute value: a SHA-512 hash and its salt are far shorter. */
export const PROTECTION_KEPT_VALUE_MAX = 1024;

export const Protection = {
  /** Whether the protection lets this caller write where it stands. */
  admits: (p: Protection, caller: ProtectionCaller): boolean =>
    p.can === 'warn' || (p.can === 'editors' ? caller.editor || caller.owner : caller.owner),

  /** What a refusal says: "This range is protected: only the owner can change it." (a sheet's says sheet). */
  refusalLine: (p: Protection): string =>
    `This ${p.range ? 'range' : 'sheet'} is protected: only ${p.can === 'owner' ? 'the owner' : 'Editors'} can change it.`,
} as const;

/** The caller the room's own writes are (a form's response row, a deletion's rewrites elsewhere): every one admits it. */
export const PROTECTION_SYSTEM: ProtectionCaller = { owner: true, editor: true };

type Box = { r1: number; c1: number; r2: number; c2: number };

const inside = (box: Box, r: number, c: number) =>
  r >= box.r1 && r <= box.r2 && c >= box.c1 && c <= box.c2;

const meets = (a: Box, b: Box) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

// Whether a protection covers the cell at (r, c), by place.
function covers(layout: SheetLayout, p: Protection, r: number, c: number): boolean {
  if (!p.range)
    return !(p.except ?? []).some((x) => {
      const box = posRangeOf(layout, x);
      return box !== null && inside(box, r, c);
    });
  const box = posRangeOf(layout, p.range);
  return box !== null && inside(box, r, c);
}

/** The protections over the cell at (r, c), by place, in the sheet's order. */
export function protectionsAt(layout: SheetLayout, r: number, c: number): Protection[] {
  return (layout.protections ?? []).filter((p) => covers(layout, p, r, c));
}

// The ranges a layout change sets or clears (a merge's, a rule's, a band's), as stored before and as written.
function rangesOf(layout: SheetLayout, ch: LayoutChange): IdRange[] {
  switch (ch.k) {
    case 'merge':
    case 'unmerge':
      return [ch.range];
    case 'merges': {
      const key = (m: IdRange) => `${m.r1} ${m.c1} ${m.r2} ${m.c2}`;
      const before = new Set((layout.merges ?? []).map(key));
      const after = new Set(ch.merges.map(key));
      return [
        ...ch.merges.filter((m) => !before.has(key(m))),
        ...(layout.merges ?? []).filter((m) => !after.has(key(m))),
      ];
    }
    case 'vrule':
      return [...(ch.rule ? [ch.rule] : []), ...(layout.rules ?? []).filter((x) => x.id === ch.id)];
    case 'band':
      return [...(ch.band ? [ch.band] : []), ...(layout.bands ?? []).filter((x) => x.id === ch.id)];
    case 'table':
      return [
        ...(ch.table ? [ch.table] : []),
        ...(layout.tables ?? []).filter((x) => x.id === ch.id),
      ];
    case 'frule':
      return [ch.rule, ...(layout.formatRules ?? []).filter((x) => x.id === ch.id)].flatMap((x) =>
        x ? [x, ...(x.also ?? [])] : [],
      );
    default:
      return [];
  }
}

// Whether a layout change touches a range's protection, whose cells stand at `box`.
function changeTouches(layout: SheetLayout, ch: LayoutChange, p: Protection, box: Box): boolean {
  const ix = layoutIndex(layout);
  const rowIn = (id: string) => {
    const at = ix.rowPos.get(id);
    return at !== undefined && at >= box.r1 && at <= box.r2;
  };
  const colIn = (id: string) => {
    const at = ix.colPos.get(id);
    return at !== undefined && at >= box.c1 && at <= box.c2;
  };
  // A line put after `after` lands inside when `after` is one of its lines but its last.
  const within = (
    after: string | null,
    pos: ReadonlyMap<string, number>,
    lo: number,
    hi: number,
  ) => {
    const at = after === null ? -1 : (pos.get(after) ?? -1);
    return at >= lo && at < hi;
  };
  switch (ch.k) {
    case 'insertRows':
      return within(ch.after, ix.rowPos, box.r1, box.r2);
    case 'insertCols':
      return within(ch.after, ix.colPos, box.c1, box.c2);
    case 'deleteRows':
    case 'orderRows':
      return ch.ids.some(rowIn);
    case 'deleteCols':
    case 'orderCols':
      return ch.ids.some(colIn);
    case 'moveRows':
      return ch.ids.some(rowIn) || within(ch.after, ix.rowPos, box.r1, box.r2);
    case 'moveCols':
      return ch.ids.some(colIn) || within(ch.after, ix.colPos, box.c1, box.c2);
    case 'protection':
      return ch.id === p.id;
    default:
      return rangesOf(layout, ch).some((r) => {
        const other = posRangeOf(layout, r);
        return other !== null && meets(other, box);
      });
  }
}

// Whether a write touches a protection: a cell it covers, or (layout) its lines, cells' rules and itself; any write
// to a protected sheet but its exceptions' cells and other protections' own changes.
function touches(layout: SheetLayout, write: SheetWrite, p: Protection): boolean {
  const box = p.range ? posRangeOf(layout, p.range) : null;
  if (p.range && !box) return false;
  if (write.kind === 'title') return !p.range;
  const ix = layoutIndex(layout);
  const cells = write.kind === 'cells' ? write.cells : (write.cells ?? []);
  const cellTouched = cells.some((ch) => {
    const r = ix.rowPos.get(ch.r);
    const c = ix.colPos.get(ch.c);
    return r !== undefined && c !== undefined && covers(layout, p, r, c);
  });
  if (cellTouched || write.kind === 'cells') return cellTouched;
  if (!box) return write.changes.some((ch) => ch.k !== 'protection' || ch.id === p.id);
  return write.changes.some((ch) => changeTouches(layout, ch, p, box));
}

/** The protections a write touches, in the sheet's order (a warning one among them). */
export function protectionsTouched(layout: SheetLayout, write: SheetWrite): Protection[] {
  return (layout.protections ?? []).filter((p) => touches(layout, write, p));
}

/** The first protection a write touches that does not admit the caller, or null when every one admits it. */
export function protectionRefusal(
  layout: SheetLayout,
  write: SheetWrite,
  caller: ProtectionCaller,
): Protection | null {
  return protectionsTouched(layout, write).find((p) => !Protection.admits(p, caller)) ?? null;
}

// `box` less `hole`: the boxes left above, below, left and right of it (none when the hole covers it).
function subtract(box: Box, hole: Box): Box[] {
  if (!meets(box, hole)) return [box];
  const out: Box[] = [];
  if (hole.r1 > box.r1) out.push({ ...box, r2: hole.r1 - 1 });
  if (hole.r2 < box.r2) out.push({ ...box, r1: hole.r2 + 1 });
  const r1 = Math.max(box.r1, hole.r1);
  const r2 = Math.min(box.r2, hole.r2);
  if (hole.c1 > box.c1) out.push({ r1, c1: box.c1, r2, c2: hole.c1 - 1 });
  if (hole.c2 < box.c2) out.push({ r1, c1: hole.c2 + 1, r2, c2: box.c2 });
  return out;
}

/**
 * The boxes View › Show › Protected Ranges hatches for this viewer, by place: each protection it may not write freely
 * (a warning one too), a protected sheet less its exceptions.
 */
export function protectedBoxes(layout: SheetLayout, viewer: ProtectionCaller): Box[] {
  const all: Box = { r1: 0, c1: 0, r2: layout.rows.length - 1, c2: layout.cols.length - 1 };
  return (layout.protections ?? [])
    .filter((p) => p.can === 'warn' || !Protection.admits(p, viewer))
    .flatMap((p) => {
      if (p.range) {
        const box = posRangeOf(layout, p.range);
        return box ? [box] : [];
      }
      return (p.except ?? []).reduce<Box[]>(
        (boxes, x) => {
          const hole = posRangeOf(layout, x);
          return hole ? boxes.flatMap((b) => subtract(b, hole)) : boxes;
        },
        [all],
      );
    });
}

// A range of cells on the sheet.
function isRangeOn(raw: unknown, layout: SheetLayout): raw is IdRange {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Partial<IdRange>;
  return (
    layout.rows.includes(r.r1!) &&
    layout.rows.includes(r.r2!) &&
    layout.cols.includes(r.c1!) &&
    layout.cols.includes(r.c2!)
  );
}

// What a file's protection held, each attribute one its standard keeps.
function isProtectionKept(raw: unknown): raw is ProtectionKept {
  if (typeof raw !== 'object' || raw === null) return false;
  const k = raw as Partial<ProtectionKept>;
  const names =
    k.standard === 'ooxml' || k.standard === 'odf' ? PROTECTION_KEPT_ATTRIBUTES[k.standard] : null;
  const attributes = k.attributes;
  if (!names || typeof attributes !== 'object' || attributes === null || Array.isArray(attributes))
    return false;
  return Object.entries(attributes).every(
    ([name, value]) =>
      names.has(name) && typeof value === 'string' && value.length <= PROTECTION_KEPT_VALUE_MAX,
  );
}

/** Whether a write's protection is well made for id `id`, its cells on the sheet (D345). */
export function isProtection(raw: unknown, id: string, layout: SheetLayout): raw is Protection {
  if (typeof raw !== 'object' || raw === null) return false;
  const p = raw as Partial<Protection> & Record<string, unknown>;
  if (p.id !== id || !PERMISSIONS.includes(p.can as ProtectionPermission)) return false;
  if (p.description !== undefined)
    if (typeof p.description !== 'string' || p.description.length > PROTECTION_DESCRIPTION_MAX)
      return false;
  if (p.range !== undefined)
    return isRangeOn(p.range, layout) && p.except === undefined && p.kept === undefined;
  if (p.kept !== undefined && !isProtectionKept(p.kept)) return false;
  if (p.except === undefined) return true;
  return (
    Array.isArray(p.except) &&
    p.except.length <= PROTECTION_EXCEPTIONS_MAX &&
    p.except.every((x) => isRangeOn(x, layout))
  );
}
