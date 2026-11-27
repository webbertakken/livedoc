'use client';

// The spreadsheet's right side panel (docs/specs/004-interface-design/office-shell.md "Side panels"): Conditional Format
// Rules (docs/specs/029-sheets/conditional-formatting.md "In a spreadsheet", D213), the Plan Sheet popover's rule list
// and form, Alternating Colours (formatting.md "Alternating colours") or Themes ("Themes"), in the shell's resizable
// frame, following the selection while it is open; and Named Ranges and Named Functions (data-tools.md "Named ranges
// and named functions").
import { OfficePanel } from '@/components/office/OfficePanel';
import { SheetBandingsBody } from '@/components/sheets/rules/SheetBandings';
import { SheetFormatRulesBody } from '@/components/sheets/rules/SheetFormatRules';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { SpreadsheetThemesBody } from './SpreadsheetThemesBody';
import { SpreadsheetValidationRulesBody } from './SpreadsheetValidationRulesBody';
import { SpreadsheetNamedRangesBody } from './SpreadsheetNamedRangesBody';
import { SpreadsheetNamedFunctionsBody } from './SpreadsheetNamedFunctionsBody';
import { SpreadsheetProtectionBody } from './SpreadsheetProtectionBody';
import type { ProtectionStart } from './ProtectionForm';
import {
  ALTERNATING_COLOURS_PANEL,
  CHART_EDITOR_PANEL,
  DATA_VALIDATION_PANEL,
  NAMED_FUNCTIONS_PANEL,
  NAMED_RANGES_PANEL,
  PIVOT_EDITOR_PANEL,
  COLUMN_STATS_PANEL,
  CLEAN_UP_SUGGESTIONS_PANEL,
  PROTECTION_PANEL,
  SPREADSHEET_PANELS,
  TABLE_SETTINGS_PANEL,
  THEMES_PANEL,
} from '@/lib/spreadsheet/spreadsheet-panels';
import { SpreadsheetTableSettingsBody } from './SpreadsheetTableSettingsBody';
import type { SheetChart, SheetPivot } from '@livedoc/sheets';
import { PivotEditorBody } from './pivots/PivotEditorBody';
import { ChartEditorBody } from './charts/ChartEditorBody';
import { SpreadsheetColumnStatsBody } from './SpreadsheetColumnStatsBody';
import { SpreadsheetCleanUpSuggestionsBody } from './SpreadsheetCleanUpSuggestionsBody';

export function SpreadsheetRightPanel({
  panels,
  actions,
  chart,
  pivot,
  validation = { nonce: 0, startNew: false },
  named = { nonce: 0, startAdding: false },
  protection = { nonce: 0, start: null },
}: {
  panels: OfficePanelsState;
  actions: SheetActions;
  // The chart the Chart Editor edits, and how a change of it is written.
  chart?: { id: string | null; change: (next: SheetChart) => void };
  // The pivot table the Pivot Table Editor edits, and how a change of it is written.
  pivot?: { id: string | null; change: (next: SheetPivot) => void };
  // How Data Validation Rules was last opened: a new Dropdown (Insert › Dropdown) or the active cell's rule.
  validation?: { nonce: number; startNew: boolean };
  // How Named Ranges was last opened: on Add a Range (Define Named Range) or as it opens (D299).
  named?: { nonce: number; startAdding: boolean };
  // How Protected Sheets and Ranges was last opened: on a new range or sheet (Protect Range, Protect Sheet) or its list.
  protection?: { nonce: number; start: ProtectionStart | null };
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
        {spec.id === PIVOT_EDITOR_PANEL.id ? (
          <PivotEditorBody
            pivotId={pivot?.id ?? null}
            onChange={(next) => pivot?.change(next)}
            onClose={close}
          />
        ) : spec.id === CHART_EDITOR_PANEL.id ? (
          <ChartEditorBody
            chartId={chart?.id ?? null}
            onChange={(next) => chart?.change(next)}
            onClose={close}
          />
        ) : spec.id === DATA_VALIDATION_PANEL.id ? (
          <SpreadsheetValidationRulesBody
            key={validation.nonce}
            actions={actions}
            startNew={validation.startNew}
          />
        ) : spec.id === NAMED_RANGES_PANEL.id ? (
          <SpreadsheetNamedRangesBody
            key={named.nonce}
            actions={actions}
            startAdding={named.startAdding}
          />
        ) : spec.id === PROTECTION_PANEL.id ? (
          <SpreadsheetProtectionBody
            key={protection.nonce}
            actions={actions}
            start={protection.start}
          />
        ) : spec.id === TABLE_SETTINGS_PANEL.id ? (
          <SpreadsheetTableSettingsBody
            actions={actions}
            onFormatting={() => panels.reveal(ALTERNATING_COLOURS_PANEL)}
            onClose={close}
          />
        ) : spec.id === COLUMN_STATS_PANEL.id ? (
          <SpreadsheetColumnStatsBody />
        ) : spec.id === CLEAN_UP_SUGGESTIONS_PANEL.id ? (
          <SpreadsheetCleanUpSuggestionsBody
            onColumnStats={() => panels.reveal(COLUMN_STATS_PANEL)}
          />
        ) : spec.id === NAMED_FUNCTIONS_PANEL.id ? (
          <SpreadsheetNamedFunctionsBody />
        ) : spec.id === THEMES_PANEL.id ? (
          <SpreadsheetThemesBody />
        ) : spec.id === ALTERNATING_COLOURS_PANEL.id ? (
          <SheetBandingsBody actions={actions} onClose={close} />
        ) : (
          <SheetFormatRulesBody actions={actions} onClose={close} />
        )}
      </div>
    </OfficePanel>
  );
}
