// A picture placed out of its line in WordprocessingML (docs/specs/034-text-documents/objects.md "In the formats"): a
// `wp:anchor`, its offsets (`wp:positionH` / `wp:positionV` `wp:posOffset`) from the column and paragraph or the page,
// its wrap (`wp:wrapSquare` on both sides, `wp:wrapTopAndBottom`, `wp:wrapNone` in front or behind) and its margins
// (`dist*`), as LibreOffice 24.2 and Word write them.
import {
  attributeOf,
  childElements,
  emuToPt,
  ptToEmu,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  PicturePlacements,
  type PictureMoves,
  type PicturePlacement,
  type PictureWrap,
} from '../model/picture-placement';

const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const WP14_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing';
const INTEGER = /^-?\d+$/;
const OFF = new Set(['0', 'false', 'off']);

const isWp = (e: XmlElement, local: string) => e.uri === WP_NS && e.local === local;
/** The anchor's attributes that change nothing the model holds, beside the margins and whether it is behind. */
const ANCHOR_NEUTRAL = new Set(['relativeHeight', 'locked', 'layoutInCell', 'allowOverlap']);

/** How an offset is measured, by the axis's `relativeFrom`. */
const FROM: Readonly<Record<'positionH' | 'positionV', Readonly<Record<string, PictureMoves>>>> = {
  positionH: { column: 'with-text', page: 'page' },
  positionV: { paragraph: 'with-text', page: 'page' },
};

/** An axis's offset in points and what it is measured from; undefined for an alignment or any other measure. */
function offsetOf(position: XmlElement, axis: 'positionH' | 'positionV') {
  const moves = FROM[axis][attributeOf(position, '', 'relativeFrom') ?? ''];
  const [offset, ...more] = childElements(position);
  if (!moves || !offset || more.length > 0 || !isWp(offset, 'posOffset')) return undefined;
  const text = textContent(offset).trim();
  return INTEGER.test(text) ? { moves, at: emuToPt(text) ?? 0 } : undefined;
}

/** The wrap a `wp:wrap*` gives, with no polygon and on both sides; undefined for any other. */
function wrapOf(e: XmlElement, behind: boolean): PictureWrap | undefined {
  if (childElements(e).length > 0) return undefined;
  if (isWp(e, 'wrapNone')) return behind ? 'behind' : 'front';
  const side = attributeOf(e, '', 'wrapText');
  if (isWp(e, 'wrapSquare') && side === 'bothSides') return 'wrap';
  return isWp(e, 'wrapTopAndBottom') ? 'break' : undefined;
}

/** Word's relative size with no share: what a picture of its own size holds. */
const noRelativeSize = (e: XmlElement) =>
  e.uri === WP14_NS &&
  (e.local === 'sizeRelH' || e.local === 'sizeRelV') &&
  childElements(e).every((p) => textContent(p).trim() === '0');

/**
 * The placement a `wp:anchor` gives its picture (objects.md "Placement read"), with the children the picture is read
 * from as an inline's; undefined for one the model does not hold, which keeps it.
 */
export function ooxmlPlacementOf(
  anchor: XmlElement,
): { placement: PicturePlacement; children: XmlElement[] } | undefined {
  for (const a of anchor.attributes) {
    if (a.uri === WP14_NS || (a.uri === '' && ANCHOR_NEUTRAL.has(a.local))) continue;
    if (a.uri === '' && ['simplePos', 'hidden'].includes(a.local) && OFF.has(a.value)) continue;
    if (a.uri === '' && (a.local === 'behindDoc' || a.local.startsWith('dist'))) continue;
    return undefined;
  }
  const behind = !OFF.has(attributeOf(anchor, '', 'behindDoc') ?? '0');
  const dist = (name: string) => {
    const text = attributeOf(anchor, '', name) ?? '0';
    return INTEGER.test(text) ? emuToPt(text) : undefined;
  };
  let across: ReturnType<typeof offsetOf>;
  let down: ReturnType<typeof offsetOf>;
  let wrap: PictureWrap | undefined;
  const children: XmlElement[] = [];
  for (const c of childElements(anchor)) {
    if (isWp(c, 'simplePos') || noRelativeSize(c)) continue;
    if (isWp(c, 'positionH')) across = offsetOf(c, 'positionH');
    else if (isWp(c, 'positionV')) down = offsetOf(c, 'positionV');
    else if (c.uri === WP_NS && c.local.startsWith('wrap')) {
      if (wrap) return undefined;
      wrap = wrapOf(c, behind);
      if (!wrap) return undefined;
    } else children.push(c);
  }
  if (!across || !down || !wrap || across.moves !== down.moves) return undefined;
  const placement = PicturePlacements.of({
    wrap,
    margin: {
      top: dist('distT'),
      right: dist('distR'),
      bottom: dist('distB'),
      left: dist('distL'),
    },
    moves: across.moves,
    x: across.at,
    y: down.at,
  });
  return placement ? { placement, children } : undefined;
}

const WRAPS: Readonly<Record<PictureWrap, string>> = {
  wrap: '<wp:wrapSquare wrapText="bothSides"/>',
  break: '<wp:wrapTopAndBottom/>',
  front: '<wp:wrapNone/>',
  behind: '<wp:wrapNone/>',
};

/**
 * A placed picture's `wp:anchor` as Word writes one (objects.md "Placement written"): its opening, with `order` the
 * order it overlaps others in, and its offsets; `wrap` the element after its effect extent.
 */
export function ooxmlAnchorParts(
  placement: PicturePlacement,
  order: number,
): { open: string; position: string; wrap: string } {
  const { margin } = placement;
  const page = placement.moves === 'page';
  return {
    open: `<wp:anchor xmlns:wp="${WP_NS}" distT="${ptToEmu(margin.top)}" distB="${ptToEmu(margin.bottom)}" distL="${ptToEmu(margin.left)}" distR="${ptToEmu(margin.right)}" simplePos="0" relativeHeight="${order}" behindDoc="${placement.wrap === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">`,
    position: `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${page ? 'page' : 'column'}"><wp:posOffset>${ptToEmu(placement.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="${page ? 'page' : 'paragraph'}"><wp:posOffset>${ptToEmu(placement.y)}</wp:posOffset></wp:positionV>`,
    wrap: WRAPS[placement.wrap],
  };
}
