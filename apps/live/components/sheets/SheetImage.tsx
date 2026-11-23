'use client';

// A picture IMAGE shows in its cell (docs/specs/029-sheets/imports.md "IMAGE"): fetched through the api by the page's
// loader and drawn in the cell's box by Google's modes: 1 fits it in proportion, 2 stretches it, 3 its own size, 4 the
// size given (a missing side in proportion), centred and cut at the cell's edges. Nothing while it loads or failed.
import { useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import type { CellImage } from '@livedoc/sheets';
import { imageLabel } from './sheet-cell-speech';
import type { SheetImageLoader } from './sheet-image-loader';

type Props = {
  image: CellImage;
  loader: SheetImageLoader;
  box: { x: number; y: number; w: number; h: number };
  // Faded like a value waiting for its new one (formulas.md "Recalculation").
  waitingOpacity?: number;
};

function sizing(image: CellImage): CSSProperties {
  if (image.mode === 1) return { width: '100%', height: '100%', objectFit: 'contain' };
  if (image.mode === 2) return { width: '100%', height: '100%', objectFit: 'fill' };
  if (image.mode === 3) return { maxWidth: 'none', flexShrink: 0 };
  return {
    maxWidth: 'none',
    flexShrink: 0,
    width: image.width ?? 'auto',
    height: image.height ?? 'auto',
  };
}

export function SheetImage({ image, loader, box, waitingOpacity }: Props) {
  useEffect(() => loader.want(image.url), [loader, image.url]);
  const snapshot = () => loader.state(image.url);
  const state = useSyncExternalStore(
    (listener) => loader.subscribe(image.url, listener),
    snapshot,
    snapshot,
  );
  if (state.status !== 'shown') return null;
  return (
    <div
      data-sheet-image={image.mode}
      role="img"
      aria-label={imageLabel(image)}
      className="pointer-events-none absolute flex items-center justify-center overflow-hidden"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: 1,
        ...(waitingOpacity === undefined
          ? {}
          : { opacity: waitingOpacity, transition: 'opacity 0s 120ms' }),
      }}
    >
      <img src={state.src} alt="" draggable={false} style={sizing(image)} />
    </div>
  );
}
