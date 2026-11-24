'use client';

import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listedTabs, surfaceOf, tabHasDrawing } from '@livedoc/document';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { useSelectTab } from '@/app/document/[id]/useSelectTab';
import { useIsMobileViewport } from '@/hooks/ui/useIsMobileViewport';
import { useSplitView } from '@/hooks/ui/useSplitView';
import { useViewportWidth } from '@/hooks/ui/useViewportWidth';
import { EditorBoxContext, WINDOW_EDITOR_BOX, type EditorBox } from '@/hooks/ui/useEditorBox';
import {
  anchorFromEditorView,
  editorViewFromAnchor,
  type CanvasAnchor,
} from '@/lib/split-pane-view';
import { EDITOR_VIEWPORT_ATTR } from '@/lib/editor-viewport';
import { setLocalBesideTab } from '@/lib/split-presence';
import { SplitDivider } from './SplitDivider';
import { SplitSeamControls } from './SplitSeamControls';
import { SplitDropZone } from './SplitDropZone';
import { SplitViewContext } from './SplitViewContext';
import type { TabSvgViewportHandle } from './TabSvgViewport';

// The other pane loads with the first split: the SVG renderer and icon catalogues it draws with
// stay out of the editor's first load.
// A surface tab's pane, likewise on demand.
const SplitSurfacePane = dynamic(
  () => import('./SplitSurfacePane').then((m) => m.SplitSurfacePane),
  { ssr: false },
);
const SplitStaticPane = dynamic(() => import('./SplitStaticPane').then((m) => m.SplitStaticPane), {
  ssr: false,
});

