// Pictures in line in ODF (docs/specs/034-text-documents/objects.md "In the formats"): a `draw:frame` anchored as a
// character holding one `draw:image`, its size, its title and description, its turn (`draw:transform`), and in its
// automatic graphic style its crop (`fo:clip`, lengths of the picture's own size), its recolour and adjustments
// (odf-picture-colours.ts) and whether it is decorative (`loext:decorative`). A frame holding anything else, or a style giving it any other look, is not the model's: the
// reader keeps it.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  odfLengthToPt,
  PICTURE_EXTENSIONS,
  pictureHeader,
  pictureOwnSize,
  ptToOdf,
  type XmlElement,
} from '@livedoc/office-packages';
import { base64OfBytes, bytesOfBase64 } from '../base64';
import { findMedia, type FoundMedia, type MediaTaken } from '../picture-media';
import {
  Pictures,
  type HeldPictureMedia,
  type Picture,
  type PictureCrop,
  type PictureMedia,
} from '../model/pictures';
import type { PictureColouring } from '../model/picture-colours';
import { NS } from './odf-names';
import { isOdfColouring, odfColouringAttributes, odfColouringOf } from './odf-picture-colours';
import {
  isOdfPlacement,
  ODF_PLACED_ANCHORS,
  odfPlacementFrame,
  odfPlacementOf,
  odfPlacementProperties,
} from './odf-picture-placement';
import type { PicturePlacement } from '../model/picture-placement';

/** The media of each `draw:image` a read may hold as a picture's, by element. */
export type OdfPictureLookup = ReadonlyMap<XmlElement, FoundMedia>;

/** A package entry an `xlink:href` names inside the package, or undefined (remote, absolute, or a fragment). */
export function odfEntryOf(href: string | undefined): string | undefined {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#'))
    return undefined;
  const name = href.replace(/^(\.\/)+/, '');
  return name.split('/').includes('..') ? undefined : name;
}

function* images(e: XmlElement): Generator<XmlElement> {
  for (const c of childElements(e)) {
    if (c.uri === NS.draw && c.local === 'image') yield c;
    else yield* images(c);
  }
}

