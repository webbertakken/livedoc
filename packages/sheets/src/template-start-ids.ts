// Which starts make a Sheet, and the sheet template each is made from (docs/specs/026-plan/plan-templates.md
// "Spreadsheet templates"): names only, apart from the engine that makes the sheets (template-starts.ts), so what
// searches the templates by their sheets' words loads no sheet code (docs/specs/016-platform/web-performance.md).
import type { SheetTemplateId } from './sheet-templates/catalogue';

export const TEMPLATE_STARTS = [
  'budget-planner',
  'timesheet',
  'contact-list',
  'task-tracker',
  'invoice',
  'expense-report',
  'loan-calculator',
  'sales-pipeline',
  'inventory',
  'guest-list',
  'grade-book',
  'habit-tracker',
  // The companion Sheets of three Diagram templates (docs/specs/026-plan/plan-templates.md "How a template with
  // tabs is made"): each named for the template it follows.
  'threat-model',
  'metric-tree',
  'value-stream-map',
  // Blank Spreadsheet (docs/specs/026-plan/plan-templates.md "Spreadsheet templates"): an empty sheet, no template.
  'blank-spreadsheet',
] as const;
export type TemplateStartId = (typeof TEMPLATE_STARTS)[number];

// The start that makes an empty sheet rather than a sheet template's.
export const BLANK_SHEET_START = 'blank-spreadsheet' satisfies TemplateStartId;
type DesignedStartId = Exclude<TemplateStartId, typeof BLANK_SHEET_START>;

export function isTemplateStart(id: unknown): id is TemplateStartId {
  return typeof id === 'string' && (TEMPLATE_STARTS as readonly string[]).includes(id);
}

// The sheet template each Plan template's Sheet is made from (every start but the blank one).
export const TEMPLATE_START_SHEETS: Record<DesignedStartId, SheetTemplateId> = {
  'budget-planner': 'budget',
  timesheet: 'timesheet',
  'contact-list': 'contacts',
  'task-tracker': 'tracker',
  invoice: 'invoice',
  'expense-report': 'expenses',
  'loan-calculator': 'loan',
  'sales-pipeline': 'pipeline',
  inventory: 'inventory',
  'guest-list': 'guests',
  'grade-book': 'grades',
  'habit-tracker': 'habits',
  'threat-model': 'threats',
  'metric-tree': 'drivers',
  'value-stream-map': 'value-stream',
};
