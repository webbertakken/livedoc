// Template starts (docs/specs/029-sheets/sheet-store.md "Template starts"; the templates in
// docs/specs/026-plan/plan-templates.md "Spreadsheet templates"): the sheets a Plan template's Sheet is made from,
// each one of the sheet templates (sheet-templates/, sheet.md "Sheet templates"). `templateSheetWithCharts` builds one whole,
// with the charts that sit over it; @livedoc/templates' materialiseTemplateSheets turns a tab's marked Sheet
// elements into them, and the editor makes one only when a path missed it.
import { emptyLayout, emptySheet, NOBODY } from './sheet';
import { sheetToJson } from './sheet-json';
import { applySheetWrite } from './store';
import { Workbook } from './engine/workbook';
import { sheetChartTable, type SheetChartTable } from './chart-data';
import { designWrite, type TemplateChart } from './sheet-templates/compile';
import { sheetTemplateInfo, type SheetTemplateId } from './sheet-templates/catalogue';
import { sheetTemplate } from './sheet-templates/template-design';
import type { SheetLook } from './sheet-starters';
import type { Rand } from './ids';
import type { SheetJson } from './sheet-json';
import {
  BLANK_SHEET_START,
  TEMPLATE_START_SHEETS,
  type TemplateStartId,
} from './template-start-ids';

// A blank start's sheet's title.
const BLANK_SHEET_TITLE = 'Sheet 1';

// The look a template's sheet is made in when nobody picked one (a Plan template, a Dashboard slot, Setup Sheet's
// first choice for a template).
export const TEMPLATE_LOOK: SheetLook = 'banded';

// A sheet made from a sheet template, ready to create: set up in the Banded look with its header frozen, at the
// default cell size, tinted for a light or dark canvas; and the charts to place over it. Null if the design's cells
// cannot be read (a formula the engine refuses: a bug in the design, caught by its test).
export function sheetFromTemplate(opts: {
  id: string;
  tabId: string;
  template: SheetTemplateId;
  now: number;
  dark: boolean;
  rand?: Rand;
}): {
  sheet: Pick<SheetJson, 'id' | 'tabId' | 'title' | 'layout' | 'cells'>;
  // Each chart with its first read (en-GB, as a chart keeps it), for whatever draws it before a browser reads it live.
  charts: (TemplateChart & { table: SheetChartTable })[];
} | null {
  const { id, tabId, now, dark, rand = Math.random } = opts;
  const design = sheetTemplate(opts.template, now);
  const title = sheetTemplateInfo(opts.template).name;
  const blank = emptySheet({ id, tabId, title, layout: emptyLayout(rand), now });
  const wb = new Workbook({ sheets: [blank], locale: 'en-GB' });
  const made = designWrite(
    wb,
    id,
    design,
    { look: TEMPLATE_LOOK, freezeHeader: true, size: 'default', dark },
    rand,
  );
  if (!made) return null;
  const next = applySheetWrite(blank, made.write, { now, by: NOBODY }).sheet;
  wb.updateSheet(next);
  const json = sheetToJson(next);
  return {
    sheet: { id, tabId, title, layout: json.layout, cells: json.cells },
    charts: made.charts.map((ch) => ({
      ...ch,
      table: sheetChartTable(
        wb,
        { sheetId: id, range: ch.range, ...(ch.cols ? { cols: ch.cols } : {}) },
        'en-GB',
      ) ?? { categories: [], series: [] },
    })),
  };
}

// A Plan template's sheet and the charts that sit over it.
export function templateSheetWithCharts(opts: {
  id: string;
  tabId: string;
  start: TemplateStartId;
  now: number;
  dark: boolean;
  rand?: Rand;
}): ReturnType<typeof sheetFromTemplate> {
  const { start, ...rest } = opts;
  if (start === BLANK_SHEET_START) {
    // An empty grid, ready to type into: no setup to await, no charts.
    const { id, tabId, now, rand = Math.random } = rest;
    const json = sheetToJson(
      emptySheet({ id, tabId, title: BLANK_SHEET_TITLE, layout: emptyLayout(rand), now }),
    );
    return {
      sheet: { id, tabId, title: json.title, layout: json.layout, cells: json.cells },
      charts: [],
    };
  }
  return sheetFromTemplate({ ...rest, template: TEMPLATE_START_SHEETS[start] });
}
