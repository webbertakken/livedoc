// The tab's editor mode in the editor (docs/specs/007-editor/editor-modes.md "Where the mode
// lives").
//
// Contract:
// - `useEditorMode(tab, { canEdit, commitTabs, toastInfo })` returns `{ mode, setMode, canSwitch,
//   canEdit }` for the active tab. `canEdit` comes from the editor's one answer (useViewPreview)
//   and is handed back, so the switch reads the very value the editor resolved with.
// - `mode` is the tab's own mode (resolveEditorMode), the same for everyone on it.
// - `canSwitch` is true only for an editor on a general, unlocked tab; the mode switch shows only
//   then.
// - `workshop` is the tab's Workshop control (workshopOf), and `setWorkshop(on)` turns it as one tab edit, fired as
//   `Editor · Toggled · WorkshopOn | WorkshopOff` first, under the same gate as a switch
//   (docs/specs/012-collaboration/workshop-mode.md).
// - `setMode(next, alsoChange?)` fires `Editor · Changed · Mode<Next>` and then commits ONE tab edit:
//   `alsoChange` (what leaving a mode brings, such as articles turned into pages), then the mode
//   with what entering it brings (withEditorModeSwitched). One undo puts the tab back in the mode
//   it was in, for everyone. A no-op when the switch is not offered or `next` is already the mode.
import { useCallback, useMemo } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';
import {
  editorModeLabel,
  setTabWorkshop,
  withEditorModeSwitched,
  workshopOf,
  type EditorMode,
  type SwitchableEditorMode,
  type Tab,
} from '@livedoc/document';
import { resolveEditorMode } from '@/lib/editor-mode-store';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

export type EditorModeState = {
  mode: EditorMode;
  setMode: (next: EditorMode, alsoChange?: (tab: Tab) => Tab) => void;
  canSwitch: boolean;
  canEdit: boolean;
  // The Workshop control (docs/specs/012-collaboration/workshop-mode.md): on or off for the tab, turned by an Editor
  // wherever the switch is offered.
  workshop: boolean;
  setWorkshop: (on: boolean) => void;
};

// The telemetry type a switch into each mode fires (the stored tokens keep the modes' stored names).
const MODE_EVENT: Record<SwitchableEditorMode, string> = {
  draw: 'ModeDraw',
  diagram: 'ModeDiagram',
  pages: 'ModePages',
};

/** Reports a switch into `next`, before it applies (docs/specs/007-editor/editor-modes.md
 *  "Telemetry"): the switch, Shift+D and the tab menu's Mode all send it. */
export function trackModeSwitch(next: SwitchableEditorMode): void {
  track('Editor', 'Changed', MODE_EVENT[next]);
}

/** The tab switched as one edit: `alsoChange` first, then the mode and what it brings. Whether
 *  entering Pages put the board onto a page comes back with it. */
export function switchedTab(
  tab: Tab,
  next: EditorMode,
  alsoChange?: (tab: Tab) => Tab,
): { tab: Tab; pagedContent: boolean } {
  return withEditorModeSwitched(alsoChange ? alsoChange(tab) : tab, next);
}

export function useEditorMode(
  tab: Tab | undefined,
  deps: {
    canEdit: boolean;
    commitTabs: (map: (ts: Tab[]) => Tab[]) => void;
    toastInfo: (message: string) => void;
  },
): EditorModeState {
  const { canEdit, commitTabs, toastInfo } = deps;
  const tabId = tab?.id;
  const { mode, canSwitch } = resolveEditorMode({ tab, canEdit });
  const workshop = workshopOf(tab);
  // The tab and the editor's handlers as they are now, read when a switch is asked for: the setters keep their
  // identity, so the mode's context around the canvas holds still while the editor re-renders
  // (docs/specs/008-canvas/canvas-performance.md "The contexts around the element layer hold still").
  const latest = useLatest({ tab, tabId, mode, canSwitch, workshop, commitTabs, toastInfo });
  const setMode = useCallback(
    (next: EditorMode, alsoChange?: (tab: Tab) => Tab) => {
      const { tab: seen, tabId, mode, canSwitch, commitTabs, toastInfo } = latest.current;
      // Never into Plan: a Plan tab is added from +, never switched to (docs/specs/007-editor/editor-modes.md).
      if (!canSwitch || !tabId || next === mode || next === 'plan') return;
      trackModeSwitch(next);
      // Whether the board goes onto a page is read from the tab as it is, not from inside the commit's updater,
      // which React may run after this returns (the toast and its event would be lost). The switch worked out
      // here is the one committed, unless the tab moved on meanwhile: a board's transform, layout and fit once.
      const out = seen ? switchedTab(seen, next, alsoChange) : null;
      const paged = !!out?.pagedContent;
      commitTabs((ts) =>
        ts.map((t) =>
          t.id !== tabId ? t : t === seen && out ? out.tab : switchedTab(t, next, alsoChange).tab,
        ),
      );
      if (paged) {
        toastInfo(`Put onto a page that fits it. Undo switches back to ${editorModeLabel(mode)}.`);
        track('Tab', 'Changed', 'PageFitToContent');
      }
      debugLog('[editor-mode] switched', { tabId, from: mode, to: next, paged });
    },
    [latest],
  );
  const setWorkshop = useCallback(
    (on: boolean) => {
      const { tabId, canSwitch, workshop, commitTabs } = latest.current;
      if (!canSwitch || !tabId || on === workshop) return;
      track('Editor', 'Toggled', on ? 'WorkshopOn' : 'WorkshopOff');
      commitTabs((ts) => ts.map((t) => (t.id === tabId ? setTabWorkshop(t, on) : t)));
      debugLog('[workshop] control turned', { tabId, on });
    },
    [latest],
  );
  return useMemo(
    () => ({ mode, setMode, canSwitch, canEdit, workshop, setWorkshop }),
    [mode, setMode, canSwitch, canEdit, workshop, setWorkshop],
  );
}
