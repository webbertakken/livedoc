// Where the sheet bar's changes land among a spreadsheet's tabs (docs/specs/029-sheets/spreadsheet.md "Sheets in the
// sheet bar"): a new tab's place, where an undone delete goes back, the sheet opened when the open one is
// deleted, and a duplicate's name. Pure.
import { SheetName } from '@livedoc/sheets';

type Tabbed = { id: string };

/** `tabs` with `tab` after the tab `after` (first when null, last when `after` is not among them). */
export function tabsWithInserted<T extends Tabbed>(
  tabs: readonly T[],
  tab: T,
  after: string | null,
): T[] {
  const without = tabs.filter((t) => t.id !== tab.id);
  if (after === null) return [tab, ...without];
  const at = without.findIndex((t) => t.id === after);
  return at < 0 ? [...without, tab] : [...without.slice(0, at + 1), tab, ...without.slice(at + 1)];
}

/** The tabs before `tabId`, nearest last: where an undone delete goes back (none for one not among them). */
export function tabsBefore(tabs: readonly Tabbed[], tabId: string): string[] {
  const at = tabs.findIndex((t) => t.id === tabId);
  return at > 0 ? tabs.slice(0, at).map((t) => t.id) : [];
}

/** The tab to go back after: the nearest of `earlier` still among `tabs`, null (first) when none is. */
export function landingAfter(tabs: readonly Tabbed[], earlier: readonly string[]): string | null {
  const here = new Set(tabs.map((t) => t.id));
  for (let i = earlier.length - 1; i >= 0; i--) if (here.has(earlier[i]!)) return earlier[i]!;
  return null;
}

/** The tab opened when `tabId` is deleted: the one after it, else the one before (D173). */
export function openAfterDelete(tabs: readonly Tabbed[], tabId: string): string | null {
  const at = tabs.findIndex((t) => t.id === tabId);
  if (at < 0) return null;
  return (tabs[at + 1] ?? tabs[at - 1])?.id ?? null;
}

/** A duplicate's name: "Copy of <name>", then "Copy of <name> 2" and up when taken (D171). */
export function duplicateName(name: string, taken: readonly string[]): string {
  return SheetName.fit(`Copy of ${name}`, taken);
}
