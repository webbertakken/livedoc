// The toolbar's choice controls (docs/specs/029-sheets/surface.md "Toolbar"): More Formats, Horizontal Align, Vertical
// Align, Text Wrapping and Text Rotation open the choices of Format › Number, Alignment, Wrapping and Rotation, from
// the menus' own catalogue and bindings, so a choice ticked in one is ticked in the other. The control's glyph shows
// the choice in force.
import type { IconPrim } from '@livedoc/icons';
import {
  lucideAlignCenter,
  lucideAlignLeft,
  lucideAlignRight,
  lucideAlignVerticalJustifyCenter,
  lucideAlignVerticalJustifyEnd,
  lucideAlignVerticalJustifyStart,
  lucideArrowDown,
  lucideArrowDownRight,
  lucideArrowDownToLine,
  lucideArrowRight,
  lucideArrowRightToLine,
  lucideArrowUp,
  lucideArrowUpRight,
  lucideRotateCcw,
  lucideScissors,
  lucideWrapText,
} from '@livedoc/icons/lucide';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type {
  OfficeActions,
  OfficeCatalogue,
  OfficeEntry,
  OfficeItem,
} from '@/lib/office/office-catalogue';

/** A submenu's entries in the catalogue, found by its menu and its id. */
function submenuEntries(
  catalogue: OfficeCatalogue,
  menu: string,
  id: string,
): readonly OfficeEntry[] {
  const entry = catalogue
    .find((m) => m.id === menu)
    ?.entries.find((e) => e.kind === 'submenu' && e.id === id);
  return entry?.kind === 'submenu' ? entry.entries : [];
}

const items = (entries: readonly OfficeEntry[]) =>
  entries.filter((e): e is OfficeItem => e.kind === 'item');

/** The label of the entry ticked now, or null where none is (a mixed or unknown look). */
const tickedLabel = (entries: readonly OfficeEntry[], actions: OfficeActions) =>
  items(entries).find((item) => actions[item.id]?.checked === true)?.label ?? null;

function choiceOf(
  entries: readonly OfficeEntry[],
  actions: OfficeActions,
  glyphs?: Readonly<Record<string, readonly IconPrim[]>>,
  fallback?: readonly IconPrim[],
) {
  return {
    read: () => tickedLabel(entries, actions),
    entries,
    actions,
    ...(glyphs && fallback
      ? { iconOf: (value: string | null) => glyphs[value ?? ''] ?? fallback }
      : {}),
  };
}

const HORIZONTAL = { Left: lucideAlignLeft, Centre: lucideAlignCenter, Right: lucideAlignRight };
const VERTICAL = {
  Top: lucideAlignVerticalJustifyStart,
  Middle: lucideAlignVerticalJustifyCenter,
  Bottom: lucideAlignVerticalJustifyEnd,
};
const WRAPPING = { Overflow: lucideArrowRightToLine, Wrap: lucideWrapText, Clip: lucideScissors };
// Each rotation as the way its text runs; a custom angle, Text Rotation's own glyph.
const ROTATION = {
  None: lucideArrowRight,
  'Tilt Up': lucideArrowUpRight,
  'Tilt Down': lucideArrowDownRight,
  'Stack Vertically': lucideArrowDownToLine,
  'Rotate Up': lucideArrowUp,
  'Rotate Down': lucideArrowDown,
};

/** The four choice controls, bound as the menus' items are; none while the grid binds none of them. */
export function spreadsheetChoices(
  catalogue: OfficeCatalogue,
  actions: OfficeActions,
): OfficeChoices {
  const alignment = submenuEntries(catalogue, 'format', 'alignment');
  const split = alignment.findIndex((e) => e.kind === 'separator');
  const horizontal = alignment.slice(0, split);
  const vertical = alignment.slice(split + 1);
  const choices: OfficeChoices = {
    'more-formats': choiceOf(submenuEntries(catalogue, 'format', 'number'), actions),
    'horizontal-align': choiceOf(horizontal, actions, HORIZONTAL, lucideAlignLeft),
    'vertical-align': choiceOf(vertical, actions, VERTICAL, lucideAlignVerticalJustifyCenter),
    'text-wrapping': choiceOf(
      submenuEntries(catalogue, 'format', 'wrapping'),
      actions,
      WRAPPING,
      lucideArrowRightToLine,
    ),
    'text-rotation': choiceOf(
      submenuEntries(catalogue, 'format', 'rotation'),
      actions,
      ROTATION,
      lucideRotateCcw,
    ),
    // The toolbar's Merge Cells arrow (formatting.md "Merges", D208).
    'merge-cells': choiceOf(submenuEntries(catalogue, 'format', 'merge-cells'), actions),
  };
  // A Viewer's grid binds none: the controls stay away, as a built control nothing runs does.
  return Object.fromEntries(
    Object.entries(choices).filter(([, choice]) =>
      items(choice.entries).some((item) => actions[item.id]),
    ),
  );
}
