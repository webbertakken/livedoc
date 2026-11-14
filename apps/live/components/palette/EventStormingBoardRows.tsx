'use client';

import { Glyph } from '@livedoc/ui';

// The BOARD-level controls at the top of the palette's Event Storming category
// (docs/specs/021-event-storming/event-storming.md). Everything below them adds a note; these change what the board
// itself does, so they sit above the notation with a rule under them rather
// than pretending to be a ninth sticky.
//
// Only rendered on an event-storming board: the category body can render
// elsewhere, and a board switch shown on an ordinary diagram would be a switch for nothing.

export type EsBoardControls = {
  // Photo import (docs/specs/021-event-storming/event-storming.md Phase 8). Absent when the deployment has no model
  // key: the whole feature is then not a thing this board can do, and a
  // greyed row would advertise something the operator cannot switch on.
  onImportPhoto?: () => void;
  photoDisabled?: boolean;
  // Why it is disabled, when the reason is worth saying (a draft already open).
  photoDisabledReason?: string;
  // Draw Context (docs/specs/021-event-storming/candidate-contexts.md "Making one by hand"): arms or puts away the pen
  // that draws a loop round notes. Absent for someone who may not change contexts.
  onDrawContext?: () => void;
  // The pen is armed.
  drawingContext?: boolean;
};

export function EventStormingBoardRows({ controls }: { controls: EsBoardControls }) {
  return (
    <div className="mb-1.5 border-b border-slate-200 pb-1.5 dark:border-slate-700">
      {controls.onDrawContext ? (
        <button
          type="button"
          aria-pressed={controls.drawingContext === true}
          data-context-pen-toggle=""
          onClick={controls.onDrawContext}
          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition ${
            controls.drawingContext
              ? 'bg-brand-50 dark:bg-brand-950'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ContextLoopIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              Draw Context
            </span>
            <span className="block text-[10px] leading-snug text-slate-500 dark:text-slate-400">
              {controls.drawingContext
                ? 'Drag a loop round the notes; Esc to stop'
                : 'Group notes into a candidate context'}
            </span>
          </span>
        </button>
      ) : null}
      {controls.onImportPhoto ? (
        <button
          type="button"
          onClick={controls.onImportPhoto}
          disabled={controls.photoDisabled}
          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition ${
            controls.photoDisabled
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <CameraIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              Add from Photo
            </span>
            {/* A disabled button takes no focus and may get no hover, so the
                reason is the row's own second line rather than a hint. */}
            <span className="block text-[10px] leading-snug text-slate-500 dark:text-slate-400">
              {(controls.photoDisabled && controls.photoDisabledReason) ||
                'Read the stickies off a photo of the wall'}
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

// A camera: the act is "photograph the wall", not "upload a file". Shared with the Toolbar
// layout's strip button (EsPhotoStripButton).
export function CameraIcon() {
  return (
    <Glyph size={16} units={24} strokeLinecap="butt">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.8A1 1 0 0 1 8.7 4.7h6.6a1 1 0 0 1 .9.5L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.8" r="3.2" />
    </Glyph>
  );
}

// A loose dashed loop round two notes: drawing a candidate context. Shared with the strip's button.
export function ContextLoopIcon() {
  return (
    <Glyph size={16} units={24}>
      <path
        d="M4.5 9.5C3.5 6 7 3.5 12 3.6s8.6 2.6 7.8 6.4c-.6 3 .6 5.5-.8 8.1-1.6 2.7-6.5 2.6-10.4 2.1C5 19.7 3 17.4 3.6 14c.3-1.6 1.4-2.8.9-4.5z"
        strokeDasharray="2.6 2.4"
      />
      <rect x="7.5" y="8" width="4" height="4" rx=".6" />
      <rect x="12.5" y="12" width="4" height="4" rx=".6" />
    </Glyph>
  );
}
