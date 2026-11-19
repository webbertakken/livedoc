// Editor modes (docs/specs/007-editor/editor-modes.md): how a general tab is worked on, Diagram,
// Draw, Workshop, Pages or Plan. A mode tunes tools and rules; it never decides what the tab is (that is its kind). The
// mode is the tab's, the same for everyone on it (`Tab.opensIn`, Diagram when absent).
import type { Layer } from './layers';
import { isEventStormingTab } from './event-storming';
import { isPlanTabKind } from './tab-kind';

// Every editor mode, in the order the interface lists them. The one place a mode is declared: a further mode is one
// entry here. The interface names `draw` Sketch and `diagram` Structured; the stored values keep their names.
export const EDITOR_MODE_CATALOGUE = [
  { id: 'draw', label: 'Sketch' },
  { id: 'diagram', label: 'Structured' },
  { id: 'pages', label: 'Pages' },
  // How a Plan tab is worked (docs/specs/026-plan/plan-mode.md): never switched to, never in the mode menu.
  { id: 'plan', label: 'Plan' },
] as const satisfies readonly { id: string; label: string }[];

export type EditorMode = (typeof EDITOR_MODE_CATALOGUE)[number]['id'];

export const EDITOR_MODES: readonly EditorMode[] = EDITOR_MODE_CATALOGUE.map((m) => m.id);

// The modes the mode switch offers, in its order (docs/specs/007-editor/editor-modes.md "The mode switch"): Sketch,
// Structured, Pages.
export const SWITCHABLE_EDITOR_MODES = [
  'draw',
  'diagram',
  'pages',
] as const satisfies readonly EditorMode[];
export type SwitchableEditorMode = (typeof SWITCHABLE_EDITOR_MODES)[number];

/** "Sketch": the mode's name as the interface shows it. */
export function editorModeLabel(mode: EditorMode): string {
  return EDITOR_MODE_CATALOGUE.find((m) => m.id === mode)!.label;
}

export const DEFAULT_EDITOR_MODE: EditorMode = 'diagram';

/** The switchable mode `step` places from `mode` (Shift+D: Sketch, Structured, Pages and round again), wrapping
 *  at either end. A mode that is not switchable steps as if just before the first. */
export function nextEditorMode(mode: EditorMode, step: 1 | -1 = 1): SwitchableEditorMode {
  const modes: readonly EditorMode[] = SWITCHABLE_EDITOR_MODES;
  const count = modes.length;
  const at = modes.indexOf(mode);
  const from = at < 0 ? (step === 1 ? -1 : count) : at;
  return SWITCHABLE_EDITOR_MODES[(from + step + count) % count]!;
}

export function isEditorMode(v: unknown): v is EditorMode {
  return EDITOR_MODES.includes(v as EditorMode);
}

// Pages mode was called Illustrate mode, and Infographic mode before that; each was stored under its old id wherever a
// mode is kept (a tab's opensIn, a remembered mode, a `/new?mode=` link). Workshop mode (Facilitate before it) is no
// longer a mode: it reads as Structured, with the Workshop control on (workshopOf).
const LEGACY_EDITOR_MODES: Readonly<Record<string, EditorMode>> = {
  illustrate: 'pages',
  infographic: 'pages',
  workshop: 'diagram',
  facilitate: 'diagram',
};

/** A stored `opensIn` from when Workshop was a mode (`'workshop'`, or `'facilitate'` before it). */
export function isLegacyWorkshopOpensIn(v: unknown): boolean {
  return v === 'workshop' || v === 'facilitate';
}

/** A stored mode as today's id: a current id as it is, a legacy one renamed, anything else
 *  undefined. Read every stored mode through this. */
export function parseEditorMode(v: unknown): EditorMode | undefined {
  if (isEditorMode(v)) return v;
  return typeof v === 'string' ? LEGACY_EDITOR_MODES[v] : undefined;
}

type ModeTab = { kind?: string; opensIn?: string; workshop?: unknown; layers?: Layer[] };

