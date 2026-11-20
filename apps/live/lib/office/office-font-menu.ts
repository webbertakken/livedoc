// The toolbar's font menu as data (docs/specs/004-interface-design/fonts.md "The font menu"): More fonts, the families
// chosen last, then the catalogue's menu families, each drawn in its own face and checked when it is the family at the
// caret. A family the menu does not list (from a file) shows as what it is drawn in.
import { DOCUMENT_DEFAULT_FONT, DocumentFonts } from '@livedoc/document';
import type { OfficeActions, OfficeEntry, OfficeItem } from './office-catalogue';

export const MORE_FONTS_ITEM = 'more-fonts';

const fontItem = (name: string, place: 'recent' | 'all'): OfficeItem => ({
  kind: 'item',
  id: `${place}-font:${name}`,
  label: name,
  level: 'edit',
  status: 'built',
  checkable: 'radio',
  face: DocumentFonts.stack(name),
});

export function fontMenuEntries(recent: readonly string[]): OfficeEntry[] {
  const more: OfficeItem = {
    kind: 'item',
    id: MORE_FONTS_ITEM,
    label: 'More fonts',
    level: 'edit',
    status: 'comingSoon',
  };
  return [
    more,
    { kind: 'separator' },
    ...(recent.length > 0
      ? [...recent.map((name) => fontItem(name, 'recent')), { kind: 'separator' } as const]
      : []),
    ...DocumentFonts.menu().map((name) => fontItem(name, 'all')),
  ];
}

/** Each family's item chooses it, and is checked while it is the family at the caret. */
export function fontMenuActions(
  entries: readonly OfficeEntry[],
  current: string | null,
  choose: (name: string) => void,
): OfficeActions {
  const actions: Record<string, OfficeActions[string]> = {};
  for (const entry of entries)
    if (entry.kind === 'item' && entry.id !== MORE_FONTS_ITEM)
      actions[entry.id] = {
        run: () => choose(entry.label),
        checked: current !== null && entry.label.toLowerCase() === current.toLowerCase(),
      };
  return actions;
}

/** For a family the menu does not list, the family it is drawn in; null for one the menu lists. */
export function fontShownAs(name: string): string | null {
  const listed = DocumentFonts.menu().some((n) => n.toLowerCase() === name.toLowerCase());
  if (listed) return null;
  return (
    DocumentFonts.drawnIn(name) ??
    DocumentFonts.drawnIn(DOCUMENT_DEFAULT_FONT) ??
    DOCUMENT_DEFAULT_FONT
  );
}
