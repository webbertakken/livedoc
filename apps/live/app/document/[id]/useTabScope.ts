import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { drawingOfTabs, isTabOutOfScope } from '@/lib/tab-scope';

// The tab this editor session is confined to when it was opened through a
// tab-scoped share link (docs/specs/013-workspace/tab-scoped-share-links.md); null for everyone else. Set
// once by the share-code bootstrap. The ref mirrors the state so the active-tab
// guard (editor-ui-state) sees the scope in the same tick it is set, before a
// re-render. The scope's drawing tabs are in it too ("Drawing tabs"), read from `tabs` on a signature of the drawing
// tabs alone, so an element edit keeps `isOutOfScope` as it was.
export function useTabScope(tabs: readonly { id: string; drawingOf?: string }[]) {
  const tabScopeRef = useRef<string | null>(null);
  const [sessionTabScope, setScopeState] = useState<string | null>(null);
  const setSessionTabScope = useCallback((scope: string | null) => {
    tabScopeRef.current = scope;
    setScopeState(scope);
  }, []);
  const drawingSig = tabs
    .flatMap((t) => (t.drawingOf ? [`${t.id}\u0000${t.drawingOf}`] : []))
    .join('\u0001');
  const drawingOf = useMemo(
    () =>
      drawingOfTabs(
        drawingSig === ''
          ? []
          : drawingSig.split('\u0001').map((entry) => {
              const [id = '', of = ''] = entry.split('\u0000');
              return { id, drawingOf: of };
            }),
      ),
    [drawingSig],
  );
  const drawingOfRef = useRef(drawingOf);
  useLayoutEffect(() => {
    drawingOfRef.current = drawingOf;
  }, [drawingOf]);
  const isOutOfScope = useCallback(
    (tabId: string) => isTabOutOfScope(tabId, sessionTabScope, drawingOf),
    [sessionTabScope, drawingOf],
  );
  return { sessionTabScope, setSessionTabScope, tabScopeRef, drawingOfRef, isOutOfScope };
}
