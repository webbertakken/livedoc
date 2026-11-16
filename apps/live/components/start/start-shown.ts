// Which tabs' template starts are shown (docs/specs/007-editor/start-diagramming.md "When it shows"): a start is
// shown only when asked for, by the palette tray's Show Templates or the New Document wizard's mode choice, so an
// empty tab opens on its empty canvas. Kept per tab and mode, for this person in this browser.
import { isBlankTemplate, templateOpening, type TemplateKind } from '@livedoc/templates';
import { createRememberedKeys } from '@/components/canvas/remembered-keys';
import type { TemplateStartMode } from './start-template-items';

export const START_SHOWN_KEY = 'livedoc:v1:start-shown';
const START_SHOWN_MAX = 200;

const shown = createRememberedKeys(START_SHOWN_KEY, START_SHOWN_MAX);

/** The key a tab's start is shown under: per tab and mode, so each mode's start opens and closes on its own. */
export const startKey = (tabId: string, mode: TemplateStartMode): string => `${tabId}:${mode}`;

export const startShown = shown.has;
export const showStart = shown.add;
export const hideStart = shown.remove;
export const subscribeStartShown = shown.subscribe;

/**
 * The wizard's mode choice asked for templates next, so the blank it makes opens on its start. Plan has no start to
 * open (Start Planning always shows); a template is not empty. True when a start was opened.
 */
export function openStartForModeChoice(tabId: string, kind: TemplateKind | null): boolean {
  if (!kind || !isBlankTemplate(kind)) return false;
  const mode = templateOpening(kind);
  if (mode === 'plan') return false;
  showStart(startKey(tabId, mode));
  return true;
}
