// What a tab added from the tab bar starts with: the theme, canvas
// styling and type of the tab it was added from, so a user mid-diagram who hits "+ tab" keeps
// their visual context. Each tab keeps its own styling once created. Never an editor mode: the mode
// is newTabOpening's, until a template chosen for it says otherwise (docs/specs/007-editor/editor-modes.md
// "Where the mode lives").
import {
  editorModeSwitchable,
  opensInOf,
  type SwitchableEditorMode,
  type Tab,
} from '@livedoc/document';
import type { PlanTabChoice } from './plan-start-landing';

// What the add menu adds (docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab"): a Tab, a Plan tab of a
// kind, or a text document tab (docs/specs/006-document/kinds-outside-the-canvas.md "The tab strip").
export type AddTabChoice = 'tab' | PlanTabChoice | 'text-document';

export function newTabSeed(source: Tab | undefined): Partial<Tab> {
  if (!source) return {};
  return {
    theme: source.theme,
    backgroundPattern: source.backgroundPattern,
    backgroundColor: source.backgroundColor,
    backgroundOpacity: source.backgroundOpacity,
    patternColor: source.patternColor,
    font: source.font,
    // Small (docs/specs/004-interface-design/fonts.md) when the source has no explicit size.
    defaultTextSize: source.defaultTextSize ?? 'sm',
  };
}

// How a new tab opens for its maker (docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab"). A **Tab**
// opens in the mode of `source`, the tab its maker was on, for everyone: a Pages tab's + makes a Pages tab, a Sketch
// tab's a Sketch tab; from Structured, an event-storming board or a Plan tab it opens in Structured, left unwritten
// (an absent `opensIn` reads as Structured). A **Board**, **Sheet** or **Dashboard** opens a Plan start (Start
// Planning), whose landing the caller sets (plan-start-landing.ts).
export function newTabOpening(source: Tab | undefined, choice: AddTabChoice): Pick<Tab, 'opensIn'> {
  if (choice === 'text-document') return {};
  if (choice !== 'tab') return { opensIn: 'plan' };
  const mode = newTabMode(source);
  return mode === 'diagram' ? {} : { opensIn: mode };
}

/** The mode a Tab added from `source` opens in: its own when it may be switched, else Structured. */
export function newTabMode(
  source: Pick<Tab, 'kind' | 'opensIn' | 'layers'> | undefined,
): SwitchableEditorMode {
  if (!source || !editorModeSwitchable(source)) return 'diagram';
  const mode = opensInOf(source);
  return mode === 'draw' || mode === 'pages' ? mode : 'diagram';
}
