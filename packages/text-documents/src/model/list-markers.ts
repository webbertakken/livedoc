// List markers (docs/specs/034-text-documents/lists.md "Numbering", "Levels"): each list item's marker, from its list's
// definition and its place among the items before it. Numbering runs on through a list past anything between its
// items; a deeper level starts again after a shallower item; an item may start its level again at a number.
import {
  LIST_LEVELS,
  ListDefinition,
  type ListLevel,
  type ListPlace,
  type NumberFormat,
} from './lists';

export type ListMarker =
  | { readonly kind: 'bullet' | 'number'; readonly text: string; readonly level: number }
  | {
      readonly kind: 'check';
      readonly text: '';
      readonly level: number;
      readonly checked: boolean;
    };

const ROMAN: readonly [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function roman(n: number): string {
  let out = '';
  let rest = n;
  for (const [value, letters] of ROMAN)
    while (rest >= value) {
      out += letters;
      rest -= value;
    }
  return out;
}

// a to z, then aa to zz, then aaa: the letter repeated, as both formats count.
const letters = (n: number) =>
  String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);

/** A number as a list level writes it. */
export function numberText(n: number, format: NumberFormat): string {
  if (n < 1 || !Number.isInteger(n)) return String(n);
  switch (format) {
    case 'decimal':
      return String(n);
    case 'lower-letter':
      return letters(n);
    case 'upper-letter':
      return letters(n).toUpperCase();
    case 'lower-roman':
      return roman(n);
    case 'upper-roman':
      return roman(n).toUpperCase();
  }
}

const FALLBACK = ListDefinition.of('bullet');

const levelOf = (list: ListDefinition, level: number): { def: ListLevel; at: number } => {
  const at = Math.min(Math.max(0, Math.trunc(level)), list.levels.length - 1, LIST_LEVELS - 1);
  return { def: list.levels[at] ?? FALLBACK.levels[0]!, at };
};

const startOf = (def: ListLevel | undefined) => (def?.kind === 'number' ? def.start : 1);

export const ListMarkers = {
  /** Each paragraph's marker, in order: null for a paragraph in no list, or an unnumbered one. */
  of: (
    places: readonly (ListPlace | undefined)[],
    lists: Readonly<Record<string, ListDefinition>>,
  ): (ListMarker | null)[] => {
    const counters = new Map<string, (number | undefined)[]>();
    return places.map((place): ListMarker | null => {
      if (!place || place.unnumbered) return null;
      const list = lists[place.id] ?? FALLBACK;
      const { def, at } = levelOf(list, place.level);
      if (def.kind === 'bullet') return { kind: 'bullet', text: def.bullet, level: at };
      if (def.kind === 'check')
        return { kind: 'check', text: '', level: at, checked: place.checked === true };
      const counts = counters.get(place.id) ?? [];
      counters.set(place.id, counts);
      counts[at] = place.restart !== undefined ? place.restart : (counts[at] ?? def.start - 1) + 1;
      // A deeper level starts again after this item.
      counts.length = at + 1;
      const text = def.label.replace(/%([1-9])/g, (_, k: string) => {
        const level = Number(k) - 1;
        const levelDef = list.levels[level];
        const n = counts[level] ?? startOf(levelDef);
        return numberText(n, levelDef?.kind === 'number' ? levelDef.format : 'decimal');
      });
      return { kind: 'number', text, level: at };
    });
  },
} as const;
