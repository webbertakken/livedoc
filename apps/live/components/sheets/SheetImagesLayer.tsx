'use client';

// A spreadsheet's images over cells (docs/specs/029-sheets/inserted-objects.md "Images over cells"): drawn over the
// cells at their anchors, under the charts, scrolling and zooming with the cells, each from its gallery bytes. An
// Editor selects one by a click or Tab, drags it to move it, drags a corner to resize it in proportion or an edge to
// stretch it, removes it with Delete or Backspace, and opens its menu with its ⋮ button or a right-click; each change
// is one undo step. Anyone else sees them, named by their alt text, and the pointer passes through to the cells.
import { useEffect, useRef, useState } from 'react';
import { SHEET_ANCHOR_MAX } from '@livedoc/document';
import { useCanvasSurface } from '@/components/canvas/CanvasSurfaceContext';
import { ImageBrokenFace } from '@/components/canvas/ImageBrokenFace';
import { IMAGE_SKELETON_BODY } from '@/components/canvas/image-placeholder-look';
import { useImageBlobUrl } from '@/hooks/persistence/useImageBlobUrl';
import {
  IMAGE_HANDLES,
  imageLabel,
  resizedImageBox,
  type ImageBox,
  type ImageHandle,
} from '@/lib/spreadsheet/sheet-image-place';
import type { SheetImage } from '@livedoc/sheets';
import { useSheetController } from './sheet-controller';
import {
  takePlacedImage,
  useSheetImagesOverCells,
  type PlacedSheetImage,
  type SheetImageAccess,
} from './sheet-images-over-cells-context';
import { MoreIcon } from './sheet-icons';
import {
  layerScale,
  SheetObjectButton,
  SheetObjectButtons,
  SheetObjectFrame,
  SheetObjectHandles,
  useSheetObjectDrag,
  type ObjectDrag,
} from './SheetObjectFrame';

export const IMAGE_MENU_LABEL = 'Image Options';

// An image's box in sheet px.
const boxOf = (p: PlacedSheetImage): ImageBox => ({
  x: p.x,
  y: p.y,
  width: p.image.width,
  height: p.image.height,
});

// Its proportion: the picture's own when known, else its box's.
const ratioOf = (image: SheetImage) =>
  image.naturalWidth && image.naturalHeight
    ? image.naturalWidth / image.naturalHeight
    : image.width / image.height;

const clampPx = (v: number) => Math.round(Math.min(SHEET_ANCHOR_MAX, Math.max(0, v)));

/** `p`'s box after a drag: moved (never past A1's corner), or resized by its handle. */
export function draggedImageBox(
  p: PlacedSheetImage,
  d: Pick<ObjectDrag, 'kind' | 'handle' | 'dx' | 'dy'>,
): ImageBox {
  const box = boxOf(p);
  if (d.kind === 'move') return { ...box, x: clampPx(box.x + d.dx), y: clampPx(box.y + d.dy) };
  const next = resizedImageBox(box, d.handle as ImageHandle, d.dx, d.dy, ratioOf(p.image));
  return { ...next, x: clampPx(next.x), y: clampPx(next.y) };
}

