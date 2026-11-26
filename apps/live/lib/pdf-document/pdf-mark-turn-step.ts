// A turn made (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate): the one way every turn is made, by
// Format > Rotate, the rotate handle or Properties' Angle: one step of the person's undo on the page, logged
// `[pdf] marks-turned` and counted as `Mark.Turned`.
import type { Box, Mark, PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { turnMarks, type MarkTurnAsked } from './pdf-mark-turns';
import type { PdfDocumentOpen } from './usePdfDocument';

type Ready = Pick<Extract<PdfDocumentOpen, { phase: 'ready' }>, 'binding' | 'undo'>;

/** How a turn was made, as the log names it: a quarter either way, the handle, or Properties' Angle. */
export type MarkTurnWay = 'clockwise' | 'counterclockwise' | 'handle' | 'angle';

/** A quarter turn's degrees, as the log reads them. */
const QUARTER = 90;

/**
 * The marks of `ids` on `page` turned as asked, held on `box`: one step of undo on the page, logged and counted.
 * Answers how many turned.
 */
export function turnMarksOn({
  ready,
  page,
  box,
  ids,
  asked,
  way,
  fileOwn,
}: {
  ready: Ready;
  page: PageInfo;
  box: Box;
  ids: readonly string[];
  asked: MarkTurnAsked;
  way: MarkTurnWay;
  fileOwn: ReadonlyMap<string, Mark>;
}): number {
  const turned = ready.undo.step({ page: page.name }, () =>
    turnMarks(ready.binding.doc, ids, asked, box, Date.now(), fileOwn),
  );
  if (turned === 0) return 0;
  const degrees = typeof asked === 'string' ? QUARTER : asked.to;
  debugLog(`[pdf] marks-turned count=${turned} way=${way} degrees=${degrees}`);
  track('Pdf', 'Changed', 'Mark.Turned');
  return turned;
}
