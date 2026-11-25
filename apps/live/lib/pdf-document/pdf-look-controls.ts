// The toolbar's look controls a Format item opens or repeats (docs/specs/035-pdf-documents/marks.md "Changing a mark";
// reading-surface.md "The toolbar"): Line width offers Format > Line width's steps while one of them may run, and is
// dimmed while none may; Format > Colour and Fill colour open the toolbar's Colour and Fill, dimmed while the toolbar
// offers none.
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { openToolbarControl } from '@/lib/office/open-toolbar-control';
import { FORMAT_COLOUR, FORMAT_FILL_COLOUR, LINE_WIDTH_MENU } from './pdf-menus';
import { WIDTH_ITEMS } from './pdf-mark-restyle';
import { FILL_COLOUR, LINE_WIDTH, TOOL_COLOUR } from './pdf-toolbar';

const WIDTH_ENTRIES = LINE_WIDTH_MENU.kind === 'submenu' ? LINE_WIDTH_MENU.entries : [];
const WIDTH_NAMES = new Map(
  WIDTH_ENTRIES.flatMap((entry) => (entry.kind === 'item' ? [[entry.id, entry.label]] : [])),
);

/** The look controls for the actions and colours bound now. */
export function lookControls(
  actions: OfficeActions,
  colours: OfficeColours,
  open: (id: string) => boolean = openToolbarControl,
): { actions: OfficeActions; choices: OfficeChoices } {
  const widths = Object.keys(WIDTH_ITEMS).filter((id) => actions[id] && !actions[id].disabled);
  return {
    actions: {
      [FORMAT_COLOUR]: { run: () => void open(TOOL_COLOUR), disabled: !(TOOL_COLOUR in colours) },
      [FORMAT_FILL_COLOUR]: {
        run: () => void open(FILL_COLOUR),
        disabled: !(FILL_COLOUR in colours),
      },
      ...(widths.length > 0 ? {} : { [LINE_WIDTH]: { run: () => {}, disabled: true } }),
    },
    choices:
      widths.length > 0
        ? {
            [LINE_WIDTH]: {
              // The step in force, by its name ("8 pt"); none where the marks differ.
              read: () => {
                const id = widths.find((step) => actions[step]?.checked);
                return WIDTH_NAMES.get(id ?? '') ?? null;
              },
              entries: WIDTH_ENTRIES,
              actions,
            },
          }
        : {},
  };
}
