'use client';

// A drawing drawn live in its picture (docs/specs/034-text-documents/objects.md "Drawn"): its tab as a tab window draws
// one (useTabSvg: the export renderer, in this person's appearance, following every change), its elements on a
// transparent ground, fitted to the picture's image. While its tab loads, or where it cannot be shown (its load failed,
// its tab gone or outside a share), the PNG last saved shows under it; a failed load offers Retry. Loaded only once a
// drawing's picture is drawn (the renderer is heavy).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prefixSvgIds, tabHasDrawing, type Tab } from '@livedoc/document';
import { trustedHtml } from '@livedoc/ui';
import { useTabSvg } from '@/components/split/useTabSvg';
import { useEditorContext } from '@/app/document/[id]/EditorContext';
import { debugLog } from '@/lib/debug-log';
import { DRAWING_DRAWN_ATTRIBUTE } from '@/lib/text-document/text-document-picture-drawing-layer';

/** What a drawing's picture shows: the PNG last saved, the PNG with Retry, or the drawing itself. */
export type DrawingPictureState = 'png' | 'failed' | 'drawn';

export function drawingPictureState(
  tab: Tab | undefined,
  status: 'loaded' | 'loading' | 'failed',
): DrawingPictureState {
  if (!tab) return 'png';
  if (status === 'failed') return 'failed';
  return status === 'loaded' && tabHasDrawing(tab) ? 'drawn' : 'png';
}

export function TextDocumentDrawingPicture({
  drawingTabId,
  host,
}: {
  drawingTabId: string;
  // The picture's drawing host: marked once the drawing is drawn, so the PNG under it is hidden.
  host: HTMLElement;
}) {
  const { tabs, loadedTabIds, tabLoadErrors, loadAllTabs, isOutOfScope } = useEditorContext();
  const found = tabs.find((t) => t.id === drawingTabId);
  const tab = found && !isOutOfScope(found.id) ? found : undefined;
  const loaded = loadedTabIds.has(drawingTabId);
  const [asking, setAsking] = useState<'idle' | 'fetching' | 'failed'>('idle');
  const status =
    loaded || !tab
      ? 'loaded'
      : asking === 'failed' || (asking === 'idle' && tabLoadErrors.has(drawingTabId))
        ? 'failed'
        : 'loading';
  const state = drawingPictureState(tab, status);

  // Its content asked for once as the picture shows it (it arrives only when opened or fetched).
  const asked = useRef(false);
  const load = useCallback(() => {
    setAsking('fetching');
    void loadAllTabs([drawingTabId]).then((failures) => {
      const failed = failures.includes(drawingTabId);
      setAsking(failed ? 'failed' : 'idle');
      debugLog('[text-document] drawing loaded', { drawing: drawingTabId, failed });
    });
  }, [loadAllTabs, drawingTabId, setAsking]);
  useEffect(() => {
    if (!tab || loaded || asked.current) return;
    asked.current = true;
    load();
  }, [tab, loaded, load]);

  useEffect(() => {
    host.toggleAttribute(DRAWING_DRAWN_ATTRIBUTE, state === 'drawn');
    return () => host.removeAttribute(DRAWING_DRAWN_ATTRIBUTE);
  }, [host, state]);

  if (state === 'failed')
    return (
      <span className="text-document-drawing-failed" data-drawing-control="">
        <button
          type="button"
          className="office-shell rounded-control border border-(--office-line) bg-(--office-menu) px-2 py-0.5 text-body font-medium text-(--office-ink) hover:bg-(--office-menu-hover) focus-visible:outline-2 focus-visible:outline-(--office-focus)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={load}
        >
          Retry
        </button>
      </span>
    );
  return state === 'drawn' && tab ? <DrawingSvg tab={tab} /> : null;
}

function DrawingSvg({ tab }: { tab: Tab }) {
  const svg = useTabSvg(tab);
  // Ids prefixed so the drawing's gradients and markers never meet another's on the page.
  const inner = useMemo(
    () => (svg ? prefixSvgIds(svg.markup, `td-${tab.id}-`.replace(/[^a-zA-Z0-9-]/g, '')) : null),
    [svg, tab.id],
  );
  if (!svg || inner == null) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      viewBox={`0 0 ${svg.width} ${svg.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-drawing-svg=""
      // Its paper is not drawn: the drawing's elements lie on the page, as its PNG's on a transparent ground.
      className="[&>svg>rect:first-of-type]:hidden"
      style={{ display: 'block' }}
      // Our own renderer's output (every label is xmlEscaped inside it).
      dangerouslySetInnerHTML={{ __html: trustedHtml(inner) }}
    />
  );
}
