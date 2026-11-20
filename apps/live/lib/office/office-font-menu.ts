// The toolbar's font menu as data (docs/specs/004-interface-design/fonts.md "The font menu"): More fonts, the families
// chosen last, then My fonts, each drawn in its own face and checked when it is the family at the caret; a family from
// Google Fonts that could not load says so. A family the menu does not list (from a file) shows as what it is drawn in.
import { DOCUMENT_DEFAULT_FONT, DocumentFonts } from '@livedoc/document';
import type { GoogleFontStatus } from '@/lib/document-fonts/google-font-loading';
import type { OfficeActions, OfficeEntry, OfficeItem } from './office-catalogue';
import { MyFonts } from './office-my-fonts';

export const MORE_FONTS_ITEM = 'more-fonts';
export const NOT_AVAILABLE_OFFLINE = 'Not available offline';

/** How a family from Google Fonts is loading; idle for every other. */
export type FontStatusOf = (name: string) => GoogleFontStatus;

const fontItem = (name: string, place: 'recent' | 'all', statusOf: FontStatusOf): OfficeItem => ({
  kind: 'item',
  id: `${place}-font:${name}`,
  label: name,
  level: 'edit',
  status: 'built',
  checkable: 'radio',
  face: DocumentFonts.stack(name),
  ...(statusOf(name) === 'failed' ? { note: NOT_AVAILABLE_OFFLINE } : {}),
});

export function fontMenuEntries(
  recent: readonly string[],
  myFonts: readonly string[],
  statusOf: FontStatusOf = () => 'idle',
): OfficeEntry[] {
  const more: OfficeItem = {
    kind: 'item',
    id: MORE_FONTS_ITEM,
    label: 'More fonts',
    level: 'edit',
    status: 'built',
  };
  return [
    more,
    { kind: 'separator' },
    ...(recent.length > 0
      ? [
          ...recent.map((name) => fontItem(name, 'recent', statusOf)),
          { kind: 'separator' } as const,
        ]
      : []),
    ...myFonts.map((name) => fontItem(name, 'all', statusOf)),
  ];
}

/** Each family's item chooses it, and is checked while it is the family at the caret; More fonts opens the dialog. */
export function fontMenuActions(
  entries: readonly OfficeEntry[],
  current: string | null,
  choose: (name: string) => void,
  moreFonts: () => void,
): OfficeActions {
  const actions: Record<string, OfficeActions[string]> = { [MORE_FONTS_ITEM]: { run: moreFonts } };
  for (const entry of entries)
    if (entry.kind === 'item' && entry.id !== MORE_FONTS_ITEM)
      actions[entry.id] = {
        run: () => choose(entry.label),
        checked: current !== null && entry.label.toLowerCase() === current.toLowerCase(),
      };
  return actions;
}

/**
 * For a family the menu does not list, or one from Google Fonts that could not load, the family it is drawn in; null
 * for one drawn in itself (a family from Google Fonts while it loads, as it lands with `display=swap`).
 */
export function fontShownAs(
  name: string,
  myFonts: readonly string[],
  statusOf: FontStatusOf = () => 'idle',
): string | null {
  const status = statusOf(name);
  if (status === 'loaded' || status === 'loading') return null;
  if (status === 'idle' && MyFonts.has(myFonts, name)) return null;
  return (
    DocumentFonts.drawnIn(name) ??
    DocumentFonts.drawnIn(DOCUMENT_DEFAULT_FONT) ??
    DOCUMENT_DEFAULT_FONT
  );
}
