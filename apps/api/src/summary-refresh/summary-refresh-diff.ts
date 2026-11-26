// What the content summaries' refresh would change (docs/specs/006-document/document-storage.md "Refreshing the
// summaries", What changed): which of a summary's fields differ between D1's and the room's, by name, `hasContent`
// before and after, and the numeric differences. Never a tab's id, a name or any text, so the flags table stays free of
// content. Pure.
import type { ContentSummary } from '../db/content-summary';

/** Every name a difference is recorded under, in the order it is listed. */
export const SUMMARY_FIELDS = [
  'missing',
  'unparseable',
  'v',
  'tabs',
  'firstTabCount',
  'tabCounts',
  'stats',
  'stats.mode',
  'stats.elements',
  'stats.comments',
  'stats.bytes',
  'hasContent',
  'spreadsheet',
  'textDocument',
  'order',
  'other',
] as const;
export type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** The numeric differences, fresh minus stored; `tabCounts` is how many tabs' counts differ, added or gone. */
export type SummaryDeltas = {
  tabs?: number;
  firstTabCount?: number;
  tabCounts?: number;
  elements?: number;
  comments?: number;
  bytes?: number;
};

export type SummaryDiff = {
  fields: SummaryField[];
  /** Null where D1 holds no summary or one that is not JSON. */
  hasContentBefore: boolean | null;
  hasContentAfter: boolean;
  deltas: SummaryDeltas;
};

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

function parsed(stored: string | null): Partial<ContentSummary> | 'missing' | 'unparseable' {
  if (stored === null) return 'missing';
  try {
    const value: unknown = JSON.parse(stored);
    return value && typeof value === 'object' ? value : 'unparseable';
  } catch {
    return 'unparseable';
  }
}

/** How many tabs' counts differ: changed, added or gone. */
function tabCountsDiffering(before: unknown, after: Record<string, number>): number {
  const was = before && typeof before === 'object' ? (before as Record<string, unknown>) : {};
  const ids = new Set([...Object.keys(was), ...Object.keys(after)]);
  return [...ids].filter((id) => was[id] !== after[id]).length;
}

// Deep equality of two JSON values, key order aside.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

export function summaryDiffOf(stored: string | null, fresh: ContentSummary): SummaryDiff {
  const was = parsed(stored);
  if (typeof was === 'string')
    return { fields: [was], hasContentBefore: null, hasContentAfter: fresh.hasContent, deltas: {} };
  const fields: SummaryField[] = [];
  const deltas: SummaryDeltas = {};
  const number = (field: SummaryField, key: keyof SummaryDeltas, a: unknown, b: unknown) => {
    if (a === b) return;
    fields.push(field);
    const from = asNumber(a);
    const to = asNumber(b);
    if (from !== null && to !== null) deltas[key] = to - from;
  };
  if (was.v !== fresh.v) fields.push('v');
  number('tabs', 'tabs', was.tabs, fresh.tabs);
  number('firstTabCount', 'firstTabCount', was.firstTabCount, fresh.firstTabCount);
  const differing = tabCountsDiffering(was.tabCounts, fresh.tabCounts);
  if (differing > 0) {
    fields.push('tabCounts');
    deltas.tabCounts = differing;
  }
  const before = was.stats ?? null;
  const after = fresh.stats;
  if ((before === null) !== (after === null)) fields.push('stats');
  else if (before && after) {
    if (before.mode !== after.mode) fields.push('stats.mode');
    number('stats.elements', 'elements', before.elements, after.elements);
    number('stats.comments', 'comments', before.comments, after.comments);
    number('stats.bytes', 'bytes', before.bytes, after.bytes);
  }
  const hasContentBefore = typeof was.hasContent === 'boolean' ? was.hasContent : null;
  if (hasContentBefore !== fresh.hasContent) fields.push('hasContent');
  if ((was.spreadsheet === true) !== (fresh.spreadsheet === true)) fields.push('spreadsheet');
  if ((was.textDocument === true) !== (fresh.textDocument === true)) fields.push('textDocument');
  // Every value named above the same, yet the text differs: only the keys' order, or a key none of them is.
  if (fields.length === 0 && stored !== JSON.stringify(fresh))
    fields.push(sameJson(was, fresh) ? 'order' : 'other');
  return { fields, hasContentBefore, hasContentAfter: fresh.hasContent, deltas };
}

/** The refresh would offer a document holding content to the empty clean-up: never written. */
export const losesContent = (diff: SummaryDiff): boolean =>
  diff.hasContentBefore === true && !diff.hasContentAfter;
