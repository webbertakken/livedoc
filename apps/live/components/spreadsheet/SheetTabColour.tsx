'use client';

// A sheet tab's Change Colour (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): the one colour picker
// (docs/specs/004-interface-design/colour-picker.md) in a popover from the tab, as the office toolbar's colours offer
// it (no Theme Palette, the standard colours light and dark, the document's custom colours), Reset leading it.
import { ColourPopover } from '@/components/colour/ColourPopover';
import { noColour } from '@/components/colour/colour-options';
import { OFFICE_COLOUR_ROWS } from '@/components/office/OfficeColourControl';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';

const RESET_ID = 'reset';
const NO_THEME: readonly never[] = [];

export function SheetTabColour({
  name,
  colour,
  anchor,
  onPick,
  onClose,
}: {
  name: string;
  // The tab's colour now, lower-case #rrggbb; none for no colour.
  colour: string | undefined;
  anchor: HTMLElement;
  // A lower-case #rrggbb, or null for Reset.
  onPick: (colour: string | null) => void;
  onClose: () => void;
}) {
  const yours = useDocumentColours();
  return (
    <ColourPopover
      label={`Colour of ${name}`}
      value={colour ?? RESET_ID}
      leading={[noColour(RESET_ID, 'Reset')]}
      theme={NO_THEME}
      standard={OFFICE_COLOUR_ROWS}
      yours={yours}
      anchor={anchor}
      onClose={onClose}
      onPick={(picked) => {
        onPick(picked === RESET_ID ? null : picked.toLowerCase());
        onClose();
      }}
    />
  );
}
