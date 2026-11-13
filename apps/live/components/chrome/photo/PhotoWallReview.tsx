'use client';

import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { stitchWall, type PhotoNote } from '@livedoc/document';
import { toNormalised } from '@livedoc/sticky-vision';
import type { PhotoReview, PhotoWall, ReviewedPhoto } from '@/hooks/canvas/usePhotoDraft';
import { PhotoReviewOverlay } from '../PhotoReviewOverlay';
import type { ReviewSnapshot } from './PhotoWallStrip';

// One review for the whole wall (docs/specs/021-event-storming/event-storming.md Phase 11): the photo on screen in
// the ordinary review, the rest kept as the author left them, and one Add that lands every photo, stitched.

type OverlayProps = ComponentProps<typeof PhotoReviewOverlay>;

// What a photo lands: as the author left it, or as found and read when it was never opened.
function reviewedOf(review: PhotoReview, snapshot: ReviewSnapshot | undefined): ReviewedPhoto {
  const boxes = snapshot?.boxes ?? review.detection?.stickies ?? [];
  const ticked = snapshot?.ticked ?? new Set(boxes.map((b) => b.id));
  const kept = boxes.filter((b) => ticked.has(b.id));
  const texts = new Map<number, { text: string; legible: boolean }>();
  for (const b of kept) {
    const text = snapshot?.edited.get(b.id) ?? review.textById.get(b.id)?.text ?? '';
    texts.set(b.id, { text, legible: text.trim() !== '' });
  }
  return { kept, texts };
}

function photoNotesOf(review: PhotoReview, reviewed: ReviewedPhoto): PhotoNote[] {
  const size = review.detection?.imageSize;
  if (!size) return [];
  return reviewed.kept.map((s) => ({
    id: s.id,
    text: reviewed.texts.get(s.id)?.text ?? '',
    kind: s.kind,
    size: s.size,
    ...toNormalised(s, size),
    row: s.row,
    order: s.order,
  }));
}

export function PhotoWallReview({
  wall,
  onGo,
  onConfirmWall,
  ...overlay
}: Omit<OverlayProps, 'review' | 'wall' | 'onConfirm'> & {
  wall: PhotoWall;
  onGo: (index: number) => void;
  onConfirmWall: (photos: ReviewedPhoto[]) => void;
}) {
  const [snapshots, setSnapshots] = useState<Map<number, ReviewSnapshot>>(() => new Map());
  const keep = useCallback(
    (index: number, snapshot: ReviewSnapshot) =>
      setSnapshots((prev) =>
        prev.get(index) === snapshot ? prev : new Map(prev).set(index, snapshot),
      ),
    [],
  );
  const current = wall.current;
  const onSnapshot = useCallback(
    (snapshot: ReviewSnapshot) => keep(current, snapshot),
    [keep, current],
  );

  // Stitched as the review stands, against no board: what the wall lands, and which notes are paper seen twice.
  const { reviewed, stitched } = useMemo(() => {
    const photos = wall.reviews.map((r, i) => reviewedOf(r, snapshots.get(i)));
    return {
      reviewed: photos,
      stitched: stitchWall(
        wall.reviews.map((r, i) => photoNotesOf(r, photos[i]!)),
        [],
      ),
    };
  }, [wall.reviews, snapshots]);
  const seenOn = new Map(
    stitched.seenAgain.filter((s) => s.photo === current).map((s) => [s.detectedId, s.onPhoto]),
  );
  const review = wall.reviews[current]!;
  return (
    <PhotoReviewOverlay
      key={current}
      {...overlay}
      review={review}
      onConfirm={(kept, texts) =>
        onConfirmWall(reviewed.map((r, i) => (i === current ? { kept, texts } : r)))
      }
      wall={{
        names: wall.reviews.map((r) => r.photoName),
        index: current,
        skipped: wall.skipped + wall.leftOut,
        adding: stitched.additions.length,
        seed: snapshots.get(current),
        seenOn,
        onSnapshot,
        onGo: (index, leaving) => {
          keep(current, leaving);
          onGo(index);
        },
      }}
    />
  );
}
