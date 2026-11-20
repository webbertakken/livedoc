// An office kind's menus as data (docs/specs/004-interface-design/office-shell.md "Menus as data"): the kind declares
// them once; the shell draws them, lists them in the tool finder, and hides what the session's level may not see.
// What an item does is bound by its id at run time, never drawn by hand.
import { levelAtLeast, type AccessLevel } from '@livedoc/api-schema';

export type OfficeItemStatus = 'built' | 'comingSoon';

export type OfficeItem = {
  kind: 'item';
  id: string;
  label: string;
  // The least share level that sees it.
  level: AccessLevel;
  status: OfficeItemStatus;
  // Its row in the kind's shortcut registry.
  shortcut?: string;
  // The part of its row's keys that names this item, for a row of several (`[1-6]`: '3' for Heading 3).
  shortcutArg?: string;
  // Other words the tool finder knows it by.
  keywords?: readonly string[];
  // An on/off item, or one of a set: drawn with a check.
  checkable?: 'checkbox' | 'radio';
  // A CSS font-family its label is drawn in (a font menu draws each family in its face).
  face?: string;
  // Its label drawn in a look of its own as well (a style menu draws each style at its size, weight and slant).
  faceStyle?: Readonly<{ fontSize?: string; fontWeight?: number; fontStyle?: 'italic' | 'normal' }>;
  // A word on its state, drawn muted where a shortcut would be and read with it (a font that could not load).
  note?: string;
};

export type OfficeSubmenu = {
  kind: 'submenu';
  id: string;
  label: string;
  entries: readonly OfficeEntry[];
  // A choice with a submenu (office-shell.md "Toolbar"): the action a press on its row runs, its check read from it.
  run?: string;
  checkable?: 'radio';
  // Its label drawn in a look of its own, as an item's.
  faceStyle?: OfficeItem['faceStyle'];
};

export type OfficeEntry = OfficeItem | OfficeSubmenu | { kind: 'separator' };

export type OfficeMenu = {
  id: string;
  label: string;
  entries: readonly OfficeEntry[];
};

export type OfficeCatalogue = readonly OfficeMenu[];

// What an item does, bound by id: `checked` for a checkable item, `disabled` when it cannot run now, `label` for what
// it does now where that changes (Add or Remove space before a paragraph).
export type OfficeAction = { run: () => void; checked?: boolean; disabled?: boolean; label?: string };
export type OfficeActions = Readonly<Record<string, OfficeAction | undefined>>;

// An item with the menus it sits in ("Format", "Text").
export type FoundItem = { item: OfficeItem; path: readonly string[] };

// Shown: at or below the session's level, and, once built, bound for this session (the binding is its permission).
type Shown = (item: OfficeItem) => boolean;

function visibleEntries(entries: readonly OfficeEntry[], shown: Shown): OfficeEntry[] {
  const kept: OfficeEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'item') {
      if (shown(entry)) kept.push(entry);
    } else if (entry.kind === 'submenu') {
      const inner = visibleEntries(entry.entries, shown);
      if (inner.length > 0)
        kept.push(inner.length === entry.entries.length ? entry : { ...entry, entries: inner });
    } else if (kept.length > 0 && kept[kept.length - 1]!.kind !== 'separator') {
      kept.push(entry);
    }
  }
  while (kept.length > 0 && kept[kept.length - 1]!.kind === 'separator') kept.pop();
  return kept;
}

// What the session sees. Without `actions` the level alone decides (a list of every item a level could reach).
export function visibleMenus(
  catalogue: OfficeCatalogue,
  level: AccessLevel,
  actions?: OfficeActions,
): OfficeMenu[] {
  const shown: Shown = (item) =>
    levelAtLeast(level, item.level) &&
    (!actions || item.status === 'comingSoon' || actions[item.id] !== undefined);
  return catalogue.flatMap((menu) => {
    const entries = visibleEntries(menu.entries, shown);
    if (entries.length === 0) return [];
    return [entries.length === menu.entries.length ? menu : { ...menu, entries }];
  });
}

function itemsOf(entries: readonly OfficeEntry[], path: readonly string[]): FoundItem[] {
  return entries.flatMap((entry) => {
    if (entry.kind === 'item') return [{ item: entry, path }];
    if (entry.kind === 'submenu') return itemsOf(entry.entries, [...path, entry.label]);
    return [];
  });
}

export function catalogueItems(catalogue: OfficeCatalogue): FoundItem[] {
  return catalogue.flatMap((menu) => itemsOf(menu.entries, [menu.label]));
}

// One entry of a context menu (office-shell.md "Context menus"): a menu item by its id, relabelled where the context
// names it otherwise ("Insert link") or offers it to fewer (a level of its own), an item of the context's own, or a separator.
export type ContextEntrySpec =
  string | { id: string; label: string; level?: AccessLevel } | OfficeItem | { kind: 'separator' };

// A context menu's entries, sharing the menus' items (their status, level and binding) by id, as commands. An id no menu holds is a
// fault of the kind's declaration, refused as it is built.
export function contextEntries(
  catalogue: OfficeCatalogue,
  specs: readonly ContextEntrySpec[],
): OfficeEntry[] {
  const byId = new Map(catalogueItems(catalogue).map(({ item }) => [item.id, item]));
  return specs.map((spec): OfficeEntry => {
    if (typeof spec === 'object' && 'kind' in spec) return spec;
    const id = typeof spec === 'string' ? spec : spec.id;
    const found = byId.get(id);
    if (!found) throw new Error(`context menu: no menu item ${id}`);
    // A context menu holds commands: a menu's check (Suggesting among the modes) is no check here.
    const { checkable: _check, ...item } = found;
    return typeof spec === 'string'
      ? item
      : { ...item, label: spec.label, ...(spec.level ? { level: spec.level } : {}) };
  });
}

// What a kind's catalogue gets wrong: a built item nothing runs, a shortcut its registry lacks, an id used twice.
export function catalogueFaults(
  catalogue: OfficeCatalogue,
  { bound, shortcuts }: { bound: readonly string[]; shortcuts: readonly string[] },
): string[] {
  const faults: string[] = [];
  const seen = new Set<string>();
  for (const { item } of catalogueItems(catalogue)) {
    if (seen.has(item.id)) faults.push(`${item.id}: used twice`);
    seen.add(item.id);
    if (item.status === 'built' && !bound.includes(item.id))
      faults.push(`${item.id}: built but nothing runs it`);
    if (item.shortcut && !shortcuts.includes(item.shortcut))
      faults.push(`${item.id}: shortcut ${item.shortcut} is not in the registry`);
  }
  return faults;
}

// The items the shell binds itself (OfficeTitleRow): File > Open's picker, the document's own Rename, Move and Share
// (where the session may use them), Help > Search the menus and Help > Keyboard shortcuts.
export const SHELL_BOUND_ITEMS: readonly string[] = [
  'open',
  'rename',
  'move',
  'share-with-others',
  'search-the-menus',
  'keyboard-shortcuts',
];
