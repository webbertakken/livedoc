'use client';

// Full screen (docs/specs/035-pdf-documents/reading-surface.md "Full screen"): the pages column alone on the whole
// screen, one page a screen at Fit page, Rotate view kept. The browser says when full screen begins and ends, by
// whichever way (the item, its key, Escape, the browser's own), and each end brings back the display and zoom it
// found. One person's, never stored.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { FULL_SCREEN } from './pdf-menus';
import { PdfView } from './pdf-view';

// Whether the browser shows part of a page full screen: an iPhone does not. It does not change while a page is open.
const neverChanges = () => () => {};
const fullScreenEnabled = () => document.fullscreenEnabled === true;
const notOnTheServer = () => false;

const refused = (reason: unknown) => console.warn('[pdf] full-screen-refused', reason);

export function usePdfFullScreen({
  element,
  view,
  setWholeView,
}: {
  // The pages column shown full screen; null while there are no pages.
  element: HTMLElement | null;
  // The person's view now.
  view: PdfView;
  // Puts a whole view in place, the page in view kept.
  setWholeView: (next: PdfView) => void;
}) {
  const [on, setOn] = useState(false);
  const latest = useRef({ view, setWholeView });
  useLayoutEffect(() => {
    latest.current = { view, setWholeView };
  });
  // The view full screen found, brought back when it ends.
  const found = useRef<PdfView | null>(null);

  useEffect(() => {
    if (!element) return undefined;
    const onChange = () => {
      const now = latest.current;
      const shown = document.fullscreenElement === element;
      if (shown && found.current === null) {
        found.current = now.view;
        now.setWholeView(PdfView.presented(now.view));
        setOn(true);
        track('Pdf', 'Toggled', 'FullScreen');
        debugLog('[pdf] full-screen on=yes');
      } else if (!shown && found.current !== null) {
        now.setWholeView({ ...found.current, turns: now.view.turns });
        found.current = null;
        setOn(false);
        debugLog('[pdf] full-screen on=no');
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [element]);

  const toggle = useCallback(() => {
    if (!element) return;
    if (document.fullscreenElement === element) document.exitFullscreen().catch(refused);
    else element.requestFullscreen().catch(refused);
  }, [element]);

  const supported = useSyncExternalStore(neverChanges, fullScreenEnabled, notOnTheServer);
  const actions: OfficeActions = useMemo(
    () => ({
      [FULL_SCREEN]: { run: toggle, checked: on, disabled: !supported || element === null },
    }),
    [toggle, on, supported, element],
  );

  return { on, actions };
}
