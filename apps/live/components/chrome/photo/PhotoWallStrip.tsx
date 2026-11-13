'use client';

import type { DetectedSticky } from '@livedoc/sticky-vision';

// The photos of one wall under one review (docs/specs/021-event-storming/event-storming.md Phase 11): a strip along
// the top of the review, one numbered stop per photo in the order they were read, to move between them.

// One photo as the author left it, kept while another photo is on screen.
export type ReviewSnapshot = {
  boxes: DetectedSticky[];
  ticked: ReadonlySet<number>;
  edited: ReadonlyMap<number, string>;
};

export type PhotoWallProps = {
  // Every photo's file name, in wall order, and the one on screen.
  names: string[];
  index: number;
  // Files picked that were not photos, and photos past the limit.
  skipped: number;
  // How many notes Add lands from the whole wall.
  adding: number;
  // This photo as it was left, when it was left before.
  seed?: ReviewSnapshot;
  // Notes of this photo that an earlier photo already shows: box id to that photo's index.
  seenOn?: ReadonlyMap<number, number>;
  onGo: (index: number, leaving: ReviewSnapshot) => void;
  onSnapshot: (snapshot: ReviewSnapshot) => void;
};

export function PhotoWallStrip({
  names,
  index,
  skipped,
  onGo,
}: {
  names: string[];
  index: number;
  skipped: number;
  onGo: (index: number) => void;
}) {
  return (
    <nav
      aria-label="Photos of the wall"
      className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-2"
    >
      <ol className="pointer-events-auto flex max-w-[96vw] items-center gap-1 overflow-x-auto rounded-full bg-slate-900/85 p-1 shadow-lg backdrop-blur">
        {names.map((name, i) => (
          <li key={`${i}-${name}`}>
            <button
              type="button"
              aria-current={i === index ? 'step' : undefined}
              aria-label={`Photo ${i + 1} of ${names.length}: ${name}`}
              onClick={() => onGo(i)}
              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                i === index ? 'bg-white text-slate-900' : 'text-white hover:bg-white/15'
              }`}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>
      <p className="pointer-events-auto rounded-full bg-slate-900/85 px-3 py-1 text-xs text-white shadow-lg backdrop-blur">
        Read left to right in file-name order
        {skipped > 0 ? ` · ${skipped} ${skipped === 1 ? 'file' : 'files'} left out` : ''}
      </p>
    </nav>
  );
}
