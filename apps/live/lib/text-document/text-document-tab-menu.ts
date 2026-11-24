// A document tab's menu (docs/specs/034-text-documents/links-and-navigation.md "A tab's menu", "Share roles"): its
// items in order with their separators, each bound only where it applies, so the menu dims the rest; a session that
// may not edit has Copy link alone.
import { DocumentTabList, type DocumentTab, type DocumentTabHead } from '@livedoc/text-documents';
import type { OfficeAction, OfficeActions, OfficeEntry } from '@/lib/office/office-catalogue';

/** The ways a tab moves from its menu, each a DocumentTabList change. */
export type TabMove = 'moveUp' | 'moveDown' | 'indent' | 'outdent';

export const TAB_MENU_ITEMS = {
  rename: 'tab-rename',
  chooseEmoji: 'tab-emoji',
  removeEmoji: 'tab-emoji-remove',
  addSubtab: 'tab-add-subtab',
  duplicate: 'tab-duplicate',
  copyLink: 'tab-copy-link',
  moveUp: 'tab-move-up',
  moveDown: 'tab-move-down',
  indent: 'tab-indent',
  outdent: 'tab-outdent',
  delete: 'tab-delete',
} as const;

const item = (id: string, label: string): OfficeEntry => ({
  kind: 'item',
  id,
  label,
  level: 'edit',
  status: 'built',
});
const SEPARATOR: OfficeEntry = { kind: 'separator' };

/** The menu's entries, in order (default, until a capture of Google's). */
export const TAB_MENU_ENTRIES: readonly OfficeEntry[] = [
  item(TAB_MENU_ITEMS.rename, 'Rename'),
  item(TAB_MENU_ITEMS.chooseEmoji, 'Choose emoji'),
  item(TAB_MENU_ITEMS.removeEmoji, 'Remove emoji'),
  SEPARATOR,
  item(TAB_MENU_ITEMS.addSubtab, 'Add subtab'),
  item(TAB_MENU_ITEMS.duplicate, 'Duplicate'),
  item(TAB_MENU_ITEMS.copyLink, 'Copy link'),
  SEPARATOR,
  item(TAB_MENU_ITEMS.moveUp, 'Move up'),
  item(TAB_MENU_ITEMS.moveDown, 'Move down'),
  item(TAB_MENU_ITEMS.indent, 'Indent'),
  item(TAB_MENU_ITEMS.outdent, 'Outdent'),
  SEPARATOR,
  item(TAB_MENU_ITEMS.delete, 'Delete'),
];

/** What each item does, given the tab it was opened on. */
export type TabMenuRun = {
  rename: (id: string) => void;
  chooseEmoji: (id: string) => void;
  removeEmoji: (id: string) => void;
  addSubtab: (id: string) => void;
  duplicate: (id: string) => void;
  copyLink: (id: string) => void;
  move: (id: string, move: TabMove) => void;
  askDelete: (id: string) => void;
};

// A stand-in head for asking whether a tab could be put in.
const PROBE: DocumentTab = { id: 't.probe', name: 'probe', depth: 0, body: [] };

/** The menu's entries for a session: every item for one that may edit, Copy link alone for any other. */
export const tabMenuEntries = (canEdit: boolean): readonly OfficeEntry[] =>
  canEdit
    ? TAB_MENU_ENTRIES
    : TAB_MENU_ENTRIES.filter((e) => e.kind === 'item' && e.id === TAB_MENU_ITEMS.copyLink);

/** The tab's menu actions: every item bound, dimmed where it cannot apply to it; Copy link alone without editing. */
export function tabMenuActions(
  list: readonly DocumentTab[],
  id: string,
  canEdit: boolean,
  run: TabMenuRun,
): OfficeActions {
  const tab: DocumentTabHead | undefined = list.find((t) => t.id === id);
  if (!tab) return {};
  const copyLink = { [TAB_MENU_ITEMS.copyLink]: { run: () => run.copyLink(id) } };
  if (!canEdit) return copyLink;
  const when = (applies: boolean, go: () => void): OfficeAction =>
    applies ? { run: go } : { run: go, disabled: true };
  const actions: Record<string, OfficeAction> = {
    ...copyLink,
    [TAB_MENU_ITEMS.rename]: { run: () => run.rename(id) },
    [TAB_MENU_ITEMS.chooseEmoji]: { run: () => run.chooseEmoji(id) },
    [TAB_MENU_ITEMS.duplicate]: { run: () => run.duplicate(id) },
    [TAB_MENU_ITEMS.removeEmoji]: when(tab.emoji !== undefined, () => run.removeEmoji(id)),
    [TAB_MENU_ITEMS.addSubtab]: when(DocumentTabList.addSubtab(list, id, PROBE) !== null, () =>
      run.addSubtab(id),
    ),
    [TAB_MENU_ITEMS.delete]: when(DocumentTabList.remove(list, id) !== null, () =>
      run.askDelete(id),
    ),
  };
  for (const move of ['moveUp', 'moveDown', 'indent', 'outdent'] as const)
    actions[TAB_MENU_ITEMS[move]] = when(DocumentTabList[move](list, id) !== null, () =>
      run.move(id, move),
    );
  return actions;
}
