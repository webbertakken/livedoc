import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The editor's parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = [
  'components/primitives',
  'components/colour',
  'components/drive',
  'components/placement',
  'components/split',
  'components/bug-report',
  'components/tags',
  'components/toast',
  'components/tour',
  'components/dialogs',
  'app/explorer',
  'app/new',
  'components/start',
  'components/panels',
  'components/canvas/ImageDropZone.tsx',
  'components/notes',
  'components/spreadsheet',
  // A sheet's rule popovers; what a rule draws in the cells (sheet-rule-draw, SheetRuleLayer) is content.
  'components/sheets/rules/SheetCustomFormat.tsx',
  'components/sheets/rules/SheetDropdownList.tsx',
  'components/sheets/rules/SheetFormatRules.tsx',
  'components/sheets/rules/SheetRuleSettings.tsx',
  'components/sheets/rules/SheetValidationEditor.tsx',
  // Plan's one option list, shared by Plan's pickers and the sheet's rule popovers.
  'components/plan/OptionRows.tsx',
  // A sheet's own chrome; its cells and drawing layers are content, its toolbar moves with the canvas palette.
  'components/sheets/NameBoxList.tsx',
  'components/sheets/SheetBordersPicker.tsx',
  'components/sheets/SheetCellMenu.tsx',
  'components/sheets/SheetColourSwatches.tsx',
  'components/sheets/SheetFindBar.tsx',
  'components/sheets/SheetFormulaBar.tsx',
  'components/sheets/SheetFunctionMenu.tsx',
  'components/sheets/SheetFunctionSearch.tsx',
  'components/sheets/SheetMenus.tsx',
  'components/sheets/SheetNamedRanges.tsx',
  'components/sheets/SheetStatusBar.tsx',
  // A form's chrome; the form as respondents see it is content (sizing.md, D237).
  'components/forms/FormBoardStrip.tsx',
  'components/forms/FormLockedStrip.tsx',
  'components/forms/FormNotTakingWarning.tsx',
  'components/forms/FormPage.tsx',
  'components/forms/FormProblems.tsx',
  'components/forms/FormStatusBar.tsx',
  'components/forms/NewResponseMark.tsx',
  'components/forms/PendingFormStart.tsx',
  'components/forms/ShareFormDialog.tsx',
  // The builder: its picture of the form draws the form's own type (forms.css form-type-*); its controls are chrome.
  'components/forms/builder',
  // A Sheet's header, setup, settings and floating parts; the grid is content (sizing.md D238).
  'components/sheets/SheetCellComments.tsx',
  'components/sheets/SheetHeader.tsx',
  'components/sheets/SheetMergeConfirm.tsx',
  'components/sheets/SheetResizeDialog.tsx',
  'components/sheets/SheetSettingsPanel.tsx',
  'components/sheets/SheetSetupStart.tsx',
  'components/sheets/SheetSetupStyle.tsx',
  'components/sheets/SheetSmartFillLayer.tsx',
  'components/sheets/SheetTouchLinkChip.tsx',
  // A Dashboard tab is chrome (sizing.md D239).
  'components/plan/dashboard',
  // A Plan view's frame and metric tiles; its drawing is content (sizing.md D240).
  'components/plan/views',
  // A board's header widgets, their zone and picker.
  'components/plan/widgets',
  // A card's panel: its fields, description, comments and linked cards.
  'components/plan/item-field-editors.tsx',
  'components/plan/ItemComments.tsx',
  'components/plan/ItemDescription.tsx',
  'components/plan/ItemFieldEditor.tsx',
  'components/plan/ItemPanel.tsx',
  'components/plan/ItemPanelHeaderParts.tsx',
  'components/plan/ItemPanelLayout.tsx',
  'components/plan/ItemTrailCrumbs.tsx',
  'components/plan/LinkedActionBanner.tsx',
  'components/plan/LinkedCardField.tsx',
  'components/plan/LinkedCards.tsx',
  'components/plan/PlanModal.tsx',
  // A board's setup and its columns' settings.
  'components/plan/AddColumnPicker.tsx',
  'components/plan/AddColumnPickerPopover.tsx',
  'components/plan/BoardColumnsSection.tsx',
  'components/plan/PlanColumnPopover.tsx',
  'components/plan/PlanSetupBoard.tsx',
  'components/plan/RemoveColumnPopover.tsx',
  'components/plan/settings-panel-parts.tsx',
  'components/plan/setup-board-steps.tsx',
  'components/plan/SetupCard.tsx',
  'components/plan/SetupColumnList.tsx',
  'components/plan/SetupLayoutStep.tsx',
  'components/plan/SetupStepper.tsx',
  // Card types: their fields, states, layout and glyphs.
  'components/plan/CardTypesPanel.tsx',
  'components/plan/CustomFieldEditor.tsx',
  'components/plan/CustomFieldKindParts.tsx',
  'components/plan/ExistingStatusList.tsx',
  'components/plan/GlyphPicker.tsx',
  'components/plan/ItemTypeConfiguration.tsx',
  'components/plan/ItemTypeDisplay.tsx',
  'components/plan/ItemTypeEditor.tsx',
  'components/plan/ItemTypeEditorTabs.tsx',
  'components/plan/ItemTypeFieldForms.tsx',
  'components/plan/ItemTypeFieldRow.tsx',
  'components/plan/ItemTypeLayoutEditor.tsx',
  'components/plan/ItemTypeStatuses.tsx',
];

// Inside a moved folder, what stays off the scale: drawn art, and a part that moves with a later slice.
const SIZING_EXCEPTIONS = [
  // Add to Slot's pictures of a card and a slot (sizing.md D239).
  'components/plan/dashboard/card-previews.tsx',
  'components/plan/dashboard/slot-previews.tsx',
  // Its floating cog shares the canvas toolbar's frame, so it moves with the canvas chrome.
  'components/plan/dashboard/DashboardSettings.tsx',
  // A Plan view's drawing is content (sizing.md D240).
  'components/plan/views/calendar-day.tsx',
  'components/plan/views/CalendarView.tsx',
  'components/plan/views/gantt-drag.tsx',
  'components/plan/views/gantt-draw.tsx',
  'components/plan/views/gantt-mark.tsx',
  'components/plan/views/gantt-rows.tsx',
  'components/plan/views/GanttView.tsx',
  'components/plan/views/PriorityMatrixView.tsx',
  'components/plan/views/StatusMixView.tsx',
  'components/plan/views/WorkloadView.tsx',
];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    expect(
      formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS, except: SIZING_EXCEPTIONS })),
    ).toBe('');
  });
});
