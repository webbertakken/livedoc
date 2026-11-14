'use client';

// The angle readout of a turn by hand (docs/specs/008-canvas/selection-transforms.md "Rotating by hand", ST6, ST7):
// a small pill beside the pointer showing the angle the reference member lands on. It reads the turn-readout
// channel alone, so a frame of the turn renders this pill and nothing else. Hidden from assistive tech: the angle is
// a pointer gesture's echo, and the Rotation tiles carry the same angle for every other way of working.
import { toEditorBox, useEditorBox } from '@/hooks/ui/useEditorBox';
import { useTurnReadout } from '@/lib/turn-readout';

/** How far right of and below the pointer the pill sits, clear of the 24 px rotate cursor's hot spot (ST7). */
export const TURN_READOUT_OFFSET_PX = 16;

// Room the pill needs on screen ("359°" at text-xs with its padding); past it the pill flips to the pointer's other
// side so it stays readable at the right and bottom edges of the editor's box (the window, or a split's pane).
const TURN_READOUT_ROOM_PX = 56;

export function TurnReadout() {
  const readout = useTurnReadout();
  const box = useEditorBox();
  if (!readout) return null;
  // Placed in the editor's box, which a `fixed` pill counts from (docs/specs/007-editor/split-view.md).
  const at = toEditorBox({ x: readout.clientX, y: readout.clientY }, box);
  const boxWidth = box.width ?? window.innerWidth;
  const flipX = at.x + TURN_READOUT_OFFSET_PX + TURN_READOUT_ROOM_PX > boxWidth;
  const flipY = at.y + TURN_READOUT_OFFSET_PX + TURN_READOUT_ROOM_PX > window.innerHeight;
  const left = at.x + (flipX ? -TURN_READOUT_OFFSET_PX : TURN_READOUT_OFFSET_PX);
  const top = at.y + (flipY ? -TURN_READOUT_OFFSET_PX : TURN_READOUT_OFFSET_PX);
  return (
    <div
      aria-hidden
      data-turn-readout=""
      className="pointer-events-none fixed z-[var(--z-chrome)] rounded-md bg-slate-900 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white shadow-md dark:bg-slate-100 dark:text-slate-900"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`,
      }}
    >
      {readout.angle}°
    </div>
  );
}
