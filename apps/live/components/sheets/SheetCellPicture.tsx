'use client';

// A gallery picture held in a cell (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D630): its bytes
// asked for as an image over cells' are, drawn filling the cell's box in proportion and centred (IMAGE's mode 1), cut
// at its edges; nothing while they are on their way or cannot be drawn, as an IMAGE's. The cell's mirror names it.
import type { CellPicture } from '@livedoc/sheets';
import { useImageBlobUrl } from '@/hooks/persistence/useImageBlobUrl';
import type { SheetImageAccess } from './sheet-images-over-cells-context';

type Props = {
  picture: CellPicture;
  access: SheetImageAccess;
  box: { x: number; y: number; w: number; h: number };
  // Faded like a value waiting for its new one (formulas.md "Recalculation").
  waitingOpacity?: number;
};

export function SheetCellPicture({ picture, access, box, waitingOpacity }: Props) {
  const state = useImageBlobUrl(access.ownerId, picture.id, {
    documentId: access.documentId,
    shareCode: access.shareCode,
  });
  if (state.status !== 'ready') return null;
  return (
    <div
      data-sheet-cell-picture={picture.id}
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
      <img
        src={state.src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}
