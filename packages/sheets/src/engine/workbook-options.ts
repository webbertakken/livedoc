// A workbook's options (engine/workbook.ts) and the wall clock its NOW and TODAY read (formulas.md "Locale").
import type { CardSource } from '../cards';
import { localMs, serialFromMs, zonedMs } from '../dates';
import type { FormulaMeaning } from '../formula/meaning';
import type { ImportAccess } from '../imports/import-request';
import type { SheetLimits } from '../sheet-limits';
import type { Sheet } from '../sheet';
import type { Iteration } from './loops';
import type { NamedFunction } from '../named-functions';

export type WorkbookOptions = {
  sheets: readonly Sheet[];
  locale: string;
  // Whose answer a formula Google and a file's standard answer differently gives (formulas.md, the file's meaning):
  // a spreadsheet opened from a file, its format's; by default Google's.
  meaning?: FormulaMeaning;
  // A spreadsheet's time zone (formulas.md "Locale"): the wall clock NOW and TODAY read; absent, the viewer's.
  timeZone?: string;
  // Today and now, as a serial; absent, from the time zone's wall clock.
  now?: () => number;
  rand?: () => number;
  cards?: CardSource | null;
  // The limits its sheets are held to: a spreadsheet's, or (by default) a Plan Sheet's (sheet-limits.ts).
  limits?: SheetLimits;
  // How ranges in single-value places read: a spreadsheet's as Google's (intersected), a Plan Sheet's whole
  // (formulas.md "Arrays and spills"). By default, as its limits say what holds it.
  arrays?: ArrayDialect;
  // Iterative calculation (settings.md "Calculation"); off by default.
  iteration?: Iteration;
  // A spreadsheet's named functions (formulas.md "Named functions"); absent, none.
  functions?: readonly NamedFunction[];
  // Note each formula value forgotten, for takeForgotten (the Worker's engine, sending what changed).
  trackForgotten?: boolean;
  // An editor's engine fetches imports (imports.md), access allowed or not; absent, imports read their refusal.
  imports?: { access: ImportAccess; web?: false };
};

/** `google`: implicit intersection outside an array context; `dynamic`: every formula an array context (Plan Sheets). */
export type ArrayDialect = 'google' | 'dynamic';

/** Today and now as a serial: in the time zone given, else the viewer's. */
export function workbookClock(timeZone: string | undefined): () => number {
  if (timeZone) return () => serialFromMs(zonedMs(Date.now(), timeZone));
  return () => serialFromMs(localMs(Date.now()));
}
