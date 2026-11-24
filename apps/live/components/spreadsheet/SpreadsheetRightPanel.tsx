'use client';

// The spreadsheet's right side panel (docs/specs/004-interface-design/office-shell.md "Side panels"): Conditional Format
// Rules (docs/specs/029-sheets/conditional-formatting.md "In a spreadsheet", D213), the Plan Sheet popover's rule list
// and form in the shell's resizable frame, following the selection while it is open.
import { OfficePanel } from '@/components/office/OfficePanel';
import { SheetFormatRulesBody } from '@/components/sheets/rules/SheetFormatRules';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { SPREADSHEET_PANELS } from '@/lib/spreadsheet/spreadsheet-panels';

export function SpreadsheetRightPanel({
  panels,
  actions,
}: {
  panels: OfficePanelsState;
  actions: SheetActions;
}) {
  const spec = SPREADSHEET_PANELS.find((p) => p.id === panels.open.right);
  if (!spec) return null;
  const close = () => panels.close('right');
  return (
    <OfficePanel
      spec={spec}
      width={panels.width}
      onWidth={panels.setWidth}
      onWidthDone={panels.saveWidth}
      onClose={close}
      focusNonce={panels.focusNonce}
    >
      <div className="flex flex-col gap-3 p-3 text-body">
        <SheetFormatRulesBody actions={actions} onClose={close} />
      </div>
    </OfficePanel>
  );
}
