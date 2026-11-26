'use client';

// The marks of a PDF page as controls (docs/specs/035-pdf-documents/marks.md "Keyboard and accessibility", "Changing
// a mark"): one over each mark made here, in the order the marks are drawn, named for its kind and author, pressed
// while selected. The pointer passes through them to the page, which finds the mark a press reaches itself; the keys
// reach them by Tab, which selects the mark. On a selected mark, arrow keys move the selection the way they point on
// screen, ⇧ farther, and with ⌥ resize the mark; Delete or Backspace deletes it; Escape lets it go. A turned mark's
// control is its box turned with it, so its focus ring follows the mark (marks.md "Changing a mark": Rotate).
import type { KeyboardEvent } from 'react';
import {
  Mark,
  PDF_MARK_NUDGE_FAR_PT,
  PDF_MARK_NUDGE_PT,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';
import { markControlName } from '@/lib/pdf-document/pdf-mark-change';
import { turnedViewBox } from '@/lib/pdf-document/pdf-rotate-handle';
import type { PdfPageChoosing } from '@/lib/pdf-document/usePdfMarkSelection';
import { linkBox } from './PdfPageLinks';

/** Each arrow's way on screen, a step of one. */
const ARROWS: Readonly<Record<string, PagePoint>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function PdfPageMarks({
  index,
  matrix,
  width,
  height,
  marks,
  chosen,
  choosing,
  onNudge,
  onResize,
}: {
  index: number;
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points.
  width: number;
  height: number;
  marks: readonly Mark[];
  // The ids of the marks selected on this page.
  chosen: readonly string[];
  // Where a selection goes; null while marks may not be changed.
  choosing: PdfPageChoosing | null;
  // An arrow key: the selection moved this far in view space, in points.
  onNudge: (step: PagePoint) => void;
  // ⌥ with an arrow key: the mark of `id` resized from its right or foot this far in view space, in points.
  onResize: (id: string, step: PagePoint) => void;
}) {
  const onKeyDown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!choosing || event.ctrlKey || event.metaKey) return;
    const arrow = ARROWS[event.key];
    const far = event.shiftKey ? PDF_MARK_NUDGE_FAR_PT : PDF_MARK_NUDGE_PT;
    const step = arrow ? { x: arrow.x * far, y: arrow.y * far } : null;
    if (event.altKey && !step) return;
    if (step && event.altKey) onResize(id, step);
    else if (step) onNudge(step);
    else if (event.key === 'Delete' || event.key === 'Backspace') choosing.remove();
    else if (event.key === 'Escape') choosing.leave();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return marks.map((mark) => {
    const turned = turnedViewBox(mark, matrix);
    const box = turned
      ? {
          left: (turned.x / width) * 100,
          top: (turned.y / height) * 100,
          width: (turned.width / width) * 100,
          height: (turned.height / height) * 100,
        }
      : linkBox(matrix, Mark.bounds(mark), width, height);
    const selected = chosen.includes(mark.id);
    return (
      <button
        key={mark.id}
        type="button"
        aria-label={markControlName(mark)}
        aria-pressed={choosing?.mayChange(mark) ? selected : undefined}
        data-pdf-mark-control={mark.id}
        className="pointer-events-none absolute rounded-control outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
        style={{
          left: `${box.left}%`,
          top: `${box.top}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          ...(turned ? { rotate: `${turned.degrees}deg` } : {}),
        }}
        onFocus={() => {
          if (choosing && !selected && choosing.mayChange(mark))
            choosing.choose(index, mark.id, false);
        }}
        onKeyDown={onKeyDown(mark.id)}
      />
    );
  });
}
