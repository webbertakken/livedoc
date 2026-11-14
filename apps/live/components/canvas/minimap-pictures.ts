// The Map's drawing as a stack of pictures (docs/specs/008-canvas/canvas-performance.md "The Map is a few
// pictures"): the browser parses and lays out an SVG picture in one go, on the main thread, so a single picture
// of a whole board was one long task after every change. Each section of the drawing (the pages, the boxed
// elements, the arrows, in paint order) is cut into pictures of at most `perPicture` elements; a change redraws
// only the pictures whose markup it changed, and a box added at the end leaves the arrows' pictures as they were.

// How many elements each picture draws (default): small enough that parsing one is a short task.
export const MAP_PICTURE_PARTS = 50;

export type MapSection = { key: string; parts: readonly string[] };
export type MapPicture = { key: string; href: string };

export function mapPictures(
  sections: readonly MapSection[],
  // The picture's opening `<svg ...>` tag and defs, shared by every picture.
  open: string,
  perPicture = MAP_PICTURE_PARTS,
): MapPicture[] {
  const pictures: MapPicture[] = [];
  for (const { key, parts } of sections)
    for (let i = 0; i < parts.length; i += perPicture) {
      const doc = `${open}${parts.slice(i, i + perPicture).join('')}</svg>`;
      // Our own renderer's output (user text is xmlEscaped inside it), shown as an image.
      pictures.push({
        key: `${key}${i / perPicture}`,
        href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`,
      });
    }
  return pictures;
}
