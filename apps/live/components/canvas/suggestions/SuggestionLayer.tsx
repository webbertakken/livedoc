'use client';

import { useMemo } from 'react';
import {
  contextBounds,
  contextNotes,
  isSuggestedContext,
  type CandidateContextElement,
  type Element,
  type Rect,
} from '@livedoc/document';
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
import { SuggestionsPanel, panelRowId, type PanelRow } from './SuggestionsPanel';

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

// The suggested candidate contexts as panel rows (docs/specs/021-event-storming/candidate-contexts.md), each with the
// box of its notes still on the board; one with none left is an orphan, never listed.
function suggestedContextRows(elements: readonly Element[]): PanelRow[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const rows: PanelRow[] = [];
  for (const el of elements) {
    if (!isSuggestedContext(el)) continue;
    const context = el as CandidateContextElement;
    const notes = contextNotes(context, byId);
    if (notes.length > 0)
      rows.push({ type: 'context', context, bounds: contextBounds(notes), notes: notes.length });
  }
  return rows;
}

// Notes and contexts in one timeline: a note by where it lands, a context by its leftmost note.
function inTimeline(notes: PanelRow[], contexts: PanelRow[]): PanelRow[] {
  const at = (row: PanelRow) => (row.type === 'note' ? row.spot : row.bounds);
  return [...notes, ...contexts].sort((a, b) => at(a).x - at(b).x || at(a).y - at(b).y);
}

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
  const contextRows = useMemo(() => suggestedContextRows(elements), [elements]);
  if (hints.length === 0 && contextRows.length === 0) return null;

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

  const noteRows: PanelRow[] = timeline.map(({ suggestion, spot, anchor }) => ({
    type: 'note',
    suggestion,
    anchor,
    spot: (showAll ? showAllSpots.get(suggestion.id) : undefined) ?? spot,
  }));
  const rows = inTimeline(noteRows, contextRows);
  const rowKey = (row: PanelRow) => `${row.type === 'note' ? 's' : 'c'}:${panelRowId(row)}`;
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
        previewSuggestion(tabId, rowKey(row));
        controls.reveal(row.type === 'note' ? union(row.anchor, row.spot) : row.bounds);
      }}
      onLeave={(row) => leaveSuggestion(tabId, rowKey(row))}
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