export function SheetImagesLayer() {
  const ctx = useSheetImagesOverCells();
  const c = useSheetController();
  const images = ctx?.images;
  const editable = !!ctx?.editable && c.interactive && c.canShape === true;
  const [selected, setSelected] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  // An image this person just placed is selected as it arrives, ready to move: focused, which selects it.
  useEffect(() => {
    const placed = images?.find((p) => takePlacedImage(p.image.id));
    if (!placed || !editable) return;
    layerRef.current
      ?.querySelector<HTMLElement>(`[data-sheet-image="${placed.image.id}"]`)
      ?.focus({ preventScroll: true });
  }, [images, editable]);
  const { drag, begin } = useSheetObjectDrag({
    editable,
    scale: () => layerScale(layerRef.current),
    select: setSelected,
    commit: (d) => {
      const p = images?.find((x) => x.image.id === d.id);
      if (p) ctx?.place(d.id, draggedImageBox(p, d), d.kind === 'move' ? 'moved' : 'resized');
    },
  });
  if (!ctx || !images || images.length === 0) return null;

  const release = () => {
    setSelected(null);
    c.focusGrid();
  };
  return (
    <div
      ref={layerRef}
      data-sheet-images
      // The layer lives inside role="grid", which may own only rows: the images sit in one row and cell of their own.
      role="row"
      aria-label="Images"
      className="pointer-events-none absolute inset-0 z-[6]"
      // A press on an image is the image's, never the cells'.
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-sheet-image]')) e.stopPropagation();
      }}
    >
      <div role="gridcell" className="absolute inset-0">
        {images.map((p) => {
          const { image } = p;
          const d = drag?.id === image.id ? drag : null;
          const box = d ? draggedImageBox(p, d) : boxOf(p);
          const isSelected = editable && (selected === image.id || ctx.menuFor === image.id);
          return (
            <SheetObjectFrame
              key={image.id}
              id={image.id}
              kind="image"
              label={imageLabel(image)}
              editable={editable}
              selected={isSelected}
              box={{
                left: box.x - c.scroll.left,
                top: box.y - c.scroll.top,
                width: box.width,
                height: box.height,
              }}
              style={
                isSelected ? { outline: `2px solid ${c.palette.focus}`, outlineOffset: 1 } : {}
              }
              onPress={(e) => begin(e, image.id, 'move')}
              onSelect={() => setSelected(image.id)}
              onLeave={() => setSelected((s) => (s === image.id ? null : s))}
              onRelease={release}
              onRemove={() => {
                ctx.remove(image.id);
                release();
              }}
              onNudge={(dx, dy, resize) =>
                ctx.place(
                  image.id,
                  draggedImageBox(p, {
                    kind: resize ? 'resize' : 'move',
                    handle: dx !== 0 ? 'e' : 's',
                    dx,
                    dy,
                  }),
                  resize ? 'resized' : 'moved',
                )
              }
              onMenu={(rect) => ctx.menu(image.id, rect)}
              controls={
                <>
                  <SheetObjectButtons>
                    <SheetObjectButton
                      label={IMAGE_MENU_LABEL}
                      palette={c.palette}
                      menu
                      onClick={(e) => ctx.menu(image.id, e.currentTarget.getBoundingClientRect())}
                    >
                      <MoreIcon />
                    </SheetObjectButton>
                  </SheetObjectButtons>
                  <SheetObjectHandles
                    handles={IMAGE_HANDLES}
                    palette={c.palette}
                    onPress={(e, handle) => begin(e, image.id, 'resize', handle)}
                  />
                </>
              }
            >
              <div className="pointer-events-none absolute inset-0">
                <SheetImageView image={image} box={box} access={ctx.access} />
              </div>
            </SheetObjectFrame>
          );
        })}
      </div>
    </div>
  );
}

// The picture itself: a skeleton while its bytes come, the broken-image state when they cannot be drawn.
function SheetImageView({
  image,
  box,
  access,
}: {
  image: SheetImage;
  box: { width: number; height: number };
  access: SheetImageAccess;
}) {
  const surface = useCanvasSurface();
  const state = useImageBlobUrl(access.ownerId, image.imageId, {
    documentId: access.documentId,
    shareCode: access.shareCode,
  });
  // Bytes that arrived but will not decode are unavailable too, keyed to the source so a new one retries.
  const [undecodable, setUndecodable] = useState<string | null>(null);
  if (state.status === 'broken' || (state.status === 'ready' && undecodable === state.src))
    return <ImageBrokenFace width={box.width} height={box.height} surface={surface} />;
  if (state.status !== 'ready')
    return (
      <div
        data-sheet-image-loading
        className="h-full w-full animate-pulse motion-reduce:animate-none"
        style={{ background: IMAGE_SKELETON_BODY[surface] }}
      />
    );
  return (
    <img
      src={state.src}
      // Named by its frame (its alt text), never twice.
      alt=""
      decoding="async"
      draggable={false}
      onError={() => setUndecodable(state.src)}
      className="block h-full w-full select-none"
      style={{ objectFit: 'fill' }}
    />
  );
}
