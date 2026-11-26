'use client';

// The links of a PDF page (docs/specs/035-pdf-documents/reading-surface.md "The pages": Links; security.md "Links and
// actions"): a control over each link's rectangle, placed through the matrix the page was drawn with, named for where
// it leads as plain text, its tooltip its name. A press follows it as a bookmark is followed: a place at once,
// anything else asked about or said first. Nothing of the file is drawn as markup: geometry and LiveDoc's own words.
import { PageView, type LinkTarget, type PageLink, type PageMatrix } from '@livedoc/pdf-documents';
import { Tooltip } from '@livedoc/ui';

/** A link's rectangle in view space, as percentages of the page as it shows. */
export function linkBox(
  matrix: PageMatrix,
  [left, bottom, right, top]: PageLink['rect'],
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const corners = [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
  ].map((corner) => PageView.toView(matrix, corner));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return {
    left: (x / width) * 100,
    top: (y / height) * 100,
    width: ((Math.max(...xs) - x) / width) * 100,
    height: ((Math.max(...ys) - y) / height) * 100,
  };
}

/** A box in percent of the page, as the page's overlays are placed. */
export const percentStyle = (box: {
  left: number;
  top: number;
  width: number;
  height: number;
}) => ({
  left: `${box.left}%`,
  top: `${box.top}%`,
  width: `${box.width}%`,
  height: `${box.height}%`,
});

export function PdfPageLinks({
  matrix,
  width,
  height,
  links,
  nameOf,
  onFollow,
}: {
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points.
  width: number;
  height: number;
  links: readonly PageLink[];
  nameOf: (target: LinkTarget) => string;
  onFollow: (target: LinkTarget) => void;
}) {
  return links.map((link, at) => {
    const box = linkBox(matrix, link.rect, width, height);
    const name = nameOf(link.target);
    return (
      <Tooltip key={at} label={name}>
        <button
          type="button"
          aria-label={name}
          data-pdf-link={at + 1}
          className="absolute cursor-pointer rounded-control outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)"
          style={percentStyle(box)}
          // A press on a link is the link's: it starts no selection on the page under it.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onFollow(link.target);
          }}
        />
      </Tooltip>
    );
  });
}
