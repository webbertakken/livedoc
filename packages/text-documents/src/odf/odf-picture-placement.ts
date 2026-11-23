// A picture placed out of its line in ODF (docs/specs/034-text-documents/objects.md "In the formats"): a frame anchored
// to a character (`text:anchor-type="char"`, or `paragraph` as LibreOffice also writes) at `svg:x` / `svg:y`, its
// graphic style holding its wrap, margins and what its offsets are measured from, as LibreOffice 24.2 writes them.
import { attributeOf, odfLengthToPt, ptToOdf, type XmlElement } from '@livedoc/office-packages';
import {
  PICTURE_MARGIN_MAX,
  PicturePlacements,
  type PictureMoves,
  type PicturePlacement,
  type PictureWrap,
} from '../model/picture-placement';
import { NS } from './odf-names';

/** The anchors a placed picture is read from: a character, or its paragraph (read where it stands). */
export const ODF_PLACED_ANCHORS = new Set(['char', 'paragraph']);

const MARGINS = ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
const STYLE_PLACEMENT = new Set([
  'wrap',
  'run-through',
  'number-wrapped-paragraphs',
  'wrap-contour',
  'wrap-contour-mode',
  'vertical-pos',
  'vertical-rel',
  'horizontal-pos',
  'horizontal-rel',
  'flow-with-text',
  'wrap-influence-on-position',
  'allow-overlap',
]);

/** Whether the graphic style's attribute places a picture: read by `odfPlacementOf` for a placed frame. */
export const isOdfPlacement = (a: { readonly uri: string; readonly local: string }): boolean =>
  (a.uri === NS.style && STYLE_PLACEMENT.has(a.local)) ||
  (a.uri === NS.fo && MARGINS.includes(a.local));

const WRAPS: Readonly<Record<string, PictureWrap>> = { parallel: 'wrap', none: 'break' };
const RELATIONS: Readonly<Record<string, PictureMoves>> = { paragraph: 'with-text', page: 'page' };

/** A margin in points within its range, else undefined. */
function marginOf(text: string | undefined): number | undefined {
  const pt = text === undefined ? 0 : odfLengthToPt(text.trim());
  return pt !== undefined && pt >= 0 && pt <= PICTURE_MARGIN_MAX ? pt : undefined;
}

/**
 * The placement a placed frame's offsets and its graphic style's placing attributes (by local name) give the picture
 * (objects.md "Placement read"); undefined for one the model does not hold, which keeps it.
 */
export function odfPlacementOf(
  frame: XmlElement,
  found: ReadonlyMap<string, string>,
): PicturePlacement | undefined {
  const get = (name: string) => found.get(name)?.trim();
  const wrap =
    get('wrap') === 'run-through'
      ? get('run-through') === 'background'
        ? 'behind'
        : 'front'
      : WRAPS[get('wrap') ?? ''];
  if (!wrap) return undefined;
  if (!['no-limit', undefined].includes(get('number-wrapped-paragraphs'))) return undefined;
  if (!['false', undefined].includes(get('wrap-contour'))) return undefined;
  if ((get('horizontal-pos') ?? 'from-left') !== 'from-left') return undefined;
  if ((get('vertical-pos') ?? 'from-top') !== 'from-top') return undefined;
  const across = RELATIONS[get('horizontal-rel') ?? ''];
  if (!across || across !== RELATIONS[get('vertical-rel') ?? '']) return undefined;
  const all = get('margin');
  const side = (name: string) => marginOf(get(`margin-${name}`) ?? all);
  const x = odfLengthToPt(attributeOf(frame, NS.svg, 'x') ?? '0pt');
  const y = odfLengthToPt(attributeOf(frame, NS.svg, 'y') ?? '0pt');
  return PicturePlacements.of({
    wrap,
    margin: { top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') },
    moves: across,
    x,
    y,
  });
}

const STYLE_WRAPS: Readonly<Record<PictureWrap, string>> = {
  wrap: 'style:wrap="parallel" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false"',
  break: 'style:wrap="none"',
  front: 'style:wrap="run-through" style:run-through="foreground"',
  behind: 'style:wrap="run-through" style:run-through="background"',
};

/** The placed picture's graphic style properties, as LibreOffice writes them (objects.md "Placement written"). */
export function odfPlacementProperties(placement: PicturePlacement): string {
  const { margin } = placement;
  const rel = placement.moves === 'page' ? 'page' : 'paragraph';
  return `${STYLE_WRAPS[placement.wrap]} fo:margin-top="${ptToOdf(margin.top)}" fo:margin-right="${ptToOdf(margin.right)}" fo:margin-bottom="${ptToOdf(margin.bottom)}" fo:margin-left="${ptToOdf(margin.left)}" style:vertical-pos="from-top" style:vertical-rel="${rel}" style:horizontal-pos="from-left" style:horizontal-rel="${rel}"`;
}

/** The placed frame's anchor and offsets. */
export const odfPlacementFrame = (placement: PicturePlacement): string =>
  `text:anchor-type="char" svg:x="${ptToOdf(placement.x)}" svg:y="${ptToOdf(placement.y)}"`;
