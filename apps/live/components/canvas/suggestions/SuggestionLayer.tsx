'use client';

import { useMemo } from 'react';
import type { Element, Rect } from '@livedoc/document';
import type { SuggestionControls } from '@/components/canvas/Canvas.types';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import {
  suggestionHints,
  suggestionSpots,
  suggestionsInTimeline,
  type SuggestionElement,
} from '@/lib/suggestion-hints';
import {
  endSuggestionPreview,
  leaveSuggestion,
  previewSuggestion,
  setShowAllSuggestions,
  setSuggestionsPanelOpen,
  useSuggestionView,
} from '@/lib/suggestion-view';
import { track } from '@/lib/telemetry';
import { SuggestionPeekTab } from './SuggestionPeekTab';
import { SuggestionPlaceholder } from './SuggestionPlaceholder';
import { SuggestionsPanel, type PanelRow } from './SuggestionsPanel';

// A board's suggestions on the canvas (docs/specs/021-event-storming/suggestions.md "How a person sees them"), in
// canvas units inside the grips layer, above every element: with Show All off a peek tab per anchor side and the
// previewed suggestion's placeholder; with it on, every placeholder where Apply All would land it (the notes that
// stand aside are drawn shifted by the element list, from the same preview). The panel is portalled to the screen.

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

export function SuggestionLayer({
  elements,
  tabId,
  controls,
  showAllSpots,
}: {
  elements: Element[];
  tabId: string;
  controls: SuggestionControls;
  // Where Apply All would land each suggestion: the Show All preview, computed beside the shift it goes with.
  showAllSpots: ReadonlyMap<string, Rect> | null;
}) {
  const zoom = useCanvasZoom();
  const view = useSuggestionView(tabId);
  const hints = useMemo(() => suggestionHints(elements), [elements]);
  const spots = useMemo(() => suggestionSpots(elements), [elements]);
  const timeline = useMemo(() => suggestionsInTimeline(elements), [elements]);
  if (hints.length === 0) return null;

  const showAll = view.showAll && showAllSpots !== null;
  const preview = (key: string) => () => previewSuggestion(tabId, key);
  const leave = (key: string) => () => leaveSuggestion(tabId, key);
  const apply = (id: string) => {
    endSuggestionPreview(tabId);
    controls.apply(id);
  };
  const dismiss = (id: string) => {
    endSuggestionPreview(tabId);
    controls.dismiss(id);
  };
  const placeholder = (s: SuggestionElement, spot: Rect, caption: boolean, key: string) => (
    <SuggestionPlaceholder
      key={s.id}
      suggestion={s}
      spot={spot}
      zoom={zoom}
      caption={caption}
      onApply={apply}
      onDismiss={dismiss}
      onPreview={preview(key)}
      onLeave={leave(key)}
    />
  );

  const rows: PanelRow[] = timeline.map(({ suggestion, spot, anchor }) => ({
    suggestion,
    anchor,
    spot: (showAll ? showAllSpots.get(suggestion.id) : undefined) ?? spot,
  }));
  const panel = (
    <SuggestionsPanel
      rows={rows}
      open={view.panelOpen}
      showAll={view.showAll}
      onOpenChange={(open) => setSuggestionsPanelOpen(tabId, open)}
      onShowAllChange={(on) => {
        if (on) track('Canvas', 'Used', 'SuggestionsShown');
        setShowAllSuggestions(tabId, on);
      }}
      onPreview={(row) => {
        previewSuggestion(tabId, `s:${row.suggestion.id}`);
        controls.reveal(union(row.anchor, row.spot));
      }}
      onLeave={(row) => leaveSuggestion(tabId, `s:${row.suggestion.id}`)}
      onApply={apply}
      onDismiss={dismiss}
      onApplyAll={() => {
        endSuggestionPreview(tabId);
        controls.applyAll();
      }}
      onDismissAll={() => {
        endSuggestionPreview(tabId);
        controls.dismissAll();
      }}
    />
  );

  if (showAll)
    return (
      <>
        {timeline.map(({ suggestion }) => {
          const key = `s:${suggestion.id}`;
          const spot = showAllSpots.get(suggestion.id);
          return spot ? placeholder(suggestion, spot, view.previewKey === key, key) : null;
        })}
        {panel}
      </>
    );

  // Show All off: the previewed hint shows its whole chain; a panel row shows its one suggestion.
  const key = view.previewKey;
  const one = key?.startsWith('s:') ? key.slice(2) : null;
  const previewed = hints.find((h) =>
    one ? h.suggestions.some((s) => s.id === one) : h.key === key,
  );
  const shown = previewed?.suggestions.filter((s) => one === null || s.id === one) ?? [];
  return (
    <>
      {hints.map((hint) => (
        <SuggestionPeekTab
          key={hint.key}
          hint={hint}
          zoom={zoom}
          onPreview={preview(hint.key)}
          onLeave={leave(hint.key)}
          onApply={apply}
          onDismiss={dismiss}
        />
      ))}
      {shown.map((s, i) => placeholder(s, spots.get(s.id)!, i === 0, key!))}
      {panel}
    </>
  );
}
