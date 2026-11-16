import { useEffect, useRef } from 'react';
import { showStart, startKey, startShown } from './start-shown';
import type { TemplateStartMode } from './start-template-items';

// A start open when the tab's mode changes (its own switch, the one beside the menu button, Shift+D, the Workshop
// control) opens the next mode's start too: the person is still choosing (docs/specs/007-editor/start-diagramming.md
// "When it shows"). Only on the same tab, from one empty-tab start straight to another; `mode` is null while the tab
// shows no start (content on it, read-only, Plan).
export function useStartFollowsMode(tabId: string, mode: TemplateStartMode | null): void {
  const last = useRef({ tabId, mode });
  useEffect(() => {
    const prev = last.current;
    last.current = { tabId, mode };
    if (prev.tabId !== tabId || !prev.mode || !mode || prev.mode === mode) return;
    if (startShown(startKey(tabId, prev.mode))) showStart(startKey(tabId, mode));
  }, [tabId, mode]);
}
