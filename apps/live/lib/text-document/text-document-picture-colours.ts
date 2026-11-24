// A picture's recolour and adjustments drawn (docs/specs/034-text-documents/objects.md "In the editor"): its recolour,
// brightness and contrast as one colour matrix over its pixels, in sRGB, and its transparency as its opacity.
import {
  PICTURE_ADJUSTMENTS,
  PictureColours,
  type PictureColouring,
} from '@livedoc/text-documents';

/** A picture's recolour and adjustments as it holds them, each absent where it has none. */
export function pictureColouring(attrs: Readonly<Record<string, unknown>>): PictureColouring {
  const recolour = PictureColours.recolour(attrs.recolour);
  const out: { -readonly [K in keyof PictureColouring]: PictureColouring[K] } = {};
  if (recolour) out.recolour = recolour;
  for (const name of PICTURE_ADJUSTMENTS) {
    const value = PictureColours.adjustment(name, attrs[name]);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let filters = 0;

/** The colour matrix's values (none when its colours are drawn as they are) and the opacity a picture is drawn at. */
export function pictureColourFilter(attrs: Readonly<Record<string, unknown>>): {
  values: string | null;
  opacity: number;
} {
  const colouring = attrs as PictureColouring;
  return {
    values: PictureColours.matrix(colouring)?.join(' ') ?? null,
    opacity: PictureColours.opacity(colouring),
  };
}

/**
 * What colours a picture's drawn image: a filter of its own, drawn in a hidden `svg` inside `host` while the picture's
 * colours need one, and the image's opacity.
 */
export function pictureColourer(
  host: HTMLElement,
): (img: HTMLImageElement, attrs: Readonly<Record<string, unknown>>) => void {
  filters += 1;
  const id = `text-document-picture-colours-${filters}`;
  let svg: SVGSVGElement | null = null;
  let matrix: SVGElement | null = null;
  return (img, attrs) => {
    const { values, opacity } = pictureColourFilter(attrs);
    img.style.opacity = opacity === 1 ? '' : String(opacity);
    if (values === null) {
      svg?.remove();
      svg = null;
      img.style.filter = '';
      return;
    }
    if (!svg || !matrix) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('class', 'text-document-picture-colours');
      const filter = document.createElementNS(SVG_NS, 'filter');
      filter.id = id;
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      matrix = document.createElementNS(SVG_NS, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      filter.append(matrix);
      svg.append(filter);
      host.append(svg);
    }
    matrix.setAttribute('values', values);
    img.style.filter = `url("#${id}")`;
  };
}
