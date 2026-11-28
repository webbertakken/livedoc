'use client';

// The broken-image state (docs/specs/009-elements/images.md "Placeholder rendering"): a picture that cannot be drawn
// (its bytes gone, refused or undecodable), sized to its box, inked for the paper under it. Shared by the canvas's
// image element and a spreadsheet's image over cells.
import type { CSSProperties } from 'react';
import type { CanvasSurface } from '@livedoc/document';
import { Glyph } from '@livedoc/ui';
import { IMAGE_BROKEN_TONE, imagePlaceholderMetrics } from './image-placeholder-look';

export function ImageBrokenFace({
  width,
  height,
  surface,
  style,
}: {
  // The box, px at 100%: the glyph and the label scale to it, the label dropped when it would not fit.
  width: number;
  height: number;
  surface: CanvasSurface;
  style?: CSSProperties;
}) {
  const tone = IMAGE_BROKEN_TONE[surface];
  const metrics = imagePlaceholderMetrics(width, height);
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded border px-2 text-center font-sans"
      style={{
        ...style,
        gap: metrics.gapPx,
        background: tone.body,
        borderColor: tone.border,
        color: tone.ink,
      }}
      role={metrics.showLabel ? undefined : 'img'}
      aria-label={metrics.showLabel ? undefined : 'Image unavailable'}
    >
      <BrokenIcon size={metrics.iconPx} />
      {metrics.showLabel ? (
        <span
          className="font-medium not-italic leading-tight"
          style={{ fontSize: metrics.labelPx }}
        >
          Image unavailable
        </span>
      ) : null}
    </div>
  );
}

function BrokenIcon({ size }: { size: number }) {
  return (
    <Glyph size={size} units={24}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 17l5-5 4 4 2-2" />
      <path d="M16 6l5 5" />
      <path d="M21 6l-5 5" />
    </Glyph>
  );
}
