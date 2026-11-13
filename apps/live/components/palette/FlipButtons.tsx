'use client';

// The two flip actions at the foot of the element menu's Rotation category, single and multi
// (docs/specs/008-canvas/selection-transforms.md "Where flips live"): actions, not toggles, so no pressed state.
import type { FlipDirection } from '@livedoc/document';
import { Glyph } from '@livedoc/ui';
import { TOOLBAR_CONTROL_REST } from '@/components/chrome/toolbar-surface';

// A shape outlined on one side of a dashed axis and its filled reflection on the other, the axis turned for a
// vertical flip.
function FlipGlyph({ direction }: { direction: FlipDirection }) {
  return (
    <Glyph size={16} units={16}>
      <g transform={direction === 'vertical' ? 'rotate(90 8 8)' : undefined}>
        <path d="M8 1.5v13" strokeDasharray="1.5 1.5" />
        <path d="M6 4 2 12h4z" strokeLinejoin="round" />
        <path d="M10 4l4 8h-4z" strokeLinejoin="round" fill="currentColor" fillOpacity={0.35} />
      </g>
    </Glyph>
  );
}

const FLIPS: readonly { direction: FlipDirection; label: string }[] = [
  { direction: 'horizontal', label: 'Flip Horizontal' },
  { direction: 'vertical', label: 'Flip Vertical' },
];

// The menu stays open after a flip, as it does after a rotation tile, so a second press flips back.
export function FlipButtons({ onFlip }: { onFlip: (direction: FlipDirection) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 px-2 pb-1.5">
      {FLIPS.map(({ direction, label }) => (
        <button
          key={direction}
          type="button"
          onClick={() => onFlip(direction)}
          // Glyph over a small label, as the angle tiles above set theirs, so both names fit a narrow menu.
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1 font-medium transition ${TOOLBAR_CONTROL_REST}`}
        >
          <FlipGlyph direction={direction} />
          <span className="whitespace-nowrap text-[10px] leading-none">{label}</span>
        </button>
      ))}
    </div>
  );
}
