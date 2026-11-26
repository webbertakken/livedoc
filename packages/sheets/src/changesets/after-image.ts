// What a sheet changeset left behind (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D265): each
// touched cell's input and format, and each touched chart, validation rule, format rule and banding, as canonical
// JSON, and the title it set; what its revert compares the sheet against to keep what changed since (D266).
import type { LayoutChange } from '../store-layout';
import type { Cell, Sheet, SheetLayout } from '../sheet';

export type SheetChangesetAfter = {
  // Cell key to the canonical JSON of the cell it left (an empty cell's input and format both null).
  cells: Record<string, string>;
  // `object:<id>`, `vrule:<id>`, `frule:<id>` or `band:<id>` to the canonical JSON of what it left, or null for none.
  things: Record<string, string | null>;
  title?: string;
};

// JSON with every object's keys sorted and undefined members left out, so equal values read as equal text.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sorted(value));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = sorted(v);
  }
  return out;
}

export function cellImage(cell: Cell | undefined): string {
  return canonicalJson({ i: cell?.input ?? null, f: cell?.format ?? null });
}

// The layout things a change sets by id, under the key the after-image files them by; none for other changes.
export function thingKeyOf(change: LayoutChange): string | null {
  switch (change.k) {
    case 'object':
    case 'vrule':
    case 'frule':
    case 'band':
      return `${change.k}:${change.id}`;
    default:
      return null;
  }
}

// The thing a key names, as the layout holds it now; null when it holds none.
export function thingImage(layout: SheetLayout, key: string): string | null {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  const list =
    kind === 'object'
      ? layout.objects
      : kind === 'vrule'
        ? layout.rules
        : kind === 'frule'
          ? layout.formatRules
          : layout.bands;
  const found = (list as readonly { id: string }[] | undefined)?.find((x) => x.id === id);
  return found ? canonicalJson(found) : null;
}

// The after-image of a sheet for the cells and things a changeset touched, and its title when it set one.
export function afterImageOf(
  sheet: Sheet,
  cells: Iterable<string>,
  things: Iterable<string>,
  titled: boolean,
): SheetChangesetAfter {
  const out: SheetChangesetAfter = { cells: {}, things: {} };
  for (const key of cells) out.cells[key] = cellImage(sheet.cells.get(key));
  for (const key of things) out.things[key] = thingImage(sheet.layout, key);
  if (titled) out.title = sheet.title;
  return out;
}