// Whether anything may write the tab's mode: never on an event-storming board, which keeps its own tools and notation
// (always Structured), nor on a Board, Sheet, Dashboard or Form tab, always in Plan (docs/specs/026-plan/plan-tabs.md),
// whatever a forged or stale `opensIn` says. A template chosen on the Plan start may still write it. Nor on a text
// document, which has no editor mode at all (docs/specs/034-text-documents/text-document.md "What it holds").
export function tabModeWritable(tab: ModeTab | undefined): boolean {
  return !isEventStormingTab(tab) && !isPlanTabKind(tab?.kind) && tab?.kind !== 'text-document';
}

// Whether the tab offers the mode switch (docs/specs/007-editor/editor-modes.md "The mode switch"): a tab whose mode
// may be written and that is not a Plan tab (Plan is never switched into or out of).
export function editorModeSwitchable(tab: ModeTab | undefined): boolean {
  return tabModeWritable(tab) && opensInOf(tab) !== 'plan';
}

/** The tab's editor mode, the same for everyone on it (docs/specs/007-editor/editor-modes.md "Where
 *  the mode lives"): its stored mode, Diagram when absent or unreadable, always Diagram on an
 *  event-storming board. */
export function opensInOf(tab: ModeTab | undefined): EditorMode {
  if (isPlanTabKind(tab?.kind)) return 'plan';
  if (isEventStormingTab(tab)) return DEFAULT_EDITOR_MODE;
  return parseEditorMode(tab?.opensIn) ?? DEFAULT_EDITOR_MODE;
}

// The tab's mode set (docs/specs/007-editor/editor-modes.md "Where the mode lives"): the mode only.
// The same tab when nothing changes; an event-storming board is always Diagram and is never given
// a mode. A switch also brings what the mode brings: withEditorModeSwitched (editor-mode-switch.ts).
export function setTabOpensIn<T extends ModeTab & { id: string }>(tab: T, mode: EditorMode): T {
  const legacyWorkshop = isLegacyWorkshopOpensIn(tab.opensIn);
  if (!tabModeWritable(tab) || (opensInOf(tab) === mode && !legacyWorkshop)) return tab;
  // A tab stored in Workshop mode is written as it now is: the mode, and the Workshop control on.
  return { ...tab, opensIn: mode, ...(legacyWorkshop ? { workshop: true } : {}) };
}

/** Whether the Workshop control is on for the tab (docs/specs/012-collaboration/workshop-mode.md), the same for
 *  everyone on it: `workshop: true`, or a tab stored in Workshop mode. Never on an event-storming board, which brings
 *  the session kit itself, nor on a Plan tab, whose tools are its own. */
export function workshopOf(tab: ModeTab | undefined): boolean {
  if (!tab || !editorModeSwitchable(tab)) return false;
  return tab.workshop === true || isLegacyWorkshopOpensIn(tab.opensIn);
}

/** The tab with the Workshop control turned `on` or off: `workshop: true`, or no key. A tab stored in Workshop mode is
 *  written as Structured (its `opensIn` dropped). The same tab when nothing changes, and on a tab that offers no
 *  control (an event-storming board, a Plan tab). One tab edit, like a mode switch. */
export function setTabWorkshop<T extends ModeTab & { id: string }>(tab: T, on: boolean): T {
  if (!editorModeSwitchable(tab) || workshopOf(tab) === on) return tab;
  const next: T = { ...tab };
  if (isLegacyWorkshopOpensIn(next.opensIn)) delete next.opensIn;
  if (on) next.workshop = true;
  else delete next.workshop;
  return next;
}

// The one gate the look reads, keyed on the viewer's effective editor mode: in Draw mode the
// canvas pattern is the person's own (resolveViewBackdrop); everything else looks the same in both.
export function hasBoardLook(mode: EditorMode): boolean {
  return mode === 'draw';
}

// Pages mode draws the canvas as pages on a surround (docs/specs/007-editor/editor-modes.md
// "The pages"); a view of the tab, like the board look, never stored.
export function hasPageLook(mode: EditorMode): boolean {
  return mode === 'pages';
}

// Plan mode works Plan boards as a planning tool (docs/specs/026-plan/plan-mode.md): pressing a card
// picks the card up, not the board. A rule about input, so it follows the person's mode.
export function hasPlanInput(mode: EditorMode): boolean {
  return mode === 'plan';
}
