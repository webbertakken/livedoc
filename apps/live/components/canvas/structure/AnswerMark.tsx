'use client';

import { CheckIcon } from '@livedoc/ui';
import type { ElementId } from '@livedoc/document';

// The check an answered hotspot wears on its top right corner (docs/specs/021-event-storming/board-structure.md
// "Hotspot answers"): a small emerald disc that says the answer. Pointing at it or focusing it shows the answer as
// a caption; for whoever may answer it is a button that opens the answer for typing, for everyone else an image with
// nothing to press. The disc is 20 px in a 28 px target, ringed in the canvas's paper so it reads on a note's edge.

/** The mark's target, screen px (safe range: 24 and up, WCAG 2.2 "Target size"). */
export const ANSWER_MARK_TARGET_PX = 28;

const TARGET =
  'flex size-7 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600';
const DISC =
  'flex size-5 items-center justify-center rounded-full bg-emerald-700 text-white ring-2 ring-[var(--lvd-canvas-paper,#ffffff)]';

export function AnswerMark({
  noteId,
  answer,
  onOpen,
  onShow,
  onHide,
}: {
  noteId: ElementId;
  answer: string;
  // Opens the answer for typing: present for whoever may answer.
  onOpen?: () => void;
  onShow: () => void;
  onHide: () => void;
}) {
  const shared = {
    'aria-label': `Answered: ${answer}`,
    'data-answer-mark': noteId,
    onPointerEnter: onShow,
    onPointerLeave: onHide,
    onFocus: onShow,
    onBlur: onHide,
    // A press here is never a press on the note beneath.
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
  const disc = (
    <span aria-hidden className={DISC}>
      <CheckIcon size={12} />
    </span>
  );
  return onOpen ? (
    <button type="button" {...shared} onClick={onOpen} className={`${TARGET} cursor-pointer`}>
      {disc}
    </button>
  ) : (
    <span role="img" tabIndex={0} {...shared} className={TARGET}>
      {disc}
    </span>
  );
}