/** Every `draw:image` of the roots read as media: from the entry it names, else from its base64 (the flat file). */
export async function odfPictureLookup(
  roots: readonly XmlElement[],
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<OdfPictureLookup | 'too-large'> {
  const found = new Map<XmlElement, FoundMedia>();
  const byEntry = new Map<string, FoundMedia | 'too-large' | undefined>();
  for (const root of roots)
    for (const image of images(root)) {
      const entry = odfEntryOf(attributeOf(image, NS.xlink, 'href'));
      let media: FoundMedia | 'too-large' | undefined;
      if (entry !== undefined) {
        const bytes = entries.get(entry);
        if (bytes === undefined) continue;
        if (!byEntry.has(entry)) byEntry.set(entry, await findMedia(bytes, entry));
        media = byEntry.get(entry);
      } else {
        const data = childElement(image, NS.office, 'binary-data');
        const bytes = data && bytesOfBase64(textOf(data).replace(/\s+/g, ''));
        if (!bytes) continue;
        media = await findMedia(bytes);
      }
      if (media === 'too-large') return media;
      if (media) found.set(image, media);
    }
  return found;
}

const textOf = (e: XmlElement): string =>
  e.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

const isBlank = (node: XmlElement['children'][number]) => typeof node === 'string' && !node.trim();

// The frame's own attributes a picture in line may have beyond what is read: names, order, its text style.
const FRAME_NEUTRAL = new Set([
  'style-name',
  'name',
  'z-index',
  'text-style-name',
  'id',
  'anchor-type',
  'width',
  'height',
]);
const IMAGE_NEUTRAL = new Set(['href', 'type', 'show', 'actuate', 'mime-type']);

const zero = (v: string) => odfLengthToPt(v) === 0;
const NEUTRAL_GRAPHIC: Readonly<Record<string, (value: string) => boolean>> = {
  margin: zero,
  'margin-left': zero,
  'margin-right': zero,
  'margin-top': zero,
  'margin-bottom': zero,
  padding: zero,
  'padding-left': zero,
  'padding-right': zero,
  'padding-top': zero,
  'padding-bottom': zero,
  border: (v) => v === 'none',
  'border-left': (v) => v === 'none',
  'border-right': (v) => v === 'none',
  'border-top': (v) => v === 'none',
  'border-bottom': (v) => v === 'none',
  'background-color': (v) => v === 'transparent',
  fill: (v) => v === 'none',
  'fill-color': () => true,
  mirror: (v) => v === 'none',
  red: (v) => v === '0%',
  green: (v) => v === '0%',
  blue: (v) => v === '0%',
  gamma: (v) => v === '100%',
  'color-inversion': (v) => v === 'false',
  shadow: (v) => v === 'none' || v === 'hidden',
  'vertical-pos': (v) => v === 'top',
  'vertical-rel': (v) => v === 'baseline',
  // A picture in line ignores how text wraps around it and where across it would stand.
  'horizontal-pos': () => true,
  'horizontal-rel': () => true,
  wrap: () => true,
  'number-wrapped-paragraphs': () => true,
  'wrap-contour': () => true,
  'wrap-contour-mode': () => true,
  'run-through': () => true,
  'flow-with-text': () => true,
  'wrap-influence-on-position': () => true,
  'allow-overlap': () => true,
};

/** A `fo:clip` as lengths in points, top, right, bottom, left; `auto` is none; undefined when it is not one. */
function clipOf(value: string): number[] | undefined {
  if (value === 'auto') return [0, 0, 0, 0];
  const match = value.match(/^rect\((.*)\)$/);
  const parts = match?.[1]!.split(/\s*,\s*|\s+/).filter(Boolean) ?? [];
  const lengths = parts.map((p) => (p === 'auto' ? 0 : odfLengthToPt(p)));
  return lengths.length === 4 && lengths.every((l) => l !== undefined && l >= 0)
    ? (lengths as number[])
    : undefined;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

type GraphicRead =
  | ({ crop?: PictureCrop; decorative?: true; placement?: PicturePlacement } & PictureColouring)
  | undefined;

/**
 * What the frame's automatic graphic style gives the picture, or undefined when it gives it any other look; a placed
 * frame's (`placed`) its placement too.
 */
function graphicOf(
  style: XmlElement | undefined,
  own: FoundMedia['own'],
  placed?: XmlElement,
): GraphicRead {
  const colouring = new Map<string, string>();
  const placing = new Map<string, string>();
  const placement = placed && (() => odfPlacementOf(placed, placing));
  if (!style) {
    if (!placement) return {};
    const at = placement();
    return at ? { placement: at } : undefined;
  }
  let crop: PictureCrop | undefined;
  let decorative: true | undefined;
  for (const c of childElements(style)) {
    if (c.uri !== NS.style || c.local !== 'graphic-properties') return undefined;
    if (childElements(c).length > 0) return undefined;
    for (const a of c.attributes) {
      if (a.uri === NS.fo && a.local === 'clip') {
        const clip = clipOf(a.value.trim());
        if (!clip) return undefined;
        const [top, right, bottom, left] = clip as [number, number, number, number];
        const read = {
          top: round4(top / own.height),
          right: round4(right / own.width),
          bottom: round4(bottom / own.height),
          left: round4(left / own.width),
        };
        if (!Pictures.isCrop(read)) return undefined;
        crop = Pictures.crop(read);
      } else if (isOdfColouring(a)) colouring.set(a.local, a.value);
      else if (placed && isOdfPlacement(a)) placing.set(a.local, a.value);
      else if (a.uri === NS.loext && a.local === 'decorative') {
        if (a.value === 'true') decorative = true;
        else if (a.value !== 'false') return undefined;
      } else if (![NS.fo, NS.draw, NS.style, NS.loext].includes(a.uri as never)) return undefined;
      else if (!NEUTRAL_GRAPHIC[a.local]?.(a.value.trim())) return undefined;
    }
  }
  const coloured = odfColouringOf(colouring);
  if (!coloured) return undefined;
  const placedAt = placement?.();
  if (placement && !placedAt) return undefined;
  return {
    ...(crop ? { crop } : {}),
    ...(decorative ? { decorative } : {}),
    ...coloured,
    ...(placedAt ? { placement: placedAt } : {}),
  };
}

/** What a picture's frame holds beyond the run around it. */
export type OdfPictureRead = Pick<
  Picture,
  'media' | 'width' | 'height' | 'alt' | 'title' | 'decorative' | 'crop' | 'rotation' | 'placement'
> &
  PictureColouring;

const TRANSFORM_STEP = /^\s*([a-zA-Z]+)\s*\(([^()]*)\)/;
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/**
 * A frame's `draw:transform` as the turn it gives a picture in line (objects.md "Rotation read"): the sum of its
 * `rotate` steps, counter-clockwise radians, turned to clockwise degrees; its `translate` steps are where LibreOffice put
 * the centre it turns about, which the line gives a picture in line. Null for any other step, or one not read.
 */
export function odfRotationOf(transform: string): { rotation: number | undefined } | null {
  let rest = transform.trim();
  let radians = 0;
  while (rest !== '') {
    const step = rest.match(TRANSFORM_STEP);
    if (!step) return null;
    const args = step[2]!.split(/\s*,\s*|\s+/).filter(Boolean);
    if (step[1] === 'rotate') {
      if (args.length !== 1 || !NUMBER.test(args[0]!)) return null;
      radians += Number(args[0]);
    } else if (step[1] === 'translate') {
      if (
        args.length < 1 ||
        args.length > 2 ||
        args.some((a) => odfLengthToPt(a) === undefined && !NUMBER.test(a))
      )
        return null;
    } else return null;
    rest = rest.slice(step[0].length).trim();
  }
  return { rotation: Pictures.rotation((-radians * 180) / Math.PI) };
}

/**
 * A `draw:frame` read as a picture in line, when everything it holds is the model's, and the media it holds taken;
 * otherwise undefined, and the reader keeps it.
 */
export function readOdfPicture(
  frame: XmlElement,
  graphicStyle: (name: string) => XmlElement | undefined,
  lookup: OdfPictureLookup,
  taken: MediaTaken,
  placeable = false,
): OdfPictureRead | undefined {
  if (frame.uri !== NS.draw || frame.local !== 'frame') return undefined;
  const anchor = attributeOf(frame, NS.text, 'anchor-type') ?? '';
  const placed = placeable && ODF_PLACED_ANCHORS.has(anchor);
  if (anchor !== 'as-char' && !placed) return undefined;
  for (const a of frame.attributes) {
    const known =
      [NS.draw, NS.text, NS.svg, NS.xml].includes(a.uri as never) && FRAME_NEUTRAL.has(a.local);
    const offset = a.uri === NS.svg && (a.local === 'x' || a.local === 'y');
    const onBaseline = offset && (placed || zero(a.value));
    const turn = a.uri === NS.draw && a.local === 'transform';
    if (!known && !onBaseline && !turn) return undefined;
  }
  const transform = attributeOf(frame, NS.draw, 'transform');
  const turned = transform === undefined ? { rotation: undefined } : odfRotationOf(transform);
  if (!turned) return undefined;
  const width = odfLengthToPt(attributeOf(frame, NS.svg, 'width'));
  const height = odfLengthToPt(attributeOf(frame, NS.svg, 'height'));
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  let image: XmlElement | undefined;
  let title: string | undefined;
  let alt: string | undefined;
  for (const c of frame.children) {
    if (isBlank(c)) continue;
    if (typeof c === 'string') return undefined;
    if (c.uri === NS.draw && c.local === 'image' && !image) image = c;
    else if (c.uri === NS.svg && c.local === 'title' && title === undefined) title = textOf(c);
    else if (c.uri === NS.svg && c.local === 'desc' && alt === undefined) alt = textOf(c);
    else return undefined;
  }
  if (!image) return undefined;
  for (const a of image.attributes)
    if (!IMAGE_NEUTRAL.has(a.local) || ![NS.xlink, NS.draw, NS.loext].includes(a.uri as never))
      return undefined;
  for (const c of image.children) {
    if (isBlank(c)) continue;
    if (typeof c === 'string') return undefined;
    const emptyParagraph = c.uri === NS.text && c.local === 'p' && c.children.every(isBlank);
    if (!emptyParagraph && !(c.uri === NS.office && c.local === 'binary-data')) return undefined;
  }
  const found = lookup.get(image);
  if (!found) return undefined;
  const styleName = attributeOf(frame, NS.draw, 'style-name');
  const graphic = graphicOf(
    styleName === undefined ? undefined : graphicStyle(styleName),
    found.own,
    placed ? frame : undefined,
  );
  if (!graphic || !taken.take(found)) return undefined;
  return {
    media: found.key,
    width,
    height,
    ...(alt ? { alt } : {}),
    ...(title ? { title } : {}),
    ...graphic,
    ...(turned.rotation ? { rotation: turned.rotation } : {}),
  };
}

const LOEXT = `xmlns:loext="${NS.loext}"`;

/** The picture's automatic graphic style's body: on the baseline, its crop, colouring and whether it is decorative. */
export function odfPictureStyle(picture: Picture, media: HeldPictureMedia): string {
  const crop = Pictures.crop(picture.crop);
  const header = pictureHeader(media.bytes);
  const own = header && pictureOwnSize(header);
  const clip =
    crop && own
      ? ` fo:clip="rect(${[crop.top * own.height, crop.right * own.width, crop.bottom * own.height, crop.left * own.width].map(ptToOdf).join(', ')})"`
      : '';
  const decorative = picture.decorative ? ` ${LOEXT} loext:decorative="true"` : '';
  const placed = picture.placement
    ? odfPlacementProperties(picture.placement)
    : 'style:vertical-pos="top" style:vertical-rel="baseline"';
  return `<style:graphic-properties ${placed}${clip}${odfColouringAttributes(picture)}${decorative}/>`;
}

/**
 * A turned picture's `draw:transform` as LibreOffice writes a Writer picture's (objects.md "Rotation written"): about
 * its centre, counter-clockwise radians to 15 significant digits; none unturned.
 */
function odfTransformOf(picture: Picture): string {
  const rotation = Pictures.rotation(picture.rotation);
  if (!rotation) return '';
  const radians = Number(((((360 - rotation) % 360) * Math.PI) / 180).toPrecision(15));
  const x = ptToOdf(picture.width / 2);
  const y = ptToOdf(picture.height / 2);
  return ` draw:transform="translate (-${x} -${y}) rotate (${radians}) translate (${x} ${y})"`;
}

/** The common graphic style a picture's automatic style names as its parent, as LibreOffice's do. */
export const PICTURE_PARENT_STYLE = 'Graphics';

/** Whether a kept style is a graphic style named as a picture's parent. */
export const isPictureParentStyleXml = (xml: string): boolean => {
  const open = xml.match(/^<(?:[\w.-]+:)?style\s[^>]*>/)?.[0] ?? '';
  return (
    /\s(?:[\w.-]+:)?name="Graphics"/.test(open) && /\s(?:[\w.-]+:)?family="graphic"/.test(open)
  );
};

/** The entry a picture's media is written at: the one it arrived in, else `Pictures/<key>.<ext>`. */
export const odfMediaEntry = (key: string, media: PictureMedia): string =>
  media.part ?? `Pictures/${key}.${PICTURE_EXTENSIONS[media.mediaType]}`;

/** The picture's frame: `name` its `draw:name`, `style` its automatic style's, its media by entry or as base64. */
export function odfPictureXml(
  picture: Picture,
  media: HeldPictureMedia,
  { name, style, flat }: { name: string; style: string; flat: boolean },
): string {
  const source = flat
    ? `<office:binary-data>${base64OfBytes(media.bytes).replace(/(.{76})/g, '$1\n')}</office:binary-data>`
    : '';
  const href = flat
    ? ''
    : ` xlink:href="${escapeXmlAttribute(odfMediaEntry(picture.media, media))}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"`;
  const title = picture.title ? `<svg:title>${escapeXmlText(picture.title)}</svg:title>` : '';
  const desc = picture.alt ? `<svg:desc>${escapeXmlText(picture.alt)}</svg:desc>` : '';
  return `<draw:frame draw:style-name="${escapeXmlAttribute(style)}" draw:name="${escapeXmlAttribute(name)}" ${picture.placement ? odfPlacementFrame(picture.placement) : 'text:anchor-type="as-char"'} svg:width="${ptToOdf(picture.width)}" svg:height="${ptToOdf(picture.height)}" draw:z-index="0"${odfTransformOf(picture)}><draw:image${href} draw:mime-type="${media.mediaType}">${source}</draw:image>${title}${desc}</draw:frame>`;
}
