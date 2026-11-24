// Where the sheet bar's changes land among a spreadsheet's tabs (docs/specs/029-sheets/spreadsheet.md "Sheets in the
// sheet bar"): a new tab's place, where an undone delete goes back, the tabs shown past the hidden ones, where Move
// Right and Move Left go, the sheet opened when the open one is deleted or hidden, and a duplicate's name. Pure.
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

/** The tabs the bar shows: every tab not hidden, and the open one whatever it is (D179). */
export function shownTabs<T extends Tabbed>(
  tabs: readonly T[],
  hidden: ReadonlySet<string>,
  openId: string,
): readonly T[] {
  return hidden.size ? tabs.filter((t) => !hidden.has(t.id) || t.id === openId) : tabs;
}

/**
 * Where Move Right or Move Left puts a tab, stepping over the hidden ones (D181): after the next shown tab, or after
 * the tab just before the previous shown one (null: first); null when it cannot pass that end.
 */
export function moveByAfter(
  tabs: readonly Tabbed[],
  hidden: ReadonlySet<string>,
  tabId: string,
  step: -1 | 1,
): { after: string | null } | null {
  const shown = tabs.filter((t) => !hidden.has(t.id) || t.id === tabId);
  const at = shown.findIndex((t) => t.id === tabId);
  const target = at < 0 ? undefined : shown[at + step];
  if (!target) return null;
  if (step === 1) return { after: target.id };
  const before = tabs.findIndex((t) => t.id === target.id) - 1;
  return { after: tabs[before]?.id ?? null };
}

/** The tab opened when `tabId` leaves the bar, deleted or hidden: the shown one after it, else before (D173, D179). */
export function openInstead(
  tabs: readonly Tabbed[],
  hidden: ReadonlySet<string>,
  tabId: string,
): string | null {
  const at = tabs.findIndex((t) => t.id === tabId);
  if (at < 0) return null;
  const shown = (t: Tabbed) => t.id !== tabId && !hidden.has(t.id);
  return (tabs.slice(at + 1).find(shown) ?? tabs.slice(0, at).findLast(shown))?.id ?? null;
}

/** A duplicate's name: "Copy of <name>", then "Copy of <name> 2" and up when taken (D171). */
export function duplicateName(name: string, taken: readonly string[]): string {
  return SheetName.fit(`Copy of ${name}`, taken);
}