// Side by side tabs (docs/specs/007-editor/split-view.md): two tabs of the document on screen, each
// keeping its side. The editor's two lines (docs/specs/007-editor/toolbar-layout.md "The two lines") are its chrome, so
// they sit in the editor's pane, with the palette. The
// editor (canvas, toolbars, panels) sits in the pane of the active tab; the other pane draws its tab
// live. Clicking into the other pane, or resting the pointer there, moves the editor across, and
// neither drawing moves. With no split this is a plain full-size box and changes nothing.
//
// With a split, the editor's box becomes a containing block (`transform`) so every `fixed` piece of
// its chrome lays out inside its pane. Its menus and dialogs render to the page body, in client
// coordinates, so they land where they always do; pointer maths reads the canvas's own rect.
export function SplitViewFrame({
  children,
}: {
  // The editor's column, given whether a split is showing (chrome that stands down for one).
  children: (splitShowing: boolean) => ReactNode;
}) {
  const ctx = useEditorContext();
  const {
    tabs,
    activeId,
    documentId,
    hydrated,
    loadedTabIds,
    loadAllTabs,
    zenMode,
    embedMode,
    appChrome,
    slideDeck,
    viewport,
    canvasMainRef,
    skipTabFitRef,
    fitToScreen,
    activeTab,
    documentWorkbook,
  } = ctx;
  const selectTab = useSelectTab();
  const isMobile = useIsMobileViewport();
  const viewportWidth = useViewportWidth();
  const split = useSplitView({
    // Side by Side never pairs a drawing tab (docs/specs/034-text-documents/objects.md "Not listed").
    tabs: listedTabs(tabs),
    activeId,
    selectTab,
    documentId,
    hydrated,
    loadedTabIds,
    loadTabs: loadAllTabs,
    // Embeds and the workbench frame (no app chrome) keep one tab, like a phone.
    suspended: isMobile || zenMode || embedMode || !appChrome || slideDeck.presentingAt !== null,
  });
  const { pair, editorSide } = split;
  const staticId = pair ? (editorSide === 'left' ? pair.rightId : pair.leftId) : null;
  const staticTab = staticId ? tabs.find((t) => t.id === staticId) : undefined;
  const showing = !!staticTab;

  // The geometry: the right pane's width is the person's; the left pane takes the rest.
  const leftWidth = viewportWidth - split.rightWidth;
  const editorBox = !showing
    ? { left: 0, width: viewportWidth }
    : editorSide === 'left'
      ? { left: 0, width: leftWidth }
      : { left: leftWidth, width: split.rightWidth };
  // What the editor's `fixed` overlays count from: the pane in a split, else the window (hooks/ui/useEditorBox).
  const fixedBox = useMemo<EditorBox>(
    () => (showing ? { left: editorBox.left, top: 0, width: editorBox.width } : WINDOW_EDITOR_BOX),
    [showing, editorBox.left, editorBox.width],
  );
  const staticBox =
    editorSide === 'left'
      ? { left: leftWidth, width: split.rightWidth }
      : { left: 0, width: leftWidth };

  // The pane slides in once, when the split opens; moving the editor between panes is instant.
  const [arrived, setArrived] = useState(false);
  const [wasShowing, setWasShowing] = useState(showing);
  const [leaving, setLeaving] = useState(false);
  // Handing the view over as the editor moves, so neither drawing moves on screen.
  const staticHandle = useRef<TabSvgViewportHandle | null>(null);
  const [handoff, setHandoff] = useState<{ tabId: string; anchor: CanvasAnchor } | null>(null);
  if (wasShowing !== showing) {
    setWasShowing(showing);
    setArrived(false);
    // A pane hidden mid leave-animation (zen, a narrow window, a deleted tab) never ends it: the next split must
    // not arrive leaving. Nor may it start from the view an earlier split handed over (it opens fitted).
    if (!showing) {
      setLeaving(false);
      setHandoff(null);
    }
  }
  // The seam's Fit Both Sides, for the pane without the editor (the editor fits itself).
  const [fitNonce, setFitNonce] = useState(0);

  const focusPane = (via: 'Click' | 'Hover') => {
    if (!staticId) return;
    const main = canvasMainRef.current?.getBoundingClientRect();
    if (main) {
      // The view the editor leaves on its tab becomes that pane's view.
      setHandoff({ tabId: activeId, anchor: anchorFromEditorView(viewport.get(), main) });
      // And the pane's view becomes the editor's, measured where the canvas will be once the
      // editor's box has moved: same height and top, the other pane's span.
      const paneAnchor = staticHandle.current?.anchor();
      if (paneAnchor) {
        const next = editorViewFromAnchor(paneAnchor, {
          left: main.left - editorBox.left + staticBox.left,
          top: main.top,
          width: main.width - editorBox.width + staticBox.width,
          height: main.height,
        });
        skipTabFitRef.current = staticId;
        viewport.setView(next);
      }
    }
    split.focus(staticId, via);
  };

  // The editor keeps what it was centred on as its pane opens, closes or is resized: half the
  // change in its width is added to the pan. Only the split's own changes: a window resize keeps
  // the editor's usual behaviour, and a move to another tab hands its view over (focusPane) or lets
  // that tab's own view take over.
  const lastLayout = useRef({ width: editorBox.width, viewportWidth, activeId });
  useLayoutEffect(() => {
    const last = lastLayout.current;
    lastLayout.current = { width: editorBox.width, viewportWidth, activeId };
    if (last.width === editorBox.width || last.viewportWidth !== viewportWidth) return;
    if (last.activeId !== activeId) return;
    const dx = (editorBox.width - last.width) / 2;
    viewport.setOffset((o) => ({ x: o.x + dx, y: o.y }));
  }, [editorBox.width, viewportWidth, activeId, viewport]);

  // The chrome slides in from the side it left when the editor changes panes (split-view.css). Set
  // for the move, then cleared, so a panel opened later doesn't slide in too. Safe to lift: the
  // animated roots have no entrance animation of their own to replay, and the keyframes hold no end
  // state to snap back from.
  const [arrival, setArrival] = useState<{ side: 'left' | 'right' | null; from: string | null }>({
    side: editorSide,
    from: null,
  });
  if (arrival.side !== editorSide) {
    const moved = arrival.side !== null && editorSide !== null;
    setArrival({
      side: editorSide,
      from: moved ? (editorSide === 'right' ? 'from-left' : 'from-right') : null,
    });
  }
  useEffect(() => {
    if (!arrival.from) return;
    const timer = window.setTimeout(() => setArrival((a) => ({ ...a, from: null })), 400);
    return () => window.clearTimeout(timer);
  }, [arrival]);

  // Collaborators see us on the tab beside the one we edit (docs/specs/007-editor/split-view.md
  // "Presence"): the presence broadcast carries it.
  const besideTabId = showing ? staticId : null;
  useEffect(() => {
    setLocalBesideTab(besideTabId);
    return () => setLocalBesideTab(null);
  }, [besideTabId]);

  // Chrome that sizes itself from the window (floating panels, clamped popovers) re-reads on
  // resize; the editor's box just changed without the window doing so.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [showing, editorSide]);

  return (
    <SplitViewContext.Provider value={split}>
      <div className="relative h-dvh w-full overflow-hidden">
        <div
          // The box the editor's chrome sizes itself to (lib/editor-viewport): its pane, in a split.
          {...{ [EDITOR_VIEWPORT_ATTR]: showing ? 'pane' : 'window' }}
          data-split-arrive={arrival.from ?? undefined}
          className="absolute inset-y-0 z-[1] h-dvh"
          style={{
            left: editorBox.left,
            width: editorBox.width,
            // `clip`, so nothing of the editor's own bleeds over the other pane.
            ...(showing ? { transform: 'translateZ(0)', overflow: 'clip' } : null),
          }}
        >
          <EditorBoxContext.Provider value={fixedBox}>
            {children(showing)}
          </EditorBoxContext.Provider>
        </div>
        {staticTab ? (
          <div
            className={`absolute z-0 ${
              leaving ? 'split-pane-leave' : arrived ? '' : 'split-pane-enter'
            }`}
            style={{
              top: 0,
              bottom: 0,
              left: staticBox.left,
              width: staticBox.width,
            }}
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (leaving) {
                setLeaving(false);
                split.close();
              } else setArrived(true);
            }}
          >
            {/* A tab outside the canvas is its surface here, live (docs/specs/006-document/kinds-outside-the-canvas.md). */}
            {surfaceOf(staticTab, documentWorkbook !== null) !== null ? (
              <SplitSurfacePane key={staticTab.id} tab={staticTab} onFocus={focusPane} />
            ) : (
              <SplitStaticPane
                key={staticTab.id}
                tab={staticTab}
                loaded={loadedTabIds.has(staticTab.id)}
                failed={split.staticLoadFailed}
                initialAnchor={handoff?.tabId === staticTab.id ? handoff.anchor : null}
                handleRef={staticHandle}
                fitNonce={fitNonce}
                onFocus={focusPane}
              />
            )}
          </div>
        ) : null}
        {showing ? (
          <div className="absolute z-[2]" style={{ top: 0, bottom: 0, left: leftWidth }}>
            <SplitDivider
              rightWidth={split.rightWidth}
              viewportWidth={viewportWidth}
              onResize={split.resize}
              onReset={split.resetWidth}
            />
            <SplitSeamControls
              canFit={(!!staticTab && tabHasDrawing(staticTab)) || tabHasDrawing(activeTab)}
              // Both sides at once: the editor's canvas and the other pane.
              onFit={() => {
                fitToScreen();
                setFitNonce((n) => n + 1);
              }}
              onClose={() => setLeaving(true)}
            />
          </div>
        ) : null}
      </div>
      <SplitDropZone split={split} tabs={tabs} loadedTabIds={loadedTabIds} />
    </SplitViewContext.Provider>
  );
}
