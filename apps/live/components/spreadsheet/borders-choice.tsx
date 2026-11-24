// The toolbar's Borders control as a choice the shell draws (docs/specs/029-sheets/formatting.md "Borders"): no menu
// of its own, its panel in place of one.
import type { OfficeChoice } from '@/components/office/OfficeChoiceMenu';
import { OfficeBordersPanel, type OfficeBorders } from '@/components/office/OfficeBordersPanel';

const NO_ENTRIES: OfficeChoice['entries'] = [];

export function bordersChoice(borders: OfficeBorders): OfficeChoice {
  return {
    read: () => null,
    entries: NO_ENTRIES,
    actions: {},
    panel: (close) => <OfficeBordersPanel borders={borders} controlId="borders" onClose={close} />,
  };
}
