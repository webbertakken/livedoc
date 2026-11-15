'use client';

import { useMemo } from 'react';
import {
  PIVOTAL_TAPE_OPACITY,
  hiddenLayerElementIds,
  pivotalTapes,
  type Element,
  type Layer,
} from '@livedoc/document';
import { CONTEXT_INK_VARS } from '@/components/canvas/contexts/context-ink';
import { applyOverlay, useDragPreview } from '@/lib/drag-preview';

// The tape of each pivotal event (docs/specs/021-event-storming/board-structure.md "Pivotal events"), in canvas
// units beneath every element: a band through the event's centre, drawn from the notes as they are drawn now, so it
// follows an event in hand and a previewed arrangement. Decoration: the event's own name says it is pivotal.

export function StructureTapes({
  tabId,
  elements,
  layers,
}: {
  tabId: string;
  elements: Element[];
  // The tab's layers: an event on a hidden layer wears no tape.
  layers?: Layer[];
}) {
  const overlay = useDragPreview(tabId, elements);
  const tapes = useMemo(() => {
    const drawn = overlay ? applyOverlay(elements, overlay) : elements;
    const off = hiddenLayerElementIds(drawn, layers);
    return pivotalTapes(
      drawn,
      drawn.filter((el) => !off.has(el.id)),
    );
  }, [elements, overlay, layers]);
  if (tapes.length === 0) return null;
  return (
    <div className="lvd-context contents" style={CONTEXT_INK_VARS}>
      {tapes.map((tape) => (
        <div
          key={tape.eventId}
          aria-hidden
          data-pivotal-tape={tape.eventId}
          className="pointer-events-none absolute"
          style={{
            left: tape.x,
            top: tape.y,
            width: tape.width,
            height: tape.height,
            borderRadius: tape.width / 2,
            backgroundColor: 'var(--ctx-line)',
            opacity: PIVOTAL_TAPE_OPACITY,
          }}
        />
      ))}
    </div>
  );
}
