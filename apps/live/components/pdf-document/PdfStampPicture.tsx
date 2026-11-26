'use client';

// A custom stamp's picture on its page (docs/specs/035-pdf-documents/custom-stamps.md "Placing one"): drawn across the
// stamp's box, upright in it as its turn has it, once its bytes are read from the document; while they are on their
// way, or where they failed, nothing is drawn here and the stamp shows as its outlined box with its name.
import { useContext, useMemo } from 'react';
import { PageView, type PageMatrix, type StampMark } from '@livedoc/pdf-documents';
import { PdfStampPicturesContext } from '@/lib/pdf-document/pdf-stamp-pictures';
import { useStampPictureUrls } from '@/lib/pdf-document/stamp-picture-urls';

/** A unit picture's place in view space: its top left at the box's, its sides along the box's. */
export function pictureTransform(
  matrix: PageMatrix,
  [left, bottom, right, top]: readonly number[],
) {
  const corner = PageView.toView(matrix, { x: left!, y: top! });
  const across = PageView.toView(matrix, { x: right!, y: top! });
  const down = PageView.toView(matrix, { x: left!, y: bottom! });
  const [a, b, c, d] = [
    across.x - corner.x,
    across.y - corner.y,
    down.x - corner.x,
    down.y - corner.y,
  ];
  return `matrix(${a} ${b} ${c} ${d} ${corner.x} ${corner.y})`;
}

/** The address of a stamp's picture: a string once drawn, null where it failed, undefined while on its way. */
export function useMarkPicture(mark: StampMark): string | null | undefined {
  const read = useContext(PdfStampPicturesContext);
  const pictures = useMemo(() => (mark.picture ? [mark.picture] : []), [mark.picture]);
  const urls = useStampPictureUrls(pictures, read);
  return mark.picture ? urls.get(mark.picture.key) : null;
}

export function PdfStampPicture({
  matrix,
  mark,
  src,
}: {
  matrix: PageMatrix;
  mark: StampMark;
  src: string;
}) {
  return (
    <image
      data-pdf-stamp-picture={mark.id}
      href={src}
      width={1}
      height={1}
      preserveAspectRatio="none"
      transform={pictureTransform(matrix, mark.rect)}
    />
  );
}
