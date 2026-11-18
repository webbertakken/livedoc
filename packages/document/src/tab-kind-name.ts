// What a tab is, in words (docs/specs/007-editor/editor-modes.md "A tab's kind is always findable"): the kind's name as
// the interface shows it, and the phrase a tab's glyph is named by. A general tab's glyph is its mode's, so its phrase
// names the mode too.
import { editorModeLabel, opensInOf } from './editor-mode';
import { isEventStormingTab } from './event-storming';
import type { Layer } from './layers';
import { tabKindOf, type TabKind } from './tab-kind';

const TAB_KIND_LABELS: Readonly<Record<TabKind, string>> = {
  diagram: 'Diagram',
  'event-storming': 'Event Storming',
  board: 'Board',
  sheet: 'Sheet',
  dashboard: 'Dashboard',
  form: 'Form',
};

/** "Event Storming": the kind's name as the interface shows it. */
export function tabKindLabel(kind: TabKind): string {
  return TAB_KIND_LABELS[kind];
}

type NamedTab = { kind?: string; opensIn?: string; layers?: Layer[] };

/** "Board tab": what the tab is, an event-storming board stored before tabs had a kind included. */
export function tabKindNoun(tab: NamedTab): string {
  return `${tabKindLabel(isEventStormingTab(tab) ? 'event-storming' : tabKindOf(tab))} tab`;
}

/** "Board tab", or "Diagram tab, in Sketch mode" for a general tab, whose glyph is its mode's. */
export function tabKindName(tab: NamedTab): string {
  const noun = tabKindNoun(tab);
  return tabModeShown(tab) ? `${noun}, in ${editorModeLabel(opensInOf(tab))} mode` : noun;
}

// A general tab's glyph is its mode's; every other kind shows its own.
function tabModeShown(tab: NamedTab): boolean {
  return !isEventStormingTab(tab) && tabKindOf(tab) === 'diagram';
}
