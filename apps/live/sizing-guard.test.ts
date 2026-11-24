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
];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
