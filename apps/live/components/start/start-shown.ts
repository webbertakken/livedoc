// Which tabs' template starts are shown (docs/specs/007-editor/start-diagramming.md "When it shows"): a start is
// shown only when asked for, by the palette tray's Show Templates or the New Document wizard's mode choice, so an
// empty tab opens on its empty canvas. Kept per tab and mode, for this person in this browser. Free of the template
// catalogue, so the editor reads it without loading the catalogue.
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
