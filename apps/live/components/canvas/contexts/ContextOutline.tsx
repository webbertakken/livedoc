'use client';

import { CONTEXT_DASH_PX, CONTEXT_STROKE_PX, CONTEXT_WOBBLE_PX } from '@livedoc/document';
import type { DrawnContext } from '@/lib/context-outlines';

// One candidate context's line on the canvas (docs/specs/021-event-storming/candidate-contexts.md): dashed and
// hand-drawn-looking, beneath the notes; its name is drawn over them by ContextName. A suggested one is drawn at half
// strength until previewed. For an Editor, a click on the line selects the context (its name takes focus), and a
// Shift-click adds it to the selection or takes it out, for merging.

// How wide the invisible band along the line that takes a click is, in screen px.
const LINE_HIT_PX = 14;
// A suggested outline's strength, until it is previewed.
const SUGGESTED_OPACITY = 0.5;

export type ContextOutlineActs = {
  // A kept context's acts; absent for someone who may not change contexts.
  kept?: {
    onDelete: () => void;
  };
  // Selecting and naming any context; absent for someone who may not change contexts.
  select?: {
    // `add`: Shift was held, so it joins or leaves the selection rather than replacing it.
    onSelect: (add: boolean) => void;
    onRename: (name: string) => void;
    onEditing: (open: boolean) => void;
  };
  // A suggested context's acts.
  suggested?: {
    onApply: () => void;
    onDismiss: () => void;
    onPreview: () => void;
    onLeave: () => void;
  };
};

/** The name's button of a context, found by its id: what a click on the line focuses. */
export const contextNameButton = (id: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-context-name-for]')].find(
    (b) => b.dataset.contextNameFor === id,
  );

export const contextStrength = (d: DrawnContext, previewed: boolean) =>
  d.suggested && !previewed && !d.highlighted ? SUGGESTED_OPACITY : 1;

export function ContextOutline({
  drawn,
  zoom,
  previewed,
  selected,
  acts,
}: {
  drawn: DrawnContext;
  zoom: number;
  // The panel is pointing at it: drawn at full strength.
  previewed: boolean;
  selected: boolean;
  acts: ContextOutlineActs;
}) {
  const { context, outline, suggested, highlighted } = drawn;
  const px = 1 / zoom;
  const pad = CONTEXT_WOBBLE_PX + LINE_HIT_PX * px;
  const b = outline.bounds;
  const box = { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
  const interactive = (suggested ? acts.suggested : acts.kept) !== undefined;
  const ink = highlighted || selected ? 'var(--ctx-active)' : 'var(--ctx-line)';
  return (
    <div
      className="contents"
      data-candidate-context={context.id}
      data-suggested={suggested ? '' : undefined}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute overflow-visible"
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          opacity: contextStrength(drawn, previewed),
        }}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      >
        <path
          d={outline.path}
          fill="none"
          stroke={ink}
          strokeWidth={highlighted || selected ? CONTEXT_STROKE_PX + 1 : CONTEXT_STROKE_PX}
          strokeDasharray={selected ? undefined : `${CONTEXT_DASH_PX} ${CONTEXT_DASH_PX}`}
          strokeLinecap="round"
          className="transition-[stroke] duration-150 motion-reduce:transition-none"
        />
        {interactive ? (
          <path
            data-context-line={context.id}
            d={outline.path}
            fill="none"
            stroke="transparent"
            strokeWidth={LINE_HIT_PX * px}
            className="cursor-pointer"
            style={{ pointerEvents: 'stroke' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              // A plain click focuses the name, which selects it alone; Shift adds or takes away.
              const name = e.shiftKey ? undefined : contextNameButton(context.id);
              if (name && document.activeElement !== name) name.focus();
              else acts.select?.onSelect(e.shiftKey);
            }}
          />
        ) : null}
      </svg>
    </div>
  );
}
