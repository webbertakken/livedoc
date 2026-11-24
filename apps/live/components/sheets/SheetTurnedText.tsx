// Turned text (docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation"): a box the size its text turns to,
// placed in the cell by its alignment as any text is, with the text turned about the box's centre: counterclockwise
// for a positive angle, so CSS, which turns clockwise, is given the angle's negative.
import type { CellTurn } from '@livedoc/sheets';

export function SheetTurnedText({ turn, text }: { turn: CellTurn; text: string }) {
  return (
    <span
      data-sheet-turned={turn.deg}
      className="relative flex-none"
      style={{ width: turn.w, height: turn.h }}
    >
      <span
        className="absolute left-1/2 top-1/2 whitespace-pre"
        style={{ transform: `translate(-50%, -50%) rotate(${-turn.deg}deg)` }}
      >
        {text}
      </span>
    </span>
  );
}
