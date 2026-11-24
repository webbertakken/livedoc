'use client';

import { HoverCard, RedoIcon, UndoIcon } from '@livedoc/ui';
import { CLUSTER_STRIP } from '@/components/canvas/cluster-strip';

// The Undo / Redo strip in the tools group: the leftmost item,
// before Layers + Theme & Canvas. Edit sessions only: undo / redo aren't
// actionable for a view-role visitor, so the caller renders nothing for
// them.
//
// `data-dock-button` keeps Undo / Redo presses from closing an open cluster
// popover (Layers, Collaborate), the same as pressing their own buttons.
export function UndoRedoClusterStrip({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}) {
  return (
    <div
      data-dock-button=""
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      data-toolbar-part=""
      className={CLUSTER_STRIP}
    >
      <HoverCard title="Undo" description="Undo last edit.">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          className="relative flex h-row w-row touch-target items-center justify-center rounded-control text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:disabled:text-slate-600 dark:disabled:hover:bg-transparent"
        >
          <UndoIcon />
        </button>
      </HoverCard>
      <HoverCard title="Redo" description="Redo last undone edit.">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          className="relative flex h-row w-row touch-target items-center justify-center rounded-control text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:disabled:text-slate-600 dark:disabled:hover:bg-transparent"
        >
          <RedoIcon />
        </button>
      </HoverCard>
    </div>
  );
}
