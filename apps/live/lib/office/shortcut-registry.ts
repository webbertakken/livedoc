// An office kind's shortcut registry (docs/specs/004-interface-design/office-shell.md "Shortcut layer"): one row per
// action, its keys for each platform in the notation, and how far it is built; and the registry as the Keyboard
// shortcuts dialog lists it ("Keyboard shortcuts dialog").
import type { ShortcutKeys } from './shortcut-matcher';
import { formatShortcut, parseShortcut, type OfficePlatform } from './shortcut-notation';
import { everyWordStarts } from './word-match';

// `browser`: the key is left to the browser, as Google leaves it. `surface`: the kind's surface hears the key itself,
// so the layer never runs it. `leftOut`: its function is a Google service (C3). `native`: what it turns on, LiveDoc's
// page does without it (braille support: the page is text), so nothing binds it.
export type ShortcutStatus = 'specified' | 'built' | 'surface' | 'browser' | 'leftOut' | 'native';

export type ShortcutRow = {
  id: string;
  group: string;
  action: string;
  keys: ShortcutKeys;
  status: ShortcutStatus;
};

export type ListedShortcut = {
  id: string;
  action: string;
  // Every way to give it on this platform and browser, written in the platform's notation.
  ways: string[];
  comingSoon: boolean;
};

export type ShortcutListing = {
  groups: { name: string; rows: ListedShortcut[] }[];
  count: number;
};

function waysOn(
  row: ShortcutRow,
  { platform, chrome }: { platform: OfficePlatform; chrome: boolean },
): string[] {
  const ways = parseShortcut(row.keys[platform]).filter(
    (way) => !way.browser || (way.browser === 'chrome') === chrome,
  );
  return [...new Set(ways.map((way) => formatShortcut(way, platform)))];
}

// The rows the dialog shows for this query, by group in the registry's order.
export function shortcutListing(
  rows: readonly ShortcutRow[],
  where: { platform: OfficePlatform; chrome: boolean },
  query: string,
): ShortcutListing {
  const groups = new Map<string, ListedShortcut[]>();
  let count = 0;
  for (const row of rows) {
    if (row.status === 'leftOut' || row.status === 'native') continue;
    if (!everyWordStarts(query, `${row.action} ${row.group}`)) continue;
    const ways = waysOn(row, where);
    if (ways.length === 0) continue;
    const listed = groups.get(row.group) ?? [];
    listed.push({ id: row.id, action: row.action, ways, comingSoon: row.status === 'specified' });
    groups.set(row.group, listed);
    count += 1;
  }
  return { groups: [...groups].map(([name, listed]) => ({ name, rows: listed })), count };
}
