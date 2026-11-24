// The document at a glance (docs/specs/024-agents/document-views.md, VW37): one
// line per tab, built from each tab's header facts so the caller never holds every tab body at once.
import type { OverviewView, ViewDoor } from '@livedoc/api-schema';
import { computeRefs } from '@livedoc/document';
import { fitLines, fitOf, type ViewLine, type ViewResult } from './budget';
import { headerSegments, type HeaderFacts } from './header';
import { jsonString, plural } from './text';

type OverviewDocument = { id: string; name: string; savedAt: number };
// A tab outside a tab-scoped visitor's scope is named by its id alone; its body is never read. `drawingOf` names a
// drawing tab's text document tab, which it is listed under (E29).
export type OverviewTabInput =
  | { id: string; outOfScope: true }
  | { id: string; outOfScope: false; facts: HeaderFacts; drawingOf?: string };
type OverviewOptions = { now: number; budget?: number; door?: ViewDoor };

const TAB = { one: 'tab', many: 'tabs' };
const DRAWING = { one: 'drawing', many: 'drawings' };

const drawingOf = (tab: OverviewTabInput): string | undefined =>
  tab.outOfScope ? undefined : tab.drawingOf;

// Listed tabs in order, each followed by its drawing tabs in order; a drawing whose text document is not listed is left
// out.
function inListOrder(tabs: readonly OverviewTabInput[]): OverviewTabInput[] {
  const listed = tabs.filter((t) => drawingOf(t) === undefined);
  return listed.flatMap((t) => [t, ...tabs.filter((d) => drawingOf(d) === t.id)]);
}
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const AGE_DAYS_MAX = 30;

// `just now`, `5m ago`, `3h ago`, `12d ago`, else the UTC date.
export function editedAge(savedAt: number, now: number): string {
  const age = now - savedAt;
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  if (age < AGE_DAYS_MAX * DAY) return `${Math.floor(age / DAY)}d ago`;
  return new Date(savedAt).toISOString().slice(0, 10);
}

export function overviewView(
  document: OverviewDocument,
  tabs: readonly OverviewTabInput[],
  options: OverviewOptions,
): ViewResult<OverviewView> {
  const refs = computeRefs(tabs.map((t) => t.id));
  const ordered = inListOrder(tabs);
  const drawings = ordered.filter((t) => drawingOf(t) !== undefined).length;
  const listedCount = ordered.length - drawings;
  const entries = ordered.map((tab) => {
    const ref = refs.refOf(tab.id);
    if (tab.outOfScope) {
      return {
        line: { text: `  tab ${ref} (out of scope)`, noun: TAB },
        json: { outOfScope: true as const, ref },
      };
    }
    const facts: HeaderFacts = { ...tab.facts, tab: { ...tab.facts.tab, ref } };
    const of = tab.drawingOf;
    const line: ViewLine = of
      ? {
          text: `    drawing ${ref} ${jsonString(facts.tab.name)} · ${headerSegments(facts)}`,
          noun: DRAWING,
        }
      : {
          text: `  tab ${ref} ${jsonString(facts.tab.name)} · ${headerSegments(facts)}`,
          noun: TAB,
        };
    return {
      line,
      json: {
        ...facts,
        view: 'overview' as const,
        outOfScope: false as const,
        ...(of ? { drawingOf: refs.refOf(of) } : {}),
      },
    };
  });
  const drawingCount = drawings > 0 ? ` · ${plural(drawings, 'drawing', 'drawings')}` : '';
  const header = `doc ${document.id} ${jsonString(document.name)} · ${plural(listedCount, 'tab', 'tabs')}${drawingCount} · edited ${editedAge(document.savedAt, options.now)}`;
  const fitted = fitLines({
    header,
    lines: entries.map((e) => e.line),
    budget: options.budget,
    door: options.door ?? 'cli',
  });
  return {
    text: fitted.text,
    fit: fitOf(fitted),
    json: {
      // Named fields only: a caller may pass a richer document record than this view prints.
      document: {
        id: document.id,
        name: document.name,
        savedAt: document.savedAt,
        tabs: listedCount,
        ...(drawings > 0 ? { drawings } : {}),
      },
      tabs: entries.slice(0, fitted.kept).map((e) => e.json),
      elision: fitted.elision,
    },
  };
}
