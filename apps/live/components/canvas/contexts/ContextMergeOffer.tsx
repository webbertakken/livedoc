'use client';

import type { ReactNode } from 'react';
import { CheckIcon, CloseIcon, SparkleIcon } from '@livedoc/ui';
import { CONTEXT_PLATE_H, polygonCentroid } from '@livedoc/document';
import type { DrawnContext } from '@/lib/context-outlines';

// The merge offer (docs/specs/021-event-storming/candidate-contexts.md "Selecting several and merging"): with two or
// more contexts selected, a small bar between their names (centred on them, above the highest) offers to merge them
// (✓) or keep them apart (✕), and to ask for a name for them as one. The names suggested for exactly those contexts
// stand in it as chips: choosing one merges them under that name
// (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides").
// Chrome, not board: drawn at the same screen size whatever the zoom.

const GAP_PX = 6;

export function ContextMergeOffer({
  contexts,
  zoom,
  chips,
  onAsk,
  onMerge,
  onCancel,
}: {
  contexts: readonly DrawnContext[];
  zoom: number;
  // The chips of the names suggested for these contexts merged, if any.
  chips?: ReactNode;
  // Ask for a name for these contexts merged (docs/specs/021-event-storming/asks.md "Where an ask starts"); absent
  // for someone who may not ask.
  onAsk?: () => void;
  onMerge: () => void;
  onCancel: () => void;
}) {
  const centres = contexts.map((d) => polygonCentroid(d.outline.polygon));
  const x = centres.reduce((s, c) => s + c.x, 0) / centres.length;
  const y = Math.min(...centres.map((c) => c.y)) - CONTEXT_PLATE_H / Math.min(zoom, 1);
  const label = `Merge ${contexts.length} contexts`;
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      data-context-merge=""
      role="group"
      aria-label={label}
      onPointerDown={stop}
      className="pointer-events-auto absolute flex origin-top-left items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-3 pr-0.5 text-sm font-medium text-slate-800 shadow-md shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      style={{
        left: x,
        top: y,
        transform: `scale(${1 / zoom}) translate(-50%, calc(-100% - ${GAP_PX}px))`,
      }}
    >
      <span className="whitespace-nowrap">{label}</span>
      {chips}
      {onAsk ? (
        <button
          type="button"
          aria-label={`Ask about ${contexts.length} contexts`}
          aria-haspopup="dialog"
          data-context-ask="merge"
          onClick={onAsk}
          className="flex size-7 items-center justify-center rounded-full text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300 dark:hover:bg-brand-950"
        >
          <SparkleIcon size={14} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`${label} into one`}
        onClick={onMerge}
        className="flex size-7 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-emerald-400 dark:hover:bg-emerald-950"
      >
        <CheckIcon size={14} />
      </button>
      <button
        type="button"
        aria-label="Keep them apart"
        onClick={onCancel}
        className="flex size-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
